"""
Design document tests: canonical validation helpers
"""

from django.test import TestCase

from apps.designs.documents import SCHEMA_VERSION, build_default_document
from apps.designs.validation import DocumentValidationError, validate_document


def build_valid_document():
    doc = build_default_document()
    doc['pages'][0]['objects'] = [
        {'id': 'obj-1', 'type': 'rectangle', 'x': 10, 'y': 20, 'width': 100, 'height': 50},
    ]
    return doc


class ValidateDocumentTestCase(TestCase):

    def test_valid_document_passes_and_is_returned(self):
        doc = build_valid_document()
        self.assertEqual(validate_document(doc), doc)

    def test_rejects_non_dict(self):
        for bad in (None, [], 'doc', 42):
            with self.assertRaises(DocumentValidationError):
                validate_document(bad)

    def test_rejects_wrong_schema_version(self):
        doc = build_valid_document()
        doc['schemaVersion'] = '9.9'
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_non_positive_dimensions(self):
        doc = build_valid_document()
        doc['width'] = 0
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

        doc = build_valid_document()
        doc['height'] = -5
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_non_integer_dimensions(self):
        doc = build_valid_document()
        doc['width'] = 10.5
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_bad_background(self):
        doc = build_valid_document()
        doc['background'] = {'type': 'plaid', 'value': '#fff'}
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

        doc = build_valid_document()
        doc['background'] = {'type': 'color'}
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_empty_pages(self):
        doc = build_valid_document()
        doc['pages'] = []
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_duplicate_page_ids(self):
        doc = build_valid_document()
        doc['pages'].append(dict(doc['pages'][0]))
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_page_missing_id(self):
        doc = build_valid_document()
        del doc['pages'][0]['id']
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_allows_page_without_name(self):
        doc = build_valid_document()
        del doc['pages'][0]['name']
        self.assertEqual(validate_document(doc), doc)

    def test_rejects_bad_per_page_background(self):
        doc = build_valid_document()
        doc['pages'][0]['background'] = {'type': 'nope'}
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_page_objects_not_list(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'] = 'objects'
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_object_with_unknown_type(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0]['type'] = 'triangle'
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_object_with_bad_geometry(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0]['width'] = 0
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

        doc = build_valid_document()
        doc['pages'][0]['objects'][0]['x'] = 'ten'
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_rejects_object_without_id(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0]['id'] = ''
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_text_object_requires_content_text(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0] = {
            'id': 'obj-t', 'type': 'text', 'x': 0, 'y': 0, 'width': 10, 'height': 10,
        }
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_image_object_requires_content_asset_id(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0] = {
            'id': 'obj-i', 'type': 'image', 'x': 0, 'y': 0, 'width': 10, 'height': 10,
        }
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_group_object_requires_children_ids(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0] = {
            'id': 'obj-g', 'type': 'group', 'x': 0, 'y': 0, 'width': 10, 'height': 10,
            'children': [1, 2],
        }
        with self.assertRaises(DocumentValidationError):
            validate_document(doc)

    def test_error_includes_path(self):
        doc = build_valid_document()
        doc['pages'][0]['objects'][0]['width'] = 0
        with self.assertRaises(DocumentValidationError) as ctx:
            validate_document(doc)
        self.assertIn('pages[0].objects[0]', str(ctx.exception))
        self.assertIn('width', str(ctx.exception))

    def test_schema_version_constant_matches_documents(self):
        self.assertEqual(SCHEMA_VERSION, '1.0')
