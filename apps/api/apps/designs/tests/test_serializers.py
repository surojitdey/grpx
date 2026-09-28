"""
Tests for Design serializers
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.designs.models import Design
from apps.designs.serializers import (
    DesignCreateSerializer,
    DesignDetailSerializer,
    DesignListSerializer,
    DesignUpdateSerializer,
)

User = get_user_model()


class DesignCreateSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )

    def test_valid_data_creates_design_with_document(self):
        serializer = DesignCreateSerializer(data={'name': 'New Design', 'width': 1920, 'height': 1080})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        design = serializer.save(owner=self.user)
        self.assertEqual(design.name, 'New Design')
        self.assertEqual(design.document['width'], 1920)
        self.assertEqual(len(design.document['pages']), 1)

    def test_defaults_applied_when_not_provided(self):
        serializer = DesignCreateSerializer(data={})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        design = serializer.save(owner=self.user)
        self.assertEqual(design.width, 1080)
        self.assertEqual(design.height, 1080)


class DesignListSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.user, name='Test Design')

    def test_excludes_document(self):
        data = DesignListSerializer(self.design).data
        self.assertNotIn('document', data)

    def test_includes_expected_fields(self):
        data = DesignListSerializer(self.design).data
        for field in ['id', 'name', 'description', 'width', 'height', 'status',
                      'is_template', 'schema_version', 'revision', 'thumbnail_key',
                      'created_at', 'updated_at', 'last_opened_at']:
            self.assertIn(field, data)


class DesignDetailSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.user, name='Test Design')

    def test_includes_document(self):
        data = DesignDetailSerializer(self.design).data
        self.assertIn('document', data)
        self.assertIn('pages', data['document'])

    def test_document_is_read_only(self):
        serializer = DesignDetailSerializer(
            self.design, data={'name': 'Updated', 'document': {'pages': []}}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertNotEqual(updated.document, {'pages': []})

    def test_revision_is_read_only(self):
        serializer = DesignDetailSerializer(
            self.design, data={'revision': 99}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.revision, 1)


class DesignUpdateSerializerTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.user, name='Original')

    def test_updates_metadata_fields(self):
        serializer = DesignUpdateSerializer(
            self.design, data={'name': 'Updated', 'status': 'published'}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertEqual(updated.name, 'Updated')
        self.assertEqual(updated.status, 'published')

    def test_has_no_document_field(self):
        serializer = DesignUpdateSerializer(self.design)
        self.assertNotIn('document', serializer.fields)
