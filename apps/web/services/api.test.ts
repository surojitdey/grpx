import { describe, it, expect } from 'vitest';
import { normalizeDesign } from './api';

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
