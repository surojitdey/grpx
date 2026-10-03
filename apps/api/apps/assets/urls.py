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
    path(
        '<uuid:pk>/complete',
        AssetViewSet.as_view({'post': 'complete'}),
        name='asset-complete-no-slash',
    ),
    path(
        'upload-url/',
        AssetViewSet.as_view({'post': 'upload_url'}),
        name='asset-upload-url-no-slash',
    ),
    # Include router URLs
    path('', include(router.urls)),
]
