/**
 * Design Schema - TypeScript Types
 * 
 * This file defines the canonical Design JSON structure that is the source
 * of truth for all design documents in the system.
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Current schema version. Increment when making breaking changes.
 */
export const SCHEMA_VERSION = '1.0'

/**
 * Supported design object types
 */
export type DesignObjectType = 'text' | 'image' | 'rectangle' | 'circle' | 'line' | 'group'

/**
 * Supported background types
 */
export type BackgroundType = 'color' | 'gradient'

/**
 * Text alignment options
 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/**
 * Font styles
 */
export type FontStyle = 'normal' | 'italic'

/**
 * Supported export formats
 */
export type ExportFormat = 'png' | 'jpeg' | 'pdf'

// ============================================================================
// Main Design Structure
// ============================================================================

/**
 * Root design document
 */
export interface Design {
    schemaVersion: string
    width: number
    height: number
    background: Background
    pages: Page[]
}

/**
 * Background configuration
 */
export interface Background {
    type: BackgroundType
    value: string
}

/**
 * Page within a design
 */
export interface Page {
    id: string
    name?: string
    objects: DesignObject[]
}

// ============================================================================
// Design Objects - Union Type
// ============================================================================

export type DesignObject =
    | TextObject
    | ImageObject
    | RectangleObject
    | CircleObject
    | LineObject
    | GroupObject

// ============================================================================
// Base Object Interface
// ============================================================================

/**
 * Base properties shared by all design objects
 */
export interface BaseDesignObject {
    id: string
    type: DesignObjectType

    // Position
    x: number
    y: number

    // Size
    width: number
    height: number

    // Transformation
    rotation: number
    scaleX: number
    scaleY: number

    // Appearance
    opacity: number

    // State
    visible: boolean
    locked: boolean

    // Layering
    zIndex: number
}

// ============================================================================
// Specific Object Types
// ============================================================================

/**
 * Text object
 */
export interface TextObject extends BaseDesignObject {
    type: 'text'
    content: {
        text: string
    }
    style: {
        fontFamily: string
        fontSize: number
        fontWeight: number
        fontStyle: FontStyle
        color: string
        textAlign: TextAlign
        lineHeight: number
        letterSpacing: number
    }
}

/**
 * Image object
 */
export interface ImageObject extends BaseDesignObject {
    type: 'image'
    content: {
        assetId: string
    }
    crop?: {
        x: number
        y: number
        width: number
        height: number
    }
    filters?: {
        brightness?: number
        contrast?: number
        saturation?: number
    }
}

/**
 * Rectangle shape object
 */
export interface RectangleObject extends BaseDesignObject {
    type: 'rectangle'
    fill?: {
        type: 'solid' | 'gradient'
        value: string
    }
    stroke?: {
        color: string
        width: number
    }
    cornerRadius?: number
}

/**
 * Circle shape object
 */
export interface CircleObject extends BaseDesignObject {
    type: 'circle'
    fill?: {
        type: 'solid' | 'gradient'
        value: string
    }
    stroke?: {
        color: string
        width: number
    }
}

/**
 * Line shape object
 */
export interface LineObject extends BaseDesignObject {
    type: 'line'
    stroke: {
        color: string
        width: number
    }
    endType?: 'none' | 'arrow' | 'circle' | 'square'
}

/**
 * Group of objects
 */
export interface GroupObject extends BaseDesignObject {
    type: 'group'
    children: string[] // IDs of child objects
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Type guard for text objects
 */
export function isTextObject(obj: DesignObject): obj is TextObject {
    return obj.type === 'text'
}

/**
 * Type guard for image objects
 */
export function isImageObject(obj: DesignObject): obj is ImageObject {
    return obj.type === 'image'
}

/**
 * Type guard for rectangle objects
 */
export function isRectangleObject(obj: DesignObject): obj is RectangleObject {
    return obj.type === 'rectangle'
}

/**
 * Type guard for circle objects
 */
export function isCircleObject(obj: DesignObject): obj is CircleObject {
    return obj.type === 'circle'
}

/**
 * Type guard for line objects
 */
export function isLineObject(obj: DesignObject): obj is LineObject {
    return obj.type === 'line'
}

/**
 * Type guard for group objects
 */
export function isGroupObject(obj: DesignObject): obj is GroupObject {
    return obj.type === 'group'
}

/**
 * Get all objects in a design (flattened)
 */
export function getAllObjects(design: Design): DesignObject[] {
    const objects: DesignObject[] = []
    for (const page of design.pages) {
        objects.push(...page.objects)
    }
    return objects
}

/**
 * Create a new design with default values
 */
export function createDefaultDesign(width: number = 1080, height: number = 1080): Design {
    return {
        schemaVersion: SCHEMA_VERSION,
        width,
        height,
        background: {
            type: 'color',
            value: '#FFFFFF'
        },
        pages: [
            {
                id: generateId('page'),
                objects: []
            }
        ]
    }
}

/**
 * Generate a stable ID
 */
export function generateId(prefix: string = 'obj'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a text object
 */
export function createTextObject(text: string, x: number = 0, y: number = 0): TextObject {
    return {
        id: generateId('text'),
        type: 'text',
        x,
        y,
        width: 200,
        height: 60,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        content: {
            text
        },
        style: {
            fontFamily: 'Arial',
            fontSize: 16,
            fontWeight: 400,
            fontStyle: 'normal',
            color: '#000000',
            textAlign: 'left',
            lineHeight: 1.2,
            letterSpacing: 0
        }
    }
}

/**
 * Create a rectangle object
 */
export function createRectangleObject(x: number = 0, y: number = 0, width: number = 100, height: number = 100): RectangleObject {
    return {
        id: generateId('rect'),
        type: 'rectangle',
        x,
        y,
        width,
        height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        fill: {
            type: 'solid',
            value: '#E0E0E0'
        },
        stroke: {
            color: '#000000',
            width: 1
        }
    }
}

/**
 * Create a circle object
 */
export function createCircleObject(x: number = 0, y: number = 0, radius: number = 50): CircleObject {
    return {
        id: generateId('circle'),
        type: 'circle',
        x,
        y,
        width: radius * 2,
        height: radius * 2,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        fill: {
            type: 'solid',
            value: '#E0E0E0'
        },
        stroke: {
            color: '#000000',
            width: 1
        }
    }
}

/**
 * Create an image object
 */
export function createImageObject(assetId: string, x: number = 0, y: number = 0, width: number = 200, height: number = 200): ImageObject {
    return {
        id: generateId('image'),
        type: 'image',
        x,
        y,
        width,
        height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
        content: {
            assetId
        },
        crop: {
            x: 0,
            y: 0,
            width: 1,
            height: 1
        }
    }
}
