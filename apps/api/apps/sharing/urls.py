"""
URL configuration for sharing app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import DesignShareViewSet, PublicShareViewSet

router = SimpleRouter()
router.register('', DesignShareViewSet, basename='design-share')

urlpatterns = [
    path('', include(router.urls)),
    path('public/<str:token>/', PublicShareViewSet.as_view({'get': 'retrieve'}), name='public-share'),
]
