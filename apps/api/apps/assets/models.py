"""
Asset models for image management
"""

import uuid

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Asset(models.Model):
    """
    User-uploaded image asset
    """

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PROCESSING', 'Processing'),
        ('READY', 'Ready'),
        ('FAILED', 'Failed'),
        ('DELETED', 'Deleted'),
    ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='assets',
    )

    filename = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=50)
    size = models.BigIntegerField()
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    storage_key = models.CharField(max_length=255, unique=True)
    thumbnail_key = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='PENDING',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'assets'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['owner', 'created_at']),
        ]

    def __str__(self):
        return self.original_filename


class AssetUsage(models.Model):
    """
    Track which designs use which assets
    """

    id = models.AutoField(primary_key=True)
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name='usage',
    )
    design = models.ForeignKey('designs.Design', on_delete=models.CASCADE)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'asset_usage'
        unique_together = ['asset', 'design']
