from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from PIL import Image, UnidentifiedImageError

from apps.assets.models import Asset
from apps.assets.tasks import process_asset


class ProcessAssetTaskTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='asset-processor',
            email='asset-processor@example.com',
            password='test-password',
        )

    def create_asset(self, mime_type='image/png'):
        return Asset.objects.create(
            owner=self.user,
            filename='upload.png',
            original_filename='upload.png',
            mime_type=mime_type,
            size=100,
            storage_key=f'assets/{self.user.pk}/upload-id/upload.png',
            status='PROCESSING',
        )

    @patch('apps.assets.tasks.get_storage_service')
    def test_processes_image_metadata_and_thumbnail(self, get_service):
        asset = self.create_asset()
        source = BytesIO()
        Image.new('RGB', (800, 400), color='red').save(source, format='PNG')
        storage = get_service.return_value
        storage.download.return_value = source.getvalue()

        process_asset.run(str(asset.pk))

        asset.refresh_from_db()
        self.assertEqual(asset.status, 'READY')
        self.assertEqual((asset.width, asset.height), (800, 400))
        self.assertTrue(
            asset.thumbnail_key.endswith(f'/.thumbnails/{asset.pk}.png')
        )
        storage.download.assert_called_once_with(asset.storage_key)
        key, content = storage.put_thumbnail.call_args.args
        self.assertEqual(key, asset.thumbnail_key)
        with Image.open(BytesIO(content)) as thumbnail:
            self.assertEqual(thumbnail.size, (512, 256))

    @patch('apps.assets.tasks.get_storage_service')
    def test_marks_non_image_media_ready_without_transforming_it(
        self, get_service
    ):
        asset = self.create_asset(mime_type='video/mp4')

        process_asset.run(str(asset.pk))

        asset.refresh_from_db()
        self.assertEqual(asset.status, 'READY')
        get_service.assert_not_called()

    @patch('apps.assets.tasks.get_storage_service')
    def test_marks_invalid_image_failed_and_raises(self, get_service):
        asset = self.create_asset()
        get_service.return_value.download.return_value = b'not an image'

        with self.assertRaises(UnidentifiedImageError):
            process_asset.run(str(asset.pk))

        asset.refresh_from_db()
        self.assertEqual(asset.status, 'FAILED')
