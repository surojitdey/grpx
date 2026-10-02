import axios from 'axios';
import { Design, Template, Asset, ExportJob, User, DesignShare } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const client = axios.create({
    baseURL: API_URL,
    // Don't set default Content-Type - let axios handle it per request
    // FormData needs to set multipart/form-data with boundary automatically
    headers: {},
});

// Convert snake_case keys to camelCase
function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

function transformKeys(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(transformKeys);
    }
    if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).reduce((result: any, key: string) => {
            const camelKey = snakeToCamel(key);
            result[camelKey] = transformKeys(obj[key]);
            return result;
        }, {});
    }
    return obj;
}

// Convert a canonical page ({id, name, objects}) into the editor page shape
// ({id, name, document: {objects, background, ...}}). The server stores objects
// directly on each page; the editor reads them from page.document.objects.
// Pages without their own background inherit the design-level one.
// Returns null for non-object input so callers can filter safely.
function canonicalPageToEditorPage(page: any, designBackground: any): any | null {
    if (!page || typeof page !== 'object') return null;
    if (page.document && Array.isArray(page.document.objects)) return page;
    return {
        ...page,
        document: {
            schemaVersion: '1.0',
            objects: Array.isArray(page.objects) ? page.objects : [],
            background:
                page.background || designBackground || { type: 'color', value: '#FFFFFF' },
            ...(page.document || {}),
        },
    };
}

// Normalize a server Design object into the client `Design` shape expected
// by the editor UI: move `document.pages` to top-level `pages` (converting
// canonical pages into editor pages so page.objects land in
// page.document.objects) and keep other top-level metadata.
// `transformKeys` should be run first. Exported for reuse when restoring
// locally-cached designs that may be in either shape.
//
// Top-level `pages` always wins when present: the canonical `document` is
// never rewritten by local edits, so preferring it would resurrect stale
// content over the edited pages (e.g. on localStorage cache restore).
// Page and object IDs are passed through untouched in both shapes, so a
// design loads with the same IDs every time.
export function normalizeDesign(obj: any): any {
    if (!obj) return obj;
    const out = { ...obj };
    if (!Array.isArray(out.pages) && out.document && Array.isArray(out.document.pages)) {
        out.pages = out.document.pages
            .map((page: any) => canonicalPageToEditorPage(page, out.document.background))
            .filter(Boolean);
    }
    return out;
}

// Rebuild the canonical server document from the editor's design shape —
// the inverse of normalizeDesign. The editor keeps objects at
// `page.document.objects`; the canonical schema stores them at
// `page.objects` with the design-level background on the envelope.
// Per-page backgrounds are only included when they differ from the envelope
// background, so a background inherited from the design is not baked into
// every page on save.
export function buildCanonicalDocument(design: any): any {
    const pages = Array.isArray(design?.pages) ? design.pages.filter(Boolean) : [];
    const background =
        design?.document?.background ||
        pages.find((page: any) => page?.document?.background)?.document.background ||
        { type: 'color', value: '#FFFFFF' };

    return {
        schemaVersion: design?.document?.schemaVersion || '1.0',
        width: design?.width ?? design?.document?.width,
        height: design?.height ?? design?.document?.height,
        background,
        pages: pages.map((page: any) => {
            const pageBackground = page.document?.background ?? page.background;
            const inheritsEnvelopeBackground =
                pageBackground && JSON.stringify(pageBackground) === JSON.stringify(background);
            return {
                id: page.id,
                ...(typeof page.name === 'string' ? { name: page.name } : {}),
                ...(pageBackground && !inheritsEnvelopeBackground ? { background: pageBackground } : {}),
                objects: Array.isArray(page.document?.objects)
                    ? page.document.objects
                    : Array.isArray(page.objects)
                      ? page.objects
                      : [],
            };
        }),
    };
}

// Stable serialization: JSON.stringify with object keys recursively sorted, so
// structurally equal documents always produce identical strings regardless of
// the key insertion order each producer happened to use (server JSON, axios key
// transforms, IndexedDB journals, undo-history clones). Plain JSON.stringify of
// two equal documents can differ, which made content comparisons report
// spurious differences. Use for equality checks only — the wire payload is
// insensitive to key order.
export function canonicalStringify(value: any): string {
    return JSON.stringify(value, (_key, val) => {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            const sorted: Record<string, any> = {};
            for (const key of Object.keys(val).sort()) {
                sorted[key] = val[key];
            }
            return sorted;
        }
        return val;
    });
}

// Compare two designs by canonical content, with key-order-insensitive
// comparison (see canonicalStringify). False on any failure — callers treat
// "cannot compare" as "different".
export function sameCanonicalContent(a: any, b: any): boolean {
    if (!a || !b) return false;
    try {
        return (
            canonicalStringify(buildCanonicalDocument(a)) ===
            canonicalStringify(buildCanonicalDocument(b))
        );
    } catch {
        return false;
    }
}

// Decide how a freshly fetched server design relates to the locally-cached
// one, without ever discarding unsynced local edits on a guess:
//   'adopt'  – server is strictly newer (higher revision); replace the cache
//   'resync' – same revision but different content: the cache carries
//              unsynced local edits that must be preserved and pushed
//   'keep'   – cache is at least as new; leave the editor state untouched
export function reconcileServerDesign(server: any, cached: any): 'adopt' | 'resync' | 'keep' {
    const serverRevision = server?.revision;
    const cachedRevision = cached?.revision;

    if (serverRevision != null && cachedRevision != null) {
        if (serverRevision > cachedRevision) return 'adopt';
        if (serverRevision < cachedRevision) return 'keep';
        // Equal revisions: the cache sits at the same save point, so any
        // content difference is an unsynced local edit. Compared with
        // key-order-insensitive serialization so equal content is never
        // misread as an edit just because the producers ordered keys
        // differently.
        return sameCanonicalContent(server, cached) ? 'keep' : 'resync';
    }

    // No comparable revisions (e.g. a cache written before revisions were
    // tracked): fall back to updatedAt, and prefer the cache whenever the
    // comparison is inconclusive.
    const serverUpdated = server?.updatedAt ? new Date(server.updatedAt).getTime() : null;
    const cachedUpdated = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : null;
    if (serverUpdated != null && cachedUpdated != null && serverUpdated > cachedUpdated) {
        return 'adopt';
    }
    return 'keep';
}

// --- pending conflict marker -------------------------------------------------
// A 409 means the local draft carries changes the server rejected. The marker
// survives reloads so the load path can distinguish "stale cache" (safe to
// adopt the newer server version) from "rejected local changes" (must never
// be silently overwritten by adopting): with the marker set, reconcileServerDesign's
// 'adopt' verdict is held back and the conflict is surfaced for explicit
// user resolution instead.
function conflictMarkerKey(userId: string, designId: string): string {
    return `design-editor-conflict:${userId}:${designId}`;
}

function currentDraftUserId(): string {
    if (typeof window === 'undefined') return 'anon';
    return localStorage.getItem('current_user_id') || 'anon';
}

export function markConflictPending(designId: string): void {
    try {
        localStorage.setItem(conflictMarkerKey(currentDraftUserId(), designId), String(Date.now()));
    } catch {
        // Storage unavailable — the in-memory conflict state still protects the session.
    }
}

export function clearConflictPending(designId: string): void {
    try {
        localStorage.removeItem(conflictMarkerKey(currentDraftUserId(), designId));
    } catch {
        // ignore
    }
}

export function hasConflictPending(designId: string): boolean {
    try {
        return localStorage.getItem(conflictMarkerKey(currentDraftUserId(), designId)) !== null;
    } catch {
        return false;
    }
}

// Conflict state parsed from a 409 response to PUT /designs/{id}/document/.
// `serverRevision` is the revision the server currently holds and
// `serverDocument` is the canonical document stored under it, so the editor
// can offer explicit resolution (keep local / adopt server) without another
// fetch — and never silently overwrite either side.
export interface RevisionConflict {
    serverRevision: number | null;
    serverDocument: any | null;
    message: string;
}

// Extract the conflict payload from an axios error returned by saveDocument.
// Returns null for any error that is not a revision conflict (409), so
// callers can branch on it: `const conflict = parseRevisionConflict(err)`.
export function parseRevisionConflict(err: any): RevisionConflict | null {
    if (err?.response?.status !== 409) return null;
    const data = err.response.data || {};
    const message =
        typeof data.detail === 'string'
            ? data.detail
            : Array.isArray(data.revision) && typeof data.revision[0] === 'string'
              ? data.revision[0]
              : 'Saved elsewhere — reload to pick up the latest changes.';
    return {
        serverRevision: typeof data.server_revision === 'number' ? data.server_revision : null,
        serverDocument: data.current_document ?? null,
        message,
    };
}

// Add token to requests
client.interceptors.request.use((config) => {
    // Allow callers to skip attaching the Authorization header by setting
    // a custom `x-skip-auth` header on the request config. This is useful
    // for login/register endpoints where an expired token in localStorage
    // should not be sent.
    const skip = config.headers && (config.headers as any)['x-skip-auth'];
    if (skip) {
        // remove the helper header before sending
        delete (config.headers as any)['x-skip-auth'];
    }

    // Set Content-Type for JSON requests (but not for FormData)
    if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
    }

    // Only attach Authorization header when caller did NOT request skip
    if (!skip) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        if (token) {
            config.headers = config.headers || {};
            (config.headers as any).Authorization = `Bearer ${token}`;
        }
    }

    return config;
});

// Auth API
export const authApi = {
    register: (email: string, password: string, name: string) => {
        const nameParts = name.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        return client.post('/auth/register/', {
            email,
            password,
            password_confirm: password,
            username: email.split('@')[0], // Use email prefix as username
            first_name: firstName,
            last_name: lastName,
        }, { headers: { 'x-skip-auth': '1' } });
    },

    login: (email: string, password: string) =>
        client.post('/auth/login/', { email, password }, { headers: { 'x-skip-auth': '1' } }),

    logout: () => client.post('/auth/logout/', {}),

    refresh: () => client.post('/auth/token/refresh/', {}),

    getCurrentUser: () => client.get<User>('/auth/me/'),
};

// Design API
export const designApi = {
    getDesigns: async () => {
        const response = await client.get<Design[]>('/designs/');
        return { ...response, data: transformKeys(response.data) };
    },

    getDesign: async (id: string) => {
        const response = await client.get<Design>(`/designs/${id}/`);
        const data = transformKeys(response.data);
        return { ...response, data: normalizeDesign(data) };
    },

    createDesign: async (data: Partial<Design>) => {
        const response = await client.post<Design>('/designs/', data);
        const d = transformKeys(response.data);
        return { ...response, data: normalizeDesign(d) };
    },

    updateDesign: async (id: string, data: Partial<Design>) => {
        const response = await client.patch<Design>(`/designs/${id}/`, data);
        const d = transformKeys(response.data);
        return { ...response, data: normalizeDesign(d) };
    },

    // Replace the canonical document (PUT /designs/{id}/document/) with
    // optimistic-concurrency protection. `revision` must be the client's last
    // known revision; the server replies 409 if it has advanced since.
    // Resolves with { id, revision, schemaVersion, updatedAt } on success.
    saveDocument: async (id: string, document: any, revision: number) => {
        const response = await client.put(`/designs/${id}/document/`, { document, revision });
        return { ...response, data: transformKeys(response.data) };
    },

    deleteDesign: (id: string) => client.delete(`/designs/${id}/`),

    duplicateDesign: async (id: string) => {
        const response = await client.post<Design>(`/designs/${id}/duplicate/`, {});
        const d = transformKeys(response.data);
        return { ...response, data: normalizeDesign(d) };
    },
};

// Pages API
// Structural page operations mirror the canonical document endpoints:
// every call returns { id, revision, schemaVersion, updatedAt, document,
// pageId } so the caller can adopt the new revision and document without a
// second fetch. `revision` is optional and enables optimistic locking (409).
export const pageApi = {
    createPage: (designId: string, name?: string, revision?: number) =>
        client.post(`/designs/${designId}/pages/`, {
            ...(name ? { name } : {}),
            ...(revision != null ? { revision } : {}),
        }),

    renamePage: (designId: string, pageId: string, name: string, revision?: number) =>
        client.patch(`/designs/${designId}/pages/${pageId}/`, {
            name,
            ...(revision != null ? { revision } : {}),
        }),

    deletePage: (designId: string, pageId: string, revision?: number) =>
        client.delete(`/designs/${designId}/pages/${pageId}/`, {
            params: revision != null ? { revision } : undefined,
        }),

    duplicatePage: (designId: string, pageId: string, revision?: number) =>
        client.post(`/designs/${designId}/pages/${pageId}/duplicate/`, {
            ...(revision != null ? { revision } : {}),
        }),

    // Reorder: pass `index` for a drag/drop target, or `direction` for
    // move-up / move-down.
    movePage: (
        designId: string,
        pageId: string,
        target: { index?: number; direction?: 'up' | 'down' },
        revision?: number
    ) =>
        client.post(`/designs/${designId}/pages/${pageId}/move/`, {
            ...target,
            ...(revision != null ? { revision } : {}),
        }),
};

// Asset API
export const assetApi = {
    getAssets: () => client.get<Asset[]>('/assets/'),

    getAsset: (id: string) => client.get<Asset>(`/assets/${id}/`),

    deleteAsset: (id: string) => client.delete(`/assets/${id}/`),

    directUpload: async (file: File, name?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (name) {
            formData.append('name', name);
        }

        // Don't override Content-Type - let axios set it with proper boundary
        // The request interceptor will add Authorization header automatically
        const response = await client.post<Asset>('/assets/direct-upload/', formData);
        const data = transformKeys(response.data);
        return { ...response, data };
    },

    getUploadUrl: (filename: string, contentType: string) =>
        client.post('/assets/upload-url/', { filename, contentType }),

    completeUpload: (key: string, etag: string) =>
        client.post('/assets/complete/', { key, etag }),
};

// Template API
export const templateApi = {
    getTemplates: (category?: string) =>
        client.get<Template[]>('/templates/', { params: { category } }),

    getTemplate: (id: string) => client.get<Template>(`/templates/${id}/`),

    createDesignFromTemplate: (templateId: string) =>
        client.post<Design>('/designs/from-template/', { templateId }).then((r) => ({ ...r, data: normalizeDesign(transformKeys(r.data)) })),
};

// Export API
export const exportApi = {
    createExport: (designId: string, format: string, quality?: number) =>
        client.post<ExportJob>(`/designs/${designId}/exports/`, {
            format,
            quality,
        }),

    getExport: (id: string) => client.get<ExportJob>(`/exports/${id}/`),
};

// Share API
export const shareApi = {
    createShare: (designId: string, permission: string, expiresAt?: string) =>
        client.post<DesignShare>(`/designs/${designId}/shares/`, {
            permission,
            expiresAt,
        }),

    getShares: (designId: string) =>
        client.get<DesignShare[]>(`/designs/${designId}/shares/`),

    deleteShare: (designId: string, shareId: string) =>
        client.delete(`/designs/${designId}/shares/${shareId}/`),

    getSharedDesign: (token: string) =>
        client.get<Design>(`/shared/${token}/`),
};

export default client;
