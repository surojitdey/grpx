"""
Design views and viewsets
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .documents import SCHEMA_VERSION, clone_document
from .models import Design, DesignVersion
from .serializers import (
    DesignListSerializer,
    DesignDetailSerializer,
    DesignCreateSerializer,
    DesignUpdateSerializer,
    DesignVersionSerializer,
    DesignDocumentSerializer,
)
from .permissions import IsDesignOwner
from .validation import DocumentValidationError, validate_document


class DesignViewSet(viewsets.ModelViewSet):
    """
    Design management endpoints

    List, create, retrieve, update, duplicate, soft-delete, and restore designs
    """

    serializer_class = DesignDetailSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['status', 'is_template']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'updated_at', 'name']
    ordering = ['-updated_at']

    def get_queryset(self):
        """Only designs owned by the current user; soft-deleted ones are hidden except when restoring"""
        queryset = Design.objects.filter(owner=self.request.user)
        if self.action != 'restore':
            queryset = queryset.filter(is_deleted=False)
        return queryset

    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'list':
            return DesignListSerializer
        elif self.action == 'create':
            return DesignCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return DesignUpdateSerializer
        return DesignDetailSerializer

    def create(self, request, *args, **kwargs):
        """Create a new design with a default background and one page"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        design = serializer.instance
        return Response(
            DesignDetailSerializer(design).data,
            status=status.HTTP_201_CREATED
        )

    def perform_create(self, serializer):
        """Ensure owner is set to current user"""
        serializer.save(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        """Return the canonical document and revision metadata, tracking last opened time"""
        design = self.get_object()
        design.last_opened_at = timezone.now()
        design.save(update_fields=['last_opened_at'])
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
        design.save(update_fields=['is_deleted', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsDesignOwner])
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
            status='draft',
            document=clone_document(design.document),
            schema_version=design.schema_version,
        )

        return Response(
            DesignDetailSerializer(new_design).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsDesignOwner])
    def restore(self, request, pk=None):
        """
        Restore a soft-deleted design

        POST /api/v1/designs/{id}/restore/
        """
        design = self.get_object()
        design.is_deleted = False
        design.save(update_fields=['is_deleted', 'updated_at'])
        return Response(DesignDetailSerializer(design).data)

    @action(
        detail=True,
        methods=['put'],
        permission_classes=[permissions.IsAuthenticated, IsDesignOwner],
    )
    def document(self, request, pk=None):
        """
        Replace the canonical design document

        PUT /api/v1/designs/{id}/document/

        Validates, in order: schema (canonical document JSON), schema version,
        and the client's `revision` for optimistic concurrency. On success the
        document is persisted, `revision` is incremented, and a DesignVersion
        snapshot is recorded.
        """
        design = self.get_object()

        serializer = DesignDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = serializer.validated_data['document']
        client_revision = serializer.validated_data['revision']

        # Canonical schema validation
        try:
            validate_document(document)
        except DocumentValidationError as exc:
            return Response(
                {'document': [str(exc)]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Schema version gate (defense in depth: validator also enforces this)
        if document.get('schemaVersion') != SCHEMA_VERSION:
            return Response(
                {'document': [f"Unsupported schemaVersion {document.get('schemaVersion')!r}; expected {SCHEMA_VERSION!r}"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optimistic concurrency: reject writes based on stale reads. The
        # authoritative check happens below under row lock.
        if client_revision != design.revision:
            return Response(
                {
                    'revision': [
                        f'Revision conflict: client sent {client_revision}, server has {design.revision}. Reload and retry.'
                    ]
                },
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            # Lock the row so concurrent saves with the same revision serialize:
            # the second request re-reads the incremented revision and correctly
            # gets a 409 instead of racing past the pre-transaction check.
            locked = Design.objects.select_for_update().get(pk=design.pk)
            if client_revision != locked.revision:
                return Response(
                    {
                        'revision': [
                            f'Revision conflict: client sent {client_revision}, server has {locked.revision}. Reload and retry.'
                        ]
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            design.document = document
            design.revision = locked.revision + 1
            # Keep the queryable relational dimensions in sync with the
            # canonical document so later reads/serializations don't revert
            # document.width/height to stale values.
            design.width = document['width']
            design.height = document['height']
            design.save(update_fields=['document', 'revision', 'width', 'height', 'updated_at'])

            DesignVersion.objects.create(
                design=design,
                version_number=design.revision,
                document=document,
                created_by=request.user,
            )

        return Response(
            {
                'id': str(design.id),
                'revision': design.revision,
                'schema_version': design.schema_version,
                'updated_at': design.updated_at,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated, IsDesignOwner])
    def versions(self, request, pk=None):
        """
        Get design version history

        GET /api/v1/designs/{id}/versions/
        """
        design = self.get_object()
        versions = design.versions.all()
        serializer = DesignVersionSerializer(versions, many=True)
        return Response(serializer.data)
