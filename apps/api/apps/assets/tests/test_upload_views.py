import uuid
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from kombu.exceptions import OperationalError

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

    def test_multipart_proxy_upload_endpoint_is_not_available(self):
        response = self.client.post(
            '/api/v1/assets/direct-upload/',
            {'file': b'large binary payload'},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(Asset.objects.count(), 0)

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

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
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
        asset = Asset.objects.get(pk=response.data['asset_id'])
        self.assertEqual(asset.owner, self.user)
        self.assertEqual(asset.filename, 'image.png')
        self.assertEqual(asset.original_filename, 'image.png')
        self.assertEqual(asset.mime_type, 'image/png')
        self.assertEqual(asset.size, 100)
        self.assertEqual(asset.storage_key, key)
        self.assertEqual(asset.status, 'PENDING')

    def test_upload_url_rejects_invalid_metadata_without_creating_asset(self):
        response = self.client.post(
            '/api/v1/assets/upload-url/',
            {
                'filename': 'image.png',
                'content_type': 'not-a-mime-type',
                'file_size': 0,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Asset.objects.count(), 0)

    def test_upload_url_rejects_mismatched_extension_and_content_type(self):
        response = self.client.post(
            '/api/v1/assets/upload-url/',
            {
                'filename': 'image.jpg',
                'content_type': 'image/png',
                'file_size': 100,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Asset.objects.count(), 0)

    def test_upload_url_rejects_files_over_the_size_limit(self):
        response = self.client.post(
            '/api/v1/assets/upload-url/',
            {
                'filename': 'image.png',
                'content_type': 'image/png',
                'file_size': 100 * 1024 * 1024 + 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Asset.objects.count(), 0)

    @patch('apps.assets.serializers.get_storage_service')
    def test_asset_library_includes_pending_status(self, get_service):
        Asset.objects.create(
            owner=self.user,
            filename='image.png',
            original_filename='image.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{self.user.pk}/upload-id/image.png',
            status='PENDING',
        )
        download_url = (
            get_service.return_value.generate_presigned_download_url
        )
        download_url.side_effect = lambda key: (
            f'https://storage.example/{key}'
        )

        response = self.client.get('/api/v1/assets/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['status'], 'PENDING')

    @patch('apps.assets.serializers.get_storage_service')
    def test_asset_library_filters_by_owner_status_and_search(
        self, get_service
    ):
        ready_asset = Asset.objects.create(
            owner=self.user,
            filename='summer-campaign.png',
            original_filename='summer-campaign.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{self.user.pk}/ready/summer-campaign.png',
            thumbnail_key=f'assets/{self.user.pk}/ready/thumbnail.png',
            status='READY',
        )
        Asset.objects.create(
            owner=self.user,
            filename='summer-draft.png',
            original_filename='summer-draft.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{self.user.pk}/processing/summer-draft.png',
            status='PROCESSING',
        )
        other_user = get_user_model().objects.create_user(
            username='asset-library-other',
            email='asset-library-other@example.com',
            password='test-password',
        )
        Asset.objects.create(
            owner=other_user,
            filename='summer-private.png',
            original_filename='summer-private.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{other_user.pk}/private/summer-private.png',
            status='READY',
        )
        download_url = (
            get_service.return_value.generate_presigned_download_url
        )
        download_url.side_effect = lambda key: (
            f'https://storage.example/{key}'
        )

        response = self.client.get(
            '/api/v1/assets/?search=summer&status=READY'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        result = response.data['results'][0]
        self.assertEqual(result['id'], str(ready_asset.pk))
        self.assertEqual(result['status'], 'READY')
        self.assertEqual(
            result['thumbnail_url'],
            f'https://storage.example/{ready_asset.thumbnail_key}',
        )

        processing_response = self.client.get(
            '/api/v1/assets/?status=PROCESSING'
        )
        self.assertEqual(processing_response.data['count'], 1)
        self.assertEqual(
            processing_response.data['results'][0]['status'],
            'PROCESSING',
        )

    @patch('apps.assets.serializers.get_storage_service')
    def test_asset_library_paginates_with_owner_scoped_count(
        self, get_service
    ):
        for index in range(22):
            Asset.objects.create(
                owner=self.user,
                filename=f'asset-{index}.png',
                original_filename=f'asset-{index}.png',
                mime_type='image/png',
                size=100,
                storage_key=(
                    f'assets/{self.user.pk}/library/asset-{index}.png'
                ),
                status='READY',
            )
        other_user = get_user_model().objects.create_user(
            username='asset-library-paginate-other',
            email='asset-library-paginate-other@example.com',
            password='test-password',
        )
        Asset.objects.create(
            owner=other_user,
            filename='other.png',
            original_filename='other.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{other_user.pk}/other.png',
            status='READY',
        )
        download_url = (
            get_service.return_value.generate_presigned_download_url
        )
        download_url.side_effect = lambda key: (
            f'https://storage.example/{key}'
        )

        response = self.client.get('/api/v1/assets/?page=2')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 22)
        self.assertEqual(len(response.data['results']), 2)
        self.assertIsNotNone(response.data['previous'])
        self.assertIsNone(response.data['next'])
        self.assertTrue(
            all(
                result['storage_key'].startswith(f'assets/{self.user.pk}/')
                for result in response.data['results']
            )
        )

        sized_response = self.client.get(
            '/api/v1/assets/?page=1&page_size=5'
        )
        self.assertEqual(len(sized_response.data['results']), 5)

    @patch('apps.assets.views.process_asset.delay')
    @patch('apps.assets.views.get_storage_service')
    @patch('apps.assets.serializers.get_storage_service')
    def test_complete_moves_upload_url_asset_to_processing_and_queues_task(
        self, get_serializer_service, get_view_service, queue_task
    ):
        storage = Mock()
        storage.generate_presigned_upload_url.return_value = (
            'http://localhost:4566/presigned-upload'
        )
        storage.generate_presigned_download_url.return_value = (
            'http://localhost:4566/presigned-download'
        )
        storage.get_object_metadata.return_value = (100, 'image/png')
        get_view_service.return_value = storage
        get_serializer_service.return_value = storage

        upload_response = self.client.post(
            '/api/v1/assets/upload-url/',
            {
                'filename': 'image.png',
                'content_type': 'image/png',
                'file_size': 100,
            },
            format='json',
        )
        asset = Asset.objects.get(pk=upload_response.data['asset_id'])
        self.assertEqual(asset.status, 'PENDING')

        response = self.client.post(
            f'/api/v1/assets/{asset.pk}/complete',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        asset.refresh_from_db()
        self.assertEqual(asset.status, 'PROCESSING')
        queue_task.assert_called_once_with(str(asset.pk))

    @patch('apps.assets.views.get_storage_service')
    def test_complete_requires_an_asset_created_by_upload_url(
        self, get_service
    ):
        storage = get_service.return_value

        response = self.client.post(
            f'/api/v1/assets/{uuid.uuid4()}/complete',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        storage.get_object_metadata.assert_not_called()
        self.assertEqual(Asset.objects.count(), 0)

    @patch('apps.assets.views.process_asset.delay')
    @patch('apps.assets.views.get_storage_service')
    def test_complete_rejects_a_missing_object(
        self, get_service, queue_task
    ):
        asset = Asset.objects.create(
            owner=self.user,
            filename='missing.png',
            original_filename='missing.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{self.user.pk}/upload-id/missing.png',
            status='PENDING',
        )
        storage = Mock()
        storage.get_object_metadata.return_value = None
        get_service.return_value = storage

        response = self.client.post(
            f'/api/v1/assets/{asset.pk}/complete',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        asset.refresh_from_db()
        self.assertEqual(asset.status, 'PENDING')
        get_service.return_value.get_object_metadata.assert_called_once_with(
            asset.storage_key
        )

    @patch('apps.assets.views.process_asset.delay')
    @patch('apps.assets.views.get_storage_service')
    def test_complete_rejects_object_metadata_that_does_not_match_asset(
        self, get_service, queue_task
    ):
        asset = Asset.objects.create(
            owner=self.user,
            filename='image.png',
            original_filename='image.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{self.user.pk}/upload-id/image.png',
            status='PENDING',
        )
        get_service.return_value.get_object_metadata.return_value = (
            101,
            'image/png',
        )

        response = self.client.post(
            f'/api/v1/assets/{asset.pk}/complete',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        asset.refresh_from_db()
        self.assertEqual(asset.status, 'PENDING')
        queue_task.assert_not_called()

    @patch('apps.assets.views.get_storage_service')
    def test_complete_rejects_an_asset_owned_by_another_user(
        self, get_service
    ):
        other_user = get_user_model().objects.create_user(
            username='other-asset-owner',
            email='other-asset-owner@example.com',
            password='test-password',
        )
        asset = Asset.objects.create(
            owner=other_user,
            filename='image.png',
            original_filename='image.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{other_user.pk}/upload-id/image.png',
            status='PENDING',
        )

        response = self.client.post(
            f'/api/v1/assets/{asset.pk}/complete',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        get_service.return_value.get_object_metadata.assert_not_called()

    @patch('apps.assets.views.process_asset.delay')
    @patch('apps.assets.views.get_storage_service')
    def test_complete_resets_asset_if_processing_cannot_be_queued(
        self, get_service, queue_task
    ):
        asset = Asset.objects.create(
            owner=self.user,
            filename='image.png',
            original_filename='image.png',
            mime_type='image/png',
            size=100,
            storage_key=f'assets/{self.user.pk}/upload-id/image.png',
            status='PENDING',
        )
        get_service.return_value.get_object_metadata.return_value = (
            100,
            'image/png',
        )
        queue_task.side_effect = OperationalError('broker unavailable')

        response = self.client.post(
            f'/api/v1/assets/{asset.pk}/complete',
            {},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
        asset.refresh_from_db()
        self.assertEqual(asset.status, 'PENDING')
