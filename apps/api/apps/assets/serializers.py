"""
Asset serializers
"""

from rest_framework import serializers

from apps.common.aws import get_storage_service

from .models import Asset


class AssetSerializer(serializers.ModelSerializer):
    """Asset serializer"""

    url = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            'id', 'name', 'asset_type', 'url', 'thumbnail_url', 'mime_type',
            'file_size', 'width', 'height', 'created_at',
        ]
        read_only_fields = [
            'id', 'created_at', 'url', 'thumbnail_url', 'file_size', 'width',
            'height',
        ]

    def get_url(self, obj):
        return get_storage_service().generate_presigned_download_url(
            obj.storage_key
        )


class AssetUploadUrlSerializer(serializers.Serializer):
    """Request for presigned upload URL"""

    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=50)
    file_size = serializers.IntegerField(
        min_value=1,
        max_value=100 * 1024 * 1024,
    )


class AssetCompleteUploadSerializer(serializers.Serializer):
    """Complete upload and create asset"""

    storage_key = serializers.CharField(max_length=255)
    name = serializers.CharField(max_length=255)
    mime_type = serializers.CharField(max_length=50)
    file_size = serializers.IntegerField(
        min_value=1,
        max_value=100 * 1024 * 1024,
    )
    width = serializers.IntegerField(required=False, min_value=1)
    height = serializers.IntegerField(required=False, min_value=1)
