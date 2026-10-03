"""
Asset views
"""

import uuid

from kombu.exceptions import OperationalError
from django.db import transaction
from django.utils import timezone
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
)
from .tasks import process_asset


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
        """Show ready assets, and allow owners to complete pending uploads."""
        queryset = Asset.objects.filter(owner=self.request.user)
        if self.action == 'complete':
            return queryset.filter(
                status__in=('PENDING', 'PROCESSING', 'FAILED', 'READY')
            )
        return queryset.filter(status='READY')

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

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        Verify an uploaded object and queue asset processing.

        POST /api/v1/assets/{id}/complete
        """
        asset = self.get_object()
        if asset.status == 'READY':
            return Response(self.get_serializer(asset).data)
        if asset.status == 'PROCESSING':
            return Response(
                self.get_serializer(asset).data,
                status=status.HTTP_202_ACCEPTED,
            )
        if asset.status not in ('PENDING', 'FAILED'):
            return Response(
                {'detail': f'Asset cannot be completed from status {asset.status}.'},
                status=status.HTTP_409_CONFLICT,
            )

        storage = get_storage_service()
        try:
            if not storage.exists(asset.storage_key):
                return Response(
                    {
                        'detail': (
                            'The uploaded object was not found in storage.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with transaction.atomic():
                asset = Asset.objects.select_for_update().get(
                    pk=asset.pk,
                    owner=request.user,
                )
                if asset.status in ('PROCESSING', 'READY'):
                    response_status = (
                        status.HTTP_202_ACCEPTED
                        if asset.status == 'PROCESSING'
                        else status.HTTP_200_OK
                    )
                    return Response(
                        self.get_serializer(asset).data,
                        status=response_status,
                    )
                if asset.status not in ('PENDING', 'FAILED'):
                    return Response(
                        {
                            'detail': (
                                f'Asset cannot be completed from status '
                                f'{asset.status}.'
                            )
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                asset.status = 'PROCESSING'
                asset.save(update_fields=['status', 'updated_at'])
        except StorageError as exc:
            return Response(
                {'detail': f'Upload verification failed: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            process_asset.delay(str(asset.pk))
        except OperationalError as exc:
            Asset.objects.filter(
                pk=asset.pk,
                status='PROCESSING',
            ).update(
                status='PENDING',
                updated_at=timezone.now(),
            )
            return Response(
                {'detail': f'Asset processing could not be queued: {exc}'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        asset.refresh_from_db()
        return Response(
            self.get_serializer(asset).data,
            status=status.HTTP_202_ACCEPTED,
        )
