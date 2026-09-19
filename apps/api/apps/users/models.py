"""
User models for design_platform
"""

from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """
    Custom User model extending Django's AbstractUser
    """
    email = models.EmailField(unique=True)
    bio = models.TextField(blank=True, default='')
    avatar = models.URLField(blank=True, default='')
    
    # Account management
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']
    
    class Meta:
        db_table = 'users'
        ordering = ['-date_joined']
    
    def __str__(self):
        return self.email
    
    def get_full_name(self):
        """Return the user's full name"""
        return f'{self.first_name} {self.last_name}'.strip() or self.email
    
    def get_short_name(self):
        """Return the user's short name"""
        return self.first_name or self.email
