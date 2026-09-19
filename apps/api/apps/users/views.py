"""
User views and viewsets for the API
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import (
    UserSerializer,
    UserRegisterSerializer,
    UserLoginSerializer,
    UserUpdateSerializer
)


class UserViewSet(viewsets.ModelViewSet):
    """
    User management endpoints
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
    
    def get_object(self):
        """Return the current authenticated user"""
        return self.request.user
    
    def get_permissions(self):
        """Allow unauthenticated access to register endpoint"""
        if self.action == 'register' or self.action == 'login':
            return [AllowAny()]
        return super().get_permissions()
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny()])
    def register(self, request):
        """
        Register a new user
        
        POST /api/v1/auth/register/
        {
            "email": "user@example.com",
            "username": "username",
            "first_name": "John",
            "last_name": "Doe",
            "password": "securepassword123",
            "password_confirm": "securepassword123"
        }
        """
        serializer = UserRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        return Response(
            {
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny()])
    def login(self, request):
        """
        Login user and return JWT tokens
        
        POST /api/v1/auth/login/
        {
            "email": "user@example.com",
            "password": "securepassword123"
        }
        """
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        
        return Response(
            {
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            },
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """
        Get current user profile
        
        GET /api/v1/users/me/
        """
        user = request.user
        return Response(UserSerializer(user).data)
    
    @action(detail=False, methods=['patch'], permission_classes=[IsAuthenticated])
    def update_profile(self, request):
        """
        Update current user profile
        
        PATCH /api/v1/users/update_profile/
        {
            "first_name": "John",
            "last_name": "Doe",
            "bio": "Designer",
            "avatar": "https://..."
        }
        """
        user = request.user
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data)
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        """
        Logout user (blacklist token on client side)
        
        POST /api/v1/auth/logout/
        """
        return Response(
            {'message': 'Successfully logged out'},
            status=status.HTTP_200_OK
        )
