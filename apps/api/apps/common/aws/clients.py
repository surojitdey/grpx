import boto3
from botocore.client import BaseClient
from botocore.config import Config
from django.conf import settings


def create_s3_client(endpoint_url: str | None = None) -> BaseClient:
    options = {
        'region_name': settings.AWS_REGION,
        'config': Config(
            signature_version=settings.AWS_S3_SIGNATURE_VERSION,
            s3={'addressing_style': 'path'} if endpoint_url else None,
        ),
    }
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        options['aws_access_key_id'] = settings.AWS_ACCESS_KEY_ID
        options['aws_secret_access_key'] = settings.AWS_SECRET_ACCESS_KEY
    if endpoint_url:
        options['endpoint_url'] = endpoint_url
    return boto3.client('s3', **options)
