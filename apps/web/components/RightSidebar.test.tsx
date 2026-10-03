import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PropertiesPanel } from './RightSidebar';
import { useEditorStore } from '@/stores/editor';
import type { Design } from '@/types';

const design: Design = {
    id: 'design-1',
    name: 'Test Design',
    description: '',
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
                objects: [
                    {
                        id: 'object-1',
                        type: 'rectangle',
                        x: 10,
                        y: 20,
                        width: 100,
                        height: 80,
                        rotation: 0,
                        scaleX: 1.5,
                        scaleY: 0.5,
                        opacity: 1,
                        visible: true,
                        locked: false,
                        zIndex: 0,
                    },
                ],
                background: { type: 'color', value: '#ffffff' },
            },
        },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
};

describe('PropertiesPanel dimensions', () => {
    beforeEach(() => {
        useEditorStore.getState().setDesign(design);
        useEditorStore.getState().setSelectedObjects(['object-1']);
    });

    it('shows the scaled dimensions of the canvas object', () => {
        render(<PropertiesPanel />);

        expect(screen.getByDisplayValue('150')).toBeTruthy();
        expect(screen.getByDisplayValue('40')).toBeTruthy();
    });

    it('shows live dimensions while the object is being resized', () => {
        useEditorStore.getState().setDraggedObjectPosition({
            id: 'object-1',
            x: 10,
            y: 20,
            width: 175,
            height: 55,
        });
        render(<PropertiesPanel />);

        expect(screen.getByDisplayValue('175')).toBeTruthy();
        expect(screen.getByDisplayValue('55')).toBeTruthy();
    });

    it('preserves the scaled size when a sidebar dimension is edited', () => {
        render(<PropertiesPanel />);
        fireEvent.change(screen.getByDisplayValue('150'), {
            target: { value: '180' },
        });

        const object =
            useEditorStore.getState().design?.pages[0].document.objects[0];
        expect(object).toMatchObject({ width: 120, scaleX: 1.5 });
    });
});
