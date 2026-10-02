import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PageNavigator from './PageNavigator';
import { useEditorStore } from '@/stores/editor';
import { Design, DesignPage } from '@/types';

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

const threePages = (): Design =>
    ({
        id: 'design-1',
        name: 'Test Design',
        description: '',
        width: 1080,
        height: 1080,
        status: 'draft',
        currentVersion: 1,
        pages: [
            makePage('page-1', 'Cover', [rect('a1')]),
            makePage('page-2', 'Product Details', [rect('b1')]),
            makePage('page-3', 'Summary', []),
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    }) as any;

const pageIds = () =>
    (useEditorStore.getState().design as Design).pages.map((p) => p.id);

describe('PageNavigator', () => {
    beforeEach(() => {
        useEditorStore.setState({ design: null, currentPageId: null });
        useEditorStore.getState().setDesign(threePages());
    });

    it('renders every page by name', () => {
        render(<PageNavigator />);
        expect(screen.getByText('Cover')).toBeTruthy();
        expect(screen.getByText('Product Details')).toBeTruthy();
        expect(screen.getByText('Summary')).toBeTruthy();
    });

    it('falls back to a numbered name when a page has none', () => {
        const design = threePages();
        (design.pages[1] as any).name = undefined;
        useEditorStore.getState().setDesign(design);
        render(<PageNavigator />);
        expect(screen.getByText('Page 2')).toBeTruthy();
    });

    it('selects the clicked page', () => {
        render(<PageNavigator />);
        fireEvent.click(screen.getByText('Summary'));
        expect(useEditorStore.getState().currentPageId).toBe('page-3');
    });

    it('adds a page via the Add Page button', () => {
        render(<PageNavigator />);
        fireEvent.click(screen.getByText('Add Page'));
        expect(pageIds()).toHaveLength(4);
        expect(useEditorStore.getState().persistence.isDirty).toBe(true);
        expect(useEditorStore.getState().currentPageId).toBe(pageIds()[3]);
    });

    it('renames a page inline and commits on Enter', () => {
        render(<PageNavigator />);
        fireEvent.click(screen.getByLabelText('Rename Cover'));

        const input = screen.getByLabelText('New name for Cover') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Front Matter' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByText('Front Matter')).toBeTruthy();
        expect(screen.queryByText('Cover')).toBeNull();
        expect((useEditorStore.getState().design as Design).pages[0].name).toBe(
            'Front Matter'
        );
    });

    it('cancels an inline rename on Escape', () => {
        render(<PageNavigator />);
        fireEvent.click(screen.getByLabelText('Rename Cover'));
        const input = screen.getByLabelText('New name for Cover') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Discarded' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(screen.getByText('Cover')).toBeTruthy();
        expect((useEditorStore.getState().design as Design).pages[0].name).toBe('Cover');
    });

    it('duplicates a page right after the source with fresh object ids', () => {
        render(<PageNavigator />);
        fireEvent.click(screen.getByLabelText('Duplicate Cover'));

        const pages = (useEditorStore.getState().design as Design).pages;
        expect(pageIds()).toHaveLength(4);
        expect(pageIds()[1]).not.toBe('page-1');
        expect(pages[0].name).toBe('Cover');
        expect(pages[1].name).toBe('Cover');
        expect(pages[1].document.objects[0].id).not.toBe('a1');
    });

    it('deletes an empty page without asking for confirmation', () => {
        const confirmSpy = vi.spyOn(window, 'confirm');
        render(<PageNavigator />);

        fireEvent.click(screen.getByLabelText('Delete Summary'));

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(pageIds()).toEqual(['page-1', 'page-2']);
        confirmSpy.mockRestore();
    });

    it('keeps a page with contents when the deletion is declined', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<PageNavigator />);

        fireEvent.click(screen.getByLabelText('Delete Cover'));

        expect(confirmSpy).toHaveBeenCalled();
        expect(pageIds()).toEqual(['page-1', 'page-2', 'page-3']);
        confirmSpy.mockRestore();
    });

    it('deletes a page with contents once confirmed', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<PageNavigator />);

        fireEvent.click(screen.getByLabelText('Delete Cover'));

        expect(pageIds()).toEqual(['page-2', 'page-3']);
        confirmSpy.mockRestore();
    });

    it('disables deletion while only one page remains', () => {
        useEditorStore.getState().setDesign({ ...threePages(), pages: [makePage('p1', 'Only', [])] } as any);
        render(<PageNavigator />);

        expect((screen.getByLabelText('Delete Only') as HTMLButtonElement).disabled).toBe(true);
    });

    it('moves a page with the arrow controls, disabling the ends', () => {
        render(<PageNavigator />);

        expect((screen.getByLabelText('Move Cover left') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText('Move Summary right') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByLabelText('Move Summary left'));
        expect(pageIds()).toEqual(['page-1', 'page-3', 'page-2']);
    });

    it('reorders by drag and drop onto another page', () => {
        render(<PageNavigator />);

        const cover = screen.getByText('Cover').closest('div') as HTMLElement;
        const summary = screen.getByText('Summary').closest('div') as HTMLElement;

        fireEvent.dragStart(cover);
        fireEvent.dragOver(summary);
        fireEvent.drop(summary);

        expect(pageIds()).toEqual(['page-2', 'page-3', 'page-1']);
    });
});
