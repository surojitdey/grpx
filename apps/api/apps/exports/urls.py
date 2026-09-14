"""
URL configuration for exports app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import ExportViewSet

router = SimpleRouter()
router.register('', ExportViewSet, basename='export')

urlpatterns = [
    path('', include(router.urls)),
]
