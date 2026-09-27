"""
Tests for Design API views
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.designs.models import Design

User = get_user_model()


class DesignAPITestCase(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.other_user = User.objects.create_user(
            username='other', email='other@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.user, name='Test Design')
        self.other_design = Design.objects.create(owner=self.other_user, name='Other Design')
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_create_design(self):
        response = self.client.post('/api/v1/designs/', {'name': 'New Design', 'width': 1080, 'height': 1080}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Design')
        self.assertIn('document', response.data)

    def test_create_requires_auth(self):
        self.client.credentials()
        response = self.client.post('/api/v1/designs/', {'name': 'New Design'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_only_own_designs(self):
        response = self.client.get('/api/v1/designs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [d['id'] for d in response.data['results']]
        self.assertIn(str(self.design.id), ids)
        self.assertNotIn(str(self.other_design.id), ids)

    def test_list_excludes_document(self):
        response = self.client.get('/api/v1/designs/')
        self.assertNotIn('document', response.data['results'][0])

    def test_retrieve_includes_document_and_updates_last_opened(self):
        self.assertIsNone(self.design.last_opened_at)
        response = self.client.get(f'/api/v1/designs/{self.design.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('document', response.data)
        self.design.refresh_from_db()
        self.assertIsNotNone(self.design.last_opened_at)

    def test_retrieve_other_user_design_denied(self):
        response = self.client.get(f'/api/v1/designs/{self.other_design.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partial_update_metadata(self):
        response = self.client.patch(f'/api/v1/designs/{self.design.id}/', {'name': 'Renamed'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.design.refresh_from_db()
        self.assertEqual(self.design.name, 'Renamed')

    def test_partial_update_ignores_document(self):
        original_document = self.design.document
        response = self.client.patch(
            f'/api/v1/designs/{self.design.id}/', {'document': {'pages': []}}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.design.refresh_from_db()
        self.assertEqual(self.design.document, original_document)

    def test_destroy_soft_deletes(self):
        response = self.client.delete(f'/api/v1/designs/{self.design.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.design.refresh_from_db()
        self.assertTrue(self.design.is_deleted)
        self.assertTrue(Design.objects.filter(id=self.design.id).exists())

    def test_deleted_design_excluded_from_list(self):
        self.client.delete(f'/api/v1/designs/{self.design.id}/')
        response = self.client.get('/api/v1/designs/')
        ids = [d['id'] for d in response.data['results']]
        self.assertNotIn(str(self.design.id), ids)

    def test_deleted_design_not_retrievable(self):
        self.client.delete(f'/api/v1/designs/{self.design.id}/')
        response = self.client.get(f'/api/v1/designs/{self.design.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_duplicate_creates_new_design(self):
        response = self.client.post(f'/api/v1/designs/{self.design.id}/duplicate/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Test Design (Copy)')
        self.assertNotEqual(response.data['id'], str(self.design.id))

    def test_duplicate_clones_document_with_new_page_ids(self):
        response = self.client.post(f'/api/v1/designs/{self.design.id}/duplicate/')
        original_page_id = self.design.document['pages'][0]['id']
        duplicate_page_id = response.data['document']['pages'][0]['id']
        self.assertNotEqual(original_page_id, duplicate_page_id)

    def test_restore_undoes_soft_delete(self):
        self.client.delete(f'/api/v1/designs/{self.design.id}/')
        response = self.client.post(f'/api/v1/designs/{self.design.id}/restore/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.design.refresh_from_db()
        self.assertFalse(self.design.is_deleted)

    def test_versions_endpoint_returns_list(self):
        response = self.client.get(f'/api/v1/designs/{self.design.id}/versions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_create_design_starts_at_revision_one(self):
        response = self.client.post('/api/v1/designs/', {'name': 'Rev Test'}, format='json')
        self.assertEqual(response.data['revision'], 1)
