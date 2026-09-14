import { describe, it, expect } from 'vitest';
import { generateObjectId, clamp, debounce } from '@/utils/editor';

describe('Editor Utils', () => {
    it('generates unique object IDs', () => {
        const id1 = generateObjectId();
        const id2 = generateObjectId();
        expect(id1).not.toEqual(id2);
        expect(id1).toMatch(/^obj_/);
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
});
