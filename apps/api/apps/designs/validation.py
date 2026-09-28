"""
Validation for the canonical design document JSON.

The canonical shape is defined by packages/design-schema and mirrored here for
server-side enforcement:

    {
        "schemaVersion": "1.0",
        "width": int > 0,
        "height": int > 0,
        "background": {"type": "color"|"gradient", "value": str},
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

from typing import Any, Dict, List, Optional, Tuple

from .documents import SCHEMA_VERSION

DESIGN_OBJECT_TYPES = {'text', 'image', 'rectangle', 'circle', 'line', 'group'}
BACKGROUND_TYPES = {'color', 'gradient'}


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
        _fail(f"background.type must be one of {sorted(BACKGROUND_TYPES)}", path=f'{path}.type')
    if not isinstance(background.get('value'), str):
        _fail('background.value must be a string', path=f'{path}.value')


def _validate_object_base(obj: Any, path: str) -> None:
    if not isinstance(obj, dict):
        _fail('object must be an object', path=path)

    if not isinstance(obj.get('id'), str) or not obj['id']:
        _fail('object.id must be a non-empty string', path=f'{path}.id')

    if obj.get('type') not in DESIGN_OBJECT_TYPES:
        _fail(f"object.type must be one of {sorted(DESIGN_OBJECT_TYPES)}", path=f'{path}.type')

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
            f'schemaVersion must be {SCHEMA_VERSION!r}',
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
