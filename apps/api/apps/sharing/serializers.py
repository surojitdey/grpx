"""
Sharing serializers
"""

from rest_framework import serializers
from .models import DesignShare


class DesignShareSerializer(serializers.ModelSerializer):
    """Share link serializer"""
    
    share_url = serializers.SerializerMethodField()
    
    class Meta:
        model = DesignShare
        fields = ['id', 'token', 'permission', 'is_active', 'expires_at', 'share_url', 'created_at']
        read_only_fields = ['id', 'token', 'created_at']
    
    def get_share_url(self, obj):
        """Generate the full share URL"""
        return f"/shared/{obj.token}"


class DesignShareCreateSerializer(serializers.ModelSerializer):
    """Create share link serializer"""
    
    class Meta:
        model = DesignShare
        fields = ['permission', 'expires_at']
