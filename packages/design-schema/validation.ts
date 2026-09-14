/**
 * Zod Validation Schemas for Design JSON
 * 
 * Used for runtime validation on the frontend
 */

import { z } from 'zod'

// ============================================================================
// Base Schemas
// ============================================================================

export const SchemaVersionSchema = z.literal('1.0')

export const DesignObjectTypeSchema = z.enum(['text', 'image', 'rectangle', 'circle', 'line', 'group'])

export const BackgroundTypeSchema = z.enum(['color', 'gradient'])

export const TextAlignSchema = z.enum(['left', 'center', 'right', 'justify'])

export const FontStyleSchema = z.enum(['normal', 'italic'])

export const ExportFormatSchema = z.enum(['png', 'jpeg', 'pdf'])

// ============================================================================
// Background Schema
// ============================================================================

export const BackgroundSchema = z.object({
    type: BackgroundTypeSchema,
    value: z.string()
})

// ============================================================================
// Base Object Schema
// ============================================================================

const BaseDesignObjectSchema = z.object({
    id: z.string().min(1),
    type: DesignObjectTypeSchema,
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    rotation: z.number().default(0),
    scaleX: z.number().default(1),
    scaleY: z.number().default(1),
    opacity: z.number().min(0).max(1).default(1),
    visible: z.boolean().default(true),
    locked: z.boolean().default(false),
    zIndex: z.number().int().default(0)
})

// ============================================================================
// Specific Object Schemas
// ============================================================================

export const TextObjectSchema = BaseDesignObjectSchema.extend({
    type: z.literal('text'),
    content: z.object({
        text: z.string()
    }),
    style: z.object({
        fontFamily: z.string(),
        fontSize: z.number().positive(),
        fontWeight: z.number(),
        fontStyle: FontStyleSchema,
        color: z.string(),
        textAlign: TextAlignSchema,
        lineHeight: z.number().positive(),
        letterSpacing: z.number()
    })
})

export const ImageObjectSchema = BaseDesignObjectSchema.extend({
    type: z.literal('image'),
    content: z.object({
        assetId: z.string()
    }),
    crop: z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1)
    }).optional(),
    filters: z.object({
        brightness: z.number().optional(),
        contrast: z.number().optional(),
        saturation: z.number().optional()
    }).optional()
})

export const RectangleObjectSchema = BaseDesignObjectSchema.extend({
    type: z.literal('rectangle'),
    fill: z.object({
        type: z.enum(['solid', 'gradient']),
        value: z.string()
    }).optional(),
    stroke: z.object({
        color: z.string(),
        width: z.number().nonnegative()
    }).optional(),
    cornerRadius: z.number().nonnegative().optional()
})

export const CircleObjectSchema = BaseDesignObjectSchema.extend({
    type: z.literal('circle'),
    fill: z.object({
        type: z.enum(['solid', 'gradient']),
        value: z.string()
    }).optional(),
    stroke: z.object({
        color: z.string(),
        width: z.number().nonnegative()
    }).optional()
})

export const LineObjectSchema = BaseDesignObjectSchema.extend({
    type: z.literal('line'),
    stroke: z.object({
        color: z.string(),
        width: z.number().positive()
    }),
    endType: z.enum(['none', 'arrow', 'circle', 'square']).optional()
})

export const GroupObjectSchema = BaseDesignObjectSchema.extend({
    type: z.literal('group'),
    children: z.array(z.string())
})

export const DesignObjectSchema = z.discriminatedUnion('type', [
    TextObjectSchema,
    ImageObjectSchema,
    RectangleObjectSchema,
    CircleObjectSchema,
    LineObjectSchema,
    GroupObjectSchema
])

// ============================================================================
// Page Schema
// ============================================================================

export const PageSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    objects: z.array(DesignObjectSchema)
})

// ============================================================================
// Design Schema
// ============================================================================

export const DesignSchema = z.object({
    schemaVersion: SchemaVersionSchema,
    width: z.number().positive(),
    height: z.number().positive(),
    background: BackgroundSchema,
    pages: z.array(PageSchema).min(1)
})

export type Design = z.infer<typeof DesignSchema>
export type Page = z.infer<typeof PageSchema>
export type DesignObject = z.infer<typeof DesignObjectSchema>
export type TextObject = z.infer<typeof TextObjectSchema>
export type ImageObject = z.infer<typeof ImageObjectSchema>
export type RectangleObject = z.infer<typeof RectangleObjectSchema>
export type CircleObject = z.infer<typeof CircleObjectSchema>
export type LineObject = z.infer<typeof LineObjectSchema>
export type GroupObject = z.infer<typeof GroupObjectSchema>
