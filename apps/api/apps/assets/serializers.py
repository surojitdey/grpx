"""
Asset serializers
"""

from rest_framework import serializers
from .models import Asset


class AssetSerializer(serializers.ModelSerializer):
    """Asset serializer"""
    
    class Meta:
        model = Asset
        fields = ['id', 'name', 'asset_type', 'url', 'thumbnail_url', 'mime_type', 'file_size', 'width', 'height', 'created_at']
        read_only_fields = ['id', 'created_at', 'url', 'thumbnail_url', 'file_size', 'width', 'height']


class AssetUploadUrlSerializer(serializers.Serializer):
    """Request for presigned upload URL"""
    
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=50)
    file_size = serializers.IntegerField(min_value=1, max_value=100 * 1024 * 1024)  # Max 100MB


class AssetCompleteUploadSerializer(serializers.Serializer):
    """Complete upload and create asset"""
    
    storage_key = serializers.CharField(max_length=255)
    name = serializers.CharField(max_length=255)
    mime_type = serializers.CharField(max_length=50)
    file_size = serializers.IntegerField()
    width = serializers.IntegerField(required=False)
    height = serializers.IntegerField(required=False)
