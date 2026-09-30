import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import {
    recoveryKey,
    saveRecoveryDraft,
    loadRecoveryDraft,
    clearRecoveryDraft,
    sameDesignContent,
    shouldOfferRecovery,
    savedMatchesRecovery,
} from './draftRecovery';
import { buildCanonicalDocument } from './api';

// Unique ids per test keep the shared fake IndexedDB from leaking records
// between cases.
let counter = 0;
const freshIds = () => {
    counter += 1;
    return { userId: `user-${counter}`, designId: `design-${counter}` };
};

const editorDesign = (overrides: Record<string, any> = {}) => ({
    id: 'design-1',
    name: 'Poster',
    width: 1080,
    height: 1080,
    revision: 3,
    pages: [
        {
            id: 'page-1',
            name: 'Page 1',
            document: {
                schemaVersion: '1.0',
                objects: [{ id: 'obj-1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }],
                background: { type: 'color', value: '#FFFFFF' },
            },
        },
    ],
    ...overrides,
});

describe('recoveryKey', () => {
    it('is user- and design-scoped so drafts never cross accounts', () => {
        expect(recoveryKey('user-1', 'design-1')).toBe('user-1:design-1');
        expect(recoveryKey('user-2', 'design-1')).not.toBe(recoveryKey('user-1', 'design-1'));
        expect(recoveryKey('user-1', 'design-2')).not.toBe(recoveryKey('user-1', 'design-1'));
    });
});

describe('recovery draft journal (IndexedDB)', () => {
    it('round-trips an unsynced draft snapshot', async () => {
        const { userId, designId } = freshIds();
        const design = editorDesign();
        await saveRecoveryDraft(userId, designId, design, 7);

        const record = await loadRecoveryDraft(userId, designId);
        expect(record).not.toBeNull();
        expect(record!.design).toEqual(design);
        expect(record!.revision).toBe(7);
        expect(record!.key).toBe(recoveryKey(userId, designId));
        expect(typeof record!.savedAt).toBe('number');
    });

    it('returns null when nothing was journalled', async () => {
        const { userId, designId } = freshIds();
        expect(await loadRecoveryDraft(userId, designId)).toBeNull();
    });

    it('keeps only the latest snapshot for a design', async () => {
        const { userId, designId } = freshIds();
        await saveRecoveryDraft(userId, designId, editorDesign({ name: 'First' }), 1);
        const latest = editorDesign({ name: 'Latest', revision: 2 });
        await saveRecoveryDraft(userId, designId, latest, 2);

        const record = await loadRecoveryDraft(userId, designId);
        expect(record!.design.name).toBe('Latest');
        expect(record!.revision).toBe(2);
    });

    it('clears a journalled draft', async () => {
        const { userId, designId } = freshIds();
        await saveRecoveryDraft(userId, designId, editorDesign(), 1);
        await clearRecoveryDraft(userId, designId);
        expect(await loadRecoveryDraft(userId, designId)).toBeNull();
    });

    it('is scoped per user and per design', async () => {
        const { userId, designId } = freshIds();
        await saveRecoveryDraft(userId, designId, editorDesign({ name: 'Mine' }), 1);

        expect(await loadRecoveryDraft(userId, 'other-design')).toBeNull();
        expect(await loadRecoveryDraft('someone-else', designId)).toBeNull();
        expect((await loadRecoveryDraft(userId, designId))!.design.name).toBe('Mine');
    });

    it('never throws when the snapshot is not structured-cloneable', async () => {
        const { userId, designId } = freshIds();
        await expect(
            saveRecoveryDraft(userId, designId, { id: designId, fn: () => undefined }, 1)
        ).resolves.toBeUndefined();
    });

    it('clearing a design that was never journalled is a safe no-op', async () => {
        const { userId, designId } = freshIds();
        await expect(clearRecoveryDraft(userId, designId)).resolves.toBeUndefined();
        expect(await loadRecoveryDraft(userId, designId)).toBeNull();
    });
});

describe('sameDesignContent', () => {
    it('ignores volatile metadata such as revision, updatedAt and the design name', () => {
        const a = editorDesign({ revision: 3, updatedAt: '2026-01-01T00:00:00Z', name: 'Old' });
        const b = editorDesign({ revision: 9, updatedAt: '2026-09-30T00:00:00Z', name: 'New' });
        expect(sameDesignContent(a, b)).toBe(true);
    });

    it('detects edited content', () => {
        const a = editorDesign();
        const b = editorDesign();
        b.pages[0].document.objects.push({ id: 'obj-2', type: 'text', x: 1, y: 1 } as any);
        expect(sameDesignContent(a, b)).toBe(false);
    });

    it('returns false when either side is missing', () => {
        expect(sameDesignContent(null, editorDesign())).toBe(false);
        expect(sameDesignContent(editorDesign(), null)).toBe(false);
    });
});

describe('shouldOfferRecovery', () => {
    const record = (design: any) => ({
        key: 'user-1:design-1',
        userId: 'user-1',
        designId: 'design-1',
        design,
        revision: 3,
        savedAt: Date.now(),
    });

    it('offers recovery when the snapshot holds work the editor is not showing', () => {
        const shown = editorDesign();
        const journalled = editorDesign();
        journalled.pages[0].document.objects.push({ id: 'unsaved', type: 'text' } as any);
        expect(shouldOfferRecovery(record(journalled), shown)).toBe(true);
    });

    it('does not offer recovery when the content is already on screen', () => {
        const shown = editorDesign();
        expect(shouldOfferRecovery(record(editorDesign()), shown)).toBe(false);
    });

    it('does not offer recovery when the shown content differs only in metadata', () => {
        const shown = editorDesign({ revision: 4, updatedAt: '2026-09-30T00:00:00Z' });
        expect(shouldOfferRecovery(record(editorDesign()), shown)).toBe(false);
    });

    it('offers recovery when nothing is on screen yet', () => {
        expect(shouldOfferRecovery(record(editorDesign()), null)).toBe(true);
    });

    it('ignores missing or empty records', () => {
        expect(shouldOfferRecovery(null, editorDesign())).toBe(false);
        expect(shouldOfferRecovery(undefined, editorDesign())).toBe(false);
        expect(shouldOfferRecovery(record(undefined), editorDesign())).toBe(false);
    });
});

describe('savedMatchesRecovery', () => {
    const record = (design: any) => ({
        key: 'user-1:design-1',
        userId: 'user-1',
        designId: 'design-1',
        design,
        revision: 3,
        savedAt: Date.now(),
    });

    it('does not retire a pending snapshot when an unrelated version was saved', () => {
        // The regression: a successful autosave of the version on screen (the
        // server/cached design the user kept editing while ignoring the prompt)
        // must not wipe the snapshot the user has not decided on yet.
        const shown = editorDesign();
        const journalled = editorDesign();
        journalled.pages[0].document.objects.push({ id: 'unsaved', type: 'text' } as any);

        expect(savedMatchesRecovery(record(journalled), buildCanonicalDocument(shown))).toBe(
            false
        );
    });

    it('retires the snapshot once the saved document is the snapshot itself', () => {
        const journalled = editorDesign();
        expect(savedMatchesRecovery(record(journalled), buildCanonicalDocument(journalled))).toBe(
            true
        );
    });

    it('ignores metadata differences between the save and the snapshot', () => {
        const journalled = editorDesign({ revision: 3, updatedAt: '2026-01-01T00:00:00Z' });
        const saved = buildCanonicalDocument(
            editorDesign({ revision: 8, updatedAt: '2026-09-30T00:00:00Z' })
        );
        expect(savedMatchesRecovery(record(journalled), saved)).toBe(true);
    });

    it('compares non-default backgrounds correctly', () => {
        const journalled = editorDesign({
            document: { background: { type: 'color', value: '#123456' } },
        });
        expect(savedMatchesRecovery(record(journalled), buildCanonicalDocument(journalled))).toBe(
            true
        );
        expect(
            savedMatchesRecovery(
                record(journalled),
                buildCanonicalDocument(editorDesign())
            )
        ).toBe(false);
    });

    it('treats a save with no pending snapshot as safe to clear', () => {
        expect(savedMatchesRecovery(null, buildCanonicalDocument(editorDesign()))).toBe(true);
        expect(savedMatchesRecovery(record(undefined), buildCanonicalDocument(editorDesign()))).toBe(
            true
        );
    });

    it('does not clear when the saved payload is missing', () => {
        expect(savedMatchesRecovery(record(editorDesign()), null)).toBe(false);
    });
});

describe('when IndexedDB is unavailable', () => {
    it('degrades to null/no-op instead of breaking the editor', async () => {
        vi.resetModules();
        const original = (globalThis as any).indexedDB;
        (globalThis as any).indexedDB = undefined;
        try {
            const mod = await import('./draftRecovery');
            await expect(mod.saveRecoveryDraft('u', 'd', editorDesign())).resolves.toBeUndefined();
            await expect(mod.loadRecoveryDraft('u', 'd')).resolves.toBeNull();
            await expect(mod.clearRecoveryDraft('u', 'd')).resolves.toBeUndefined();
        } finally {
            (globalThis as any).indexedDB = original;
            vi.resetModules();
        }
    });
});
