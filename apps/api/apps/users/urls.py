"""
URL configuration for users app
"""

from django.urls import path, include
from rest_framework.routers import SimpleRouter

from .views import UserViewSet

router = SimpleRouter()
router.register('', UserViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
    path('register/', UserViewSet.as_view({'post': 'register'}), name='user-register'),
    path('login/', UserViewSet.as_view({'post': 'login'}), name='user-login'),
    path('me/', UserViewSet.as_view({'get': 'me'}), name='user-me'),
    path('update-profile/', UserViewSet.as_view({'patch': 'update_profile'}), name='user-update-profile'),
]
