import { buildCanonicalDocument, canonicalStringify, sameCanonicalContent } from '@/services/api';

// Durable journal of unsynced editor drafts.
//
// The editor also keeps a localStorage warm-start cache (see EditorLayout),
// but localStorage is small, synchronous and easy for the browser to evict
// under quota pressure. This journal records the last snapshot the server has
// not acknowledged in IndexedDB, which has a much larger quota, so work lost
// to a crash, a dropped network or an interrupted save can be offered back to
// the user explicitly (Restore / Discard) instead of silently disappearing.
//
// Every function is failure-tolerant by design: recovery is a safety net, so a
// missing, blocked or corrupt database must never break the editor. Calls
// simply resolve to null/no-op when IndexedDB is unavailable (SSR, private
// browsing, disabled storage).

export interface RecoveryDraft {
    /** `${userId}:${designId}` — the object store key. */
    key: string;
    userId: string;
    designId: string;
    /** Editor-shaped design snapshot captured while it was unsynced. */
    design: any;
    /** Last server revision known when the snapshot was written. */
    revision: number | null;
    /** Epoch ms the snapshot was written. */
    savedAt: number;
}

export const RECOVERY_DB_NAME = 'design-platform-recovery';
export const RECOVERY_STORE = 'unsaved-drafts';
export const RECOVERY_DEBOUNCE_MS = 500;

const RECOVERY_DB_VERSION = 1;

// User-scoped key, matching the localStorage draft/conflict marker scheme so a
// draft is never recovered into another account's session.
export function recoveryKey(userId: string, designId: string): string {
    return `${userId}:${designId}`;
}

// Resolved user id for the recovery journal and the user-scoped storage keys
// (draft cache, conflict marker). Single home for the key logic — callers must
// not read `current_user_id` from localStorage directly. Falls back to 'anon'
// when unset (unauthenticated session or storage unavailable), matching the
// editor's load path so both sides always agree on the namespace.
export function currentRecoveryUserId(): string {
    if (typeof window === 'undefined') return 'anon';
    try {
        return localStorage.getItem('current_user_id') || 'anon';
    } catch {
        return 'anon';
    }
}

function indexedDbAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

// The connection is cached, but a failed open clears the cache so a later call
// can retry (e.g. storage was temporarily blocked during startup).
let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> | null {
    if (!indexedDbAvailable()) return null;
    if (dbPromise) return dbPromise;

    const promise = new Promise<IDBDatabase>((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(RECOVERY_DB_NAME, RECOVERY_DB_VERSION);
        } catch (err) {
            reject(err);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
                db.createObjectStore(RECOVERY_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        // A blocked open (another tab holds an older version) is not a
        // failure: it can still succeed once the other tab closes. The open
        // stays pending and whichever callback fires first settles the
        // promise; the failure-tolerant wrappers below cover the genuinely
        // unavailable case, so this is only logged, never rejected.
        request.onblocked = () => {
            console.warn(
                `IndexedDB open for "${RECOVERY_DB_NAME}" is blocked by another tab; waiting…`
            );
        };
    });

    dbPromise = promise;
    promise.catch(() => {
        if (dbPromise === promise) dbPromise = null;
    });
    return promise;
}

// Run one object-store operation in its own transaction, resolving to null on
// any failure (including a DataCloneError from a non-serializable snapshot).
// Writes resolve only on tx.oncomplete: request.onsuccess fires before the
// transaction commits, so a quota abort would otherwise be reported as a
// successful save.
async function withStore<T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
    const opening = openDatabase();
    if (!opening) return null;
    try {
        const db = await opening;
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(RECOVERY_STORE, mode);
            const request = op(tx.objectStore(RECOVERY_STORE));
            let result: T | undefined;
            request.onsuccess = () => {
                result = request.result as T;
            };
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => resolve(result as T);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        });
    } catch {
        return null;
    }
}

// Write (or overwrite) the recovery snapshot for a design. Fire-and-forget:
// callers should not await this on the editing hot path.
export async function saveRecoveryDraft(
    userId: string,
    designId: string,
    design: any,
    revision: number | null = null
): Promise<void> {
    if (!design) return;
    const record: RecoveryDraft = {
        key: recoveryKey(userId, designId),
        userId,
        designId,
        design,
        revision: revision ?? null,
        savedAt: Date.now(),
    };
    await withStore('readwrite', (store) => store.put(record));
}

export async function loadRecoveryDraft(
    userId: string,
    designId: string
): Promise<RecoveryDraft | null> {
    const record = await withStore<RecoveryDraft | undefined>('readonly', (store) =>
        store.get(recoveryKey(userId, designId))
    );
    if (!record || !record.design) return null;
    return record;
}

export async function clearRecoveryDraft(userId: string, designId: string): Promise<void> {
    await withStore('readwrite', (store) => store.delete(recoveryKey(userId, designId)));
}

// Compare two designs by their canonical content, ignoring the editor/server
// shape differences (page.objects vs page.document.objects), any volatile
// metadata such as revision/updatedAt, and object key insertion order.
export function sameDesignContent(a: any, b: any): boolean {
    return sameCanonicalContent(a, b);
}

// A journalled draft is only worth offering when it still holds work the editor
// is not already showing: identical content means the snapshot was already
// restored (or saved), so prompting would be noise.
export function shouldOfferRecovery(
    record: RecoveryDraft | null | undefined,
    shown: any
): boolean {
    if (!record || !record.design) return false;
    if (!shown) return true;
    return !sameDesignContent(record.design, shown);
}

// Whether a document just acknowledged by the server IS the pending snapshot.
// Drives the save-success path: a save only retires the journal when the saved
// content is the snapshot itself. With no pending snapshot there is nothing to
// protect, so every save is safe to clear with; a missing saved payload can
// never be the snapshot, so the journal stays.
// `savedDocument` is the canonical document that was PUT (buildCanonicalDocument
// output); the snapshot is normalized the same way before comparing, with
// key-order-insensitive serialization so equal content never misses.
export function savedMatchesRecovery(
    record: RecoveryDraft | null | undefined,
    savedDocument: any
): boolean {
    if (!record || !record.design) return true;
    if (!savedDocument) return false;
    try {
        return (
            canonicalStringify(buildCanonicalDocument(record.design)) ===
            canonicalStringify(savedDocument)
        );
    } catch {
        return false;
    }
}
