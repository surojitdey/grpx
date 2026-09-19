import { describe, it, expect } from 'vitest';
import {
    generateObjectId,
    generatePageId,
    generateDesignId,
    clamp,
    debounce,
    createDefaultRectangle,
    createDefaultCircle,
    createDefaultTextObject,
    createDefaultImage,
    createDefaultLine,
} from '@/utils/editor';

describe('Editor Utils', () => {
    it('generates unique object IDs', () => {
        const id1 = generateObjectId();
        const id2 = generateObjectId();
        expect(id1).not.toEqual(id2);
        expect(id1).toMatch(/^obj_/);
        expect(id2).toMatch(/^obj_/);
    });

    it('generates unique page IDs', () => {
        const id1 = generatePageId();
        const id2 = generatePageId();
        expect(id1).not.toEqual(id2);
        expect(id1).toMatch(/^page_/);
    });

    it('generates unique design IDs', () => {
        const id1 = generateDesignId();
        const id2 = generateDesignId();
        expect(id1).not.toEqual(id2);
        expect(id1).toMatch(/^design_/);
    });

    it('clamps values correctly', () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-5, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('debounces function calls', async () => {
        let callCount = 0;
        const fn = debounce(() => {
            callCount++;
        }, 100);

        fn();
        fn();
        fn();

        expect(callCount).toBe(0);

        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(callCount).toBe(1);
    });

    describe('Object factories', () => {
        it('creates default rectangle with correct properties', () => {
            const rect = createDefaultRectangle(100, 200);
            expect(rect.type).toBe('rectangle');
            expect(rect.x).toBe(100);
            expect(rect.y).toBe(200);
            expect(rect.width).toBe(200);
            expect(rect.height).toBe(200);
            expect(rect.fill).toBe('#3b82f6');
            expect(rect.opacity).toBe(1);
            expect(rect.rotation).toBe(0);
        });

        it('creates default circle with correct properties', () => {
            const circle = createDefaultCircle(50, 75);
            expect(circle.type).toBe('circle');
            expect(circle.x).toBe(50);
            expect(circle.y).toBe(75);
            expect(circle.width).toBe(200);
            expect(circle.height).toBe(200);
            expect(circle.fill).toBe('#3b82f6');
        });

        it('creates default text object with correct properties', () => {
            const text = createDefaultTextObject(0, 0);
            expect(text.type).toBe('text');
            expect(text.width).toBe(300);
            expect(text.height).toBe(50);
            expect((text as any).content.text).toBe('Click to edit');
            expect((text as any).style.fontFamily).toBe('Inter');
            expect((text as any).style.fontSize).toBe(24);
            expect((text as any).style.color).toBe('#111111');
        });

        it('creates default image with correct properties', () => {
            const img = createDefaultImage(100, 100, 'http://example.com/image.jpg');
            expect(img.type).toBe('image');
            expect(img.x).toBe(100);
            expect(img.y).toBe(100);
            expect(img.width).toBe(300);
            expect(img.height).toBe(200);
            expect((img as any).content.assetId).toBe('http://example.com/image.jpg');
        });

        it('creates default line with correct properties', () => {
            const line = createDefaultLine(50, 100);
            expect(line.type).toBe('line');
            expect(line.x).toBe(50);
            expect(line.y).toBe(100);
            expect(line.width).toBe(300);
            expect(line.height).toBe(2);
            expect((line as any).stroke).toBe('#000000');
            expect((line as any).strokeWidth).toBe(2);
        });

        it('generates unique IDs for created objects', () => {
            const rect1 = createDefaultRectangle(0, 0);
            const rect2 = createDefaultRectangle(0, 0);
            expect(rect1.id).not.toEqual(rect2.id);
        });
    });
});

