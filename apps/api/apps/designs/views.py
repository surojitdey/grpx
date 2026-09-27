"""
Design views and viewsets
"""

from django.utils import timezone
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .documents import clone_document
from .models import Design
from .serializers import (
    DesignListSerializer,
    DesignDetailSerializer,
    DesignCreateSerializer,
    DesignUpdateSerializer,
    DesignVersionSerializer,
)
from .permissions import IsDesignOwner


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
