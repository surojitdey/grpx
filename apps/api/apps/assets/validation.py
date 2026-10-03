"""Validation rules for uploaded image assets."""

MAX_UPLOAD_SIZE = 100 * 1024 * 1024
MAX_IMAGE_DIMENSION = 16_384
MAX_IMAGE_PIXELS = 80_000_000

IMAGE_FORMATS = {
    'JPEG': ('image/jpeg', {'.jpg', '.jpeg'}),
    'PNG': ('image/png', {'.png'}),
    'WEBP': ('image/webp', {'.webp'}),
    'GIF': ('image/gif', {'.gif'}),
}


class AssetValidationError(ValueError):
    """Raised when uploaded image metadata or content is not allowed."""


def validate_upload_metadata(filename: str, content_type: str) -> str:
    basename = filename.rsplit('/', 1)[-1].rsplit('\\', 1)[-1]
    extension = (
        f'.{basename.rsplit(".", 1)[-1]}'.lower()
        if '.' in basename
        else ''
    )

    expected_format = next(
        (
            image_format
            for image_format, (_, extensions) in IMAGE_FORMATS.items()
            if extension in extensions
        ),
        None,
    )
    if expected_format is None:
        raise AssetValidationError(
            'Only JPEG, PNG, WebP, and GIF images are supported.'
        )

    expected_content_type = IMAGE_FORMATS[expected_format][0]
    if content_type.lower() != expected_content_type:
        raise AssetValidationError(
            'The content type does not match the file extension.'
        )
    return expected_format


def validate_image_content(
    filename: str,
    content_type: str,
    image_format: str | None,
    width: int,
    height: int,
    content_size: int,
    expected_size: int,
) -> None:
    expected_format = validate_upload_metadata(filename, content_type)
    if (image_format or '').upper() != expected_format:
        raise AssetValidationError(
            'The file content does not match its extension and content type.'
        )
    if content_size < 1 or content_size > MAX_UPLOAD_SIZE:
        raise AssetValidationError(
            f'Image size must be between 1 byte and {MAX_UPLOAD_SIZE} bytes.'
        )
    if content_size != expected_size:
        raise AssetValidationError(
            'The uploaded file size does not match the requested size.'
        )
    if width < 1 or height < 1:
        raise AssetValidationError(
            'Image dimensions must be greater than zero.'
        )
    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        raise AssetValidationError(
            f'Image dimensions cannot exceed {MAX_IMAGE_DIMENSION} pixels '
            'on either side.'
        )
    if width * height > MAX_IMAGE_PIXELS:
        raise AssetValidationError(
            f'Image dimensions cannot exceed {MAX_IMAGE_PIXELS} pixels total.'
        )
