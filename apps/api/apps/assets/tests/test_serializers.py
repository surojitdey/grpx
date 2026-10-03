from unittest import mock

from django.test import SimpleTestCase

from apps.assets.models import Asset
from apps.assets.serializers import AssetSerializer


class AssetSerializerTestCase(SimpleTestCase):
    @mock.patch('apps.assets.serializers.get_storage_service')
    def test_url_is_generated_from_storage_key(self, get_service):
        signed_url = (
            'http://localhost:4566/design-platform-assets/assets/1/image.png?'
            + ('x' * 500)
        )
        download_url = get_service.return_value.generate_presigned_download_url
        download_url.return_value = signed_url
        asset = Asset(storage_key='assets/1/image.png')

        self.assertEqual(AssetSerializer(asset).data['url'], signed_url)
        download_url.assert_called_once_with(asset.storage_key)
