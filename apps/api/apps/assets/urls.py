"""
URL configuration for assets app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import AssetViewSet

router = SimpleRouter()
# Register viewset with an empty prefix for /assets/ and /assets/{id}/.
# When included at 'api/v1/assets/', this becomes the full path
router.register(r'', AssetViewSet, basename='asset')

urlpatterns = [
    # Custom direct upload endpoint (must come before router patterns)
    path(
        'direct-upload/',
        AssetViewSet.as_view({'post': 'direct_upload'}),
        name='asset-direct-upload',
    ),
    path(
        'upload-url',
        AssetViewSet.as_view({'post': 'upload_url'}),
        name='asset-upload-url-no-slash',
    ),
    # Include router URLs
    path('', include(router.urls)),
]
