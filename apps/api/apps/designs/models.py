"""
Design models - Core data models for designs
"""

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


def empty_dict():
    """Return empty dict for JSONField default"""
    return {}


class Design(models.Model):
    """
    Main design document
    
    Each design contains one or more pages.
    The document itself (design JSON) is stored in pages.
    """
    
    id = models.AutoField(primary_key=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='designs')
    
    name = models.CharField(max_length=255, default='Untitled Design')
    description = models.TextField(blank=True, default='')
    
    # Dimensions
    width = models.IntegerField(default=1080)
    height = models.IntegerField(default=1080)
    
    # Status
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Versioning
    current_version = models.IntegerField(default=1)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'designs'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['owner', 'status']),
            models.Index(fields=['owner', 'updated_at']),
        ]
    
    def __str__(self):
        return self.name


class DesignPage(models.Model):
    """
    A page within a design
    
    Contains the JSONB document (objects) for that page
    """
    
    id = models.AutoField(primary_key=True)
    design = models.ForeignKey(Design, on_delete=models.CASCADE, related_name='pages')
    
    # Page info
    page_number = models.IntegerField()
    name = models.CharField(max_length=255, default='')
    
    # The actual design document (JSONB)
    # Structure: {
    #   "objects": [...],
    #   "background": {...}
    # }
    document = models.JSONField(default=empty_dict)
    
    # Version tracking
    version = models.IntegerField(default=1)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'design_pages'
        ordering = ['page_number']
        unique_together = ['design', 'page_number']
        indexes = [
            models.Index(fields=['design', 'page_number']),
        ]
    
    def __str__(self):
        return f"{self.design.name} - Page {self.page_number}"


class DesignVersion(models.Model):
    """
    Version history for designs
    
    Keeps a complete copy of the design JSON at each save point
    for recovery and history viewing
    """
    
    id = models.AutoField(primary_key=True)
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
