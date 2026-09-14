"""
URL configuration for designs app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter
from rest_framework_nested import routers

from .views import DesignViewSet, DesignPageViewSet

# Main router for designs
router = SimpleRouter()
router.register('', DesignViewSet, basename='design')

# Nested router for design pages
designs_router = routers.NestedSimpleRouter(router, '', lookup='design')
designs_router.register('pages', DesignPageViewSet, basename='design-page')

urlpatterns = [
    path('', include(router.urls)),
    path('', include(designs_router.urls)),
]
