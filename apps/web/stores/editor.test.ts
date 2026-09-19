import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './editor';
import { Design, DesignPage, DesignObject } from '@/types';

describe('Editor Store', () => {
    beforeEach(() => {
        // Reset store before each test
        useEditorStore.setState({
            design: null,
            selectedObjectIds: [],
            activeTool: 'select',
        });
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
});
