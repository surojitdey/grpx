"""
Template views
"""

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter

from .models import Template
from .serializers import TemplateSerializer, TemplateListSerializer
from apps.designs.models import Design, DesignPage


class TemplateViewSet(viewsets.ModelViewSet):
    """
    Template management
    
    Browse templates and create designs from them
    """
    
    queryset = Template.objects.filter(is_public=True)
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['category']
    search_fields = ['name', 'description']
    
    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'list':
            return TemplateListSerializer
        return TemplateSerializer
    
    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def create_design(self, request, pk=None):
        """
        Create a design from a template
        
        POST /api/v1/templates/{id}/create_design/
        {
            "name": "My Design from Template"
        }
        """
        template = self.get_object()
        name = request.data.get('name', template.name)
        
        # Create new design
        design = Design.objects.create(
            owner=request.user,
            name=name,
            width=template.document.get('width', 1080),
            height=template.document.get('height', 1080),
            status='draft'
        )
        
        # Create page from template
        DesignPage.objects.create(
            design=design,
            page_number=1,
            name='Page 1',
            document=template.document
        )
        
        return Response(
            {'id': design.id, 'name': design.name},
            status=status.HTTP_201_CREATED
        )
