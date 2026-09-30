'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/stores/editor';
import {
    designApi,
    authApi,
    normalizeDesign,
    buildCanonicalDocument,
    reconcileServerDesign,
    parseRevisionConflict,
    markConflictPending,
    clearConflictPending,
    hasConflictPending,
    type RevisionConflict,
} from '@/services/api';
import {
    loadRecoveryDraft,
    saveRecoveryDraft,
    clearRecoveryDraft,
    shouldOfferRecovery,
    savedMatchesRecovery,
    currentRecoveryUserId,
    RECOVERY_DEBOUNCE_MS,
    type RecoveryDraft,
} from '@/services/draftRecovery';
import { validateDocument as validateCanonicalDocument } from '@/utils/documentValidation';
import { debounce } from '@/utils/editor';
import EditorToolbar from '@/components/EditorToolbar';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import Canvas from '@/components/Canvas';
import PageNavigator from '@/components/PageNavigator';

interface EditorLayoutProps {
    designId: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Debounce for the server-side document autosave (the flow is: edits mark the
// store dirty → serialize → validate → debounced PUT → saved). localStorage
// drafts below keep their own, faster cadence.
const SERVER_SAVE_DEBOUNCE_MS = 1500;

function saveErrorMessage(err: any): string {
    const data = err?.response?.data;
    const fieldError = data?.document?.[0] || data?.revision?.[0];
    if (fieldError) return String(fieldError);
    if (err?.response?.status === 401) return 'Session expired — log in again to keep saving.';
    if (err?.response?.status === 404) return 'Design not found — changes are only saved locally.';
    if (!err?.response) return 'Offline — changes are only saved locally.';
    return 'Failed to save changes to the server.';
}

// Transient failures are safe to retry automatically (the request never
// reached the server or it failed without state change). 4xx responses are
// not: 409 means another session saved, and re-PUTting would clobber it.
function isTransientSaveError(err: any): boolean {
    if (!err?.response) return true; // network error / offline / timeout
    const status = err.response.status;
    return status === 429 || status >= 500;
}

// Auto-retry cadence for transient save failures.
const SAVE_RETRY_BASE_MS = 1000;
const SAVE_RETRY_MAX_MS = 15000;
const SAVE_RETRY_MAX_ATTEMPTS = 3;

// Format a lastSavedAt as a short wall-clock time for the status pill.
function formatSavedAt(at: Date | null): string {
    if (!at) return '';
    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        }).format(at);
    } catch {
        return '';
    }
}

export default function EditorLayout({ designId }: EditorLayoutProps) {
    const { design, setDesign } = useEditorStore();
    const persistence = useEditorStore((state) => state.persistence);
    const [error, setError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [saveMessage, setSaveMessage] = useState<string>('');
    // Unresolved revision conflict (409) for the design on screen: the local
    // changes stay in the editor and the draft cache until the user explicitly
    // picks a version — nothing is overwritten or discarded automatically.
    const [conflict, setConflict] = useState<RevisionConflict | null>(null);
    // Unsynced work journalled in IndexedDB by an earlier session (a crash, a
    // dropped network or an interrupted save) that the editor is not already
    // showing. Surfaced as an explicit Restore / Discard prompt — never
    // applied or dropped silently.
    const [recovery, setRecovery] = useState<RecoveryDraft | null>(null);
    // Resolved user id, so the recovery journal is written under the same
    // user-scoped key the load path reads from.
    const userIdRef = useRef<string>('anon');
    // Mirrors `recovery` for the journal effect: a snapshot awaiting a
    // Restore/Discard decision must never be overwritten or cleared by the
    // autosave journalling that runs as soon as a design is on screen.
    const recoveryPendingRef = useRef<RecoveryDraft | null>(null);

    // Last design revision acknowledged by the server. Seeded from the loaded
    // design and advanced by every save response. Kept in a ref (rather than
    // written into store history) so saving never re-triggers itself.
    const revisionRef = useRef<number | null>(null);
    // Canonical serialization last known to be persisted server-side, used to
    // skip saves when nothing changed (including immediately after a load).
    const lastSyncedRef = useRef<string | null>(null);
    // Set right after a design load/reconcile so the autosave effect adopts
    // the freshly loaded state as the sync baseline instead of PUTting it back.
    const baselinePendingRef = useRef(false);
    // Holds the exact design object last given to setDesign, so the load flow
    // can reconcile a later server fetch against what the editor actually
    // shows (including any unsynced cache-restored edits).
    const cachedForEditorRef = useRef<any>(null);
    // Serializes overlapping saves: one request in flight, latest payload queued.
    const inFlightRef = useRef(false);
    const queuedRef = useRef<{ designId: string; serialized: string } | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Auto-retry bookkeeping for transient save failures (see
    // isTransientSaveError); reset whenever a save succeeds.
    const retryAttemptsRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isCurrentTarget = (targetId: string) =>
        useEditorStore.getState().design?.id === targetId;

    const cancelRetryTimer = useCallback(() => {
        if (retryTimerRef.current !== null) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    const clearRetryState = useCallback(() => {
        cancelRetryTimer();
        retryAttemptsRef.current = 0;
    }, [cancelRetryTimer]);

    // Push one canonical document to the server, keeping the revision in sync.
    // Split into a gate wrapper (sendDocument, below) and the actual send
    // (performSend): the wrapper owns the in-flight gate and the queued
    // payload and releases both in a finally block on every exit path —
    // success, error, validation failure, design switch. Without that, one
    // settled save wedged the gate and silently dropped every later save, so
    // local changes could never reach the server.
    const performSend = useCallback(async (targetId: string, serialized: string) => {
        // Only touch the store's persistence when this design is the one on
        // screen — a save flushing after a design switch must not leak its
        // in-flight/error state onto the newly loaded design.
        if (!isCurrentTarget(targetId)) {
            // Not current anymore: never PUT a design that is no longer on
            // screen, and never flip the visible save status/error for it.
            // The wrapper's finally block releases the gate and drains any
            // payload queued meanwhile (e.g. for the design now shown).
            return;
        }

        useEditorStore.getState().saveStarted();
        setSaveStatus('saving');
        setSaveMessage('');

        const document = JSON.parse(serialized);

        // Validate step: canonical JSON must pass the same checks the
        // server applies (mirrored in utils/documentValidation) before it
        // goes on the wire. Covers debounced saves, resync pushes and
        // retries alike; a failed validation surfaces the first issue's
        // path-style message and is never retried automatically.
        const issues = validateCanonicalDocument(document);
        if (issues.length > 0) {
            const message = `${issues[0].path}: ${issues[0].message}`;
            setSaveStatus('error');
            setSaveMessage(message);
            useEditorStore.getState().saveFailed(message);
            return;
        }

        // The shared revision ref belongs to the design on screen. For any
        // other target (e.g. a save flushing after a design switch) fetch
        // that design's revision directly.
        let revision = isCurrentTarget(targetId)
            ? revisionRef.current
            : null;
        if (revision == null) {
            // Reaching the server just to discover the revision can fail too;
            // surface it through state instead of letting it escape as an
            // unhandled rejection from a `void sendDocument(...)` caller.
            try {
                const res = await designApi.getDesign(targetId);
                revision = res.data?.revision ?? null;
            } catch (err: any) {
                if (isCurrentTarget(targetId)) {
                    useEditorStore.getState().saveFailed(saveErrorMessage(err));
                    setSaveStatus('error');
                    setSaveMessage(saveErrorMessage(err));
                }
                return;
            }
        }
        if (revision == null) {
            return;
        }

        // No automatic retry on 409: whole documents are replaced, so
        // blindly re-PUTting would silently overwrite the other session's
        // intervening changes. Surface the conflict instead and let the
        // user choose which version wins (Keep mine / Use server).
        let response: Awaited<ReturnType<typeof designApi.saveDocument>>;
        try {
            response = await designApi.saveDocument(targetId, document, revision);
        } catch (err: any) {
            console.error('Failed to save design document:', err);
            const conflictInfo = parseRevisionConflict(err);
            if (conflictInfo) {
                // Remember the conflict for this design even when the save
                // flushes after a design switch: the reload path must never
                // adopt the server version over the rejected local changes.
                markConflictPending(targetId);
            }
            // Only surface error state for the design that is still on screen —
            // a save finishing after a design switch must not corrupt the new
            // design's status/error.
            if (!isCurrentTarget(targetId)) return;

            if (conflictInfo) {
                // Revision conflict: keep every local change on screen and in
                // the draft cache, record the server's version, and let the
                // user resolve it explicitly. Nothing is retried or
                // overwritten automatically.
                setConflict(conflictInfo);
                useEditorStore.getState().saveFailed(conflictInfo.message);
                setSaveStatus('error');
                setSaveMessage('Saved elsewhere — choose which version to keep.');
            } else {
                useEditorStore.getState().saveFailed(saveErrorMessage(err));
                setSaveStatus('error');
                setSaveMessage(saveErrorMessage(err));
            }

            // Auto-retry only transient failures, never validation/conflict
            // responses; a 409 must not clobber the other session's changes.
            if (isTransientSaveError(err)) {
                if (retryAttemptsRef.current < SAVE_RETRY_MAX_ATTEMPTS) {
                    retryAttemptsRef.current += 1;
                    const delay = Math.min(
                        SAVE_RETRY_BASE_MS * 2 ** (retryAttemptsRef.current - 1),
                        SAVE_RETRY_MAX_MS
                    );
                    cancelRetryTimer();
                    retryTimerRef.current = setTimeout(() => {
                        retryTimerRef.current = null;
                        void sendDocument(targetId, serialized);
                    }, delay);
                }
            }
            throw err;
        }

        // Only advance sync state if this design is still the one on
        // screen; a save finishing after a design switch must not corrupt
        // the new design's baseline.
        if (!isCurrentTarget(targetId)) return;

        // The server acknowledged this document: any conflict for this design
        // is resolved — drop the pending marker along with the banner. The
        // unsynced-work journal, however, is only dropped when the document
        // that was just saved *is* the pending snapshot. A successful autosave
        // of the server/cached version the user is editing instead (e.g. after
        // ignoring a recovery prompt while offline) must not destroy work they
        // have not decided on yet — recovery would otherwise be a race against
        // the autosave it coexists with.
        setConflict(null);
        clearConflictPending(targetId);
        if (savedMatchesRecovery(recoveryPendingRef.current, document)) {
            setRecovery(null);
            recoveryPendingRef.current = null;
            void clearRecoveryDraft(userIdRef.current, targetId);
        }

        revisionRef.current = response.data.revision ?? revisionRef.current;
        lastSyncedRef.current = serialized;
        setSaveStatus('saved');
        clearRetryState();
        useEditorStore.getState().saveSuccessIfCurrent(
            response.data.revision ?? revisionRef.current ?? 0,
            new Date(),
            serialized
        );

        // Reflect the new revision/updatedAt on the in-memory design so
        // cache-restore reconciliation compares fresh metadata. Patched
        // directly (not via setDesign) to preserve undo history; the
        // document content is unchanged, so autosave skips it.
        const state = useEditorStore.getState();
        if (state.design) {
            const newDoc = JSON.parse(serialized);
            const serverDoc = response.data.document ?? state.design.document;
            useEditorStore.setState({
                design: {
                    ...state.design,
                    revision: response.data.revision ?? state.design.revision,
                    updatedAt: response.data.updatedAt ?? state.design.updatedAt,
                    document: newDoc.document ?? serverDoc,
                    pages: state.design.pages.map((p: any) => ({
                        ...p,
                        document: p.document ?? (newDoc.document as any)?.pages?.[0]?.document,
                    })),
                },
            });
        }
    }, [clearRetryState, cancelRetryTimer]);

    // Gate wrapper for performSend: serializes saves (one in flight, latest
    // payload queued) and guarantees the gate is released — with the queued
    // payload drained — no matter how the in-flight send ended. Without this,
    // a completed (or 409-rejected) save left the gate stuck and every later
    // autosave or Retry click was silently dropped.
    const sendDocument = useCallback(async (targetId: string, serialized: string) => {
        if (inFlightRef.current) {
            // A save is already running; remember the latest payload and send
            // it when the current one finishes.
            queuedRef.current = { designId: targetId, serialized };
            return;
        }
        inFlightRef.current = true;
        try {
            await performSend(targetId, serialized);
        } catch (err) {
            // performSend already reported this save's failure through the
            // store/UI state; never let it escape as an unhandled rejection
            // from a `void sendDocument(...)` caller.
            console.error('Save failed:', err);
        } finally {
            inFlightRef.current = false;
            const queued = queuedRef.current;
            queuedRef.current = null;
            if (queued) {
                void sendDocument(queued.designId, queued.serialized);
            }
        }
    }, [performSend]);

    useEffect(() => {
        // Reset document-sync state when switching to a different design.
        revisionRef.current = null;
        lastSyncedRef.current = null;
        baselinePendingRef.current = true;
        cachedForEditorRef.current = null;
        setConflict(null);
        setRecovery(null);
        recoveryPendingRef.current = null;
        setSaveStatus('idle');
        setSaveMessage('');
        // Fresh design: persistence starts clean (setDesign also resets it;
        // this covers designs that fail to load). The loaded revision is
        // adopted by the autosave baseline below once the design arrives.
        useEditorStore.getState().resetPersistence(0);

        const loadDesign = async () => {
            try {
                setError(null);
                // Determine a user-scoped cache key. We attempt to resolve the
                // current authenticated user so cached drafts are scoped to that
                // user. If we cannot determine a user (unauthenticated or error)
                // we fall back to an 'anon' namespace.
                let userId = 'anon';
                try {
                    const me = await authApi.getCurrentUser();
                    userId = String((me.data as any)?.id || 'anon');
                    try {
                        localStorage.setItem('current_user_id', userId);
                    } catch (e) {
                        // ignore storage errors
                    }
                } catch (e) {
                    // unable to resolve current user; continue as anon
                }

                userIdRef.current = userId;
                // Read any journalled unsynced work *before* a design is put on
                // screen: the journal effect below only starts once a design is
                // set, so reading first guarantees we capture the snapshot
                // instead of racing the effect's clear. The ref holds it so the
                // effect leaves it alone until the user decides.
                const journal = await loadRecoveryDraft(userId, designId);
                recoveryPendingRef.current = journal;

                const key = `design-editor:${userId}:${designId}`;

                // Reconcile a fetched server design against whatever the editor
                // currently shows, without ever silently discarding unsynced
                // local edits (which live in the cache-restored state).
                const applyServerFetch = async (server: any, allowResync: boolean) => {
                    const shown = cachedForEditorRef.current;
                    if (!shown) {
                        // Nothing cached on screen — adopt the server design outright.
                        // (No local state to protect; drop any stale conflict marker.)
                        clearConflictPending(designId);
                        baselinePendingRef.current = true;
                        cachedForEditorRef.current = server;
                        setDesign(server);
                        return;
                    }
                    const verdict = reconcileServerDesign(server, shown);

                    // A pending 409 conflict means the draft holds changes the
                    // server rejected. Never silently adopt (and thereby
                    // overwrite) the server version over them: keep the local
                    // state on screen and let the user resolve it explicitly.
                    if (verdict === 'adopt' && hasConflictPending(designId)) {
                        const sameContent =
                            JSON.stringify(buildCanonicalDocument(server)) ===
                            JSON.stringify(buildCanonicalDocument(shown));
                        if (sameContent) {
                            // Both sides converged — nothing left to resolve.
                            clearConflictPending(designId);
                        } else {
                            if (allowResync) {
                                // Only the authoritative fetch surfaces the UI; the
                                // racing background fetch simply refrains from adopting.
                                setConflict({
                                    serverRevision: server?.revision ?? null,
                                    serverDocument: server?.document ?? null,
                                    message: `Revision conflict: server is at revision ${server?.revision ?? '?'}, local draft at revision ${shown?.revision ?? '?'}.`,
                                });
                                setSaveStatus('error');
                                setSaveMessage('Saved elsewhere — choose which version to keep.');
                                useEditorStore.getState().markDirty();
                            }
                            return;
                        }
                    }

                    if (verdict === 'adopt') {
                        // Server is strictly newer — replace cache and editor state.
                        baselinePendingRef.current = true;
                        cachedForEditorRef.current = server;
                        setDesign(server);
                        try {
                            localStorage.setItem(key, JSON.stringify(server));
                        } catch (e) {
                            // ignore local save errors
                        }
                    } else if (verdict === 'resync' && allowResync) {
                        // Same revision but different content: the shown state
                        // carries unsynced local edits. Keep them on screen and
                        // push them to the server instead of dropping them.
                        // (allowResync=false for the racing background fetch so
                        // only the authoritative final fetch triggers the save.)
                        void sendDocument(designId, JSON.stringify(buildCanonicalDocument(shown)));
                    }
                    // 'keep': the editor state is at least as new; leave it untouched.
                };

                const cached = localStorage.getItem(key);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        // Cached entries may be in the raw server shape (canonical
                        // document under `document`, objects under page.objects).
                        // normalizeDesign converts them into the editor shape so
                        // cached objects are not silently dropped.
                        const normalized = normalizeDesign(parsed);

                        // Use cached design for fast restore (scoped to user), but
                        // do NOT treat it as authoritative. The flag tells autosave
                        // to adopt this state as the sync baseline rather than
                        // pushing it straight back to the server; the background
                        // fetch below reconciles it against the server.
                        baselinePendingRef.current = true;
                        cachedForEditorRef.current = normalized;
                        setDesign(normalized);

                        (async () => {
                            try {
                                const response = await designApi.getDesign(designId);
                                await applyServerFetch(response.data as any, false);
                            } catch (err) {
                                // If background fetch fails, keep using cached state and allow main flow to handle errors.
                                // No-op here to avoid noisy console logs for transient network issues.
                            }
                        })();

                        // Continue: don't return early — background reconciliation will update if needed.
                    } catch (err) {
                        // fall back to API
                    }
                }

                let response: Awaited<ReturnType<typeof designApi.getDesign>>;
                try {
                    response = await designApi.getDesign(designId);
                } catch (err: any) {
                    // Reachability failure (offline / server down): if there is
                    // anything to work with — a warm-cache design on screen or
                    // a journal snapshot even with an empty cache — offer it and
                    // keep working locally instead of dead-ending on the error
                    // screen. 401/404 still surface as errors.
                    const shown = useEditorStore.getState().design;
                    if (!err?.response && (shown || journal)) {
                        if (shouldOfferRecovery(journal, shown)) {
                            setRecovery(journal);
                        } else {
                            recoveryPendingRef.current = null;
                        }
                        setSaveStatus('error');
                        setSaveMessage('Offline — changes are only saved locally.');
                        return;
                    }
                    throw err;
                }
                await applyServerFetch(response.data, true);

                // Offer any journalled unsynced work the editor is not already
                // showing (e.g. the warm cache was evicted before the crash).
                // Identical content means the load path already restored it, so
                // the stale entry is dropped rather than prompted for.
                if (shouldOfferRecovery(journal, useEditorStore.getState().design)) {
                    setRecovery(journal);
                } else {
                    recoveryPendingRef.current = null;
                    void clearRecoveryDraft(userId, designId);
                }
            } catch (error: any) {
                console.error('Failed to load design:', error);
                if (error.response?.status === 404) {
                    setError('Design not found. It may have been deleted or you may not have access to it.');
                } else if (error.response?.status === 401) {
                    setError('You are not authenticated. Please log in again.');
                } else {
                    setError('Failed to load design. Please try again.');
                }
            }
        };

        loadDesign();
    }, [designId, setDesign]);

    // Server autosave: persist the canonical document (debounced) alongside the
    // localStorage draft cache below. Deliberately not cancelled on cleanup —
    // a pending save still fires after unmount so the last edit reaches the
    // server; overlapping sends are serialized inside sendDocument.
    useEffect(() => {
        if (!design) return;
        // The store can briefly hold the previous design while a new designId
        // loads — never push a mismatched document.
        if (design.id && design.id !== designId) return;

        const serialized = JSON.stringify(buildCanonicalDocument(design));

        if (baselinePendingRef.current) {
            // Fresh load/reconcile: adopt as the sync baseline instead of
            // immediately pushing identical content back to the server. Any
            // save scheduled before the baseline arrived targets superseded
            // state, so drop it.
            baselinePendingRef.current = false;
            if (saveTimerRef.current !== null) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            if (design.revision != null) {
                revisionRef.current = design.revision;
                // Seed the persistence revision so the UI can report the
                // server-acked state even before the first local save.
                const persisted = useEditorStore.getState().persistence;
                if (persisted.revision !== design.revision) {
                    useEditorStore.getState().resetPersistence(design.revision);
                }
            }
            lastSyncedRef.current = serialized;
            setSaveStatus((status) => (status === 'saving' ? 'idle' : status));
            return;
        }

        if (serialized === lastSyncedRef.current) {
            // Nothing new to send (e.g. undo back to the last synced state).
            if (saveTimerRef.current !== null) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
                setSaveStatus((status) => (status === 'saving' ? 'idle' : status));
            }
            // Content matches the server again; nothing left to persist.
            if (useEditorStore.getState().persistence.isDirty) {
                useEditorStore.getState().markClean();
            }
            return;
        }

        // Dirty edits awaiting the debounced PUT — distinguishable from an
        // in-flight request (which shows 'Saving…' once sendDocument runs).
        setSaveStatus('saving');
        useEditorStore.getState().markDirty();
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void sendDocument(designId, serialized);
        }, SERVER_SAVE_DEBOUNCE_MS);
    }, [design, designId, sendDocument]);

    // Autosave design to localStorage. Use the shared user-id resolver so the
    // key namespace always matches the journal and the conflict marker — the
    // load path reads the same key.
    useEffect(() => {
        if (!design) return;
        const userId = currentRecoveryUserId();
        const key = `design-editor:${userId}:${designId}`;
        const save = debounce((d: any) => {
            try {
                localStorage.setItem(key, JSON.stringify(d));
            } catch (err) {
                console.error('Failed to save design locally', err);
            }
        }, 1000);

        save(design);

        // Cancel any pending autosave when effect cleans up (component unmount or deps change)
        return () => {
            save.cancel?.();
        };
    }, [design, designId]);

    // Durable unsynced-work journal (IndexedDB). Mirrors the localStorage
    // cache above but only while the design carries content the server has not
    // acknowledged — a crash or a failed/interrupted save leaves it behind for
    // the load path to offer back. Once the content matches the last synced
    // document the entry is dropped so a clean reload never nags.
    useEffect(() => {
        if (!design) return;
        // The store can briefly hold the previous design while a new designId
        // loads — never journal a mismatched document.
        if (design.id && design.id !== designId) return;
        // A snapshot is awaiting a Restore/Discard decision; leave it untouched
        // so ignoring the prompt and reloading is non-destructive.
        if (recoveryPendingRef.current) return;

        const userId = userIdRef.current;
        const serialized = JSON.stringify(buildCanonicalDocument(design));
        const unsynced =
            persistence.isDirty ||
            (lastSyncedRef.current !== null && serialized !== lastSyncedRef.current);

        if (!unsynced) {
            // Content is already acknowledged by the server — nothing to recover.
            void clearRecoveryDraft(userId, designId);
            return;
        }

        const save = debounce((d: any) => {
            void saveRecoveryDraft(userId, designId, d, d?.revision ?? null);
        }, RECOVERY_DEBOUNCE_MS);

        save(design);

        return () => {
            save.cancel?.();
        };
    }, [design, designId, persistence.isDirty]);

    // Manual retry from the status pill: re-serialize and re-send the *current*
    // canonical document. Never re-send a stale payload — newer local edits may
    // have already changed the design, and persisting the stale document would
    // overwrite them and temporarily mark the newer edits clean.
    const handleRetrySave = useCallback(() => {
        if (persistence.isSaving) return;
        if (!isCurrentTarget(designId)) return;
        clearRetryState();
        const serialized = JSON.stringify(buildCanonicalDocument(design));
        void sendDocument(designId, serialized);
    }, [persistence.isSaving, design, designId, sendDocument, clearRetryState]);

    // -- revision conflict resolution ----------------------------------------
    //
    // A 409 means another session saved a version this client never saw.
    // Neither version is destroyed: the server keeps its document (plus a
    // DesignVersion snapshot of every save) and the local edits stay in the
    // editor and the draft cache. Resolution is always explicit — nothing is
    // overwritten or discarded silently in either direction.

    // Keep the local document: adopt the server's revision (so the write
    // passes optimistic concurrency) and re-PUT the local content on top of
    // it. This replaces the other session's version only by explicit user
    // consent; the server keeps a version snapshot of what it replaces.
    const handleKeepMine = useCallback(async () => {
        if (persistence.isSaving) return;
        if (!isCurrentTarget(designId)) return;
        const pending = conflict;
        if (!pending) return;
        clearRetryState();
        try {
            let revision = pending.serverRevision;
            if (revision == null) {
                const res = await designApi.getDesign(designId);
                revision = res.data?.revision ?? null;
            }
            if (revision == null) {
                throw new Error('Could not determine the server revision');
            }
            revisionRef.current = revision;
            const latest = useEditorStore.getState().design ?? design;
            void sendDocument(designId, JSON.stringify(buildCanonicalDocument(latest)));
        } catch (err) {
            console.error('Failed to keep local changes:', err);
            setSaveStatus('error');
            setSaveMessage('Could not reach the server — your changes are still saved locally.');
        }
    }, [conflict, persistence.isSaving, design, designId, sendDocument, clearRetryState]);

    // Use the server version: replace the local document (and draft) with the
    // stored one. Explicit user action — the load path itself never does this
    // silently while rejected local changes exist.
    const handleUseServer = useCallback(async () => {
        if (persistence.isSaving) return;
        if (!isCurrentTarget(designId)) return;
        const pending = conflict;
        if (!pending) return;
        clearRetryState();
        try {
            let adopted: any = null;
            if (pending.serverDocument && pending.serverRevision != null) {
                const currentDesign: any = useEditorStore.getState().design;
                adopted = normalizeDesign({
                    ...currentDesign,
                    pages: undefined,
                    document: pending.serverDocument,
                    revision: pending.serverRevision,
                    width: pending.serverDocument.width ?? currentDesign?.width,
                    height: pending.serverDocument.height ?? currentDesign?.height,
                });
            } else {
                const res = await designApi.getDesign(designId);
                adopted = res.data;
            }
            if (!adopted) return;
            // Adopt as the sync baseline (the path a normal load takes): the
            // autosave effect seeds revisionRef/persistence from it instead of
            // pushing the just-adopted content straight back to the server.
            baselinePendingRef.current = true;
            cachedForEditorRef.current = adopted;
            clearConflictPending(designId);
            setConflict(null);
            setSaveStatus('idle');
            setSaveMessage('');
            setDesign(adopted);
        } catch (err) {
            console.error('Failed to load the server version:', err);
            setSaveStatus('error');
            setSaveMessage('Could not load the server version — your changes are still saved locally.');
        }
    }, [conflict, persistence.isSaving, designId, clearRetryState]);

    // -- local unsaved recovery ---------------------------------------------
    //
    // Work journalled in IndexedDB by an earlier session that the editor is not
    // already showing. Recovery is explicit: Restore puts the snapshot back on
    // screen (the normal autosave then pushes it), Discard drops the journal
    // and keeps the server version.

    const handleRestoreRecovery = useCallback(() => {
        if (!recovery) return;
        // Scope by the record's own design id rather than the store, because
        // the journal can be offered precisely when nothing is on screen yet
        // (cache evicted + server unreachable) — `isCurrentTarget` would be
        // false there and the Restore button would silently do nothing.
        if (recovery.designId && recovery.designId !== designId) return;
        const restored = normalizeDesign(recovery.design);
        // Show the snapshot and let the autosave effect treat it as unsynced
        // (clearing the baseline flag) rather than as freshly loaded server
        // state, so the recovered work is validated and pushed normally.
        baselinePendingRef.current = false;
        cachedForEditorRef.current = restored;
        recoveryPendingRef.current = null;
        setRecovery(null);
        setDesign(restored);
        // By definition the snapshot is not on the server; mark it unsynced so
        // the journal keeps it (rather than clearing it as a clean load) and
        // autosave pushes it as soon as the server is reachable again.
        useEditorStore.getState().markDirty();
    }, [recovery, designId, setDesign]);

    const handleDiscardRecovery = useCallback(() => {
        recoveryPendingRef.current = null;
        void clearRecoveryDraft(userIdRef.current, designId);
        setRecovery(null);
    }, [designId]);

    // Shared recovery prompt, rendered both in the editor and above the loading
    // spinner: offline with an evicted cache offers the journal before any
    // design is on screen, so the prompt must be reachable there too.
    const recoveryBanner = recovery ? (
        <div
            role="alert"
            className="fixed top-3 left-1/2 z-50 max-w-[460px] -translate-x-1/2 rounded-lg bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 shadow-md ring-1 ring-amber-300"
        >
            <span className="inline-flex flex-wrap items-center justify-center gap-2">
                <span>
                    Unsaved changes from a previous session were found.
                </span>
                <button
                    type="button"
                    onClick={handleRestoreRecovery}
                    title="Load the recovered unsaved changes back into the editor"
                    className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                >
                    Restore
                </button>
                <button
                    type="button"
                    onClick={handleDiscardRecovery}
                    title="Discard the recovered changes and keep the version saved on the server"
                    className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100"
                >
                    Discard
                </button>
            </span>
        </div>
    ) : null;

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center max-w-md">
                    <div className="text-5xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Design</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <a
                        href="/designs"
                        className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Back to Designs
                    </a>
                </div>
            </div>
        );
    }

    if (!design) {
        return (
            <div className="flex items-center justify-center h-screen">
                {recoveryBanner}
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading design...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Save status indicator (server autosave), driven by the store's
                PersistenceState: dirty → debounced validate → PUT → saved. */}
            {saveStatus !== 'idle' && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`fixed top-3 right-3 z-50 max-w-[320px] rounded-full px-3 py-1 text-xs font-medium shadow-sm ${
                        saveStatus === 'error'
                            ? 'bg-red-100 text-red-700'
                            : saveStatus === 'saving'
                              ? 'bg-white text-gray-500'
                              : 'bg-white text-green-700'
                    }`}
                    title={saveStatus === 'error' ? saveMessage : undefined}
                >
                    {saveStatus === 'saving' &&
                        (persistence.isSaving ? 'Saving…' : 'Unsaved changes…')}
                    {saveStatus === 'saved' &&
                        (persistence.lastSavedAt
                            ? `✓ Saved ${formatSavedAt(persistence.lastSavedAt)}`
                            : '✓ Saved')}
                    {saveStatus === 'error' && (
                        <span className="inline-flex flex-wrap items-center gap-2">
                            <span
                                className="truncate"
                                title={conflict ? conflict.message : saveMessage}
                            >
                                ⚠ {saveMessage}
                            </span>
                            {conflict ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleKeepMine}
                                        disabled={persistence.isSaving}
                                        title="Save your version on top of the one stored on the server (the server keeps its version in history)"
                                        className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        Keep mine
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleUseServer}
                                        disabled={persistence.isSaving}
                                        title="Discard your local changes and load the version saved elsewhere"
                                        className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-50"
                                    >
                                        Use server
                                    </button>
                                </>
                            ) : (
                                persistence.isDirty && (
                                    <button
                                        type="button"
                                        onClick={handleRetrySave}
                                        disabled={persistence.isSaving}
                                        className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        Retry
                                    </button>
                                )
                            )}
                        </span>
                    )}
                </div>
            )}

            {/* Local unsaved recovery prompt: unsynced work found in the
                IndexedDB journal that the editor is not already showing. */}
            {recoveryBanner}

            {/* Toolbar */}
            <EditorToolbar />

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <LeftSidebar />

                {/* Canvas */}
                <Canvas />

                {/* Right Sidebar */}
                <RightSidebar />
            </div>

            {/* Page Navigator */}
            <PageNavigator />
        </div>
    );
}
