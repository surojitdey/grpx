from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.assets.models import Asset


class AssetUploadViewTestCase(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username='asset-owner',
            email='asset-owner@example.com',
            password='test-password',
        )
        self.client.force_authenticate(user=self.user)

    @patch('apps.assets.views.get_storage_service')
    def test_upload_url_returns_a_private_presigned_put_url(self, get_service):
        storage = Mock()
        storage.generate_presigned_upload_url.return_value = (
            'http://localhost:4566/presigned-upload'
        )
        get_service.return_value = storage

        response = self.client.post(
            '/api/v1/assets/upload-url/',
            {
                'filename': 'image.png',
                'content_type': 'image/png',
                'file_size': 100,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['upload_url'],
            'http://localhost:4566/presigned-upload',
        )
        key, content_type = (
            storage.generate_presigned_upload_url.call_args.args
        )
        self.assertTrue(key.startswith(f'assets/{self.user.pk}/'))
        self.assertTrue(key.endswith('/image.png'))
        self.assertEqual(content_type, 'image/png')

    @patch('apps.assets.views.get_storage_service')
    @patch('apps.assets.serializers.get_storage_service')
    def test_complete_creates_an_asset_only_after_object_exists(
        self, get_serializer_service, get_view_service
    ):
        storage = Mock()
        storage.exists.return_value = True
        storage.generate_presigned_download_url.return_value = (
            'http://localhost:4566/presigned-download'
        )
        get_view_service.return_value = storage
        get_serializer_service.return_value = storage
        key = f'assets/{self.user.pk}/upload-id/image.png'

        response = self.client.post(
            '/api/v1/assets/complete/',
            {
                'storage_key': key,
                'name': 'image.png',
                'mime_type': 'image/png',
                'file_size': 100,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data['url'],
            'http://localhost:4566/presigned-download',
        )
        asset = Asset.objects.get(storage_key=key)
        self.assertEqual(asset.owner, self.user)
        self.assertEqual(asset.mime_type, 'image/png')

    @patch('apps.assets.views.get_storage_service')
    def test_complete_rejects_a_missing_object(self, get_service):
        storage = Mock()
        storage.exists.return_value = False
        get_service.return_value = storage

        response = self.client.post(
            '/api/v1/assets/complete/',
            {
                'storage_key': f'assets/{self.user.pk}/upload-id/missing.png',
                'name': 'missing.png',
                'mime_type': 'image/png',
                'file_size': 100,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Asset.objects.count(), 0)

    @patch('apps.assets.views.get_storage_service')
    def test_complete_rejects_a_key_owned_by_another_user(self, get_service):
        storage = get_service.return_value

        response = self.client.post(
            '/api/v1/assets/complete/',
            {
                'storage_key': 'assets/999/upload-id/image.png',
                'name': 'image.png',
                'mime_type': 'image/png',
                'file_size': 100,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        storage.exists.assert_not_called()
        self.assertEqual(Asset.objects.count(), 0)
