"""
Sharing models for public sharing
"""

import secrets
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


def generate_share_token():
    """Generate a secure share token"""
    return secrets.token_urlsafe(24)


class DesignShare(models.Model):
    """
    Public share link for a design
    """
    
    id = models.AutoField(primary_key=True)
    design = models.ForeignKey('designs.Design', on_delete=models.CASCADE, related_name='shares')
    creator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Secure token for public access
    token = models.CharField(max_length=32, unique=True, default=generate_share_token)
    
    # Permissions
    PERMISSION_CHOICES = [
        ('view', 'View Only'),
        ('edit', 'Can Edit'),
    ]
    permission = models.CharField(max_length=20, choices=PERMISSION_CHOICES, default='view')
    
    # Access control
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'design_shares'
        ordering = ['-created_at']
        unique_together = ['design', 'token']
    
    def __str__(self):
        return f"Share: {self.design.name}"
