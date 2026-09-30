"""
Helpers for building and transforming canonical design documents

The document JSONB is the source of truth: {schemaVersion, width, height,
background, pages: [{id, name, objects: [...]}]}.
"""

import copy
import uuid

SCHEMA_VERSION = "1.0"


def build_default_document(width=1080, height=1080):
    """Build a canonical design document with a default background and one blank page"""
    return {
        "schemaVersion": SCHEMA_VERSION,
        "width": width,
        "height": height,
        "background": {"type": "color", "value": "#FFFFFF"},
        "pages": [
            {
                "id": str(uuid.uuid4()),
                "name": "Page 1",
                "objects": [],
            }
        ],
    }


def clone_document(document):
    """Deep-copy a document, regenerating page and object IDs so clones don't collide with the source"""
    cloned = copy.deepcopy(document or {})
    id_map = {}
    for page in cloned.get("pages", []):
        page["id"] = str(uuid.uuid4())
        for obj in page.get("objects", []):
            old_id = obj.get("id")
            new_id = str(uuid.uuid4())
            if isinstance(old_id, str):
                id_map[old_id] = new_id
            obj["id"] = new_id

    # Rewrite group child references to the regenerated ids; otherwise a cloned
    # group points at the source design's objects (dangling, or worse, another
    # object that happens to share the id).
    for page in cloned.get("pages", []):
        for obj in page.get("objects", []):
            if obj.get("type") == "group" and isinstance(obj.get("children"), list):
                obj["children"] = [id_map.get(child, child) for child in obj["children"]]

    return cloned


def build_document_from_legacy_pages(page_rows, width=1080, height=1080):
    """
    Assemble a canonical design document from legacy design_pages rows.

    The legacy model stored one row per page as
    {"objects": [...], "background": {...}} with page order and name kept in
    relational columns. This rebuilds the canonical single-document structure
    from those rows without losing any of it:

    - pages are ordered by page_number
    - page objects and names are preserved as-is
    - the first page background found becomes the design-level background
    - any further per-page backgrounds are kept on their page as an extra
      `background` key (ignored by the canonical schema, but not data loss)

    `page_rows` is an iterable of dicts with `page_number`, `name` and
    `document` keys (as returned by QuerySet.values()). Returns the default
    blank document when no usable rows are given.
    """
    pages = []
    design_background = None

    for row in sorted(page_rows, key=lambda r: r.get("page_number") or 0):
        legacy = row.get("document")
        legacy = legacy if isinstance(legacy, dict) else {}

        page = {
            "id": str(uuid.uuid4()),
            "name": row.get("name") or f"Page {row.get('page_number', len(pages) + 1)}",
            "objects": legacy.get("objects") if isinstance(legacy.get("objects"), list) else [],
        }

        background = legacy.get("background")
        if isinstance(background, dict):
            page["background"] = background
            if design_background is None:
                design_background = background

        pages.append(page)

    if not pages:
        return build_default_document(width, height)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "width": width,
        "height": height,
        "background": design_background or {"type": "color", "value": "#FFFFFF"},
        "pages": pages,
    }
