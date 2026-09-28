"""
Design serializers
"""

from rest_framework import serializers

from .documents import build_default_document
from .models import Design, DesignVersion


class DesignListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the design list view (no document payload)"""

    class Meta:
        model = Design
        fields = [
            'id', 'name', 'description', 'width', 'height', 'status',
            'is_template', 'schema_version', 'revision', 'thumbnail_key',
            'created_at', 'updated_at', 'last_opened_at',
        ]
        read_only_fields = fields


class DesignDetailSerializer(serializers.ModelSerializer):
    """Serializer for the design detail view - returns the canonical document and revision metadata"""

    class Meta:
        model = Design
        fields = [
            'id', 'name', 'description', 'width', 'height', 'status',
            'is_template', 'document', 'schema_version', 'revision',
            'thumbnail_key', 'created_at', 'updated_at', 'last_opened_at',
        ]
        read_only_fields = [
            'id', 'document', 'schema_version', 'revision', 'thumbnail_key',
            'created_at', 'updated_at', 'last_opened_at',
        ]


class DesignCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating designs"""

    class Meta:
        model = Design
        fields = ['name', 'description', 'width', 'height', 'status', 'is_template']

    def create(self, validated_data):
        """Create a design with a default background and one blank page"""
        width = validated_data.get('width', 1080)
        height = validated_data.get('height', 1080)
        validated_data['document'] = build_default_document(width, height)
        return Design.objects.create(**validated_data)


class DesignUpdateSerializer(serializers.ModelSerializer):
    """Serializer for metadata-only updates (PATCH); `document` is deliberately excluded"""

    class Meta:
        model = Design
        fields = ['name', 'description', 'width', 'height', 'status', 'is_template']


class DesignDocumentSerializer(serializers.Serializer):
    """
    Payload for PUT /designs/{id}/document/

    `document` is validated against the canonical schema in validation.py;
    `revision` carries the client's known revision for optimistic locking.
    """

    document = serializers.JSONField()
    revision = serializers.IntegerField(min_value=1)


class DesignVersionSerializer(serializers.ModelSerializer):
    """Serializer for design versions"""
    
    class Meta:
        model = DesignVersion
        fields = ['id', 'version_number', 'change_description', 'created_by', 'created_at']
        read_only_fields = fields
