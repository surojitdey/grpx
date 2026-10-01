"""
Tests for the page-management endpoints (US-3.14 .. US-3.18)

POST   /api/v1/designs/{id}/pages/                          add a page
POST   /api/v1/designs/{id}/pages/{page_id}/duplicate/      clone a page
PATCH  /api/v1/designs/{id}/pages/{page_id}/                rename a page
DELETE /api/v1/designs/{id}/pages/{page_id}/                delete a page
POST   /api/v1/designs/{id}/pages/{page_id}/move/           reorder pages
"""

from apps.designs.models import Design, DesignVersion
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


def rectangle(obj_id, x=0, y=0):
    """Canonical rectangle object — valid under validate_document."""
    return {"id": obj_id, "type": "rectangle", "x": x, "y": y, "width": 10, "height": 10}


def multi_page_document():
    """A three-page document; page 2 carries a group referencing two objects."""
    return {
        "schemaVersion": "1.0",
        "width": 1080,
        "height": 1080,
        "background": {"type": "color", "value": "#FFFFFF"},
        "pages": [
            {"id": "page-1", "name": "Cover", "objects": [rectangle("obj-1")]},
            {
                "id": "page-2",
                "name": "Product Details",
                "objects": [
                    rectangle("obj-2"),
                    rectangle("obj-3"),
                    {
                        "id": "group-1",
                        "type": "group",
                        "x": 0,
                        "y": 0,
                        "width": 20,
                        "height": 20,
                        "children": ["obj-2", "obj-3"],
                    },
                ],
            },
            {"id": "page-3", "name": "Summary", "objects": []},
        ],
    }


class PageEndpointTestCase(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="testpass123"
        )
        self.other_user = User.objects.create_user(
            username="other", email="other@example.com", password="testpass123"
        )
        self.design = Design.objects.create(
            owner=self.user, name="Test Design", document=multi_page_document()
        )
        self.other_design = Design.objects.create(
            owner=self.other_user, name="Other Design", document=multi_page_document()
        )
        self.token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token.access_token}")

        self.base = f"/api/v1/designs/{self.design.id}"
        self.pages_url = f"{self.base}/pages/"

    def page_url(self, page_id):
        return f"{self.base}/pages/{page_id}/"

    def document(self):
        self.design.refresh_from_db()
        return self.design.document

    def page_ids(self):
        return [page["id"] for page in self.document()["pages"]]

    def get_page(self, page_id):
        for page in self.document()["pages"]:
            if page["id"] == page_id:
                return page
        return None

    # -- US-3.14 add page ----------------------------------------------------

    def test_add_page_returns_stable_id(self):
        response = self.client.post(self.pages_url, {"name": "Back Cover"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        page_id = response.data["page_id"]
        self.assertTrue(isinstance(page_id, str) and page_id)

        # The id survives on screen: a fresh read returns the same page.
        pages = self.document()["pages"]
        self.assertEqual(len(pages), 4)
        self.assertEqual(pages[-1]["id"], page_id)
        self.assertEqual(pages[-1]["name"], "Back Cover")
        self.assertEqual(pages[-1]["objects"], [])

        listed = self.client.get(f"{self.base}/").data["document"]["pages"]
        self.assertEqual(listed[-1]["id"], page_id)

    def test_add_page_defaults_the_name_to_page_number(self):
        response = self.client.post(self.pages_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.get_page(response.data["page_id"])["name"], "Page 4")

    def test_add_page_appends_and_bumps_revision_with_snapshot(self):
        self.assertEqual(self.design.revision, 1)

        response = self.client.post(self.pages_url, {"name": "Appendix"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["revision"], 2)
        self.assertEqual(
            [page["id"] for page in response.data["document"]["pages"]], self.page_ids()
        )
        self.assertEqual(self.design.revision, 2)

        version = DesignVersion.objects.get(design=self.design)
        self.assertEqual(version.version_number, 2)
        self.assertEqual(version.document, self.document())

    def test_add_page_blank_name_rejected(self):
        response = self.client.post(self.pages_url, {"name": "   "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(self.document()["pages"]), 3)
        self.assertEqual(self.design.revision, 1)

    # -- US-3.15 duplicate page ---------------------------------------------

    def test_duplicate_page_creates_fresh_page_and_object_ids(self):
        response = self.client.post(f"{self.base}/pages/page-2/duplicate/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        copied_id = response.data["page_id"]
        self.assertNotEqual(copied_id, "page-2")

        # Inserted directly after the original.
        self.assertEqual(
            self.page_ids(),
            ["page-1", "page-2", copied_id, "page-3"],
        )

        copied = self.get_page(copied_id)
        source = self.get_page("page-2")
        self.assertEqual(copied["name"], source["name"])

        source_object_ids = [obj["id"] for obj in source["objects"]]
        copied_object_ids = [obj["id"] for obj in copied["objects"]]
        self.assertEqual(len(copied_object_ids), len(source_object_ids))
        self.assertTrue(set(copied_object_ids).isdisjoint(source_object_ids))

        # Group children were rewritten to the cloned objects, not left
        # pointing at the source page's ids.
        copied_group = [obj for obj in copied["objects"] if obj["type"] == "group"][0]
        copied_children = [obj["id"] for obj in copied["objects"] if obj["type"] != "group"]
        self.assertEqual(sorted(copied_group["children"]), sorted(copied_children))
        for child in copied_group["children"]:
            self.assertNotIn(child, source_object_ids)

    def test_duplicate_first_page_inserts_after_source(self):
        response = self.client.post(f"{self.base}/pages/page-1/duplicate/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.page_ids(),
            ["page-1", response.data["page_id"], "page-2", "page-3"],
        )

    def test_duplicate_unknown_page_404(self):
        response = self.client.post(f"{self.base}/pages/nope/duplicate/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(len(self.document()["pages"]), 3)

    # -- US-3.16 delete page -------------------------------------------------

    def test_delete_page_removes_only_that_page(self):
        response = self.client.delete(self.page_url("page-2"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["page_id"], "page-2")
        self.assertEqual(self.page_ids(), ["page-1", "page-3"])

    def test_delete_last_page_is_refused(self):
        self.client.delete(self.page_url("page-2"))
        self.client.delete(self.page_url("page-3"))

        response = self.client.delete(self.page_url("page-1"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("at least one page", str(response.data))
        self.assertEqual(self.page_ids(), ["page-1"])
        # The refused delete wrote nothing: only the two successful deletes
        # (revisions 2 and 3) produced a new revision or a snapshot.
        self.assertEqual(self.design.revision, 3)
        self.assertEqual(DesignVersion.objects.filter(design=self.design).count(), 2)

    def test_delete_unknown_page_404(self):
        response = self.client.delete(self.page_url("missing-page"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(len(self.document()["pages"]), 3)

    # -- US-3.17 rename page -------------------------------------------------

    def test_rename_page(self):
        response = self.client.patch(
            self.page_url("page-1"), {"name": "Front Cover"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["page_id"], "page-1")
        self.assertEqual(self.get_page("page-1")["name"], "Front Cover")

    def test_rename_accepts_free_form_names(self):
        for name in ["Cover", "Product Details", "Summary"]:
            with self.subTest(name=name):
                response = self.client.patch(self.page_url("page-3"), {"name": name}, format="json")
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(self.get_page("page-3")["name"], name)

    def test_rename_keeps_objects_and_other_pages(self):
        before = self.document()
        self.client.patch(self.page_url("page-2"), {"name": "Renamed"}, format="json")

        after = self.document()
        self.assertEqual(after["pages"][1]["objects"], before["pages"][1]["objects"])
        self.assertEqual(after["pages"][0], before["pages"][0])
        self.assertEqual(after["pages"][2], before["pages"][2])

    def test_rename_requires_a_name(self):
        response = self.client.patch(self.page_url("page-1"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.get_page("page-1")["name"], "Cover")

    def test_rename_blank_name_rejected(self):
        response = self.client.patch(self.page_url("page-1"), {"name": " "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.get_page("page-1")["name"], "Cover")

    def test_rename_unknown_page_404(self):
        response = self.client.patch(self.page_url("missing"), {"name": "X"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # -- US-3.18 reorder pages -----------------------------------------------

    def test_move_page_up_and_down(self):
        response = self.client.post(
            f"{self.base}/pages/page-3/move/", {"direction": "up"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.page_ids(), ["page-1", "page-3", "page-2"])

        response = self.client.post(
            f"{self.base}/pages/page-3/move/", {"direction": "down"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.page_ids(), ["page-1", "page-2", "page-3"])

    def test_move_page_to_explicit_index_for_drag_and_drop(self):
        response = self.client.post(f"{self.base}/pages/page-1/move/", {"index": 2}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.page_ids(), ["page-2", "page-3", "page-1"])

    def test_move_page_backwards_by_index(self):
        response = self.client.post(f"{self.base}/pages/page-3/move/", {"index": 0}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.page_ids(), ["page-3", "page-1", "page-2"])

    def test_move_page_to_its_own_index_is_a_no_op(self):
        response = self.client.post(f"{self.base}/pages/page-2/move/", {"index": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.page_ids(), ["page-1", "page-2", "page-3"])

    def test_move_first_page_up_is_refused(self):
        response = self.client.post(
            f"{self.base}/pages/page-1/move/", {"direction": "up"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already first", str(response.data))
        self.assertEqual(self.page_ids(), ["page-1", "page-2", "page-3"])
        self.assertEqual(self.design.revision, 1)

    def test_move_last_page_down_is_refused(self):
        response = self.client.post(
            f"{self.base}/pages/page-3/move/", {"direction": "down"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already last", str(response.data))

    def test_move_index_out_of_range_refused(self):
        response = self.client.post(f"{self.base}/pages/page-1/move/", {"index": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("out of range", str(response.data))

    def test_move_requires_exactly_one_of_index_or_direction(self):
        for body in [{}, {"index": 1, "direction": "up"}]:
            with self.subTest(body=body):
                response = self.client.post(f"{self.base}/pages/page-1/move/", body, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(self.page_ids(), ["page-1", "page-2", "page-3"])

    def test_move_unknown_page_404(self):
        response = self.client.post(
            f"{self.base}/pages/missing/move/", {"direction": "up"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_reorder_preserves_page_content(self):
        before = {page["id"]: page["objects"] for page in self.document()["pages"]}
        self.client.post(f"{self.base}/pages/page-1/move/", {"index": 2}, format="json")
        after = {page["id"]: page["objects"] for page in self.document()["pages"]}
        self.assertEqual(after, before)

    # -- shared behaviour ----------------------------------------------------

    def test_every_operation_records_a_version_snapshot(self):
        self.client.post(self.pages_url, {"name": "Added"}, format="json")  # rev 2
        self.client.post(f"{self.base}/pages/page-1/duplicate/", {}, format="json")  # rev 3
        self.client.patch(self.page_url("page-2"), {"name": "Renamed"}, format="json")  # rev 4
        self.client.post(
            f"{self.base}/pages/page-3/move/", {"direction": "up"}, format="json"
        )  # rev 5
        self.client.delete(self.page_url("page-2"))  # rev 6
        self.document()  # refresh

        self.assertEqual(self.design.revision, 6)
        self.assertEqual(
            list(
                DesignVersion.objects.filter(design=self.design)
                .order_by("version_number")
                .values_list("version_number", flat=True)
            ),
            [2, 3, 4, 5, 6],
        )

    def test_stale_revision_is_conflicting_and_writes_nothing(self):
        response = self.client.post(
            self.pages_url, {"name": "Stale", "revision": 99}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["server_revision"], 1)
        self.assertEqual(response.data["current_document"], self.design.document)
        self.assertEqual(len(self.document()["pages"]), 3)
        self.assertEqual(self.design.revision, 1)
        self.assertEqual(DesignVersion.objects.filter(design=self.design).count(), 0)

    def test_matching_revision_succeeds(self):
        response = self.client.post(
            self.pages_url, {"name": "Tracked", "revision": 1}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["revision"], 2)

    def test_stale_revision_on_delete_via_query_param(self):
        response = self.client.delete(f"{self.page_url('page-1')}?revision=99")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.page_ids(), ["page-1", "page-2", "page-3"])

    def test_non_owner_cannot_manage_pages(self):
        other_base = f"/api/v1/designs/{self.other_design.id}"
        calls = [
            self.client.post(f"{other_base}/pages/", {}, format="json"),
            self.client.post(f"{other_base}/pages/page-1/duplicate/", {}, format="json"),
            self.client.patch(f"{other_base}/pages/page-1/", {"name": "X"}, format="json"),
            self.client.delete(f"{other_base}/pages/page-1/"),
            self.client.post(
                f"{other_base}/pages/page-1/move/", {"direction": "up"}, format="json"
            ),
        ]
        for response in calls:
            with self.subTest(url=response.request["PATH_INFO"]):
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.other_design.revision, 1)

    def test_pages_require_authentication(self):
        self.client.credentials()
        response = self.client.post(self.pages_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
