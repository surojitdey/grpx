"""
URL configuration for designs app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import DesignViewSet

router = SimpleRouter()
router.register('', DesignViewSet, basename='design')

urlpatterns = [
    path('', include(router.urls)),
]
