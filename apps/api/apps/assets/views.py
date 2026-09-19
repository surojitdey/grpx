"""
Asset views
"""

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
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
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        """Only show assets owned by the current user"""
        return Asset.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        """Ensure owner is set to current user"""
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=['post'])
    def direct_upload(self, request):
        """
        Direct file upload endpoint
        
        POST /api/v1/assets/direct-upload/
        
        Form data:
        - file: Image file
        - name: Optional asset name
        """
        if 'file' not in request.FILES:
            return Response(
                {'detail': 'No file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        file = request.FILES['file']
        name = request.POST.get('name', file.name)

        try:
            # Save file using Django's storage system
            file_path = f'assets/{request.user.id}/{file.name}'
            url = default_storage.save(file_path, file)
            relative_url = default_storage.url(url)

            # Build absolute URL for frontend access
            full_url = request.build_absolute_uri(relative_url)

            # Create asset record
            asset = Asset.objects.create(
                owner=request.user,
                name=name,
                asset_type='image',
                storage_key=url,
                url=full_url,
                mime_type=file.content_type,
                file_size=file.size,
            )

            serializer = AssetSerializer(asset)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            if "url" in locals():
                default_storage.delete(url)
            return Response(
                {'detail': f'Upload failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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
