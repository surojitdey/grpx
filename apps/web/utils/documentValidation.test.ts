import { describe, it, expect } from 'vitest';
import { validateDocument } from './documentValidation';

// Valid canonical document used as the base for negative cases.
const validDocument = {
    schemaVersion: '1.0',
    width: 1080,
    height: 1080,
    background: { type: 'color', value: '#ffffff' },
    pages: [
        {
            id: 'page-1',
            name: 'Page 1',
            objects: [
                {
                    id: 'obj-1',
                    type: 'rectangle',
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
            ],
        },
    ],
};

describe('validateDocument (client-side mirror of backend validation.py)', () => {
    it('accepts a valid canonical document', () => {
        expect(validateDocument(validDocument)).toEqual([]);
    });

    it('rejects a non-object document', () => {
        const issues = validateDocument(null);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toEqual({ path: 'document', message: 'document must be an object' });
    });

    it('rejects a wrong schemaVersion', () => {
        const issues = validateDocument({ ...validDocument, schemaVersion: '2.0' });
        expect(issues).toContainEqual({
            path: 'document.schemaVersion',
            message: "schemaVersion must be '1.0'",
        });
    });

    it('rejects non-positive-integer width/height', () => {
        const issues = validateDocument({ ...validDocument, width: 0, height: 'big' });
        expect(issues).toContainEqual({
            path: 'document.width',
            message: 'width must be a positive integer',
        });
        expect(issues).toContainEqual({
            path: 'document.height',
            message: 'height must be a positive integer',
        });
    });

    it('rejects an invalid envelope background', () => {
        const issues = validateDocument({
            ...validDocument,
            background: { type: 'pattern', value: 5 },
        });
        expect(issues).toContainEqual({
            path: 'document.background.type',
            message: `background.type must be one of ${JSON.stringify(['color', 'gradient'])}`,
        });
        expect(issues).toContainEqual({
            path: 'document.background.value',
            message: 'background.value must be a string',
        });
    });

    it('rejects empty pages and non-list pages', () => {
        const empty = validateDocument({ ...validDocument, pages: [] });
        expect(empty).toContainEqual({
            path: 'document.pages',
            message: 'pages must be a non-empty list',
        });

        const notList = validateDocument({ ...validDocument, pages: 'nope' });
        expect(notList).toContainEqual({
            path: 'document.pages',
            message: 'pages must be a non-empty list',
        });
    });

    it('rejects duplicate page ids', () => {
        const doc = {
            ...validDocument,
            pages: [validDocument.pages[0], { ...validDocument.pages[0] }],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[1].id',
            message: 'duplicate page id "page-1"',
        });
    });

    it('rejects a page object with bad geometry', () => {
        const doc = {
            ...validDocument,
            pages: [
                {
                    id: 'page-1',
                    objects: [
                        { id: 'obj-1', type: 'rectangle', x: 'left', y: 0, width: -5, height: 10 },
                    ],
                },
            ],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[0].objects[0].x',
            message: 'object.x must be a number',
        });
        expect(issues).toContainEqual({
            path: 'document.pages[0].objects[0].width',
            message: 'object.width must be a positive number',
        });
    });

    it('rejects an unknown object type', () => {
        const doc = {
            ...validDocument,
            pages: [
                {
                    id: 'page-1',
                    objects: [
                        { id: 'obj-1', type: 'triangle', x: 0, y: 0, width: 1, height: 1 },
                    ],
                },
            ],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[0].objects[0].type',
            message: `object.type must be one of ${JSON.stringify([
                'circle',
                'group',
                'image',
                'line',
                'rectangle',
                'text',
            ])}`,
        });
    });

    it('requires content.text on text objects', () => {
        const doc = {
            ...validDocument,
            pages: [
                {
                    id: 'page-1',
                    objects: [
                        { id: 'obj-1', type: 'text', x: 0, y: 0, width: 1, height: 1 },
                    ],
                },
            ],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[0].objects[0].content',
            message: 'text object requires content.text',
        });
    });

    it('requires content.assetId on image objects', () => {
        const doc = {
            ...validDocument,
            pages: [
                {
                    id: 'page-1',
                    objects: [
                        { id: 'obj-1', type: 'image', x: 0, y: 0, width: 1, height: 1 },
                    ],
                },
            ],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[0].objects[0].content',
            message: 'image object requires content.assetId',
        });
    });

    it('requires children as string ids on group objects', () => {
        const doc = {
            ...validDocument,
            pages: [
                {
                    id: 'page-1',
                    objects: [
                        {
                            id: 'obj-1',
                            type: 'group',
                            x: 0,
                            y: 0,
                            width: 1,
                            height: 1,
                            children: ['a', 3],
                        },
                    ],
                },
            ],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[0].objects[0].children',
            message: 'group object requires children as a list of object ids',
        });
    });

    it('allows optional page background and validates it when present', () => {
        const ok = validateDocument({
            ...validDocument,
            pages: [{ ...validDocument.pages[0], background: { type: 'gradient', value: 'x' } }],
        });
        expect(ok).toEqual([]);

        const bad = validateDocument({
            ...validDocument,
            pages: [{ ...validDocument.pages[0], background: { type: 'pattern', value: 'x' } }],
        });
        expect(bad).toContainEqual({
            path: 'document.pages[0].background.type',
            message: `background.type must be one of ${JSON.stringify(['color', 'gradient'])}`,
        });
    });

    it('rejects non-string page names', () => {
        const doc = {
            ...validDocument,
            pages: [{ ...validDocument.pages[0], name: 42 }],
        };
        const issues = validateDocument(doc);
        expect(issues).toContainEqual({
            path: 'document.pages[0].name',
            message: 'page.name must be a string',
        });
    });

    it('collects multiple issues in one pass', () => {
        const issues = validateDocument({
            schemaVersion: '9',
            width: -1,
            height: 100,
            background: { type: 'color', value: '#fff' },
            pages: [{ id: '', objects: [] }],
        });
        // schemaVersion, width, page.id — page.objects empty list is fine.
        expect(issues.length).toBeGreaterThanOrEqual(3);
        expect(issues.some((i) => i.path === 'document.schemaVersion')).toBe(true);
        expect(issues.some((i) => i.path === 'document.width')).toBe(true);
        expect(issues.some((i) => i.path === 'document.pages[0].id')).toBe(true);
    });

    it('matches the backend on a document the server would reject', () => {
        // Cross-checked against apps/api/apps/designs/tests/test_validation.py
        // semantics: schemaVersion gate, positive-int dimensions, background
        // shape, object geometry, per-type content requirements.
        const doc = {
            schemaVersion: '1.0',
            width: 100,
            height: 100,
            background: { type: 'color', value: '#ffffff' },
            pages: [
                {
                    id: 'page-1',
                    objects: [
                        {
                            id: 'obj-1',
                            type: 'rectangle',
                            x: 0,
                            y: 0,
                            width: 0, // invalid: must be positive
                            height: 10,
                        },
                    ],
                },
            ],
        };
        const issues = validateDocument(doc);
        expect(issues).toEqual([
            {
                path: 'document.pages[0].objects[0].width',
                message: 'object.width must be a positive number',
            },
        ]);
    });
});
