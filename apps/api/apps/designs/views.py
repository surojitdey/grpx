"""
Design views and viewsets
"""

import copy
import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .documents import SCHEMA_VERSION, clone_document, clone_page
from .models import Design, DesignVersion
from .permissions import IsDesignOwner
from .serializers import (
    DesignCreateSerializer,
    DesignDetailSerializer,
    DesignDocumentSerializer,
    DesignListSerializer,
    DesignUpdateSerializer,
    DesignVersionSerializer,
    PageCreateSerializer,
    PageMoveSerializer,
    PageRenameSerializer,
)
from .validation import DocumentValidationError, validate_document

# Autosave snapshots are frequent, so DesignVersion history must not grow
# without bound. Keep the most recent K versions per design — enough to browse
# and restore recent milestones — and prune older ones on each save.
KEEP_VERSIONS = 50


class PageNotFound(Exception):
    """Raised by a page mutator when the design has no page with that id."""


def _pages(document):
    """Return the canonical page list, failing cleanly if the shape is broken."""
    pages = document.get("pages") if isinstance(document, dict) else None
    if not isinstance(pages, list) or not pages:
        raise DocumentValidationError("pages must be a non-empty list", path="document.pages")
    return pages


def _page_index(pages, page_id):
    """Index of `page_id` in the canonical page list, or raise PageNotFound."""
    for index, page in enumerate(pages):
        if isinstance(page, dict) and page.get("id") == page_id:
            return index
    raise PageNotFound(page_id)


def _persist_document(locked, document, user):
    """
    Persist a replacement document on the row-locked design: bump the
    revision, keep the relational dimensions in sync, record a DesignVersion
    snapshot and prune history beyond KEEP_VERSIONS.

    Shared by every path that replaces the document (the autosave PUT and the
    page-management endpoints), so a snapshot is taken and history stays
    bounded no matter which one performed the write.
    """
    locked.document = document
    locked.revision += 1
    # Keep the queryable relational dimensions in sync with the
    # canonical document so later reads/serializations don't revert
    # document.width/height to stale values.
    locked.width = document["width"]
    locked.height = document["height"]
    locked.save(update_fields=["document", "revision", "width", "height", "updated_at"])

    DesignVersion.objects.create(
        design=locked,
        version_number=locked.revision,
        document=document,
        created_by=user,
    )

    # Bound the history so the table tracks save milestones rather than edit
    # tempo. Done inside the same transaction as the insert: an autosave has
    # already stored the newest snapshot, so pruning there keeps at most
    # KEEP_VERSIONS rows after every successful save.
    stale_ids = list(
        DesignVersion.objects.filter(design=locked)
        .order_by("-version_number")
        .values_list("id", flat=True)[KEEP_VERSIONS:]
    )
    if stale_ids:
        DesignVersion.objects.filter(id__in=stale_ids).delete()


def _save_envelope(locked):
    """Revision metadata every document-writing endpoint returns."""
    return {
        "id": str(locked.id),
        "revision": locked.revision,
        "schema_version": locked.schema_version,
        "updated_at": locked.updated_at,
    }


def _client_revision(request):
    """
    Optional optimistic-lock revision for a page operation: taken from the
    JSON body when present, otherwise from `?revision=` (so DELETE, which has
    no meaningful body, can opt in too). Returns None when the caller did not
    send one, in which case the mutation applies to the current revision.
    """
    value = None
    if isinstance(request.data, dict) and "revision" in request.data:
        value = request.data["revision"]
    elif "revision" in request.query_params:
        value = request.query_params["revision"]
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({"revision": ["A valid integer is required."]})


def revision_conflict_response(client_revision, server_design):
    """
    409 Conflict for an optimistic-concurrency mismatch.

    Carries the server's authoritative state (`server_revision` and
    `current_document`) so a client can resolve the conflict — reload the
    other version, or retry on top of it — without a second round trip.
    Local changes are never accepted silently: the stored document is left
    exactly as-is and the caller must explicitly choose how to proceed.

    `server_design` must be the design re-read under the row lock
    (`select_for_update`), so the payload reflects the authoritative server
    state at read time — never a possibly-stale pre-transaction read that a
    concurrent save could have superseded.
    """
    message = (
        f"Revision conflict: client sent {client_revision}, "
        f"server has {server_design.revision}. Reload and retry."
    )
    return Response(
        {
            "detail": message,
            "revision": [message],
            "server_revision": server_design.revision,
            "current_document": server_design.document,
        },
        status=status.HTTP_409_CONFLICT,
    )


class DesignViewSet(viewsets.ModelViewSet):
    """
    Design management endpoints

    List, create, retrieve, update, duplicate, soft-delete, and restore designs
    """

    serializer_class = DesignDetailSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["status", "is_template"]
    search_fields = ["name", "description"]
    ordering_fields = ["created_at", "updated_at", "name"]
    ordering = ["-updated_at"]

    def get_queryset(self):
        """Only designs owned by the current user; soft-deleted ones are hidden except when restoring"""
        queryset = Design.objects.filter(owner=self.request.user)
        if self.action != "restore":
            queryset = queryset.filter(is_deleted=False)
        return queryset

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == "list":
            return DesignListSerializer
        elif self.action == "create":
            return DesignCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return DesignUpdateSerializer
        return DesignDetailSerializer

    def create(self, request, *args, **kwargs):
        """Create a new design with a default background and one page"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        design = serializer.instance
        return Response(DesignDetailSerializer(design).data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        """Ensure owner is set to current user"""
        serializer.save(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        """Return the canonical document and revision metadata, tracking last opened time"""
        design = self.get_object()
        # Touch last_opened_at with a targeted UPDATE instead of design.save():
        # a full instance save would emit pre_save/post_save signals and rewrite
        # every column (including `document`) on what is semantically a read.
        Design.objects.filter(pk=design.pk).update(last_opened_at=timezone.now())
        return Response(self.get_serializer(design).data)

    def partial_update(self, request, *args, **kwargs):
        """Update metadata only; the document is never touched here"""
        design = self.get_object()
        serializer = self.get_serializer(design, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(DesignDetailSerializer(design).data)

    def destroy(self, request, *args, **kwargs):
        """Soft delete a design instead of removing it immediately"""
        design = self.get_object()
        design.is_deleted = True
        design.save(update_fields=["is_deleted", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def duplicate(self, request, pk=None):
        """
        Duplicate a design

        POST /api/v1/designs/{id}/duplicate/
        """
        design = self.get_object()

        new_design = Design.objects.create(
            owner=request.user,
            name=f"{design.name} (Copy)",
            description=design.description,
            width=design.width,
            height=design.height,
            status="draft",
            document=clone_document(design.document),
            schema_version=design.schema_version,
        )

        return Response(DesignDetailSerializer(new_design).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def restore(self, request, pk=None):
        """
        Restore a soft-deleted design

        POST /api/v1/designs/{id}/restore/
        """
        design = self.get_object()
        design.is_deleted = False
        design.save(update_fields=["is_deleted", "updated_at"])
        return Response(DesignDetailSerializer(design).data)

    @action(
        detail=True,
        methods=["put"],
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def document(self, request, pk=None):
        """
        Replace the canonical design document

        PUT /api/v1/designs/{id}/document/

        Validates, in order: schema (canonical document JSON), schema version,
        and the client's `revision` for optimistic concurrency. The revision
        check runs under a row lock so the 409 always reports the
        authoritative server state. On success the document is persisted,
        `revision` is incremented, and a DesignVersion snapshot is recorded.
        """
        design = self.get_object()

        serializer = DesignDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = serializer.validated_data["document"]
        client_revision = serializer.validated_data["revision"]

        # Canonical schema validation
        try:
            validate_document(document)
        except DocumentValidationError as exc:
            return Response(
                {"document": [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Schema version gate (defense in depth: validator also enforces this)
        if document.get("schemaVersion") != SCHEMA_VERSION:
            return Response(
                {
                    "document": [
                        f"Unsupported schemaVersion {document.get('schemaVersion')!r}; expected {SCHEMA_VERSION!r}"
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optimistic concurrency: the single authoritative check runs under
        # the row lock below. A pre-transaction fast path would have to build
        # the 409 from the unlocked `design` read, which a concurrent save can
        # supersede between get_object() and response construction — the
        # client would then receive an outdated server_revision/
        # current_document to display or adopt. Under the lock, the check and
        # the response state are read together, serialized with any
        # committing writer.
        with transaction.atomic():
            # Lock the row so concurrent saves with the same revision serialize:
            # the second request re-reads the incremented revision and correctly
            # gets a 409 instead of racing past an unlocked read.
            locked = Design.objects.select_for_update().get(pk=design.pk)
            if client_revision != locked.revision:
                return revision_conflict_response(client_revision, locked)

            # Mutate and persist the locked instance, never the pre-lock read:
            # `locked` is the authoritative row state under the lock, so the
            # write cannot resurrect a value a concurrent transaction changed
            # between get_object() and the lock. Keeping all reads/writes on one
            # instance makes the serialization guarantee self-evident.
            _persist_document(locked, document, request.user)

        return Response(_save_envelope(locked), status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def versions(self, request, pk=None):
        """
        Get design version history

        GET /api/v1/designs/{id}/versions/
        """
        design = self.get_object()
        versions = design.versions.all()
        serializer = DesignVersionSerializer(versions, many=True)
        return Response(serializer.data)

    # -- page management (US-3.14 .. US-3.18) ---------------------------------
    #
    # Structural edits to the canonical `pages` array: add, duplicate, delete,
    # rename and reorder. They all follow the discipline of PUT /document/: the
    # mutation runs on the row-locked design, honours an optional client
    # `revision` (409 when stale), bumps the revision, records a DesignVersion
    # snapshot, prunes history, and returns the resulting document so the client
    # can adopt it without a second fetch.

    def _apply_page_change(self, request, design, mutator, client_revision=None):
        """
        Run a page mutation under the design row lock and persist the result.

        `mutator(document) -> (document, page_id)` receives a copy of the
        locked document and returns the updated one plus the affected page id.
        It may raise PageNotFound (404) or DocumentValidationError (400).

        Returns the success envelope + resulting document + page id, the
        standard 409, or the mapped error response.
        """
        try:
            with transaction.atomic():
                # Serialize structural edits the same way saves are serialized:
                # two concurrent page operations cannot interleave reads and
                # writes of the pages array.
                locked = Design.objects.select_for_update().get(pk=design.pk)
                if client_revision is not None and client_revision != locked.revision:
                    return revision_conflict_response(client_revision, locked)
                document, page_id = mutator(copy.deepcopy(locked.document))
                # The server-built document must satisfy the same canonical
                # schema a client PUT has to pass.
                validate_document(document)
                _persist_document(locked, document, request.user)
        except PageNotFound:
            return Response({"detail": "Page not found."}, status=status.HTTP_404_NOT_FOUND)
        except DocumentValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        payload = _save_envelope(locked)
        payload["document"] = locked.document
        payload["page_id"] = page_id
        return Response(payload, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["post"],
        url_path="pages",
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def pages(self, request, pk=None):
        """
        Add a page (US-3.14)

        POST /api/v1/designs/{id}/pages/

        Optional body: {"name": "Cover", "revision": 3}. Without a name the
        page is numbered "Page N".
        """
        design = self.get_object()
        serializer = PageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data.get("name")
        client_revision = serializer.validated_data.get("revision")

        def add_page(document):
            pages = _pages(document)
            page_id = str(uuid.uuid4())
            pages.append({"id": page_id, "name": name or f"Page {len(pages) + 1}", "objects": []})
            return document, page_id

        return self._apply_page_change(request, design, add_page, client_revision)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"pages/(?P<page_id>[^/.]+)/duplicate",
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def duplicate_page(self, request, pk=None, page_id=None):
        """
        Duplicate a page (US-3.15)

        POST /api/v1/designs/{id}/pages/{page_id}/duplicate/

        The copy gets a fresh page id and fresh object ids (group `children`
        rewritten to match), and is inserted directly after the original.
        """
        design = self.get_object()

        def duplicate(document):
            pages = _pages(document)
            source_index = _page_index(pages, page_id)
            copied = clone_page(pages[source_index])
            pages.insert(source_index + 1, copied)
            return document, copied["id"]

        return self._apply_page_change(request, design, duplicate, _client_revision(request))

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"pages/(?P<page_id>[^/.]+)",
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def page_detail(self, request, pk=None, page_id=None):
        """
        Rename a page (PATCH, US-3.17) or delete one (DELETE, US-3.16)

        PATCH /api/v1/designs/{id}/pages/{page_id}/   {"name": "Summary"}
        DELETE /api/v1/designs/{id}/pages/{page_id}/[?revision=]

        Names are free-form ("Cover", "Product Details", "Summary"). Deletion
        refuses to leave a design without a page.
        """
        design = self.get_object()

        if request.method == "PATCH":
            serializer = PageRenameSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            name = serializer.validated_data["name"]
            client_revision = serializer.validated_data.get("revision")

            def rename(document):
                pages = _pages(document)
                pages[_page_index(pages, page_id)]["name"] = name
                return document, page_id

            return self._apply_page_change(request, design, rename, client_revision)

        # DELETE
        def delete_page(document):
            pages = _pages(document)
            index = _page_index(pages, page_id)
            if len(pages) <= 1:
                raise DocumentValidationError(
                    "a design must keep at least one page",
                    path="document.pages",
                )
            del pages[index]
            return document, page_id

        return self._apply_page_change(request, design, delete_page, _client_revision(request))

    @action(
        detail=True,
        methods=["post"],
        url_path=r"pages/(?P<page_id>[^/.]+)/move",
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def move_page(self, request, pk=None, page_id=None):
        """
        Reorder pages (US-3.18)

        POST /api/v1/designs/{id}/pages/{page_id}/move/

        Body takes exactly one of:
            {"index": 3}          the position a drag/drop gesture landed on
            {"direction": "up"}   move-up / move-down (also "down")
        """
        design = self.get_object()
        serializer = PageMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        index = serializer.validated_data.get("index")
        direction = serializer.validated_data.get("direction")
        client_revision = serializer.validated_data.get("revision")

        def move(document):
            pages = _pages(document)
            current = _page_index(pages, page_id)
            if direction == "up":
                target = current - 1
                if target < 0:
                    raise DocumentValidationError("page is already first", path="document.pages")
            elif direction == "down":
                target = current + 1
                if target >= len(pages):
                    raise DocumentValidationError("page is already last", path="document.pages")
            else:
                target = index
                if target >= len(pages):
                    raise DocumentValidationError(
                        f"index {target} is out of range",
                        path="document.pages",
                    )
            if target != current:
                pages.insert(target, pages.pop(current))
            return document, page_id

        return self._apply_page_change(request, design, move, client_revision)
