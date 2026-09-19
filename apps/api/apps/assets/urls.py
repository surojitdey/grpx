"""
URL configuration for assets app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import AssetViewSet

router = SimpleRouter()
# Register viewset - the empty prefix means routes are /assets/, /assets/{id}/, etc
# When included at 'api/v1/assets/', this becomes the full path
router.register(r'', AssetViewSet, basename='asset')

urlpatterns = [
    # Custom direct upload endpoint (must come before router patterns)
    path('direct-upload/', AssetViewSet.as_view({'post': 'direct_upload'}), name='asset-direct-upload'),
    # Include router URLs
    path('', include(router.urls)),
]
