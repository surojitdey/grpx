"""
URL configuration for assets app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import AssetViewSet

router = SimpleRouter()
router.register('', AssetViewSet, basename='asset')

urlpatterns = [
    path('', include(router.urls)),
]
