import { Design } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Serialize a Design object to JSON string
 */
export function serializeDesign(design: Design): string {
    return JSON.stringify(design, null, 2);
}

/**
 * Deserialize a JSON string to Design object
 */
export function deserializeDesign(json: string): Design {
    try {
        return JSON.parse(json) as Design;
    } catch (err) {
        throw new Error(`Failed to deserialize design: ${err}`);
    }
}

/**
 * Export design to browser download
 */
export function exportDesignAsJSON(design: Design): void {
    const json = serializeDesign(design);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.name}-design.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Import design from JSON file
 */
export async function importDesignFromJSON(file: File): Promise<Design> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = e.target?.result as string;
                const design = deserializeDesign(json);
                resolve(design);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

/**
 * Create a backup key for design
 */
export function createDesignBackupKey(design: Design): string {
    return `${design.id}_${Date.now()}_${uuidv4()}`;
}

/**
 * Clone a design
 */
export function cloneDesign(design: Design): Design {
    return JSON.parse(JSON.stringify(design));
}
