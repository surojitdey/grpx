import { describe, it, expect, beforeEach } from 'vitest';
import {
    normalizeDesign,
    buildCanonicalDocument,
    reconcileServerDesign,
    parseRevisionConflict,
    markConflictPending,
    clearConflictPending,
    hasConflictPending,
} from './api';

// `normalizeDesign` expects transformKeys to have run already, so feed it
// camelCase input exactly like designApi.getDesign does.
describe('normalizeDesign', () => {
    const canonical = {
        id: 'design-1',
        name: 'Poster',
        document: {
            schemaVersion: '1.0',
            width: 1920,
            height: 1080,
            background: { type: 'color', value: '#FF0000' },
            pages: [
                {
                    id: 'page-uuid-1',
                    name: 'Cover',
                    objects: [
                        { id: 'obj-1', type: 'rectangle', x: 5, width: 50 },
                        { id: 'obj-2', type: 'circle' },
                    ],
                },
                {
                    id: 'page-uuid-2',
                    name: 'Middle',
                    objects: [{ id: 'obj-3', type: 'text', content: { text: 'hello' } }],
                },
            ],
        },
    };

    it('promotes document.pages to top-level pages', () => {
        const out = normalizeDesign(canonical);
        expect(out.pages).toHaveLength(2);
        expect(out.pages[0].name).toBe('Cover');
        expect(out.pages[1].name).toBe('Middle');
    });

    it('converts canonical page.objects into page.document.objects', () => {
        const out = normalizeDesign(canonical);
        expect(out.pages[0].document.objects).toEqual(canonical.document.pages[0].objects);
        expect(out.pages[1].document.objects).toEqual(canonical.document.pages[1].objects);
    });

    it('keeps page metadata (id, name) on the converted page', () => {
        const out = normalizeDesign(canonical);
        expect(out.pages[0].id).toBe('page-uuid-1');
        expect(out.pages[0].name).toBe('Cover');
    });

    it('does not mutate the input object', () => {
        const input = JSON.parse(JSON.stringify(canonical));
        normalizeDesign(input);
        expect(input.pages).toBeUndefined();
        expect(input.document.pages[0].document).toBeUndefined();
    });

    it('prefers an existing valid page.document over page.objects', () => {
        const alreadyEditorShape = {
            id: 'd2',
            document: {
                pages: [
                    {
                        id: 'p1',
                        name: 'Kept',
                        objects: [{ id: 'stale', type: 'circle' }],
                        document: {
                            schemaVersion: '1.0',
                            objects: [{ id: 'authoritative', type: 'text' }],
                        },
                    },
                ],
            },
        };
        const out = normalizeDesign(alreadyEditorShape);
        expect(out.pages[0].document.objects).toEqual([{ id: 'authoritative', type: 'text' }]);
    });

    it('falls back to an empty objects array when a page has none', () => {
        const blank = {
            id: 'd3',
            document: { pages: [{ id: 'p1', name: 'Blank' }] },
        };
        const out = normalizeDesign(blank);
        expect(out.pages[0].document.objects).toEqual([]);
    });

    it('uses the page background when present, defaulting otherwise', () => {
        const out = normalizeDesign(canonical);
        expect(out.pages[0].document.background).toEqual({ type: 'color', value: '#FF0000' });

        const noBg = normalizeDesign({
            id: 'd4',
            document: { pages: [{ id: 'p1', name: 'X', objects: [] }] },
        });
        expect(noBg.pages[0].document.background).toEqual({ type: 'color', value: '#FFFFFF' });
    });

    it('passes through legacy top-level pages untouched', () => {
        const legacy = {
            id: 'd5',
            pages: [{ id: 'p1', name: 'P', document: { objects: [{ id: 'o1' }] } }],
        };
        const out = normalizeDesign(legacy);
        expect(out.pages).toEqual(legacy.pages);
    });

    it('prefers top-level pages over canonical document.pages when both exist', () => {
        const both = {
            id: 'd7',
            // Stale canonical snapshot with old content and different IDs
            document: {
                pages: [
                    {
                        id: 'stale-page-uuid',
                        name: 'Stale',
                        objects: [{ id: 'stale-obj', type: 'circle' }],
                    },
                ],
            },
            // Fresher edited pages (e.g. from a localStorage cache restore)
            pages: [
                {
                    id: 'edited-page-id',
                    name: 'Edited',
                    document: {
                        schemaVersion: '1.0',
                        objects: [{ id: 'edited-obj', type: 'text' }],
                        background: { type: 'color', value: '#123456' },
                    },
                },
            ],
        };
        const out = normalizeDesign(both);
        expect(out.pages[0].id).toBe('edited-page-id');
        expect(out.pages[0].document.objects).toEqual([{ id: 'edited-obj', type: 'text' }]);
    });

    it('handles null/undefined/empty input safely', () => {
        expect(normalizeDesign(null)).toBeNull();
        expect(normalizeDesign(undefined)).toBeUndefined();
        expect(normalizeDesign({})).toEqual({});
    });

    it('drops non-object page entries instead of crashing', () => {
        const weird = {
            id: 'd6',
            document: { pages: [null, 'junk', { id: 'p1', name: 'Real', objects: [] }] },
        };
        const out = normalizeDesign(weird);
        expect(out.pages).toHaveLength(1);
        expect(out.pages[0].name).toBe('Real');
    });
});

// buildCanonicalDocument is the inverse of normalizeDesign: it rebuilds the
// payload for PUT /designs/{id}/document/ from the editor's page shape.
describe('buildCanonicalDocument', () => {
    const serverDesign = {
        id: 'design-1',
        name: 'Poster',
        width: 1920,
        height: 1080,
        revision: 3,
        document: {
            schemaVersion: '1.0',
            width: 1920,
            height: 1080,
            background: { type: 'color', value: '#FF0000' },
            pages: [
                {
                    id: 'page-uuid-1',
                    name: 'Cover',
                    objects: [
                        {
                            id: 'obj-1',
                            type: 'rectangle',
                            x: 5,
                            y: 5,
                            width: 50,
                            height: 20,
                            rotation: 0,
                            scaleX: 1,
                            scaleY: 1,
                            opacity: 1,
                            visible: true,
                            locked: false,
                            zIndex: 0,
                            fill: '#3b82f6',
                        },
                    ],
                },
                {
                    id: 'page-uuid-2',
                    name: 'Back',
                    background: { type: 'color', value: '#00FF00' },
                    objects: [],
                },
            ],
        },
    };

    const loadIntoEditor = () => normalizeDesign(JSON.parse(JSON.stringify(serverDesign)));

    it('round-trips a normalized server design back to the canonical document', () => {
        const out = buildCanonicalDocument(loadIntoEditor());
        expect(out).toEqual(serverDesign.document);
    });

    it('moves editor objects from page.document.objects back to page.objects', () => {
        const editor = loadIntoEditor();
        const out = buildCanonicalDocument(editor);
        expect(out.pages[0].objects).toEqual(serverDesign.document.pages[0].objects);
        expect(out.pages[1].objects).toEqual([]);
        // The editor's wrapper must not leak into the canonical payload.
        expect(out.pages[0].document).toBeUndefined();
    });

    it('reflects edits made in the editor before saving', () => {
        const editor = loadIntoEditor();
        editor.pages[0].document.objects.push({
            id: 'obj-new',
            type: 'text',
            x: 10,
            y: 10,
            width: 100,
            height: 40,
            content: { text: 'edited' },
        } as any);
        const out = buildCanonicalDocument(editor);
        expect(out.pages[0].objects).toHaveLength(2);
        expect(out.pages[0].objects[1].content).toEqual({ text: 'edited' });
    });

    it('does not bake an inherited page background into every page', () => {
        const editor = loadIntoEditor();
        // normalizeDesign materializes the design background onto each page…
        expect(editor.pages[0].document.background).toEqual({ type: 'color', value: '#FF0000' });
        const out = buildCanonicalDocument(editor);
        // …but pages whose background matches the envelope keep inheriting it.
        expect(out.pages[0]).not.toHaveProperty('background');
        expect(out.pages[1].background).toEqual({ type: 'color', value: '#00FF00' });
    });

    it('defaults background and schemaVersion for designs without them', () => {
        const out = buildCanonicalDocument({
            id: 'd-minimal',
            width: 800,
            height: 600,
            pages: [{ id: 'p1', document: { objects: [] } }],
        });
        expect(out.schemaVersion).toBe('1.0');
        expect(out.background).toEqual({ type: 'color', value: '#FFFFFF' });
        expect(out.width).toBe(800);
        expect(out.height).toBe(600);
        expect(out.pages).toEqual([{ id: 'p1', objects: [] }]);
    });

    it('handles missing or malformed pages safely', () => {
        expect(buildCanonicalDocument(null).pages).toEqual([]);
        expect(buildCanonicalDocument({}).pages).toEqual([]);
        const partial = buildCanonicalDocument({
            pages: [null, { id: 'ok', objects: [{ id: 'o1' }] }],
        });
        expect(partial.pages).toEqual([{ id: 'ok', objects: [{ id: 'o1' }] }]);
    });
});

// reconcileServerDesign decides how a fetched server design relates to the
// cached/editor state without discarding unsynced local edits.
describe('reconcileServerDesign', () => {
    const serverDesign = (revision: number) => ({
        id: 'design-1',
        revision,
        updatedAt: '2026-09-28T10:00:00Z',
        document: {
            schemaVersion: '1.0',
            width: 1080,
            height: 1080,
            background: { type: 'color', value: '#FFFFFF' },
            pages: [{ id: 'p1', name: 'Page 1', objects: [] }],
        },
    });

    it('adopts when the server revision is strictly higher', () => {
        expect(reconcileServerDesign(serverDesign(5), serverDesign(3))).toBe('adopt');
    });

    it('keeps the cached state when its revision is ahead (unsynced edits)', () => {
        expect(reconcileServerDesign(serverDesign(3), serverDesign(4))).toBe('keep');
    });

    it('keeps the cached state at the same revision with identical content', () => {
        expect(reconcileServerDesign(serverDesign(3), serverDesign(3))).toBe('keep');
    });

    it('flags a resync at the same revision with different content', () => {
        // Cached design sits at the same revision but carries an extra object:
        // an unsynced local edit that must be pushed, not dropped.
        const cached = normalizeDesign(JSON.parse(JSON.stringify(serverDesign(3))));
        cached.pages[0].document.objects.push({
            id: 'obj-local',
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        });
        expect(reconcileServerDesign(serverDesign(3), cached)).toBe('resync');
    });

    it('falls back to updatedAt when revisions are missing', () => {
        const server = { ...serverDesign(3), updatedAt: '2026-09-28T11:00:00Z' };
        delete (server as any).revision;
        const cached = { ...serverDesign(3) };
        delete (cached as any).revision;

        // Server timestamp later than the cache's => server wins.
        expect(reconcileServerDesign(server, cached)).toBe('adopt');

        // Cache newer than server => keep local state.
        const staleServer = { ...server, updatedAt: '2026-09-27T10:00:00Z' };
        expect(reconcileServerDesign(staleServer, cached)).toBe('keep');

        // Inconclusive comparison => keep (never discard local edits on a guess).
        const undatedServer = { ...server };
        delete (undatedServer as any).updatedAt;
        const undatedCached = { ...cached };
        delete (undatedCached as any).updatedAt;
        expect(reconcileServerDesign(undatedServer, undatedCached)).toBe('keep');
    });
});

// parseRevisionConflict turns a 409 from saveDocument into the server's
// authoritative revision + document, enabling explicit conflict resolution
// without a second fetch. Anything else must yield null (no conflict state).
describe('parseRevisionConflict', () => {
    const serverDocument = {
        schemaVersion: '1.0',
        width: 1080,
        height: 1080,
        background: { type: 'color', value: '#FFFFFF' },
        pages: [{ id: 'p1', name: 'Page 1', objects: [{ id: 'server-obj' }] }],
    };

    const conflictError = {
        response: {
            status: 409,
            data: {
                detail:
                    'Revision conflict: client sent 3, server has 5. Reload and retry.',
                revision: ['Revision conflict: client sent 3, server has 5. Reload and retry.'],
                server_revision: 5,
                current_document: serverDocument,
            },
        },
    };

    it('extracts the server revision, document, and message from a 409', () => {
        const conflict = parseRevisionConflict(conflictError);
        expect(conflict).not.toBeNull();
        expect(conflict!.serverRevision).toBe(5);
        expect(conflict!.serverDocument).toEqual(serverDocument);
        expect(conflict!.message).toContain('client sent 3');
    });

    it('falls back to the revision field when detail is absent', () => {
        const conflict = parseRevisionConflict({
            response: { status: 409, data: { revision: ['stale write rejected'] } },
        });
        expect(conflict!.message).toBe('stale write rejected');
        expect(conflict!.serverRevision).toBeNull();
        expect(conflict!.serverDocument).toBeNull();
    });

    it('still reports a conflict when the body lacks resolvable state', () => {
        const conflict = parseRevisionConflict({ response: { status: 409, data: {} } });
        expect(conflict).not.toBeNull();
        expect(conflict!.serverRevision).toBeNull();
        expect(conflict!.serverDocument).toBeNull();
        expect(conflict!.message).toContain('reload');
    });

    it('returns null for non-conflict errors (never triggers resolution UI)', () => {
        expect(parseRevisionConflict({ response: { status: 400, data: {} } })).toBeNull();
        expect(parseRevisionConflict({ response: { status: 500, data: {} } })).toBeNull();
        expect(parseRevisionConflict(new Error('network down'))).toBeNull();
        expect(parseRevisionConflict(undefined)).toBeNull();
    });
});

// The pending-conflict marker survives reloads so the load path never adopts
// (and overwrites) a newer server version while rejected local changes still
// sit in the draft cache — the conflict must be re-surfaced for the user.
describe('conflict marker', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('current_user_id', 'user-1');
    });

    it('marks, detects, and clears a pending conflict for a design', () => {
        expect(hasConflictPending('design-1')).toBe(false);
        markConflictPending('design-1');
        expect(hasConflictPending('design-1')).toBe(true);
        clearConflictPending('design-1');
        expect(hasConflictPending('design-1')).toBe(false);
    });

    it('is scoped per design', () => {
        markConflictPending('design-1');
        expect(hasConflictPending('design-2')).toBe(false);
        expect(hasConflictPending('design-1')).toBe(true);
    });

    it('is scoped per user (drafts are user-scoped)', () => {
        markConflictPending('design-1');
        localStorage.setItem('current_user_id', 'user-2');
        expect(hasConflictPending('design-1')).toBe(false);
        localStorage.setItem('current_user_id', 'user-1');
        expect(hasConflictPending('design-1')).toBe(true);
    });

    it('clearing a marker that was never set is a no-op', () => {
        expect(() => clearConflictPending('design-x')).not.toThrow();
        expect(hasConflictPending('design-x')).toBe(false);
    });
});
