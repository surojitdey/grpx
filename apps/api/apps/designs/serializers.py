"""
Design serializers
"""

from rest_framework import serializers
from .models import Design, DesignPage, DesignVersion


class DesignPageSerializer(serializers.ModelSerializer):
    """Serializer for design pages"""
    
    class Meta:
        model = DesignPage
        fields = ['id', 'page_number', 'name', 'document', 'version', 'created_at', 'updated_at']
        read_only_fields = ['id', 'version', 'created_at', 'updated_at']


class DesignListSerializer(serializers.ModelSerializer):
    """Serializer for design list view"""
    
    class Meta:
        model = Design
        fields = ['id', 'name', 'description', 'width', 'height', 'status', 'current_version', 'created_at', 'updated_at']
        read_only_fields = ['id', 'current_version', 'created_at', 'updated_at']


class DesignDetailSerializer(serializers.ModelSerializer):
    """Serializer for design detail view with pages"""
    
    pages = DesignPageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Design
        fields = ['id', 'name', 'description', 'width', 'height', 'status', 'current_version', 'pages', 'created_at', 'updated_at']
        read_only_fields = ['id', 'current_version', 'pages', 'created_at', 'updated_at']


class DesignCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating designs"""
    
    class Meta:
        model = Design
        fields = ['name', 'description', 'width', 'height', 'status']
    
    def create(self, validated_data):
        """Create a design with an initial page"""
        # Owner is set in perform_create, so just use validated_data
        design = Design.objects.create(**validated_data)
        
        # Create initial page
        DesignPage.objects.create(
            design=design,
            page_number=1,
            name='Page 1',
            document={
                'objects': [],
                'background': {
                    'type': 'color',
                    'value': '#FFFFFF'
                }
            }
        )
        
        return design


class DesignUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating designs"""
    
    class Meta:
        model = Design
        fields = ['name', 'description', 'status']


class DesignVersionSerializer(serializers.ModelSerializer):
    """Serializer for design versions"""
    
    class Meta:
        model = DesignVersion
        fields = ['id', 'version_number', 'change_description', 'created_by', 'created_at']
        read_only_fields = fields
