"""
Tests for PUT /api/v1/designs/{id}/document/
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.designs.documents import build_default_document
from apps.designs.models import Design, DesignVersion
from apps.designs.views import DesignViewSet

User = get_user_model()


class DesignDocumentEndpointTestCase(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.other_user = User.objects.create_user(
            username='other', email='other@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.user, name='Test Design')
        self.other_design = Design.objects.create(owner=self.other_user, name='Other Design')
        self.token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token.access_token}')

        self.url = f'/api/v1/designs/{self.design.id}/document/'
        self.valid_document = build_default_document()
        self.valid_document['pages'][0]['objects'] = [
            {'id': 'obj-1', 'type': 'rectangle', 'x': 1, 'y': 2, 'width': 30, 'height': 40},
        ]

    def valid_payload(self, revision=1, document=None):
        return {
            'document': document if document is not None else self.valid_document,
            'revision': revision,
        }

    # -- authorization ------------------------------------------------------

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.put(self.url, self.valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_owner_gets_404(self):
        response = self.client.put(
            f'/api/v1/designs/{self.other_design.id}/document/',
            self.valid_payload(),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # -- happy path ---------------------------------------------------------

    def test_put_document_succeeds_and_persists(self):
        response = self.client.put(self.url, self.valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['revision'], 2)

        self.design.refresh_from_db()
        self.assertEqual(self.design.document, self.valid_document)
        self.assertEqual(self.design.revision, 2)

    def test_put_document_records_version_snapshot(self):
        self.client.put(self.url, self.valid_payload(), format='json')
        self.design.refresh_from_db()
        version = DesignVersion.objects.get(design=self.design)
        self.assertEqual(version.version_number, 2)
        self.assertEqual(version.document, self.valid_document)
        self.assertEqual(version.created_by, self.user)

    # -- schema validation --------------------------------------------------

    def test_missing_document_or_revision_rejected(self):
        response = self.client.put(self.url, {'document': self.valid_document}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.put(self.url, {'revision': 1}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_document_rejected_unchanged(self):
        broken = build_default_document()
        broken['pages'][0]['objects'] = [{'id': 'x', 'type': 'triangle'}]
        response = self.client.put(self.url, self.valid_payload(document=broken), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('document', response.data)

        self.design.refresh_from_db()
        self.assertNotEqual(self.design.document, broken)

    def test_non_dict_document_rejected(self):
        response = self.client.put(self.url, self.valid_payload(document=[1, 2]), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_error_message_includes_path(self):
        broken = self.valid_document.copy()
        broken['pages'][0]['objects'][0]['width'] = 0
        response = self.client.put(self.url, self.valid_payload(document=broken), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pages[0].objects[0]', str(response.data))

    # -- schema version -----------------------------------------------------

    def test_wrong_schema_version_rejected(self):
        doc = build_default_document()
        doc['schemaVersion'] = '0.9'
        response = self.client.put(self.url, self.valid_payload(document=doc), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('schemaVersion', str(response.data))

    # -- revision / optimistic concurrency ----------------------------------

    def test_stale_revision_conflicts(self):
        response = self.client.put(self.url, self.valid_payload(revision=99), format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('revision', response.data)

        self.design.refresh_from_db()
        self.assertEqual(self.design.revision, 1)

    def test_conflict_response_carries_server_state_and_preserves_document(self):
        """A 409 must not only refuse the write: it hands the client the
        server's authoritative revision and document so the client can let
        the user resolve the conflict without losing either version, and the
        stored document must be left untouched."""
        # Server is at revision 1 with the untouched default document.
        original_document = self.design.document

        stale_payload = self.valid_payload(revision=99)
        stale_payload['document']['pages'][0]['objects'][0]['id'] = 'stale-obj'
        response = self.client.put(self.url, stale_payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Server's authoritative state for client-side conflict resolution
        self.assertEqual(response.data['server_revision'], 1)
        self.assertEqual(response.data['current_document'], original_document)
        self.assertIn('client sent 99', response.data['detail'])

        # Neither version was silently overwritten: stored document unchanged,
        # no new version snapshot recorded.
        self.design.refresh_from_db()
        self.assertEqual(self.design.document, original_document)
        self.assertEqual(self.design.revision, 1)
        self.assertEqual(self.design.versions.count(), 0)

    def test_conflict_response_reports_state_committed_after_load(self):
        """Comment 1: a save landing between get_object() and the conflict
        response must be reflected in the 409 — the client must never be
        handed an outdated server_revision/current_document to display or
        adopt. The revision check and the response state are read together
        under the row lock."""
        competing_doc = build_default_document()
        competing_doc['pages'][0]['objects'] = [
            {'id': 'obj-raced', 'type': 'circle', 'x': 5, 'y': 5, 'width': 15, 'height': 15},
        ]

        original_get_object = DesignViewSet.get_object
        state = {'ran': False}

        def racing_get_object(viewset):
            """One-shot hook: land a concurrent save after this request has
            loaded the design but before it builds the conflict response —
            the window an unlocked read cannot see."""
            obj = original_get_object(viewset)
            if not state['ran']:
                state['ran'] = True
                racing_client = APIClient()
                racing_client.credentials(
                    HTTP_AUTHORIZATION=f'Bearer {self.token.access_token}'
                )
                competing = racing_client.put(
                    self.url,
                    self.valid_payload(revision=1, document=competing_doc),
                    format='json',
                )
                self.assertEqual(competing.status_code, status.HTTP_200_OK)
                self.assertEqual(competing.data['revision'], 2)
            return obj

        DesignViewSet.get_object = racing_get_object
        try:
            response = self.client.put(self.url, self.valid_payload(revision=99), format='json')
        finally:
            DesignViewSet.get_object = original_get_object

        # The 409 carries the authoritative state, including the raced commit.
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['server_revision'], 2)
        self.assertEqual(response.data['current_document'], competing_doc)
        self.assertIn('server has 2', response.data['detail'])

        # The raced save wins cleanly; the stale write changed nothing.
        self.design.refresh_from_db()
        self.assertEqual(self.design.revision, 2)
        self.assertEqual(self.design.document, competing_doc)
        self.assertEqual(self.design.versions.count(), 1)

    def test_second_write_with_old_revision_conflicts(self):
        first = self.client.put(self.url, self.valid_payload(), format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.put(
            self.url, self.valid_payload(revision=1, document=build_default_document()), format='json'
        )
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)

    def test_sequential_writes_with_current_revision_succeed(self):
        first = self.client.put(self.url, self.valid_payload(), format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second_doc = build_default_document()
        second_doc['pages'][0]['objects'] = []
        second = self.client.put(self.url, self.valid_payload(revision=2, document=second_doc), format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['revision'], 3)

        self.design.refresh_from_db()
        self.assertEqual(self.design.versions.count(), 2)

    def test_deleted_design_document_not_writable(self):
        self.client.delete(f'/api/v1/designs/{self.design.id}/')
        response = self.client.put(self.url, self.valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_revision_zero_rejected_by_serializer(self):
        response = self.client.put(self.url, self.valid_payload(revision=0), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -- dimensions kept in sync ---------------------------------------------

    def test_put_document_syncs_relational_dimensions(self):
        """Comment 2: document.width/height changes must update Design.width/height
        so later reads and client serialization don't revert them."""
        doc = build_default_document(width=800, height=600)
        doc['pages'][0]['objects'] = self.valid_document['pages'][0]['objects']

        response = self.client.put(self.url, self.valid_payload(document=doc), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.design.refresh_from_db()
        self.assertEqual(self.design.width, 800)
        self.assertEqual(self.design.height, 600)
        self.assertEqual(self.design.document['width'], 800)
        self.assertEqual(self.design.document['height'], 600)

    def test_put_document_with_unchanged_dimensions_keeps_them(self):
        doc = build_default_document(width=1080, height=1080)
        doc['pages'][0]['objects'] = self.valid_document['pages'][0]['objects']
        response = self.client.put(self.url, self.valid_payload(document=doc), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.design.refresh_from_db()
        self.assertEqual(self.design.width, 1080)
        self.assertEqual(self.design.height, 1080)

    # -- concurrent revision race ---------------------------------------------

    def test_concurrent_saves_with_same_revision_serialize(self):
        """Comment 1: a revision committed between the view's unlocked read and
        its locked re-check must lose the write with a clean 409 instead of
        racing to a duplicate version_number IntegrityError."""
        doc_a = build_default_document()
        doc_a['pages'][0]['objects'] = [
            {'id': 'obj-a', 'type': 'rectangle', 'x': 1, 'y': 1, 'width': 10, 'height': 10},
        ]
        doc_b = build_default_document()
        doc_b['pages'][0]['objects'] = [
            {'id': 'obj-b', 'type': 'circle', 'x': 2, 'y': 2, 'width': 20, 'height': 20},
        ]

        manager = Design.objects
        original_select_for_update = manager.select_for_update
        state = {'competing_ran': False}

        def racing_select_for_update(*args, **kwargs):
            """One-shot hook on the view's locked re-read: before it executes,
            land the competing autosave (same client revision) — the race window
            an unlocked read cannot see."""
            if not state['competing_ran']:
                state['competing_ran'] = True
                competing_client = APIClient()
                competing_client.credentials(
                    HTTP_AUTHORIZATION=f'Bearer {self.token.access_token}'
                )
                competing = competing_client.put(
                    self.url, self.valid_payload(document=doc_b), format='json'
                )
                # The competing write wins cleanly; no IntegrityError raised.
                self.assertEqual(competing.status_code, status.HTTP_200_OK)
                self.assertEqual(competing.data['revision'], 2)
            return original_select_for_update(*args, **kwargs)

        manager.select_for_update = racing_select_for_update
        try:
            first = self.client.put(self.url, self.valid_payload(document=doc_a), format='json')
        finally:
            manager.select_for_update = original_select_for_update

        # The first request re-reads the revision under the row lock, sees it
        # advanced, and gets a 409 instead of double-incrementing.
        self.assertEqual(first.status_code, status.HTTP_409_CONFLICT)

        self.design.refresh_from_db()
        self.assertEqual(self.design.revision, 2)
        self.assertEqual(self.design.document['pages'][0]['objects'][0]['id'], 'obj-b')
        # Exactly one version snapshot (no duplicate version_number row).
        self.assertEqual(self.design.versions.count(), 1)
        self.assertEqual(self.design.versions.get().document['pages'][0]['objects'][0]['id'], 'obj-b')
