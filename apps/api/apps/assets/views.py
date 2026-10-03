"""
Asset views
"""

import uuid

from django.db import transaction
from django.utils.text import get_valid_filename
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from apps.common.aws import StorageError, get_storage_service

from .models import Asset
from .serializers import (
    AssetSerializer,
    AssetUploadUrlSerializer,
    AssetCompleteUploadSerializer
)


def _fit_storage_key_filename(owner_id, filename):
    key_prefix = f'assets/{owner_id}/{uuid.uuid4().hex}/'
    filename = filename[:255 - len(key_prefix)]
    return filename, f'{key_prefix}{filename}'


class AssetViewSet(viewsets.ModelViewSet):
    """
    Asset management endpoints

    Upload, list, and delete images
    """

    serializer_class = AssetSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (JSONParser,)

    def get_queryset(self):
        """Only show ready assets owned by the current user"""
        return Asset.objects.filter(
            owner=self.request.user,
            status='READY',
        )

    def perform_create(self, serializer):
        """Ensure owner is set to current user"""
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=['post'], url_path='upload-url')
    def upload_url(self, request):
        """
        Get presigned URL for uploading to S3

        POST /api/v1/assets/upload-url
        {
            "filename": "image.jpg",
            "content_type": "image/jpeg",
            "file_size": 1024000
        }
        """
        serializer = AssetUploadUrlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        submitted_filename = serializer.validated_data['filename']
        original_filename = (
            submitted_filename.rsplit('/', 1)[-1]
            .rsplit('\\', 1)[-1]
        )
        filename = get_valid_filename(
            original_filename
        )
        if not filename:
            return Response(
                {'filename': ['A valid filename is required.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        filename, key = _fit_storage_key_filename(
            request.user.pk,
            filename,
        )

        asset = Asset.objects.create(
            owner=request.user,
            filename=filename,
            original_filename=original_filename,
            mime_type=serializer.validated_data['content_type'],
            size=serializer.validated_data['file_size'],
            storage_key=key,
            status='PENDING',
        )
        try:
            upload_url = get_storage_service().generate_presigned_upload_url(
                asset.storage_key,
                asset.mime_type,
            )
        except StorageError as exc:
            asset.status = 'FAILED'
            asset.save(update_fields=['status', 'updated_at'])
            return Response(
                {'detail': f'Upload URL generation failed: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                'upload_url': upload_url,
                'storage_key': asset.storage_key,
                'asset_id': str(asset.id),
                'status': asset.status,
            },
            status=status.HTTP_201_CREATED
        )

    def perform_destroy(self, instance):
        get_storage_service().delete(instance.storage_key)
        super().perform_destroy(instance)

    @action(detail=False, methods=['post'])
    def complete(self, request):
        """
        Complete upload and move its Asset record to READY

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
                asset = Asset.objects.select_for_update().filter(
                    owner=request.user,
                    storage_key=key,
                ).first()
                created = asset is None
                if asset is None:
                    filename = get_valid_filename(key.rsplit('/', 1)[-1])
                    asset = Asset.objects.create(
                        owner=request.user,
                        filename=filename,
                        original_filename=data['name'],
                        storage_key=key,
                        mime_type=data['mime_type'],
                        size=data['file_size'],
                        width=data.get('width'),
                        height=data.get('height'),
                        status='READY',
                    )
                else:
                    if (
                        asset.mime_type != data['mime_type']
                        or asset.size != data['file_size']
                    ):
                        return Response(
                            {
                                'detail': (
                                    'Upload metadata does not match the '
                                    'requested asset.'
                                )
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    if asset.status not in ('PENDING', 'READY'):
                        return Response(
                            {
                                'detail': (
                                    f'Asset cannot be completed from status '
                                    f'{asset.status}.'
                                )
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    asset.width = data.get('width', asset.width)
                    asset.height = data.get('height', asset.height)
                    asset.status = 'READY'
                    asset.save(
                        update_fields=[
                            'width',
                            'height',
                            'status',
                            'updated_at',
                        ]
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
