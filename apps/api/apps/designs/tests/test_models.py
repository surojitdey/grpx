"""
Tests for Design and DesignVersion models
"""
import uuid
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.designs.models import Design, DesignVersion

User = get_user_model()


class DesignModelTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )

    def test_create_with_defaults(self):
        design = Design.objects.create(owner=self.user)
        self.assertEqual(design.name, 'Untitled Design')
        self.assertEqual(design.description, '')
        self.assertEqual(design.width, 1080)
        self.assertEqual(design.height, 1080)
        self.assertEqual(design.status, 'draft')
        self.assertFalse(design.is_template)
        self.assertFalse(design.is_deleted)

    def test_uuid_primary_key(self):
        design = Design.objects.create(owner=self.user)
        self.assertIsInstance(design.id, uuid.UUID)

    def test_document_default_structure(self):
        design = Design.objects.create(owner=self.user)
        self.assertIn('pages', design.document)
        self.assertEqual(len(design.document['pages']), 1)

    def test_schema_version_default(self):
        design = Design.objects.create(owner=self.user)
        self.assertEqual(design.schema_version, '1.0')

    def test_revision_default(self):
        design = Design.objects.create(owner=self.user)
        self.assertEqual(design.revision, 1)

    def test_timestamps_set_on_create(self):
        design = Design.objects.create(owner=self.user)
        self.assertIsNotNone(design.created_at)
        self.assertIsNotNone(design.updated_at)
        self.assertIsNone(design.last_opened_at)

    def test_str_returns_name(self):
        design = Design.objects.create(owner=self.user, name='My Design')
        self.assertEqual(str(design), 'My Design')

    def test_cascade_delete_on_user_deletion(self):
        design = Design.objects.create(owner=self.user)
        design_id = design.id
        self.user.delete()
        self.assertFalse(Design.objects.filter(id=design_id).exists())

    def test_soft_delete_flag(self):
        design = Design.objects.create(owner=self.user)
        design.is_deleted = True
        design.save(update_fields=['is_deleted'])
        design.refresh_from_db()
        self.assertTrue(design.is_deleted)


class DesignVersionModelTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.user)

    def test_create_version(self):
        version = DesignVersion.objects.create(
            design=self.design,
            version_number=1,
            document=self.design.document,
            created_by=self.user,
        )
        self.assertEqual(str(version), f'{self.design.name} v1')

    def test_cascade_delete_on_design_deletion(self):
        version = DesignVersion.objects.create(
            design=self.design, version_number=1, document={}
        )
        version_id = version.id
        self.design.delete()
        self.assertFalse(DesignVersion.objects.filter(id=version_id).exists())

    def test_unique_together_design_version_number(self):
        DesignVersion.objects.create(design=self.design, version_number=1, document={})
        with self.assertRaises(Exception):
            DesignVersion.objects.create(design=self.design, version_number=1, document={})
