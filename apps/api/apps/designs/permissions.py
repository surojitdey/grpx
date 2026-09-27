"""
Permissions for designs app
"""

from rest_framework.permissions import BasePermission


class IsDesignOwner(BasePermission):
    """Only the owner of a design can view, modify, or delete it"""

    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user
