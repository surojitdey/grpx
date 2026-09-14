"""
Health check views
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db import connection
from django.core.cache import cache


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    """
    Health check endpoint
    
    Checks:
    - Database connectivity
    - Cache connectivity
    - API availability
    """
    checks = {
        'api': True,
        'database': False,
        'cache': False,
    }
    
    # Check database
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks['database'] = True
    except Exception as e:
        checks['database'] = False
    
    # Check cache
    try:
        cache.set('health_check', 'ok', 1)
        cache.get('health_check')
        checks['cache'] = True
    except Exception as e:
        checks['cache'] = False
    
    overall_healthy = all(checks.values())
    
    return Response(
        {
            'status': 'healthy' if overall_healthy else 'degraded',
            'checks': checks
        },
        status=status.HTTP_200_OK if overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    )
