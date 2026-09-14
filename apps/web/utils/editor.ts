/**
 * Utility functions for the editor
 */

import { DesignObject } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export function generateObjectId(): string {
    return `obj_${uuidv4()}`;
}

export function generatePageId(): string {
    return `page_${uuidv4()}`;
}

export function generateDesignId(): string {
    return `design_${uuidv4()}`;
}

export function createDefaultTextObject(x = 0, y = 0): DesignObject {
    return {
        id: generateObjectId(),
        type: 'text',
        x,
        y,
        width: 300,
        height: 50,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        content: { text: 'Click to edit' },
        style: {
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: 400,
            fontStyle: 'normal',
            color: '#111111',
            textAlign: 'left',
            lineHeight: 1.2,
            letterSpacing: 0,
        },
    };
}

export function createDefaultRectangle(x = 0, y = 0): DesignObject {
    return {
        id: generateObjectId(),
        type: 'rectangle',
        x,
        y,
        width: 200,
        height: 200,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        fill: '#3b82f6',
        stroke: undefined,
        strokeWidth: 0,
    };
}

export function createDefaultCircle(x = 0, y = 0): DesignObject {
    return {
        id: generateObjectId(),
        type: 'circle',
        x,
        y,
        width: 200,
        height: 200,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        fill: '#3b82f6',
        stroke: undefined,
        strokeWidth: 0,
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function (...args: Parameters<T>) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
