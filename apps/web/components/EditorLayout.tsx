'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/stores/editor';
import {
    designApi,
    authApi,
    normalizeDesign,
    buildCanonicalDocument,
    reconcileServerDesign,
} from '@/services/api';
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
    const sendDocument = useCallback(async (targetId: string, serialized: string) => {
        if (inFlightRef.current) {
            // A save is already running; remember the latest payload and send
            // it when the current one finishes.
            queuedRef.current = { designId: targetId, serialized };
            return;
        }
        inFlightRef.current = true;
        // Only touch the store's persistence when this design is the one on
        // screen — a save flushing after a design switch must not leak its
        // in-flight/error state onto the newly loaded design.
        if (!isCurrentTarget(targetId)) {
            // Not current anymore: still serialize + validate so we can surface
            // client-side validation errors, but never flip the visible save
            // status/error for a stale target. Bail before we commit to saving
            // it (we still queued locally, so the finally block will drain it).
            const staleDocument = JSON.parse(serialized);
            const issues = validateCanonicalDocument(staleDocument);
            if (issues.length > 0) {
                inFlightRef.current = false;
                queuedRef.current = null;
                return;
            }
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
            inFlightRef.current = false;
            queuedRef.current = null;
            return;
        }

        // The shared revision ref belongs to the design on screen. For any
        // other target (e.g. a save flushing after a design switch) fetch
        // that design's revision directly.
        let revision = isCurrentTarget(targetId)
            ? revisionRef.current
            : null;
        if (revision == null) {
            const res = await designApi.getDesign(targetId);
            revision = res.data?.revision ?? null;
        }
        if (revision == null) {
            inFlightRef.current = false;
            queuedRef.current = null;
            return;
        }

        // No automatic retry on 409: whole documents are replaced, so
        // blindly re-PUTting would silently overwrite the other session's
        // intervening changes. Surface the conflict instead — the user
        // reloads/merges and the next edit saves normally.
        let response: Awaited<ReturnType<typeof designApi.saveDocument>>;
        try {
            response = await designApi.saveDocument(targetId, document, revision);
        } catch (err: any) {
            console.error('Failed to save design document:', err);
            // Only surface error state for the design that is still on screen —
            // a save finishing after a design switch must not corrupt the new
            // design's status/error.
            if (!isCurrentTarget(targetId)) return;

            useEditorStore.getState().saveFailed(saveErrorMessage(err));
            setSaveStatus('error');
            setSaveMessage(
                err?.response?.status === 409
                    ? 'Saved elsewhere — reload to pick up the latest changes.'
                    : saveErrorMessage(err)
            );

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

    useEffect(() => {
        // Reset document-sync state when switching to a different design.
        revisionRef.current = null;
        lastSyncedRef.current = null;
        baselinePendingRef.current = true;
        cachedForEditorRef.current = null;
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

                const key = `design-editor:${userId}:${designId}`;

                // Reconcile a fetched server design against whatever the editor
                // currently shows, without ever silently discarding unsynced
                // local edits (which live in the cache-restored state).
                const applyServerFetch = async (server: any, allowResync: boolean) => {
                    const shown = cachedForEditorRef.current;
                    if (!shown) {
                        // Nothing cached on screen — adopt the server design outright.
                        baselinePendingRef.current = true;
                        cachedForEditorRef.current = server;
                        setDesign(server);
                        return;
                    }
                    const verdict = reconcileServerDesign(server, shown);
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

                const response = await designApi.getDesign(designId);
                await applyServerFetch(response.data, true);
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

    // Autosave design to localStorage. Use the same user-scoped key that
    // `loadDesign` creates so drafts are stored per authenticated user.
    useEffect(() => {
        if (!design) return;
        const userId = typeof window !== 'undefined' ? (localStorage.getItem('current_user_id') || 'anon') : 'anon';
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
                        <span className="inline-flex items-center gap-2">
                            <span className="truncate">⚠ {saveMessage}</span>
                            {persistence.isDirty && (
                                <button
                                    type="button"
                                    onClick={handleRetrySave}
                                    disabled={persistence.isSaving}
                                    className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                    Retry
                                </button>
                            )}
                        </span>
                    )}
                </div>
            )}

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
