"""
URL configuration for design_platform API
"""

from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from apps.users.views import UserViewSet

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    
    # API Schema
    path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/v1/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/v1/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    
    # Authentication
    path('api/v1/auth/register/', UserViewSet.as_view({'post': 'register'}), name='auth-register'),
    path('api/v1/auth/login/', UserViewSet.as_view({'post': 'login'}), name='auth-login'),
    path('api/v1/auth/logout/', UserViewSet.as_view({'post': 'logout'}), name='auth-logout'),
    path('api/v1/auth/me/', UserViewSet.as_view({'get': 'me'}), name='auth-me'),
    path('api/v1/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Health check
    path('api/v1/health/', include('apps.health.urls')),
    
    # App URLs
    path('api/v1/users/', include('apps.users.urls')),
    path('api/v1/designs/', include('apps.designs.urls')),
    path('api/v1/assets/', include('apps.assets.urls')),
    path('api/v1/templates/', include('apps.templates.urls')),
    path('api/v1/exports/', include('apps.exports.urls')),
    path('api/v1/shared/', include('apps.sharing.urls')),
]
