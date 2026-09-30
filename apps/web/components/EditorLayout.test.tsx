import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import EditorLayout from './EditorLayout';
import { useEditorStore } from '@/stores/editor';
import { authApi, designApi } from '@/services/api';
import {
    loadRecoveryDraft,
    saveRecoveryDraft,
    clearRecoveryDraft,
} from '@/services/draftRecovery';

// Heavy children (fabric canvas, sidebars) are irrelevant to the recovery
// flows under test — replace them with inert placeholders.
vi.mock('@/components/Canvas', () => ({ default: () => <div /> }));
vi.mock('@/components/LeftSidebar', () => ({ default: () => <div /> }));
vi.mock('@/components/RightSidebar', () => ({ default: () => <div /> }));
vi.mock('@/components/EditorToolbar', () => ({ default: () => <div /> }));
vi.mock('@/components/PageNavigator', () => ({ default: () => <div /> }));

// Keep the real comparison logic (shouldOfferRecovery, savedMatchesRecovery,
// currentRecoveryUserId) but control the journal I/O per test.
vi.mock('@/services/draftRecovery', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/draftRecovery')>();
    return {
        ...actual,
        loadRecoveryDraft: vi.fn(),
        saveRecoveryDraft: vi.fn(),
        clearRecoveryDraft: vi.fn(),
    };
});

// Keep every pure helper (normalizeDesign, buildCanonicalDocument,
// reconcileServerDesign, validateDocument consumers, conflict marker) but mock
// the network boundary.
vi.mock('@/services/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/api')>();
    return {
        ...actual,
        authApi: { getCurrentUser: vi.fn() },
        designApi: { getDesign: vi.fn(), saveDocument: vi.fn() },
    };
});

const designId = 'design-1';
const userId = 'user-1';

// Real timers: the flows under test schedule debounced work (500ms journal,
// 1500ms server save). Sleeping past the debounce keeps the assertions
// deterministic without coupling the tests to the timer implementation.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const SERVER_SAVE_DEBOUNCE_MS = 1500;

// Editor-shaped design (what normalizeDesign produces), as the mocked
// designApi.getDesign would return it.
const editorDesign = (overrides: Record<string, any> = {}) => ({
    id: designId,
    name: 'Poster',
    width: 1080,
    height: 1080,
    revision: 3,
    updatedAt: '2026-09-29T00:00:00Z',
    document: { schemaVersion: '1.0', background: { type: 'color', value: '#FFFFFF' } },
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

const journalRecord = (design: any) => ({
    key: `${userId}:${designId}`,
    userId,
    designId,
    design,
    revision: 3,
    savedAt: Date.now(),
});

const onScreenObjectIds = () =>
    useEditorStore
        .getState()
        .design?.pages.flatMap((p: any) => p.document.objects.map((o: any) => o.id)) ?? [];

beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('current_user_id', userId);
    useEditorStore.setState({
        design: null,
        currentPageId: null,
        history: [],
        historyIndex: -1,
        persistence: {
            isDirty: false,
            isSaving: false,
            lastSavedAt: null,
            saveError: null,
            revision: 0,
        },
    });

    vi.mocked(authApi.getCurrentUser).mockResolvedValue({ data: { id: userId } } as any);
    vi.mocked(designApi.getDesign).mockResolvedValue({ data: editorDesign() } as any);
    vi.mocked(designApi.saveDocument).mockResolvedValue({
        data: { id: designId, revision: 4, schema_version: '1.0', updatedAt: '2026-09-30T00:00:00Z' },
    } as any);
    vi.mocked(loadRecoveryDraft).mockResolvedValue(null);
    vi.mocked(saveRecoveryDraft).mockResolvedValue(undefined);
    vi.mocked(clearRecoveryDraft).mockResolvedValue(undefined);
});

describe('EditorLayout recovery flows', () => {
    it('restore puts the snapshot on screen, marks it dirty, and autosave pushes it to the server', async () => {
        // Journal holds work the server version does not have.
        const snapshot = editorDesign();
        snapshot.pages[0].document.objects.push({
            id: 'obj-j',
            type: 'circle',
            x: 3,
            y: 3,
            width: 8,
            height: 8,
        });
        vi.mocked(loadRecoveryDraft).mockResolvedValue(journalRecord(snapshot) as any);

        render(<EditorLayout designId={designId} />);

        // Server version loads; the differing journal is offered.
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Unsaved changes');
        expect(onScreenObjectIds()).toEqual(['obj-1']);

        fireEvent.click(screen.getByText('Restore'));

        // Snapshot replaces the server version on screen…
        await waitFor(() => {
            expect(onScreenObjectIds()).toContain('obj-j');
        });
        expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        expect(screen.queryByRole('alert')).toBeNull();

        // …and the normal autosave treats it as unsynced work and pushes it.
        await act(async () => {
            await sleep(SERVER_SAVE_DEBOUNCE_MS + 200);
        });
        expect(vi.mocked(designApi.saveDocument)).toHaveBeenCalledTimes(1);
        const [, document, revision] = vi.mocked(designApi.saveDocument).mock.calls[0];
        expect(document.pages[0].objects.map((o: any) => o.id)).toContain('obj-j');
        expect(revision).toBe(3);

        // Saving the snapshot itself retires the journal.
        expect(vi.mocked(clearRecoveryDraft)).toHaveBeenCalledWith(userId, designId);
    });

    it('discard drops the journal and keeps the server version on screen', async () => {
        const snapshot = editorDesign();
        snapshot.pages[0].document.objects.push({
            id: 'obj-j',
            type: 'circle',
            x: 3,
            y: 3,
            width: 8,
            height: 8,
        });
        vi.mocked(loadRecoveryDraft).mockResolvedValue(journalRecord(snapshot) as any);

        render(<EditorLayout designId={designId} />);
        await screen.findByRole('alert');

        fireEvent.click(screen.getByText('Discard'));

        await waitFor(() => {
            expect(screen.queryByRole('alert')).toBeNull();
        });
        expect(vi.mocked(clearRecoveryDraft)).toHaveBeenCalledWith(userId, designId);
        // The server version is untouched.
        expect(onScreenObjectIds()).toEqual(['obj-1']);
    });

    it('offers the journal offline even when nothing is on screen (evicted cache)', async () => {
        // No warm cache (localStorage empty) + unreachable server: previously
        // this dead-ended on the error screen and the journal was never shown.
        vi.mocked(designApi.getDesign).mockRejectedValue(new Error('Network unreachable'));
        const snapshot = editorDesign({ revision: 3 });
        snapshot.pages[0].document.objects.push({
            id: 'obj-j',
            type: 'circle',
            x: 3,
            y: 3,
            width: 8,
            height: 8,
        });
        vi.mocked(loadRecoveryDraft).mockResolvedValue(journalRecord(snapshot) as any);

        render(<EditorLayout designId={designId} />);

        // The prompt renders above the loading spinner — no design, but the
        // recovered work is offered instead of an error dead end.
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Unsaved changes');
        expect(screen.getByText('Loading design...')).toBeTruthy();
        expect(screen.queryByText('Error Loading Design')).toBeNull();
        expect(useEditorStore.getState().design).toBeNull();
    });

    it('a successful autosave of the on-screen version does not clear a pending journal', async () => {
        const snapshot = editorDesign();
        snapshot.pages[0].document.objects.push({
            id: 'obj-j',
            type: 'circle',
            x: 3,
            y: 3,
            width: 8,
            height: 8,
        });
        vi.mocked(loadRecoveryDraft).mockResolvedValue(journalRecord(snapshot) as any);

        render(<EditorLayout designId={designId} />);
        await screen.findByRole('alert');

        // The user ignores the prompt and keeps editing the server version.
        await act(async () => {
            const current = useEditorStore.getState().design;
            if (!current) throw new Error('server design should be on screen');
            useEditorStore.setState({
                design: {
                    ...current,
                    pages: current.pages.map((p: any) => ({
                        ...p,
                        document: {
                            ...p.document,
                            objects: [
                                ...p.document.objects,
                                { id: 'obj-2', type: 'circle', x: 1, y: 1, width: 5, height: 5 },
                            ],
                        },
                    })),
                },
            });
        });

        // Autosave fires (past the 1500ms debounce) and succeeds.
        await act(async () => {
            await sleep(SERVER_SAVE_DEBOUNCE_MS + 200);
        });
        expect(vi.mocked(designApi.saveDocument)).toHaveBeenCalledTimes(1);

        // The saved document is NOT the journalled snapshot: the journal (and
        // the prompt) must survive — recovery must not be a race the autosave
        // always wins.
        expect(vi.mocked(clearRecoveryDraft)).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('Unsaved changes');
    });

    it('a clean load shows no recovery prompt', async () => {
        render(<EditorLayout designId={designId} />);

        // Server design loads, nothing journalled.
        await waitFor(() => {
            expect(useEditorStore.getState().design).not.toBeNull();
        });
        await act(async () => {
            await sleep(50);
        });
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
