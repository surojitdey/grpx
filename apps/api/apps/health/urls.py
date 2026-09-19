"""
URL configuration for health app
"""

from django.urls import path
from . import views

urlpatterns = [
    path('', views.health, name='health'),
]
