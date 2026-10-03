from io import BytesIO
from unittest import TestCase
from unittest.mock import Mock, call, patch
from urllib.parse import parse_qs, urlparse

from botocore.exceptions import ClientError
from django.test import override_settings

from apps.common.aws.exceptions import StorageError
from apps.common.aws.clients import create_s3_client
from apps.common.aws.s3 import S3StorageService


class S3StorageServiceTestCase(TestCase):
    def setUp(self):
        self.client = Mock()
        self.download_client = Mock()
        self.storage = S3StorageService(
            client=self.client,
            download_client=self.download_client,
            bucket_name='test-assets',
        )

    def test_upload_sends_content_and_type_to_configured_bucket(self):
        content = BytesIO(b'image-data')

        self.storage.upload('assets/1/image.png', content, 'image/png')

        self.client.put_object.assert_called_once_with(
            Bucket='test-assets',
            Key='assets/1/image.png',
            Body=content,
            ContentType='image/png',
        )

    def test_delete_removes_the_object_from_configured_bucket(self):
        self.storage.delete('assets/1/image.png')

        self.client.delete_object.assert_called_once_with(
            Bucket='test-assets',
            Key='assets/1/image.png',
        )

    def test_exists_checks_the_configured_bucket(self):
        self.assertTrue(self.storage.exists('assets/1/image.png'))

        self.client.head_object.assert_called_once_with(
            Bucket='test-assets',
            Key='assets/1/image.png',
        )

    def test_exists_returns_false_for_a_missing_object(self):
        self.client.head_object.side_effect = ClientError(
            {'Error': {'Code': '404', 'Message': 'Not Found'}},
            'HeadObject',
        )

        self.assertFalse(self.storage.exists('assets/1/missing.png'))

    @patch('apps.common.aws.clients.boto3.client')
    def test_custom_endpoints_use_path_style_addressing(self, boto_client):
        create_s3_client('http://localhost:4566')

        config = boto_client.call_args.kwargs['config']
        self.assertEqual(config.s3['addressing_style'], 'path')

    @patch('apps.common.aws.clients.boto3.client')
    def test_aws_client_uses_default_endpoint_addressing(self, boto_client):
        create_s3_client()

        config = boto_client.call_args.kwargs['config']
        self.assertIsNone(config.s3)
        self.assertNotIn('endpoint_url', boto_client.call_args.kwargs)

    @override_settings(
        AWS_ACCESS_KEY_ID='test',
        AWS_SECRET_ACCESS_KEY='test',
        AWS_REGION='us-east-1',
        AWS_S3_BUCKET='design-platform-assets',
        AWS_S3_INTERNAL_ENDPOINT_URL='http://localstack:4566',
        AWS_S3_EXTERNAL_ENDPOINT_URL='http://localhost:4566',
    )
    def test_localstack_presigned_urls_use_the_browser_endpoint(self):
        storage = S3StorageService()
        key = 'assets/1/upload-id/image.png'

        upload = urlparse(
            storage.generate_presigned_upload_url(key, 'image/png')
        )
        download = urlparse(storage.generate_presigned_download_url(key))

        for parsed in (upload, download):
            self.assertEqual(parsed.netloc, 'localhost:4566')
            self.assertEqual(
                parsed.path,
                f'/design-platform-assets/{key}',
            )
            self.assertIn('X-Amz-Signature', parse_qs(parsed.query))

    def test_presigned_urls_use_download_client_and_requested_parameters(self):
        self.download_client.generate_presigned_url.side_effect = [
            'https://s3.example/upload',
            'https://s3.example/download',
        ]

        upload_url = self.storage.generate_presigned_upload_url(
            'assets/1/image.png', 'image/png'
        )
        download_url = self.storage.generate_presigned_download_url(
            'assets/1/image.png', expires_in=120
        )

        self.assertEqual(upload_url, 'https://s3.example/upload')
        self.assertEqual(download_url, 'https://s3.example/download')
        self.assertEqual(
            self.download_client.generate_presigned_url.call_args_list,
            [
                call(
                    'put_object',
                    Params={
                        'Bucket': 'test-assets',
                        'Key': 'assets/1/image.png',
                        'ContentType': 'image/png',
                    },
                    ExpiresIn=3600,
                ),
                call(
                    'get_object',
                    Params={
                        'Bucket': 'test-assets',
                        'Key': 'assets/1/image.png',
                    },
                    ExpiresIn=120,
                ),
            ],
        )

    def test_client_errors_are_exposed_as_storage_errors(self):
        self.client.put_object.side_effect = ClientError(
            {'Error': {'Code': 'Unavailable', 'Message': 'S3 is unavailable'}},
            'PutObject',
        )

        with self.assertRaises(StorageError) as raised:
            self.storage.upload(
                'assets/1/image.png', b'image-data', 'image/png'
            )

        self.assertEqual(raised.exception.operation, 'upload')
        self.assertEqual(raised.exception.key, 'assets/1/image.png')

    @override_settings(
        AWS_S3_INTERNAL_ENDPOINT_URL='http://localstack:4566',
        AWS_S3_EXTERNAL_ENDPOINT_URL='http://localhost:4566',
    )
    def test_upload_and_presigning_clients_use_internal_and_external_endpoints(
        self,
    ):
        with patch('apps.common.aws.s3.create_s3_client') as create_client:
            internal_client = Mock()
            external_client = Mock()
            create_client.side_effect = [internal_client, external_client]

            storage = S3StorageService()

        self.assertIs(storage.client, internal_client)
        self.assertIs(storage.download_client, external_client)
        self.assertEqual(
            create_client.call_args_list,
            [
                call('http://localstack:4566'),
                call('http://localhost:4566'),
            ],
        )
