"""
Asset serializers
"""

from rest_framework import serializers

from apps.common.aws import get_storage_service

from .models import Asset

MIME_TYPE_PATTERN = r'^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$'


class AssetSerializer(serializers.ModelSerializer):
    """Asset serializer"""

    url = serializers.SerializerMethodField()
    name = serializers.CharField(source='original_filename', read_only=True)
    asset_type = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    file_size = serializers.IntegerField(source='size', read_only=True)

    class Meta:
        model = Asset
        fields = [
            'id', 'filename', 'original_filename', 'name', 'asset_type',
            'url', 'thumbnail_url', 'mime_type', 'size', 'file_size', 'width',
            'height', 'storage_key', 'thumbnail_key', 'status', 'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_url(self, obj):
        return get_storage_service().generate_presigned_download_url(
            obj.storage_key
        )

    def get_asset_type(self, obj):
        return 'video' if obj.mime_type.startswith('video/') else 'image'

    def get_thumbnail_url(self, obj):
        if not obj.thumbnail_key:
            return ''
        return get_storage_service().generate_presigned_download_url(
            obj.thumbnail_key
        )


class AssetUploadUrlSerializer(serializers.Serializer):
    """Request for presigned upload URL"""

    filename = serializers.CharField(max_length=255)
    content_type = serializers.RegexField(
        regex=MIME_TYPE_PATTERN,
        max_length=50,
    )
    file_size = serializers.IntegerField(
        min_value=1,
        max_value=100 * 1024 * 1024,
    )


class AssetCompleteUploadSerializer(serializers.Serializer):
    """Complete upload and create asset"""

    storage_key = serializers.CharField(max_length=255)
    name = serializers.CharField(max_length=255)
    mime_type = serializers.RegexField(
        regex=MIME_TYPE_PATTERN,
        max_length=50,
    )
    file_size = serializers.IntegerField(
        min_value=1,
        max_value=100 * 1024 * 1024,
    )
    width = serializers.IntegerField(required=False, min_value=1)
    height = serializers.IntegerField(required=False, min_value=1)
