"""
Tests for IsDesignOwner permission
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.designs.models import Design
from apps.designs.permissions import IsDesignOwner

User = get_user_model()


class IsDesignOwnerTestCase(TestCase):

    def setUp(self):
        self.permission = IsDesignOwner()
        self.factory = APIRequestFactory()
        self.owner = User.objects.create_user(
            username='owner', email='owner@example.com', password='testpass123'
        )
        self.other = User.objects.create_user(
            username='other', email='other@example.com', password='testpass123'
        )
        self.design = Design.objects.create(owner=self.owner)

    def test_owner_has_object_permission(self):
        request = self.factory.get('/')
        request.user = self.owner
        self.assertTrue(self.permission.has_object_permission(request, None, self.design))

    def test_non_owner_denied_object_permission(self):
        request = self.factory.get('/')
        request.user = self.other
        self.assertFalse(self.permission.has_object_permission(request, None, self.design))
