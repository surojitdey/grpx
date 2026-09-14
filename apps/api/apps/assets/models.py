"""
Asset models for image management
"""

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Asset(models.Model):
    """
    User-uploaded image asset
    """
    
    id = models.AutoField(primary_key=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='assets')
    
    # Asset info
    name = models.CharField(max_length=255)
    TYPE_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]
    asset_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='image')
    
    # S3 storage
    storage_key = models.CharField(max_length=255, unique=True)
    url = models.URLField()
    thumbnail_url = models.URLField(blank=True, default='')
    
    # File info
    mime_type = models.CharField(max_length=50)
    file_size = models.BigIntegerField()
    
    # Image metadata
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'assets'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['owner', 'created_at']),
        ]
    
    def __str__(self):
        return self.name


class AssetUsage(models.Model):
    """
    Track which designs use which assets
    """
    
    id = models.AutoField(primary_key=True)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='usage')
    design = models.ForeignKey('designs.Design', on_delete=models.CASCADE)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'asset_usage'
        unique_together = ['asset', 'design']
