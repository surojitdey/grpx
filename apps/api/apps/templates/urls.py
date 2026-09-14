"""
URL configuration for templates app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import TemplateViewSet

router = SimpleRouter()
router.register('', TemplateViewSet, basename='template')

urlpatterns = [
    path('', include(router.urls)),
]
