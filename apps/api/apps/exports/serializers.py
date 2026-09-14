"""
Export serializers
"""

from rest_framework import serializers
from .models import ExportJob


class ExportJobSerializer(serializers.ModelSerializer):
    """Export job serializer"""
    
    class Meta:
        model = ExportJob
        fields = ['id', 'format', 'quality', 'page_range', 'status', 'file_url', 'error_message', 'created_at', 'completed_at']
        read_only_fields = ['id', 'status', 'file_url', 'error_message', 'created_at', 'completed_at']


class ExportCreateSerializer(serializers.ModelSerializer):
    """Create export job serializer"""
    
    class Meta:
        model = ExportJob
        fields = ['format', 'quality', 'page_range']
