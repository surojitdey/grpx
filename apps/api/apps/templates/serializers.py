"""
Template serializers
"""

from rest_framework import serializers
from .models import Template


class TemplateSerializer(serializers.ModelSerializer):
    """Template serializer"""
    
    class Meta:
        model = Template
        fields = ['id', 'name', 'description', 'category', 'preview_url', 'document', 'created_at']
        read_only_fields = ['id', 'created_at']


class TemplateListSerializer(serializers.ModelSerializer):
    """Template list serializer (without full document)"""
    
    class Meta:
        model = Template
        fields = ['id', 'name', 'description', 'category', 'preview_url', 'created_at']
        read_only_fields = fields
