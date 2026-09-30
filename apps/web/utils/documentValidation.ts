/**
 * Client-side validation of the canonical design document.
 *
 * GENERATED FILE — do not edit by hand.
 * Source: packages/design-schema/schema-spec.json via packages/design-schema/generate.js
 * Regenerate: node packages/design-schema/generate.js
 *
 * Envelope + core geometry checks mirror the server validator exactly (same
 * path-style issues), so the autosave "Validate" step rejects the same payloads
 * the server would without a network round trip. Type-specific content/style
 * fields round-trip without deep verification, matching the server.
 */

export interface DocumentValidationIssue {
    path: string;
    message: string;
}

const DESIGN_OBJECT_TYPES: readonly string[] = ["circle","group","image","line","rectangle","text"];
const BACKGROUND_TYPES: readonly string[] = ["color","gradient"];
const SCHEMA_VERSION = "1.0";

const isPlainObject = (v: any) =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

// Numbers excluding NaN; booleans are not numbers (matches Python semantics).
const isNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);

export function issue(path: string, message: string): DocumentValidationIssue {
    return { path, message };
}

function validateBackground(background: any, path: string, issues: DocumentValidationIssue[]): void {
    if (!isPlainObject(background)) {
        issues.push(issue(path, 'background must be an object'));
        return;
    }
    if (typeof background.type !== 'string' || !BACKGROUND_TYPES.includes(background.type)) {
        issues.push(issue(`${path}.type`, "background.type must be one of [\"color\",\"gradient\"]"));
    }
    if (typeof background.value !== 'string') {
        issues.push(issue(`${path}.value`, 'background.value must be a string'));
    }
}

function validateObjectBase(obj: any, path: string, issues: DocumentValidationIssue[]): void {
    if (!isPlainObject(obj)) {
        issues.push(issue(path, 'object must be an object'));
        return;
    }

    if (typeof obj.id !== 'string' || !obj.id) {
        issues.push(issue(`${path}.id`, 'object.id must be a non-empty string'));
    }

    if (typeof obj.type !== 'string' || !DESIGN_OBJECT_TYPES.includes(obj.type)) {
        issues.push(issue(`${path}.type`, "object.type must be one of [\"circle\",\"group\",\"image\",\"line\",\"rectangle\",\"text\"]"));
    }

    for (const coord of ['x', 'y']) {
        if (!isNumber(obj[coord])) {
            issues.push(issue(`${path}.${coord}`, `object.${coord} must be a number`));
        }
    }

    for (const dim of ['width', 'height']) {
        if (!isNumber(obj[dim]) || obj[dim] <= 0) {
            issues.push(issue(`${path}.${dim}`, `object.${dim} must be a positive number`));
        }
    }
}

function validateObject(obj: any, path: string, issues: DocumentValidationIssue[]): void {
    validateObjectBase(obj, path, issues);
    if (!isPlainObject(obj)) return;

    if (obj.type === 'text') {
        if (!isPlainObject(obj.content) || typeof obj.content.text !== 'string') {
            issues.push(issue(`${path}.content`, 'text object requires content.text'));
        }
    } else if (obj.type === 'image') {
        if (!isPlainObject(obj.content) || typeof obj.content.assetId !== 'string') {
            issues.push(issue(`${path}.content`, 'image object requires content.assetId'));
        }
    } else if (obj.type === 'group') {
        if (
            !Array.isArray(obj.children) ||
            obj.children.some((child: any) => typeof child !== 'string')
        ) {
            issues.push(issue(`${path}.children`, 'group object requires children as a list of object ids'));
        }
    }
}

/**
 * Validate a canonical design document and return all issues found.
 * An empty array means the document is valid and safe to PUT.
 */
export function validateDocument(document: any): DocumentValidationIssue[] {
    const issues: DocumentValidationIssue[] = [];
    const path = 'document';

    if (!isPlainObject(document)) {
        issues.push(issue(path, 'document must be an object'));
        return issues;
    }

    if (document.schemaVersion !== SCHEMA_VERSION) {
        issues.push(issue(`${path}.schemaVersion`, "schemaVersion must be '1.0'"));
    }

    for (const dim of ['width', 'height']) {
        const value = document[dim];
        if (!Number.isInteger(value) || typeof value === 'boolean' || value <= 0) {
            issues.push(issue(`${path}.${dim}`, `${dim} must be a positive integer`));
        }
    }

    validateBackground(document.background, `${path}.background`, issues);

    const pages = document.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
        issues.push(issue(`${path}.pages`, 'pages must be a non-empty list'));
        return issues;
    }

    const seenPageIds = new Set<string>();
    pages.forEach((page: any, index: number) => {
        const pagePath = `${path}.pages[${index}]`;
        if (!isPlainObject(page)) {
            issues.push(issue(pagePath, 'page must be an object'));
            return;
        }

        if (typeof page.id !== 'string' || !page.id) {
            issues.push(issue(`${pagePath}.id`, 'page.id must be a non-empty string'));
        } else if (seenPageIds.has(page.id)) {
            issues.push(issue(`${pagePath}.id`, `duplicate page id ${JSON.stringify(page.id)}`));
        } else {
            seenPageIds.add(page.id);
        }

        if ('name' in page && typeof page.name !== 'string') {
            issues.push(issue(`${pagePath}.name`, 'page.name must be a string'));
        }

        if ('background' in page) {
            validateBackground(page.background, `${pagePath}.background`, issues);
        }

        const objects = page.objects;
        if (!Array.isArray(objects)) {
            issues.push(issue(`${pagePath}.objects`, 'page.objects must be a list'));
            return;
        }

        objects.forEach((obj: any, objIndex: number) => {
            validateObject(obj, `${pagePath}.objects[${objIndex}]`, issues);
        });
    });

    return issues;
}
