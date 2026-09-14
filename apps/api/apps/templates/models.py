"""
Template models
"""

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Template(models.Model):
    """
    Design template for users to start from
    """
    
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    
    CATEGORY_CHOICES = [
        ('social_media', 'Social Media'),
        ('marketing', 'Marketing'),
        ('presentation', 'Presentation'),
        ('poster', 'Poster'),
        ('flyer', 'Flyer'),
        ('business', 'Business'),
    ]
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    
    # Preview
    preview_url = models.URLField(blank=True, default='')
    
    # Template design JSON
    document = models.JSONField()
    
    # Visibility
    is_public = models.BooleanField(default=True)
    
    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'templates'
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name
