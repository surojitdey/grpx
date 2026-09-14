"""
Sharing views
"""

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import DesignShare
from .serializers import DesignShareSerializer, DesignShareCreateSerializer
from apps.designs.models import Design
from apps.designs.serializers import DesignDetailSerializer


class DesignShareViewSet(viewsets.ModelViewSet):
    """
    Design sharing endpoints
    
    Create and manage public share links
    """
    
    serializer_class = DesignShareSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['post', 'get', 'delete', 'head', 'options']
    
    def get_queryset(self):
        """Only show shares for designs owned by the current user"""
        return DesignShare.objects.filter(design__owner=self.request.user)
    
    def create(self, request, *args, **kwargs):
        """
        Create a share link
        
        POST /api/v1/designs/{design_id}/shares/
        {
            "permission": "view",
            "expires_at": "2024-12-31T23:59:59Z"
        }
        """
        design_id = request.data.get('design_id')
        design = get_object_or_404(Design, id=design_id, owner=request.user)
        
        serializer = DesignShareCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        share = DesignShare.objects.create(
            design=design,
            creator=request.user,
            **serializer.validated_data
        )
        
        return Response(
            DesignShareSerializer(share).data,
            status=status.HTTP_201_CREATED
        )


class PublicShareViewSet(viewsets.ViewSet):
    """
    Public sharing endpoints (no authentication required)
    
    Allows public access to shared designs
    """
    
    permission_classes = [permissions.AllowAny]
    
    def retrieve(self, request, token=None):
        """
        Get a shared design by token
        
        GET /api/v1/shared/{token}/
        """
        share = get_object_or_404(DesignShare, token=token, is_active=True)
        
        # Check if share has expired
        if share.expires_at and share.expires_at < timezone.now():
            return Response(
                {'detail': 'Share link has expired'},
                status=status.HTTP_410_GONE
            )
        
        return Response({
            'design': DesignDetailSerializer(share.design).data,
            'permission': share.permission,
            'can_edit': share.permission == 'edit'
        })
