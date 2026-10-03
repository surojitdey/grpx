from typing import BinaryIO

from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings

from .clients import create_s3_client
from .exceptions import StorageError


class S3StorageService:
    def __init__(
        self,
        client: BaseClient | None = None,
        download_client: BaseClient | None = None,
        bucket_name: str | None = None,
    ) -> None:
        self.bucket_name = (
            bucket_name if bucket_name is not None else settings.AWS_S3_BUCKET
        )
        internal_endpoint = settings.AWS_S3_INTERNAL_ENDPOINT_URL
        external_endpoint = (
            settings.AWS_S3_EXTERNAL_ENDPOINT_URL or internal_endpoint
        )
        self.client = client or create_s3_client(internal_endpoint)
        if download_client is not None:
            self.download_client = download_client
        elif external_endpoint == internal_endpoint:
            self.download_client = self.client
        else:
            self.download_client = create_s3_client(external_endpoint)

    def upload(
        self, key: str, content: BinaryIO | bytes, content_type: str
    ) -> None:
        try:
            self.client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError('upload', key, exc) from exc

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
        except (BotoCoreError, ClientError) as exc:
            raise StorageError('delete', key, exc) from exc

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as exc:
            code = exc.response.get('Error', {}).get('Code')
            if code in {'404', 'NoSuchKey', 'NotFound'}:
                return False
            raise StorageError('check existence', key, exc) from exc
        except BotoCoreError as exc:
            raise StorageError('check existence', key, exc) from exc

    def generate_presigned_upload_url(
        self, key: str, content_type: str
    ) -> str:
        try:
            return self.download_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': key,
                    'ContentType': content_type,
                },
                ExpiresIn=3600,
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError('generate upload URL', key, exc) from exc

    def generate_presigned_download_url(
        self, key: str, expires_in: int = 3600
    ) -> str:
        try:
            return self.download_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=expires_in,
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError('generate download URL', key, exc) from exc
