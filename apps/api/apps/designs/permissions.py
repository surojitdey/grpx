"""
Permissions for designs app
"""

from rest_framework.permissions import BasePermission
from .models import Design


class IsDesignOwner(BasePermission):
    """
    Only the owner of a design can modify or delete it
    """
    
    def has_object_permission(self, request, view, obj):
        """Check if user is the owner of the design"""
        if isinstance(obj, Design):
            return obj.owner == request.user
        # If it's a page, check the design ownership
        return obj.design.owner == request.user
