import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editor';
import { Design, DesignPage, DesignObject } from '@/types';

describe('Editor Store', () => {
    beforeEach(() => {
        // Reset store before each test
        useEditorStore.setState({
            design: null,
            selectedObjectIds: [],
            draggedObjectPosition: null,
            activeTool: 'select',
        });
        useEditorStore.getState().resetPersistence(0);
    });

    // Mock design
    const mockDesign: Design = {
        id: 'design-1',
        name: 'Test Design',
        description: 'A test design',
        width: 1080,
        height: 1080,
        status: 'draft',
        currentVersion: 1,
        pages: [
            {
                id: 'page-1',
                pageNumber: 1,
                name: 'Page 1',
                document: {
                    schemaVersion: '1.0',
                    objects: [],
                    background: { type: 'color', value: '#ffffff' },
                },
            },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };

    describe('setDesign', () => {
        it('sets design and currentPageId', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const state = useEditorStore.getState();
            expect(state.design).toEqual(mockDesign);
            expect(state.currentPageId).toBe('page-1');
        });
    });

    describe('addObject', () => {
        it('adds an object to current page', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            const page = useEditorStore.getState().design?.pages[0];
            expect(page?.document.objects).toHaveLength(1);
            expect(page?.document.objects[0]).toEqual(obj);
        });
    });

    describe('removeObject', () => {
        it('removes an object from current page', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            useEditorStore.getState().removeObject('obj-1');
            const page = useEditorStore.getState().design?.pages[0];
            expect(page?.document.objects).toHaveLength(0);
        });

        it('clears selection when removing selected object', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
            } as any;

            useEditorStore.getState().addObject(obj);
            useEditorStore.getState().setSelectedObjects(['obj-1']);
            useEditorStore.getState().removeObject('obj-1');
            expect(useEditorStore.getState().selectedObjectIds).toHaveLength(0);
        });
    });

    describe('duplicateObject', () => {
        it('duplicates an object with new ID and offset position', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 50,
                y: 50,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            useEditorStore.getState().duplicateObject('obj-1');
            const page = useEditorStore.getState().design?.pages[0];
            expect(page?.document.objects).toHaveLength(2);

            const duplicated = page?.document.objects[1];
            expect(duplicated?.id).not.toBe('obj-1');
            expect(duplicated?.x).toBe(70); // 50 + 20 offset
            expect(duplicated?.y).toBe(70); // 50 + 20 offset
            expect(duplicated?.fill).toBe('#3b82f6'); // Properties copied
        });

        it('selects duplicated object', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
            } as any;

            useEditorStore.getState().addObject(obj);
            useEditorStore.getState().duplicateObject('obj-1');
            const duplicatedId = useEditorStore.getState().design?.pages[0].document.objects[1].id;
            expect(useEditorStore.getState().selectedObjectIds).toContain(duplicatedId);
        });
    });

    describe('updateObject', () => {
        it('updates object properties', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            useEditorStore.getState().updateObject('obj-1', { x: 50, y: 50, fill: '#ff0000' });

            const updated = useEditorStore.getState().design?.pages[0].document.objects[0];
            expect(updated?.x).toBe(50);
            expect(updated?.y).toBe(50);
            expect((updated as any).fill).toBe('#ff0000');
        });
    });

    describe('setSelectedObjects', () => {
        it('sets selected object IDs', () => {
            useEditorStore.getState().setSelectedObjects(['obj-1', 'obj-2']);
            expect(useEditorStore.getState().selectedObjectIds).toEqual(['obj-1', 'obj-2']);
        });
    });

    describe('setActiveTool', () => {
        it('sets active tool', () => {
            useEditorStore.getState().setActiveTool('rectangle');
            expect(useEditorStore.getState().activeTool).toBe('rectangle');
        });
    });

    describe('undo/redo history', () => {
        it('should track history when adding object', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            const history = useEditorStore.getState().history;
            expect(history.length).toBeGreaterThan(0);
        });

        it('should undo object addition', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            expect(useEditorStore.getState().design?.pages[0].document.objects).toHaveLength(1);

            useEditorStore.getState().undo();
            expect(useEditorStore.getState().design?.pages[0].document.objects).toHaveLength(0);
        });

        it('should redo object addition', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            useEditorStore.getState().addObject(obj);
            useEditorStore.getState().undo();
            useEditorStore.getState().redo();

            expect(useEditorStore.getState().design?.pages[0].document.objects).toHaveLength(1);
        });

        it('should limit history size to MAX_HISTORY', () => {
            useEditorStore.getState().setDesign(mockDesign);
            const obj: DesignObject = {
                id: 'obj-1',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                fill: '#3b82f6',
            } as any;

            // Add many objects to exceed MAX_HISTORY
            for (let i = 0; i < 55; i++) {
                useEditorStore.getState().addObject({ ...obj, id: `obj-${i}` });
            }

            const history = useEditorStore.getState().history;
            expect(history.length).toBeLessThanOrEqual(50);
        });
    });

    describe('text editing', () => {
        it('persists edited canvas text in the design and marks it dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject({
                id: 'text-1',
                type: 'text',
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                content: { text: 'Before edit' },
                style: {
                    fontFamily: 'Arial',
                    fontSize: 16,
                    fontWeight: 400,
                    fontStyle: 'normal',
                    color: '#000000',
                    textAlign: 'left',
                    lineHeight: 1,
                    letterSpacing: 0,
                },
            });
            useEditorStore.getState().saveSuccess(1, new Date());

            useEditorStore.getState().updateObject('text-1', {
                content: { text: 'After edit' },
            });

            const textObject = useEditorStore
                .getState()
                .design?.pages[0].document.objects[0];
            expect(textObject).toMatchObject({
                type: 'text',
                content: { text: 'After edit' },
            });
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('should start editing text', () => {
            useEditorStore.getState().startEditingText('obj-1', 'Hello');
            expect(useEditorStore.getState().editingTextId).toBe('obj-1');
            expect(useEditorStore.getState().editingTextValue).toBe('Hello');
        });

        it('should update editing text', () => {
            useEditorStore.getState().startEditingText('obj-1', 'Hello');
            useEditorStore.getState().updateEditingText('Hello World');
            expect(useEditorStore.getState().editingTextValue).toBe('Hello World');
        });

        it('should stop editing text', () => {
            useEditorStore.getState().startEditingText('obj-1', 'Hello');
            useEditorStore.getState().stopEditingText();
            expect(useEditorStore.getState().editingTextId).toBeNull();
            expect(useEditorStore.getState().editingTextValue).toBe('');
        });
    });

    describe('persistence state', () => {
        const makeRect = (id: string, overrides: Record<string, any> = {}): DesignObject =>
            ({
                id,
                type: 'rectangle',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
                ...overrides,
            } as any);

        it('starts clean with zero revision', () => {
            expect(useEditorStore.getState().persistence).toEqual({
                isDirty: false,
                isSaving: false,
                lastSavedAt: null,
                saveError: null,
                revision: 0,
            });
        });

        it('addObject marks the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('removeObject marks the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().saveSuccess(3, new Date('2026-09-28T10:00:00Z'));
            useEditorStore.getState().removeObject('obj-1');
            const persistence = useEditorStore.getState().persistence;
            expect(persistence.isDirty).toBe(true);
            // A new edit invalidates the previous healthy state.
            expect(persistence.saveError).toBeNull();
        });

        it('updateObject marks the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().saveSuccess(1, new Date());
            useEditorStore.getState().updateObject('obj-1', { x: 42 });
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('tracks drag coordinates without persisting until the drag ends', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().saveSuccess(1, new Date());

            useEditorStore.getState().setDraggedObjectPosition({
                id: 'obj-1',
                x: 42,
                y: 64,
            });

            let object = useEditorStore.getState().design?.pages[0].document.objects[0];
            expect(object).toMatchObject({ x: 0, y: 0 });
            expect(useEditorStore.getState().persistence.isDirty).toBe(false);

            useEditorStore.getState().updateObject('obj-1', { x: 42, y: 64 });

            object = useEditorStore.getState().design?.pages[0].document.objects[0];
            expect(object).toMatchObject({ x: 42, y: 64 });
            expect(useEditorStore.getState().draggedObjectPosition).toBeNull();
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('reorderObject marks the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().addObject(makeRect('obj-2', { zIndex: 1 }));
            useEditorStore.getState().saveSuccess(2, new Date());
            useEditorStore.getState().reorderObject('obj-1', 'up');
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('duplicateObject marks the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().saveSuccess(1, new Date());
            useEditorStore.getState().duplicateObject('obj-1');
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('undo and redo mark the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().saveSuccess(1, new Date());

            useEditorStore.getState().undo();
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);

            useEditorStore.getState().saveSuccess(2, new Date());
            useEditorStore.getState().redo();
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        });

        it('non-editing actions never mark the design dirty', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().setCurrentPage('page-1');
            useEditorStore.getState().setSelectedObjects(['obj-1']);
            useEditorStore.getState().setActiveTool('rectangle');
            useEditorStore.getState().setZoom(150);
            expect(useEditorStore.getState().persistence.isDirty).toBe(false);
        });

        it('setDesign resets persistence (loading is not an edit)', () => {
            useEditorStore.getState().setDesign(mockDesign);
            useEditorStore.getState().addObject(makeRect('obj-1'));
            useEditorStore.getState().saveFailed('boom');
            expect(useEditorStore.getState().persistence.isDirty).toBe(true);

            useEditorStore.getState().setDesign({ ...mockDesign, id: 'design-2' });
            expect(useEditorStore.getState().persistence).toEqual({
                isDirty: false,
                isSaving: false,
                lastSavedAt: null,
                saveError: null,
                revision: 0,
            });
        });

        it('saveStarted flags in-flight and clears the error', () => {
            useEditorStore.getState().saveFailed('boom');
            useEditorStore.getState().saveStarted();
            const persistence = useEditorStore.getState().persistence;
            expect(persistence.isSaving).toBe(true);
            expect(persistence.saveError).toBeNull();
            expect(persistence.isDirty).toBe(true); // unchanged by saveStarted
        });

        it('saveSuccess clears dirty/saving and records revision + time', () => {
            useEditorStore.getState().saveStarted();
            const savedAt = new Date('2026-09-28T12:00:00Z');
            useEditorStore.getState().saveSuccess(7, savedAt);
            expect(useEditorStore.getState().persistence).toEqual({
                isDirty: false,
                isSaving: false,
                lastSavedAt: savedAt,
                saveError: null,
                revision: 7,
            });
        });

        it('saveFailed keeps the edits dirty and stops the in-flight flag', () => {
            useEditorStore.getState().saveStarted();
            useEditorStore.getState().saveFailed('Offline — changes are only saved locally.');
            const persistence = useEditorStore.getState().persistence;
            expect(persistence.isSaving).toBe(false);
            expect(persistence.isDirty).toBe(true);
            expect(persistence.saveError).toBe('Offline — changes are only saved locally.');
        });

        it('markClean clears dirty without touching other fields', () => {
            useEditorStore.getState().saveStarted();
            useEditorStore.getState().markClean();
            const persistence = useEditorStore.getState().persistence;
            expect(persistence.isDirty).toBe(false);
            expect(persistence.isSaving).toBe(true); // untouched
        });

        it('resetPersistence fully resets but keeps the given revision', () => {
            useEditorStore.getState().saveSuccess(5, new Date('2026-09-28T09:00:00Z'));
            useEditorStore.getState().markDirty();
            useEditorStore.getState().resetPersistence(5);
            expect(useEditorStore.getState().persistence).toEqual({
                isDirty: false,
                isSaving: false,
                lastSavedAt: null,
                saveError: null,
                revision: 5,
            });
        });
    });

    describe('page operations (US-3.14 .. US-3.18)', () => {
        const rect = (id: string) => ({
            id,
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        });

        const makePage = (id: string, name: string, objects: any[] = []): DesignPage =>
            ({
                id,
                name,
                pageNumber: 1,
                document: {
                    schemaVersion: '1.0',
                    objects,
                    background: { type: 'color', value: '#ffffff' },
                },
            }) as any;

        const threePages = (): Design => ({
            ...mockDesign,
            pages: [
                makePage('page-1', 'Cover', [rect('a1')]),
                makePage('page-2', 'Product Details', [
                    rect('b1'),
                    rect('b2'),
                    {
                        id: 'g1',
                        type: 'group',
                        x: 0,
                        y: 0,
                        width: 10,
                        height: 10,
                        children: ['b1', 'b2'],
                    },
                ]),
                makePage('page-3', 'Summary', []),
            ],
        });

        const pageIds = () =>
            (useEditorStore.getState().design as Design).pages.map((p) => p.id);

        const isDirty = () => useEditorStore.getState().persistence.isDirty;

        beforeEach(() => {
            useEditorStore.getState().setDesign(threePages());
            useEditorStore.getState().markClean();
        });

        describe('addPage', () => {
            it('appends a page with a stable unique id and marks the design dirty', () => {
                const pageId = useEditorStore.getState().addPage('Back Cover');
                const pages = (useEditorStore.getState().design as Design).pages;

                expect(pageId).toBeTruthy();
                expect(pages).toHaveLength(4);
                expect(pages[3].id).toBe(pageId);
                expect(pages[3].name).toBe('Back Cover');
                expect(pages[3].document.objects).toEqual([]);
                expect(pageIds().filter((id) => id === pageId)).toHaveLength(1);
                expect(isDirty()).toBe(true);
                // The new page becomes the current one.
                expect(useEditorStore.getState().currentPageId).toBe(pageId);
            });

            it('defaults the name to the next page number', () => {
                useEditorStore.getState().addPage();
                const pages = (useEditorStore.getState().design as Design).pages;
                expect(pages[3].name).toBe('Page 4');
            });

            it('returns null when no design is loaded', () => {
                useEditorStore.setState({ design: null });
                expect(useEditorStore.getState().addPage()).toBeNull();
            });
        });

        describe('duplicatePage', () => {
            it('inserts a copy right after the source with a new page id', () => {
                const copyId = useEditorStore.getState().duplicatePage('page-2');
                expect(copyId).toBeTruthy();
                expect(pageIds()).toEqual(['page-1', 'page-2', copyId, 'page-3']);
                expect(useEditorStore.getState().currentPageId).toBe(copyId);
                expect(isDirty()).toBe(true);
            });

            it('regenerates object ids and rewrites group children', () => {
                const copyId = useEditorStore.getState().duplicatePage('page-2');
                const pages = (useEditorStore.getState().design as Design).pages;
                const copy = pages.find((p) => p.id === copyId)!;
                const source = pages.find((p) => p.id === 'page-2')!;

                const sourceIds = source.document.objects.map((o: any) => o.id);
                const copyIds = copy.document.objects.map((o: any) => o.id);
                expect(copyIds).toHaveLength(sourceIds.length);
                expect(copyIds.some((id: string) => sourceIds.includes(id))).toBe(false);

                const group: any = copy.document.objects.find((o: any) => o.type === 'group');
                const members = copy.document.objects
                    .filter((o: any) => o.type !== 'group')
                    .map((o: any) => o.id);
                expect([...group.children].sort()).toEqual([...members].sort());
                expect(group.children.some((c: string) => sourceIds.includes(c))).toBe(false);
            });

            it('returns null for an unknown page', () => {
                expect(useEditorStore.getState().duplicatePage('nope')).toBeNull();
                expect(pageIds()).toHaveLength(3);
            });
        });

        describe('deletePage', () => {
            it('removes the page and marks the design dirty', () => {
                expect(useEditorStore.getState().deletePage('page-2')).toBe(true);
                expect(pageIds()).toEqual(['page-1', 'page-3']);
                expect(isDirty()).toBe(true);
            });

            it('never removes the last remaining page', () => {
                useEditorStore.getState().deletePage('page-1');
                useEditorStore.getState().deletePage('page-2');
                expect(pageIds()).toEqual(['page-3']);
                expect(useEditorStore.getState().deletePage('page-3')).toBe(false);
                expect(pageIds()).toEqual(['page-3']);
            });

            it('moves the current page selection to a neighbour', () => {
                useEditorStore.getState().setCurrentPage('page-2');
                useEditorStore.getState().deletePage('page-2');
                expect(useEditorStore.getState().currentPageId).toBe('page-3');
            });

            it('keeps the selection when another page was current', () => {
                useEditorStore.getState().setCurrentPage('page-1');
                useEditorStore.getState().deletePage('page-2');
                expect(useEditorStore.getState().currentPageId).toBe('page-1');
            });
        });

        describe('renamePage', () => {
            it('renames the page and marks the design dirty', () => {
                useEditorStore.getState().renamePage('page-1', 'Front Matter');
                const pages = (useEditorStore.getState().design as Design).pages;
                expect(pages[0].name).toBe('Front Matter');
                expect(isDirty()).toBe(true);
            });

            it('allows free-form names with surrounding whitespace trimmed', () => {
                useEditorStore.getState().renamePage('page-3', '  Product Details  ');
                const pages = (useEditorStore.getState().design as Design).pages;
                expect(pages[2].name).toBe('Product Details');
            });

            it('ignores blank names and unknown pages', () => {
                useEditorStore.getState().renamePage('page-1', '   ');
                useEditorStore.getState().renamePage('nope', 'Nope');
                const pages = (useEditorStore.getState().design as Design).pages;
                expect(pages[0].name).toBe('Cover');
                expect(pages).toHaveLength(3);
                expect(isDirty()).toBe(false);
            });
        });

        describe('movePage', () => {
            it('moves a page to an explicit index (drag/drop target)', () => {
                useEditorStore.getState().movePage('page-1', 2);
                expect(pageIds()).toEqual(['page-2', 'page-3', 'page-1']);
                expect(isDirty()).toBe(true);
            });

            it('moves a page backwards', () => {
                useEditorStore.getState().movePage('page-3', 0);
                expect(pageIds()).toEqual(['page-3', 'page-1', 'page-2']);
            });

            it('serves move-up/move-down as neighbouring indexes', () => {
                useEditorStore.getState().movePage('page-3', 1); // move up
                expect(pageIds()).toEqual(['page-1', 'page-3', 'page-2']);
                useEditorStore.getState().movePage('page-3', 2); // move down
                expect(pageIds()).toEqual(['page-1', 'page-2', 'page-3']);
            });

            it('clamps out-of-range targets and ignores no-op/unknown moves', () => {
                useEditorStore.getState().movePage('page-1', 99);
                expect(pageIds()).toEqual(['page-2', 'page-3', 'page-1']);

                useEditorStore.getState().movePage('page-1', -5);
                expect(pageIds()).toEqual(['page-1', 'page-2', 'page-3']);

                useEditorStore.getState().markClean();
                useEditorStore.getState().movePage('page-1', 0);
                useEditorStore.getState().movePage('nope', 1);
                expect(pageIds()).toEqual(['page-1', 'page-2', 'page-3']);
                expect(isDirty()).toBe(false);
            });

            it('preserves every page and its objects', () => {
                const before = new Map(
                    threePages().pages.map((p) => [p.id, JSON.stringify(p)])
                );
                useEditorStore.getState().movePage('page-1', 2);
                const pages = (useEditorStore.getState().design as Design).pages;
                expect(pages.map((p) => p.id)).toEqual(['page-2', 'page-3', 'page-1']);
                for (const page of pages) {
                    expect(JSON.stringify(page)).toBe(before.get(page.id));
                }
            });

            it('is undoable through the history stack', () => {
                useEditorStore.getState().movePage('page-1', 2);
                expect(pageIds()).toEqual(['page-2', 'page-3', 'page-1']);
                useEditorStore.getState().undo();
                expect(pageIds()).toEqual(['page-1', 'page-2', 'page-3']);
            });
        });
    });
});
