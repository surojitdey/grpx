"""
Design serializers
"""

import json

from rest_framework import serializers

from .documents import build_default_document
from .models import Design, DesignVersion


class DesignListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the design list view (no document payload)"""

    class Meta:
        model = Design
        fields = [
            "id",
            "name",
            "description",
            "width",
            "height",
            "status",
            "is_template",
            "schema_version",
            "revision",
            "thumbnail_key",
            "created_at",
            "updated_at",
            "last_opened_at",
        ]
        read_only_fields = fields


class DesignDetailSerializer(serializers.ModelSerializer):
    """Serializer for the design detail view - returns the canonical document and revision metadata"""

    class Meta:
        model = Design
        fields = [
            "id",
            "name",
            "description",
            "width",
            "height",
            "status",
            "is_template",
            "document",
            "schema_version",
            "revision",
            "thumbnail_key",
            "created_at",
            "updated_at",
            "last_opened_at",
        ]
        read_only_fields = [
            "id",
            "document",
            "schema_version",
            "revision",
            "thumbnail_key",
            "created_at",
            "updated_at",
            "last_opened_at",
        ]


class DesignCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating designs"""

    class Meta:
        model = Design
        fields = ["name", "description", "width", "height", "status", "is_template"]

    def create(self, validated_data):
        """Create a design with a default background and one blank page"""
        width = validated_data.get("width", 1080)
        height = validated_data.get("height", 1080)
        validated_data["document"] = build_default_document(width, height)
        return Design.objects.create(**validated_data)


class DesignUpdateSerializer(serializers.ModelSerializer):
    """Serializer for metadata-only updates (PATCH); `document` is deliberately excluded"""

    class Meta:
        model = Design
        fields = ["name", "description", "width", "height", "status", "is_template"]


class DesignDocumentSerializer(serializers.Serializer):
    """
    Payload for PUT /designs/{id}/document/

    `document` is validated against the canonical schema in validation.py;
    `revision` carries the client's known revision for optimistic locking.

    A size cap is enforced here, at the boundary: a valid schema can still be
    pathologically large (tens of thousands of objects), and such a write is
    expensive to validate, store and snapshot on every autosave.
    """

    # 2 MiB of JSON is far beyond any realistic canvas while still bounding
    # the cost of validation, storage and version snapshots per save.
    MAX_DOCUMENT_BYTES = 2 * 1024 * 1024

    document = serializers.JSONField()
    revision = serializers.IntegerField(min_value=1)

    def validate_document(self, value):
        try:
            encoded = len(json.dumps(value))
        except (TypeError, ValueError):
            raise serializers.ValidationError("document must be JSON-serializable")
        if encoded > self.MAX_DOCUMENT_BYTES:
            raise serializers.ValidationError("document exceeds the maximum allowed size")
        return value


class DesignVersionSerializer(serializers.ModelSerializer):
    """
    Serializer for design versions
    """

    class Meta:
        model = DesignVersion
        fields = ["id", "version_number", "change_description", "created_by", "created_at"]
        read_only_fields = fields


class PageCreateSerializer(serializers.Serializer):
    """
    Payload for POST /designs/{id}/pages/

    The page name is optional — the server defaults it to "Page N" — and free
    form, so names like "Cover" or "Product Details" round-trip unchanged.
    """

    name = serializers.CharField(required=False, allow_blank=False, max_length=255)
    revision = serializers.IntegerField(required=False, min_value=1)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("page name cannot be blank")
        return value


class PageRenameSerializer(serializers.Serializer):
    """Payload for PATCH /designs/{id}/pages/{page_id}/ (US-3.17)"""

    name = serializers.CharField(required=True, allow_blank=False, max_length=255)
    revision = serializers.IntegerField(required=False, min_value=1)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("page name cannot be blank")
        return value


class PageMoveSerializer(serializers.Serializer):
    """
    Payload for POST /designs/{id}/pages/{page_id}/move/ (US-3.18)

    Accepts either an explicit target `index` (what a drag/drop gesture ends
    on) or a relative `direction` (what move-up / move-down buttons send) —
    exactly one of the two must be present.
    """

    index = serializers.IntegerField(required=False, min_value=0)
    direction = serializers.ChoiceField(choices=["up", "down"], required=False)
    revision = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        has_index = attrs.get("index") is not None
        has_direction = attrs.get("direction") is not None
        if has_index == has_direction:
            raise serializers.ValidationError("Provide exactly one of 'index' or 'direction'.")
        return attrs
