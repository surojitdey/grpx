"""
Export views
"""

from rest_framework import viewsets, status, permissions
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import ExportJob
from .serializers import ExportJobSerializer, ExportCreateSerializer
from apps.designs.models import Design


class ExportViewSet(viewsets.ModelViewSet):
    """
    Export management
    
    Create and manage design exports
    """
    
    serializer_class = ExportJobSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['post', 'get', 'head', 'options']
    
    def get_queryset(self):
        """Only show exports for designs owned by the current user"""
        return ExportJob.objects.filter(user=self.request.user)
    
    def create(self, request, *args, **kwargs):
        """
        Create an export job
        
        POST /api/v1/exports/
        {
            "design_id": 123,
            "format": "png",
            "quality": 90,
            "page_range": "all"
        }
        """
        design_id = request.data.get('design_id')
        design = get_object_or_404(Design, id=design_id, owner=request.user)
        
        serializer = ExportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Create export job
        export_job = ExportJob.objects.create(
            design=design,
            user=request.user,
            **serializer.validated_data
        )
        
        # TODO: Trigger Celery task to process export
        # from .tasks import process_export
        # process_export.delay(export_job.id)
        
        return Response(
            ExportJobSerializer(export_job).data,
            status=status.HTTP_201_CREATED
        )
    
    def retrieve(self, request, pk=None):
        """
        Get export job status
        
        GET /api/v1/exports/{id}/
        """
        export_job = self.get_object()
        return Response(ExportJobSerializer(export_job).data)
