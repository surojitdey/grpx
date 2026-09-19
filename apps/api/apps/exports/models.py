"""
Export models for managing design exports
"""

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ExportJob(models.Model):
    """
    Asynchronous export job
    """
    
    id = models.AutoField(primary_key=True)
    design = models.ForeignKey('designs.Design', on_delete=models.CASCADE, related_name='exports')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    
    # Export settings
    FORMAT_CHOICES = [
        ('png', 'PNG'),
        ('jpeg', 'JPEG'),
        ('pdf', 'PDF'),
    ]
    format = models.CharField(max_length=20, choices=FORMAT_CHOICES)
    quality = models.IntegerField(default=90)  # For JPEG/PNG
    
    # Pages to export
    page_range = models.CharField(max_length=100, default='all')  # 'all' or '1,3,5'
    
    # Status
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    
    # Result
    file_url = models.URLField(blank=True, default='')
    error_message = models.TextField(blank=True, default='')
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'export_jobs'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.design.name} - {self.format}"
