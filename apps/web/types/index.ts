// Design Object Types
export type DesignObjectType = 'text' | 'image' | 'rectangle' | 'circle' | 'line' | 'group';

export interface BaseDesignObject {
    id: string;
    type: DesignObjectType;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    visible: boolean;
    locked: boolean;
    zIndex: number;
}

export interface TextStyle {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fontStyle: 'normal' | 'italic';
    color: string;
    textAlign: 'left' | 'center' | 'right';
    lineHeight: number;
    letterSpacing: number;
}

export interface TextObject extends BaseDesignObject {
    type: 'text';
    content: {
        text: string;
    };
    style: TextStyle;
}

export interface ImageObject extends BaseDesignObject {
    type: 'image';
    content: {
        assetId: string;
    };
    crop: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface ShapeObject extends BaseDesignObject {
    type: 'rectangle' | 'circle' | 'line';
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
}

export type DesignObject = TextObject | ImageObject | ShapeObject;

export interface DesignPage {
    id: string;
    pageNumber: number;
    name: string;
    document: {
        schemaVersion: string;
        objects: DesignObject[];
        background: {
            type: 'color';
            value: string;
        };
    };
}

export interface Design {
    id: string;
    name: string;
    description: string;
    width: number;
    height: number;
    status: 'draft' | 'published' | 'archived';
    currentVersion: number;
    // Server-side canonical state: `revision` is used for optimistic
    // concurrency on document saves, `document` holds the canonical snapshot
    // as returned by the API (never rewritten by local edits).
    revision?: number;
    document?: {
        schemaVersion?: string;
        width?: number;
        height?: number;
        background?: { type: string; value: string };
        pages?: Array<{
            id: string;
            name?: string;
            background?: { type: string; value: string };
            objects?: DesignObject[];
        }>;
    };
    pages: DesignPage[];
    createdAt: string;
    updatedAt: string;
}

// Asset types
export interface Asset {
    id: string;
    name: string;
    type: 'image' | 'video';
    url: string;
    thumbnailUrl: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    createdAt: string;
}

// Template types
export interface Template {
    id: string;
    name: string;
    description: string;
    category: string;
    previewUrl: string;
    document: DesignPage['document'];
    isPublic: boolean;
    createdAt: string;
}

// Export types
export interface ExportJob {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    format: 'png' | 'jpeg' | 'pdf';
    downloadUrl?: string;
    error?: string;
    createdAt: string;
}

// API Response types
export interface ApiResponse<T> {
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

// User types
export interface User {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    createdAt: string;
}

// Share types
export interface DesignShare {
    id: string;
    token: string;
    permission: 'view' | 'edit';
    isActive: boolean;
    expiresAt?: string;
    createdAt: string;
}
