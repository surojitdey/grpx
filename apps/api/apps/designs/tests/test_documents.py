"""
Tests for design document helper functions
"""
from django.test import TestCase

from apps.designs.documents import (
    SCHEMA_VERSION,
    build_default_document,
    build_document_from_legacy_pages,
    clone_document,
)


class BuildDefaultDocumentTestCase(TestCase):

    def test_structure(self):
        doc = build_default_document(1080, 1080)
        self.assertEqual(doc['schemaVersion'], SCHEMA_VERSION)
        self.assertEqual(doc['width'], 1080)
        self.assertEqual(doc['height'], 1080)
        self.assertIn('background', doc)
        self.assertEqual(len(doc['pages']), 1)

    def test_custom_dimensions(self):
        doc = build_default_document(1920, 1080)
        self.assertEqual(doc['width'], 1920)
        self.assertEqual(doc['height'], 1080)

    def test_default_dimensions(self):
        doc = build_default_document()
        self.assertEqual(doc['width'], 1080)
        self.assertEqual(doc['height'], 1080)

    def test_background_default(self):
        doc = build_default_document()
        self.assertEqual(doc['background'], {'type': 'color', 'value': '#FFFFFF'})

    def test_page_has_id_name_and_empty_objects(self):
        doc = build_default_document()
        page = doc['pages'][0]
        self.assertIn('id', page)
        self.assertEqual(page['name'], 'Page 1')
        self.assertEqual(page['objects'], [])

    def test_page_ids_unique_across_calls(self):
        doc1 = build_default_document()
        doc2 = build_default_document()
        self.assertNotEqual(doc1['pages'][0]['id'], doc2['pages'][0]['id'])


class CloneDocumentTestCase(TestCase):

    def test_clone_creates_independent_copy(self):
        original = build_default_document()
        cloned = clone_document(original)
        self.assertIsNot(cloned, original)
        self.assertIsNot(cloned['pages'], original['pages'])

    def test_clone_regenerates_page_ids(self):
        original = build_default_document()
        cloned = clone_document(original)
        self.assertNotEqual(cloned['pages'][0]['id'], original['pages'][0]['id'])

    def test_clone_regenerates_object_ids(self):
        original = build_default_document()
        original['pages'][0]['objects'] = [{'id': 'obj-1', 'type': 'text'}]
        cloned = clone_document(original)
        cloned_obj = cloned['pages'][0]['objects'][0]
        self.assertNotEqual(cloned_obj['id'], 'obj-1')
        self.assertEqual(cloned_obj['type'], 'text')

    def test_clone_preserves_metadata(self):
        original = build_default_document(1920, 1080)
        cloned = clone_document(original)
        self.assertEqual(cloned['width'], 1920)
        self.assertEqual(cloned['height'], 1080)
        self.assertEqual(cloned['schemaVersion'], original['schemaVersion'])

    def test_clone_deep_copy_independence(self):
        original = build_default_document()
        cloned = clone_document(original)
        original['pages'][0]['name'] = 'Modified'
        self.assertNotEqual(cloned['pages'][0]['name'], 'Modified')

    def test_clone_handles_empty_document(self):
        cloned = clone_document({})
        self.assertEqual(cloned, {})

    def test_clone_handles_none(self):
        cloned = clone_document(None)
        self.assertEqual(cloned, {})

    def test_clone_handles_empty_pages_list(self):
        cloned = clone_document({'pages': []})
        self.assertEqual(cloned['pages'], [])


class BuildDocumentFromLegacyPagesTestCase(TestCase):

    @staticmethod
    def _page_row(page_number, name='Page', objects=None, background=None):
        row = {'page_number': page_number, 'name': name, 'document': {}}
        if objects is not None:
            row['document']['objects'] = objects
        if background is not None:
            row['document']['background'] = background
        return row

    def test_pages_ordered_by_page_number(self):
        doc = build_document_from_legacy_pages(
            [
                self._page_row(2, name='Second', objects=[{'id': 'b'}]),
                self._page_row(1, name='First', objects=[{'id': 'a'}]),
            ]
        )
        self.assertEqual([p['name'] for p in doc['pages']], ['First', 'Second'])
        self.assertEqual(doc['pages'][0]['objects'], [{'id': 'a'}])
        self.assertEqual(doc['pages'][1]['objects'], [{'id': 'b'}])

    def test_page_names_preserved(self):
        doc = build_document_from_legacy_pages(
            [self._page_row(1, name='Cover'), self._page_row(2, name='Back')]
        )
        self.assertEqual([p['name'] for p in doc['pages']], ['Cover', 'Back'])

    def test_objects_preserved_as_is(self):
        obj = {'id': 'obj-1', 'type': 'rectangle', 'x': 10, 'width': 100}
        doc = build_document_from_legacy_pages([self._page_row(1, objects=[obj])])
        self.assertEqual(doc['pages'][0]['objects'], [obj])

    def test_design_background_from_first_page(self):
        background = {'type': 'color', 'value': '#FF0000'}
        doc = build_document_from_legacy_pages(
            [
                self._page_row(1, background=background),
                self._page_row(2, background={'type': 'color', 'value': '#00FF00'}),
            ]
        )
        self.assertEqual(doc['background'], background)

    def test_per_page_backgrounds_kept_on_pages(self):
        first = {'type': 'color', 'value': '#FF0000'}
        second = {'type': 'color', 'value': '#00FF00'}
        doc = build_document_from_legacy_pages(
            [
                self._page_row(1, background=first),
                self._page_row(2, background=second),
            ]
        )
        self.assertEqual(doc['pages'][0]['background'], first)
        self.assertEqual(doc['pages'][1]['background'], second)

    def test_design_background_defaults_when_no_page_background(self):
        doc = build_document_from_legacy_pages([self._page_row(1, objects=[])])
        self.assertEqual(doc['background'], {'type': 'color', 'value': '#FFFFFF'})

    def test_page_ids_generated_and_unique(self):
        doc = build_document_from_legacy_pages(
            [self._page_row(1), self._page_row(2)]
        )
        ids = [p['id'] for p in doc['pages']]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(i for i in ids))

    def test_missing_page_document_becomes_empty_objects(self):
        doc = build_document_from_legacy_pages([self._page_row(1)])
        self.assertEqual(doc['pages'][0]['objects'], [])

    def test_non_dict_page_document_becomes_empty_objects(self):
        row = {'page_number': 1, 'name': 'P', 'document': 'garbage'}
        doc = build_document_from_legacy_pages([row])
        self.assertEqual(doc['pages'][0]['objects'], [])

    def test_no_rows_returns_default_document(self):
        doc = build_document_from_legacy_pages([])
        expected = build_default_document()
        self.assertEqual(doc['width'], 1080)
        self.assertEqual(doc['height'], 1080)
        self.assertEqual(len(doc['pages']), 1)
        self.assertEqual(doc['pages'][0]['name'], 'Page 1')
        self.assertEqual(doc['schemaVersion'], expected['schemaVersion'])

    def test_document_matches_canonical_shape(self):
        doc = build_document_from_legacy_pages(
            [self._page_row(1, name='Only', objects=[], background={'type': 'color', 'value': '#123456'})]
        )
        self.assertEqual(set(doc.keys()), {'schemaVersion', 'width', 'height', 'background', 'pages'})
        self.assertEqual(set(doc['pages'][0].keys()), {'id', 'name', 'objects', 'background'})
