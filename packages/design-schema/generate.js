#!/usr/bin/env node
/**
 * Validator generator for the canonical design document.
 *
 * Renders both validators from schema-spec.json — the single source of truth
 * for the design document's envelope constraints:
 *
 *   - apps/web/utils/documentValidation.ts   (client mirror, used by autosave)
 *   - apps/api/apps/designs/validation.py    (server enforcement)
 *
 * Usage: node packages/design-schema/generate.js
 *
 * The hand-written validators were retired deliberately: the canonical schema
 * lived in three places (this package's Zod schemas, the client mirror, the
 * server) and was kept in sync by hand. Regenerate after changing the spec;
 * both outputs are committed so neither runtime needs this generator at
 * start-up.
 */

const fs = require('fs');
const path = require('path');

const spec = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'schema-spec.json'), 'utf8')
);

const OUTPUTS = {
    web: path.resolve(__dirname, '../../apps/web/utils/documentValidation.ts'),
    api: path.resolve(__dirname, '../../apps/api/apps/designs/validation.py'),
};

const objectTypes = spec.objectTypes;
const backgroundTypes = spec.backgroundTypes;
const schemaVersion = spec.schemaVersion;

// Sorted arrays keep the generated error messages deterministic and
// byte-identical across the two runtimes.
if (
    JSON.stringify([...objectTypes].sort()) !== JSON.stringify(objectTypes) ||
    JSON.stringify([...backgroundTypes].sort()) !== JSON.stringify(backgroundTypes)
) {
    console.error(
        'schema-spec.json: objectTypes and backgroundTypes must be alphabetically sorted — ' +
            'the generated error messages embed the arrays verbatim on both sides.'
    );
    process.exit(1);
}

/** JSON string literal escaped for embedding inside generated source. */
const q = (s) => JSON.stringify(s);

/** Generation-time message strings shared by both outputs. */
const MSG = {
    schemaVersion: `schemaVersion must be '${schemaVersion}'`,
    backgroundTypes: `background.type must be one of ${q(backgroundTypes)}`,
    objectTypes: `object.type must be one of ${q(objectTypes)}`,
};

// ----------------------------------------------------------------------------
// TypeScript generator (apps/web/utils/documentValidation.ts)
// ----------------------------------------------------------------------------

function generateWeb() {
    return `/**
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

const DESIGN_OBJECT_TYPES: readonly string[] = ${q(objectTypes)};
const BACKGROUND_TYPES: readonly string[] = ${q(backgroundTypes)};
const SCHEMA_VERSION = ${q(schemaVersion)};

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
        issues.push(issue(\`\${path}.type\`, ${q(MSG.backgroundTypes)}));
    }
    if (typeof background.value !== 'string') {
        issues.push(issue(\`\${path}.value\`, 'background.value must be a string'));
    }
}

function validateObjectBase(obj: any, path: string, issues: DocumentValidationIssue[]): void {
    if (!isPlainObject(obj)) {
        issues.push(issue(path, 'object must be an object'));
        return;
    }

    if (typeof obj.id !== 'string' || !obj.id) {
        issues.push(issue(\`\${path}.id\`, 'object.id must be a non-empty string'));
    }

    if (typeof obj.type !== 'string' || !DESIGN_OBJECT_TYPES.includes(obj.type)) {
        issues.push(issue(\`\${path}.type\`, ${q(MSG.objectTypes)}));
    }

    for (const coord of ['x', 'y']) {
        if (!isNumber(obj[coord])) {
            issues.push(issue(\`\${path}.\${coord}\`, \`object.\${coord} must be a number\`));
        }
    }

    for (const dim of ['width', 'height']) {
        if (!isNumber(obj[dim]) || obj[dim] <= 0) {
            issues.push(issue(\`\${path}.\${dim}\`, \`object.\${dim} must be a positive number\`));
        }
    }
}

function validateObject(obj: any, path: string, issues: DocumentValidationIssue[]): void {
    validateObjectBase(obj, path, issues);
    if (!isPlainObject(obj)) return;

    if (obj.type === 'text') {
        if (!isPlainObject(obj.content) || typeof obj.content.text !== 'string') {
            issues.push(issue(\`\${path}.content\`, 'text object requires content.text'));
        }
    } else if (obj.type === 'image') {
        if (!isPlainObject(obj.content) || typeof obj.content.assetId !== 'string') {
            issues.push(issue(\`\${path}.content\`, 'image object requires content.assetId'));
        }
    } else if (obj.type === 'group') {
        if (
            !Array.isArray(obj.children) ||
            obj.children.some((child: any) => typeof child !== 'string')
        ) {
            issues.push(issue(\`\${path}.children\`, 'group object requires children as a list of object ids'));
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
        issues.push(issue(\`\${path}.schemaVersion\`, ${q(MSG.schemaVersion)}));
    }

    for (const dim of ['width', 'height']) {
        const value = document[dim];
        if (!Number.isInteger(value) || typeof value === 'boolean' || value <= 0) {
            issues.push(issue(\`\${path}.\${dim}\`, \`\${dim} must be a positive integer\`));
        }
    }

    validateBackground(document.background, \`\${path}.background\`, issues);

    const pages = document.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
        issues.push(issue(\`\${path}.pages\`, 'pages must be a non-empty list'));
        return issues;
    }

    const seenPageIds = new Set<string>();
    pages.forEach((page: any, index: number) => {
        const pagePath = \`\${path}.pages[\${index}]\`;
        if (!isPlainObject(page)) {
            issues.push(issue(pagePath, 'page must be an object'));
            return;
        }

        if (typeof page.id !== 'string' || !page.id) {
            issues.push(issue(\`\${pagePath}.id\`, 'page.id must be a non-empty string'));
        } else if (seenPageIds.has(page.id)) {
            issues.push(issue(\`\${pagePath}.id\`, \`duplicate page id \${JSON.stringify(page.id)}\`));
        } else {
            seenPageIds.add(page.id);
        }

        if ('name' in page && typeof page.name !== 'string') {
            issues.push(issue(\`\${pagePath}.name\`, 'page.name must be a string'));
        }

        if ('background' in page) {
            validateBackground(page.background, \`\${pagePath}.background\`, issues);
        }

        const objects = page.objects;
        if (!Array.isArray(objects)) {
            issues.push(issue(\`\${pagePath}.objects\`, 'page.objects must be a list'));
            return;
        }

        objects.forEach((obj: any, objIndex: number) => {
            validateObject(obj, \`\${pagePath}.objects[\${objIndex}]\`, issues);
        });
    });

    return issues;
}
`;
}

// ----------------------------------------------------------------------------
// Python generator (apps/api/apps/designs/validation.py)
// ----------------------------------------------------------------------------

function generateApi() {
    const sortedObjectTypes = [...objectTypes].sort();
    const sortedBackgroundTypes = [...backgroundTypes].sort();

    return `"""
Validation for the canonical design document JSON.

GENERATED FILE — do not edit by hand.
Source: packages/design-schema/schema-spec.json via packages/design-schema/generate.js
Regenerate: node packages/design-schema/generate.js

The canonical shape is defined by packages/design-schema and mirrored here for
server-side enforcement:

    {
        "schemaVersion": ${q(schemaVersion)},
        "width": int > 0,
        "height": int > 0,
        "background": {"type": "${backgroundTypes.join('|')}", "value": str},
        "pages": [
            {
                "id": str,
                "name": str (optional),
                "background": {...} (optional, per-page),
                "objects": [ ...typed design objects... ]
            }
        ]
    }

Object payloads are stored as received: the validator checks the envelope and
each object's core geometry (id, type, position, size) but does not deep-verify
every type-specific content/style field, so newer client fields can round-trip
without server changes.
"""

from typing import Any, Dict, Optional

from .documents import SCHEMA_VERSION

DESIGN_OBJECT_TYPES = {${sortedObjectTypes.map((t) => q(t)).join(', ')}}
BACKGROUND_TYPES = {${sortedBackgroundTypes.map((t) => q(t)).join(', ')}}


class DocumentValidationError(Exception):
    """Raised when a design document fails canonical validation."""

    def __init__(self, message: str, path: Optional[str] = None):
        self.path = path
        super().__init__(f'{path}: {message}' if path else message)


def _fail(message: str, path: Optional[str] = None) -> None:
    raise DocumentValidationError(message, path=path)


def _validate_background(background: Any, path: str) -> None:
    if not isinstance(background, dict):
        _fail('background must be an object', path=path)
    if background.get('type') not in BACKGROUND_TYPES:
        _fail(
            'background.type must be one of ' + repr(sorted(BACKGROUND_TYPES)),
            path=f'{path}.type',
        )
    if not isinstance(background.get('value'), str):
        _fail('background.value must be a string', path=f'{path}.value')


def _validate_object_base(obj: Any, path: str) -> None:
    if not isinstance(obj, dict):
        _fail('object must be an object', path=path)

    if not isinstance(obj.get('id'), str) or not obj['id']:
        _fail('object.id must be a non-empty string', path=f'{path}.id')

    if obj.get('type') not in DESIGN_OBJECT_TYPES:
        _fail(
            'object.type must be one of ' + repr(sorted(DESIGN_OBJECT_TYPES)),
            path=f'{path}.type',
        )

    for coord in ('x', 'y'):
        if not isinstance(obj.get(coord), (int, float)) or isinstance(obj.get(coord), bool):
            _fail(f'object.{coord} must be a number', path=f'{path}.{coord}')

    for dim in ('width', 'height'):
        value = obj.get(dim)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
            _fail(f'object.{dim} must be a positive number', path=f'{path}.{dim}')


def _validate_object(obj: Any, path: str) -> None:
    _validate_object_base(obj, path)

    if obj['type'] == 'text':
        content = obj.get('content')
        if not isinstance(content, dict) or not isinstance(content.get('text'), str):
            _fail('text object requires content.text', path=f'{path}.content')
    elif obj['type'] == 'image':
        content = obj.get('content')
        if not isinstance(content, dict) or not isinstance(content.get('assetId'), str):
            _fail('image object requires content.assetId', path=f'{path}.content')
    elif obj['type'] == 'group':
        children = obj.get('children')
        if not isinstance(children, list) or any(not isinstance(c, str) for c in children):
            _fail('group object requires children as a list of object ids', path=f'{path}.children')


def validate_document(document: Any) -> Dict[str, Any]:
    """
    Validate a canonical design document.

    Returns the document on success; raises DocumentValidationError otherwise.
    """
    path = 'document'

    if not isinstance(document, dict):
        _fail('document must be an object', path=path)

    if document.get('schemaVersion') != SCHEMA_VERSION:
        _fail(
            'schemaVersion must be ' + repr(SCHEMA_VERSION),
            path=f'{path}.schemaVersion',
        )

    for dim in ('width', 'height'):
        value = document.get(dim)
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            _fail(f'{dim} must be a positive integer', path=f'{path}.{dim}')

    _validate_background(document.get('background'), f'{path}.background')

    pages = document.get('pages')
    if not isinstance(pages, list) or not pages:
        _fail('pages must be a non-empty list', path=f'{path}.pages')

    seen_page_ids = set()
    for index, page in enumerate(pages):
        page_path = f'{path}.pages[{index}]'
        if not isinstance(page, dict):
            _fail('page must be an object', path=page_path)

        page_id = page.get('id')
        if not isinstance(page_id, str) or not page_id:
            _fail('page.id must be a non-empty string', path=f'{page_path}.id')
        if page_id in seen_page_ids:
            _fail(f'duplicate page id {page_id!r}', path=f'{page_path}.id')
        seen_page_ids.add(page_id)

        if 'name' in page and not isinstance(page['name'], str):
            _fail('page.name must be a string', path=f'{page_path}.name')

        if 'background' in page:
            _validate_background(page['background'], f'{page_path}.background')

        objects = page.get('objects')
        if not isinstance(objects, list):
            _fail('page.objects must be a list', path=f'{page_path}.objects')

        for obj_index, obj in enumerate(objects):
            _validate_object(obj, f'{page_path}.objects[{obj_index}]')

    return document
`;
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

let dirty = false;
for (const [name, content, target] of [
    ['web', generateWeb(), OUTPUTS.web],
    ['api', generateApi(), OUTPUTS.api],
]) {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (existing === content) {
        console.log(`${name}: up to date (${path.relative(process.cwd(), target)})`);
        continue;
    }
    fs.writeFileSync(target, content);
    dirty = true;
    console.log(`${name}: regenerated (${path.relative(process.cwd(), target)})`);
}
process.exit(dirty ? 0 : 0);
