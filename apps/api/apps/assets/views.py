"""
Asset views
"""

import logging
import uuid

from django.db import DatabaseError, transaction
from django.utils.text import get_valid_filename
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.common.aws import StorageError, get_storage_service

from .models import Asset
from .serializers import (
    AssetSerializer,
    AssetUploadUrlSerializer,
    AssetCompleteUploadSerializer
)

logger = logging.getLogger(__name__)


class AssetViewSet(viewsets.ModelViewSet):
    """
    Asset management endpoints

    Upload, list, and delete images
    """

    serializer_class = AssetSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

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
        filename = get_valid_filename(
            file.name.rsplit('/', 1)[-1].rsplit('\\', 1)[-1]
        )
        key = f'assets/{request.user.id}/{uuid.uuid4().hex}/{filename}'
        storage = get_storage_service()
        uploaded = False

        try:
            content_type = file.content_type or 'application/octet-stream'
            storage.upload(key, file, content_type)
            uploaded = True
            with transaction.atomic():
                asset = Asset.objects.create(
                    owner=request.user,
                    name=name,
                    asset_type='image',
                    storage_key=key,
                    mime_type=content_type,
                    file_size=file.size,
                )
                data = self.get_serializer(asset).data
            return Response(data, status=status.HTTP_201_CREATED)
        except (StorageError, DatabaseError) as exc:
            if uploaded:
                try:
                    storage.delete(key)
                except StorageError:
                    logger.exception(
                        'Failed to clean up uploaded asset %s',
                        key,
                    )
            return Response(
                {'detail': f'Upload failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=['post'], url_path='upload-url')
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

        submitted_filename = serializer.validated_data['filename']
        filename = get_valid_filename(
            submitted_filename.rsplit('/', 1)[-1].rsplit('\\', 1)[-1]
        )
        key = f'assets/{request.user.id}/{uuid.uuid4().hex}/{filename}'
        upload_url = get_storage_service().generate_presigned_upload_url(
            key, serializer.validated_data['content_type']
        )

        return Response(
            {
                'upload_url': upload_url,
                'storage_key': key,
            },
            status=status.HTTP_200_OK
        )

    def perform_destroy(self, instance):
        get_storage_service().delete(instance.storage_key)
        super().perform_destroy(instance)

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
        data = serializer.validated_data
        key = data['storage_key']
        if not key.startswith(f'assets/{request.user.pk}/'):
            return Response(
                {
                    'detail': (
                        'The uploaded object does not belong to this user.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        storage = get_storage_service()
        try:
            if not storage.exists(key):
                return Response(
                    {
                        'detail': (
                            'The uploaded object was not found in storage.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with transaction.atomic():
                asset, created = Asset.objects.get_or_create(
                    owner=request.user,
                    storage_key=key,
                    defaults={
                        'name': data['name'],
                        'asset_type': 'image',
                        'mime_type': data['mime_type'],
                        'file_size': data['file_size'],
                        'width': data.get('width'),
                        'height': data.get('height'),
                    },
                )
                response_data = self.get_serializer(asset).data
        except StorageError as exc:
            return Response(
                {'detail': f'Upload completion failed: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            response_data,
            status=(
                status.HTTP_201_CREATED
                if created
                else status.HTTP_200_OK
            ),
        )
