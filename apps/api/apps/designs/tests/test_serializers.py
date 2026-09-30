"""
Tests for Design serializers
"""

from apps.designs.documents import build_default_document
from apps.designs.models import Design
from apps.designs.serializers import (
    DesignCreateSerializer,
    DesignDetailSerializer,
    DesignDocumentSerializer,
    DesignListSerializer,
    DesignUpdateSerializer,
)
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import serializers

User = get_user_model()


class DesignCreateSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="testpass123"
        )

    def test_valid_data_creates_design_with_document(self):
        serializer = DesignCreateSerializer(
            data={"name": "New Design", "width": 1920, "height": 1080}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        design = serializer.save(owner=self.user)
        self.assertEqual(design.name, "New Design")
        self.assertEqual(design.document["width"], 1920)
        self.assertEqual(len(design.document["pages"]), 1)

    def test_defaults_applied_when_not_provided(self):
        serializer = DesignCreateSerializer(data={})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        design = serializer.save(owner=self.user)
        self.assertEqual(design.width, 1080)
        self.assertEqual(design.height, 1080)


class DesignListSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="testpass123"
        )
        self.design = Design.objects.create(owner=self.user, name="Test Design")

    def test_excludes_document(self):
        data = DesignListSerializer(self.design).data
        self.assertNotIn("document", data)

    def test_includes_expected_fields(self):
        data = DesignListSerializer(self.design).data
        for field in [
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
        ]:
            self.assertIn(field, data)


class DesignDetailSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="testpass123"
        )
        self.design = Design.objects.create(owner=self.user, name="Test Design")

    def test_includes_document(self):
        data = DesignDetailSerializer(self.design).data
        self.assertIn("document", data)
        self.assertIn("pages", data["document"])

    def test_document_is_read_only(self):
        serializer = DesignDetailSerializer(
            self.design, data={"name": "Updated", "document": {"pages": []}}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertNotEqual(updated.document, {"pages": []})

    def test_revision_is_read_only(self):
        serializer = DesignDetailSerializer(self.design, data={"revision": 99}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.revision, 1)


class DesignUpdateSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="testpass123"
        )
        self.design = Design.objects.create(owner=self.user, name="Original")

    def test_updates_metadata_fields(self):
        serializer = DesignUpdateSerializer(
            self.design, data={"name": "Updated", "status": "published"}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.name, "Updated")
        self.assertEqual(updated.status, "published")

    def test_has_no_document_field(self):
        serializer = DesignUpdateSerializer(self.design)
        self.assertNotIn("document", serializer.fields)


class DesignDocumentSerializerTestCase(TestCase):

    def test_accepts_document_within_size_cap(self):
        serializer = DesignDocumentSerializer(
            data={"document": build_default_document(), "revision": 1}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_rejects_document_over_size_cap(self):
        document = build_default_document()
        document["pages"][0]["objects"] = [
            {
                "id": "obj-huge",
                "type": "text",
                "text": "x" * DesignDocumentSerializer.MAX_DOCUMENT_BYTES,
            }
        ]
        serializer = DesignDocumentSerializer(data={"document": document, "revision": 1})
        self.assertFalse(serializer.is_valid())
        self.assertIn("document", serializer.errors)
        self.assertIn("maximum allowed size", str(serializer.errors["document"]))

    def test_rejects_non_json_serializable_document(self):
        serializer = DesignDocumentSerializer()
        with self.assertRaises(serializers.ValidationError) as ctx:
            serializer.validate_document({"not": {"json", "serializable"}})
        self.assertIn("JSON-serializable", str(ctx.exception))
