"""
Asset views
"""

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Asset
from .serializers import (
    AssetSerializer,
    AssetUploadUrlSerializer,
    AssetCompleteUploadSerializer
)


class AssetViewSet(viewsets.ModelViewSet):
    """
    Asset management endpoints
    
    Upload, list, and delete images
    """
    
    serializer_class = AssetSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Only show assets owned by the current user"""
        return Asset.objects.filter(owner=self.request.user)
    
    def perform_create(self, serializer):
        """Ensure owner is set to current user"""
        serializer.save(owner=self.request.user)
    
    @action(detail=False, methods=['post'])
    def upload_url(self, request):
        """
        Get presigned URL for uploading to S3
        
        POST /api/v1/assets/upload-url/
        {
            "filename": "image.jpg",
            "content_type": "image/jpeg",
            "file_size": 1024000
        }
        """
        serializer = AssetUploadUrlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # TODO: Generate presigned URL from S3
        # For now, return a placeholder
        
        return Response(
            {
                'upload_url': 'https://s3.amazonaws.com/...',
                'storage_key': 'assets/user_123/image_123.jpg'
            },
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['post'])
    def complete(self, request):
        """
        Complete upload and create asset record
        
        POST /api/v1/assets/complete/
        {
            "storage_key": "assets/user_123/image_123.jpg",
            "name": "My Image",
            "mime_type": "image/jpeg",
            "file_size": 1024000,
            "width": 1920,
            "height": 1080
        }
        """
        serializer = AssetCompleteUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # TODO: Create asset from S3 file
        
        return Response(
            {'detail': 'Upload completed'},
            status=status.HTTP_201_CREATED
        )
