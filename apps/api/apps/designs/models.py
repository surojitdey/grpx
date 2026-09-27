"""
Design models - Core data models for designs
"""

import uuid

from django.db import models
from django.contrib.auth import get_user_model

from .documents import SCHEMA_VERSION, build_default_document

User = get_user_model()


def empty_dict():
    """Return empty dict for JSONField default"""
    return {}


class Design(models.Model):
    """
    Main design document

    The canonical design JSON (background + pages + objects) is the source
    of truth and lives entirely in `document`. Relational columns only hold
    queryable metadata.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='designs')

    name = models.CharField(max_length=255, default='Untitled Design')
    description = models.TextField(blank=True, default='')

    # Dimensions (kept in sync with document.width/height for querying)
    width = models.IntegerField(default=1080)
    height = models.IntegerField(default=1080)

    # Canonical design JSON - source of truth for background/pages/objects
    document = models.JSONField(default=build_default_document)
    schema_version = models.CharField(max_length=20, default=SCHEMA_VERSION)

    # Optimistic concurrency control for document saves
    revision = models.IntegerField(default=1)

    thumbnail_key = models.CharField(max_length=255, blank=True, default='')

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    is_template = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_opened_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'designs'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['owner', 'updated_at']),
            models.Index(fields=['owner', 'status']),
            models.Index(fields=['owner', 'is_deleted']),
        ]

    def __str__(self):
        return self.name


class DesignVersion(models.Model):
    """
    Version history for designs
    
    Keeps a complete copy of the design JSON at each save point
    for recovery and history viewing
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    design = models.ForeignKey(Design, on_delete=models.CASCADE, related_name='versions')
    
    version_number = models.IntegerField()
    
    # The complete design JSON at this version
    document = models.JSONField()
    
    # Who made this version
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    
    # What changed (optional)
    change_description = models.CharField(max_length=255, blank=True, default='')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'design_versions'
        ordering = ['-version_number']
        unique_together = ['design', 'version_number']
        indexes = [
            models.Index(fields=['design', 'version_number']),
        ]
    
    def __str__(self):
        return f"{self.design.name} v{self.version_number}"
