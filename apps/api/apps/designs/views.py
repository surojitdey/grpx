"""
Design views and viewsets
"""

from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Design, DesignPage, DesignVersion
from .serializers import (
    DesignListSerializer,
    DesignDetailSerializer,
    DesignCreateSerializer,
    DesignUpdateSerializer,
    DesignPageSerializer,
    DesignVersionSerializer
)
from .permissions import IsDesignOwner


class DesignViewSet(viewsets.ModelViewSet):
    """
    Design management endpoints
    
    List, create, retrieve, update, and delete designs
    """
    
    serializer_class = DesignDetailSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'updated_at', 'name']
    ordering = ['-updated_at']
    
    def get_queryset(self):
        """Only show designs owned by the current user"""
        return Design.objects.filter(owner=self.request.user)
    
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
        """Create a new design"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        # Return full design detail
        design = serializer.instance
        return Response(
            DesignDetailSerializer(design).data,
            status=status.HTTP_201_CREATED
        )
    
    def perform_create(self, serializer):
        """Ensure owner is set to current user"""
        serializer.save(owner=self.request.user)
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsDesignOwner])
    def duplicate(self, request, pk=None):
        """
        Duplicate a design
        
        POST /api/v1/designs/{id}/duplicate/
        """
        design = self.get_object()
        
        # Create new design
        new_design = Design.objects.create(
            owner=request.user,
            name=f"{design.name} (Copy)",
            description=design.description,
            width=design.width,
            height=design.height,
            status='draft'
        )
        
        # Duplicate pages
        for page in design.pages.all():
            DesignPage.objects.create(
                design=new_design,
                page_number=page.page_number,
                name=page.name,
                document=page.document
            )
        
        return Response(
            DesignDetailSerializer(new_design).data,
            status=status.HTTP_201_CREATED
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


class DesignPageViewSet(viewsets.ModelViewSet):
    """
    Design page management
    
    Manage individual pages within a design
    """
    
    serializer_class = DesignPageSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Get pages for designs owned by the current user"""
        design_id = self.kwargs.get('design_id')
        design = get_object_or_404(Design, id=design_id, owner=self.request.user)
        return design.pages.all()
    
    def get_design(self):
        """Get the parent design"""
        design_id = self.kwargs.get('design_id')
        return get_object_or_404(Design, id=design_id, owner=self.request.user)
    
    def create(self, request, *args, **kwargs):
        """Add a new page to a design"""
        design = self.get_design()
        
        # Calculate next page number
        last_page = design.pages.order_by('-page_number').first()
        next_page_number = (last_page.page_number + 1) if last_page else 1
        
        page = DesignPage.objects.create(
            design=design,
            page_number=next_page_number,
            name=f'Page {next_page_number}',
            document={
                'objects': [],
                'background': {
                    'type': 'color',
                    'value': '#FFFFFF'
                }
            }
        )
        
        return Response(
            DesignPageSerializer(page).data,
            status=status.HTTP_201_CREATED
        )
    
    def update(self, request, *args, **kwargs):
        """Update a page (especially the document)"""
        page = self.get_object()
        
        # Increment version if document changed
        if 'document' in request.data and request.data['document'] != page.document:
            page.version += 1
        
        serializer = self.get_serializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def duplicate(self, request, design_id=None, pk=None):
        """
        Duplicate a page
        
        POST /api/v1/designs/{design_id}/pages/{id}/duplicate/
        """
        design = self.get_design()
        page = self.get_object()
        
        # Calculate next page number
        last_page = design.pages.order_by('-page_number').first()
        next_page_number = last_page.page_number + 1
        
        new_page = DesignPage.objects.create(
            design=design,
            page_number=next_page_number,
            name=f"{page.name} (Copy)",
            document=page.document
        )
        
        return Response(
            DesignPageSerializer(new_page).data,
            status=status.HTTP_201_CREATED
        )
