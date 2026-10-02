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


def regenerate_object_ids(objects):
    """
    Give every object in `objects` a fresh id and rewrite group `children`
    references to those new ids. Mutates in place and returns the old→new map.

    Shared by clone_document and clone_page so a clone never references the
    source's objects (dangling, or worse, an unrelated object that happens to
    share the id).
    """
    id_map = {}
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        old_id = obj.get("id")
        new_id = str(uuid.uuid4())
        if isinstance(old_id, str):
            id_map[old_id] = new_id
        obj["id"] = new_id

    for obj in objects:
        if (
            isinstance(obj, dict)
            and obj.get("type") == "group"
            and isinstance(obj.get("children"), list)
        ):
            obj["children"] = [id_map.get(child, child) for child in obj["children"]]

    return id_map


def clone_document(document):
    """Deep-copy a document, regenerating page and object IDs so clones don't collide with the source"""
    cloned = copy.deepcopy(document or {})
    for page in cloned.get("pages", []):
        page["id"] = str(uuid.uuid4())
        regenerate_object_ids(page.get("objects", []))
    return cloned


def clone_page(page):
    """
    Deep-copy a single canonical page, regenerating the page id and every
    object id (group `children` rewritten to match) so the duplicate is
    independent of the page it was copied from.
    """
    cloned = copy.deepcopy(page or {})
    if isinstance(cloned, dict):
        cloned["id"] = str(uuid.uuid4())
        objects = cloned.get("objects")
        if isinstance(objects, list):
            regenerate_object_ids(objects)
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
