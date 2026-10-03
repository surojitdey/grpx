"""Asynchronous asset processing tasks."""

from io import BytesIO

from celery import shared_task
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.common.aws import StorageError, get_storage_service

from .models import Asset


@shared_task
def process_asset(asset_id: str) -> None:
    asset = Asset.objects.filter(
        pk=asset_id,
        status='PROCESSING',
    ).first()
    if asset is None:
        return

    updates = {'status': 'READY'}
    try:
        if asset.mime_type.startswith('image/'):
            storage = get_storage_service()
            original = storage.download(asset.storage_key)
            with Image.open(BytesIO(original)) as source:
                image = ImageOps.exif_transpose(source)
                width, height = image.size
                image.thumbnail((512, 512))
                thumbnail = image.convert(
                    'RGBA' if 'A' in image.getbands() else 'RGB'
                )
                output = BytesIO()
                thumbnail.save(output, format='PNG', optimize=True)

            thumbnail_key = (
                f'{asset.storage_key.rsplit("/", 1)[0]}'
                f'/.thumbnails/{asset.pk}.png'
            )
            storage.put_thumbnail(thumbnail_key, output.getvalue())
            updates.update(
                width=width,
                height=height,
                thumbnail_key=thumbnail_key,
            )
    except (
        StorageError,
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ):
        Asset.objects.filter(
            pk=asset.pk,
            status='PROCESSING',
        ).update(status='FAILED')
        raise

    Asset.objects.filter(
        pk=asset.pk,
        status='PROCESSING',
    ).update(**updates)
