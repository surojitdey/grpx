from django.test import SimpleTestCase

from apps.assets.validation import (
    AssetValidationError,
    validate_image_content,
    validate_upload_metadata,
)


class AssetValidationTestCase(SimpleTestCase):
    def test_accepts_matching_jpeg_extension_and_content_type(self):
        image_format = validate_upload_metadata('photo.JPEG', 'image/jpeg')

        self.assertEqual(image_format, 'JPEG')

    def test_rejects_content_type_that_does_not_match_extension(self):
        with self.assertRaises(AssetValidationError):
            validate_upload_metadata('photo.jpg', 'image/png')

    def test_rejects_unsupported_extension(self):
        with self.assertRaises(AssetValidationError):
            validate_upload_metadata('photo.svg', 'image/svg+xml')

    def test_rejects_actual_format_that_does_not_match_filename(self):
        with self.assertRaises(AssetValidationError):
            validate_image_content(
                'photo.png',
                'image/png',
                'WEBP',
                100,
                100,
                100,
                100,
            )

    def test_rejects_content_size_that_does_not_match_requested_size(self):
        with self.assertRaises(AssetValidationError):
            validate_image_content(
                'photo.png',
                'image/png',
                'PNG',
                100,
                100,
                101,
                100,
            )

    def test_rejects_dimensions_over_per_side_limit(self):
        with self.assertRaises(AssetValidationError):
            validate_image_content(
                'photo.png',
                'image/png',
                'PNG',
                16_385,
                1,
                100,
                100,
            )

    def test_rejects_dimensions_over_total_pixel_limit(self):
        with self.assertRaises(AssetValidationError):
            validate_image_content(
                'photo.png',
                'image/png',
                'PNG',
                10_000,
                8_001,
                100,
                100,
            )
