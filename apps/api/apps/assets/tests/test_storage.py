from urllib.parse import parse_qs, urlparse

from django.core.files.storage import storages
from django.test import SimpleTestCase, override_settings

from config.storage import LocalStackAwareS3Storage


class StorageTestCase(SimpleTestCase):
    def make_storage(self):
        return LocalStackAwareS3Storage(
            access_key='test',
            secret_key='test',
            region_name='us-east-1',
            bucket_name='design-platform-assets',
            endpoint_url='http://localstack:4566',
            addressing_style='path',
            signature_version='s3v4',
            custom_domain=None,
        )

    @override_settings(AWS_S3_EXTERNAL_ENDPOINT_URL='http://localhost:4566')
    def test_browser_url_is_signed_for_external_endpoint(self):
        storage = self.make_storage()
        parsed = urlparse(storage.url('assets/example image.png'))
        self.assertEqual(parsed.netloc, 'localhost:4566')
        self.assertEqual(parsed.scheme, 'http')
        self.assertEqual(parsed.path, '/design-platform-assets/assets/example%20image.png')
        self.assertIn('X-Amz-Signature', parse_qs(parsed.query))
        self.assertEqual(storage.endpoint_url, 'http://localstack:4566')
        self.assertEqual(storage.connection.meta.client.meta.endpoint_url, 'http://localstack:4566')

    @override_settings(AWS_S3_EXTERNAL_ENDPOINT_URL=None)
    def test_no_external_endpoint_uses_normal_storage_url(self):
        parsed = urlparse(self.make_storage().url('assets/example.png'))
        self.assertEqual(parsed.netloc, 'localstack:4566')
        self.assertIn('X-Amz-Signature', parse_qs(parsed.query))

    @override_settings(STORAGES={
        'default': {
            'BACKEND': 'config.storage.LocalStackAwareS3Storage',
            'OPTIONS': {'access_key': 'test', 'secret_key': 'test',
                        'bucket_name': 'design-platform-assets'},
        },
    })
    def test_django_storage_registry_resolves_backend(self):
        self.assertIsInstance(storages['default'], LocalStackAwareS3Storage)
        self.assertEqual(storages['default'].bucket_name, 'design-platform-assets')
