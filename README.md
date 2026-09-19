# 🎨 Design Platform - Complete Visual Design Editor

A comprehensive, production-ready visual design platform built with modern web technologies. Create stunning designs with an intuitive editor, rich templates, and powerful features.

## ⚡ Quick Start

### Prerequisites

- Docker and Docker Compose (recommended)
- Or: Python 3.12+, Node.js 18+, PostgreSQL 15, Redis 7

### Option 1: Docker Compose (Recommended)

```bash
# Clone and setup
git clone <repo-url>
cd grpx

# Start all services
docker-compose up --build

# Services available at:
# - Frontend: http://localhost:3000
# - API: http://localhost:8000
# - Database: localhost:5432
# - Redis: localhost:6379
```

First time setup:
```bash
# In another terminal, create superuser
docker-compose exec api python manage.py createsuperuser
```

### Option 2: Local Development

#### Backend Setup

```bash
cd apps/api

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start server
python manage.py runserver
```

Access at: http://localhost:8000

#### Frontend Setup

```bash
cd apps/web

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local

# Start development server
npm run dev
```

Access at: http://localhost:3000

## 📁 Project Structure

```
grpx/
├── apps/
│   ├── api/                         # Django REST API backend
│   │   ├── apps/                    # Django app modules
│   │   │   ├── users/              # User authentication & profiles
│   │   │   ├── designs/            # Design CRUD operations
│   │   │   ├── assets/             # Image/file storage
│   │   │   ├── templates/          # Design templates
│   │   │   ├── exports/            # Export job processing
│   │   │   ├── sharing/            # Share links & access control
│   │   │   └── health/             # Health check endpoints
│   │   ├── config/                 # Django settings
│   │   ├── manage.py
│   │   └── requirements.txt         # Python dependencies
│   └── web/                         # Next.js frontend
│       ├── app/                     # Next.js app directory
│       │   ├── editor/             # Design editor page
│       │   ├── designs/            # Designs dashboard
│       │   ├── auth/               # Login/Register pages
│       │   ├── page.tsx            # Home page
│       │   └── layout.tsx          # Root layout
│       ├── components/              # Reusable React components
│       ├── stores/                 # Zustand state management
│       ├── services/               # API client & utilities
│       ├── types/                  # TypeScript type definitions
│       ├── utils/                  # Utility functions
│       ├── styles/                 # Tailwind CSS & globals
│       ├── package.json
│       └── tsconfig.json
├── infrastructure/                  # Docker & deployment
│   └── docker/
│       ├── Dockerfile.api
│       ├── Dockerfile.web
│       └── Dockerfile.worker
├── packages/
│   └── design-schema/              # Shared design format
│       ├── types.ts                # TypeScript types
│       ├── validation.ts           # Schema validation
│       └── index.ts
├── docker-compose.yml
└── README.md
```

## 🏗️ Architecture

### Technology Stack

**Backend**:
- Python 3.12.4
- Django 4.2.7 (LTS)
- Django REST Framework 3.15.0
- PostgreSQL 15
- Redis 7
- Celery 5.4.0

**Frontend**:
- Next.js 14
- React 18
- TypeScript
- Zustand 4.4.0
- Fabric.js 5.3.0
- Tailwind CSS 3.3.0
- Axios

### Backend Architecture

**Modular Monolith** with 6 independent Django apps:

1. **Users**: Authentication, profiles, preferences
2. **Designs**: Design CRUD, multi-page support, versioning
3. **Assets**: Image upload, storage, retrieval
4. **Templates**: Template library, categories
5. **Exports**: Export job processing (PNG, JPEG, PDF)
6. **Sharing**: Share links, permissions, access control

Each app has:
- `models.py` - Database models
- `serializers.py` - DRF serializers
- `views.py` - API endpoints
- `urls.py` - URL routing
- `permissions.py` - Access control (if needed)

### Frontend Architecture

**Component-based** with strict TypeScript:

- **Pages**: Home, Auth, Editor, Dashboard
- **Components**: Reusable UI primitives
- **Editor**: Specialized editing components
- **State**: Zustand store for editor state
- **Services**: API layer with 7 modules
- **Types**: Full TypeScript coverage

## 📊 Database Schema

```sql
-- Core tables

users (id, email, password, first_name, last_name, created_at)

designs (id, owner_id, name, width, height, status, created_at, updated_at)

design_pages (id, design_id, index, name, document[JSONB], created_at)

design_versions (id, design_id, version, document[JSONB], created_at)

assets (id, owner_id, filename, mime_type, size, s3_url, created_at)

templates (id, category, name, description, document[JSONB], created_at)

exports (id, design_id, format, status, file_url, error, created_at)

design_shares (id, design_id, token, permission_level, expiry, created_at)
```

## 🔌 API Endpoints

### Authentication
```
POST   /api/v1/auth/register/
POST   /api/v1/auth/login/
POST   /api/v1/auth/refresh/
```

### Designs
```
GET    /api/v1/designs/              # List designs
POST   /api/v1/designs/              # Create design
GET    /api/v1/designs/{id}/         # Get design
PUT    /api/v1/designs/{id}/         # Update design
DELETE /api/v1/designs/{id}/         # Delete design
```

### Pages
```
GET    /api/v1/designs/{id}/pages/   # List pages
POST   /api/v1/designs/{id}/pages/   # Add page
PUT    /api/v1/pages/{id}/           # Update page
DELETE /api/v1/pages/{id}/           # Delete page
```

### Assets
```
GET    /api/v1/assets/               # List assets
POST   /api/v1/assets/upload/        # Get upload URL
POST   /api/v1/assets/               # Create asset
```

### Exports
```
POST   /api/v1/exports/              # Create export job
GET    /api/v1/exports/{id}/         # Get status
```

### Sharing
```
POST   /api/v1/designs/{id}/share/   # Create share link
GET    /api/v1/shares/{token}/       # Access shared design
```

## ✨ Features

### Editor Capabilities

✅ **Object Types**:
- Text (with formatting)
- Shapes (rectangles, circles, lines)
- Images (from asset library)
- Groups (coming soon)
- Frames (coming soon)

✅ **Editing Tools**:
- Drag & drop
- Resize & rotate
- Layering (z-index)
- Color picker
- Opacity control
- Lock/unlock objects
- Multi-select

✅ **Advanced Features**:
- Undo/Redo
- Keyboard shortcuts
- Autosave
- Multi-page designs
- History/versions
- Alignment tools (coming)
- Guides & grids (coming)

### Platform Features

✅ **Asset Management**:
- Upload images
- Asset library
- Organization & search

✅ **Templates**:
- Template library
- Customizable templates
- Categories

✅ **Export**:
- PNG with transparency
- JPEG with quality
- PDF (single/multi-page)
- SVG (coming)

✅ **Sharing**:
- Public links
- Permission levels
- Expiring links
- Download control

## 🚀 Development

### Running Tests

**Backend**:
```bash
cd apps/api
pytest
```

**Frontend**:
```bash
cd apps/web
npm run test
npm run test:e2e
```

### Building for Production

**Backend**:
```bash
# Collect static files
python manage.py collectstatic --noinput

# Create superuser
python manage.py createsuperuser

# Use production server (gunicorn, etc.)
```

**Frontend**:
```bash
npm run build
npm run start
```

### Environment Variables

**Backend (.env)**:
```env
DEBUG=False
DJANGO_SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://user:password@host:5432/grpx
REDIS_URL=redis://localhost:6379/0
ALLOWED_HOSTS=yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com
AWS_STORAGE_BUCKET_NAME=your-bucket
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
JWT_SECRET_KEY=xxx
```

**Frontend (.env.local)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## 🔒 Security Features

- JWT authentication with refresh tokens
- CORS protection
- CSRF protection
- SQL injection prevention (Django ORM)
- XSS protection (React)
- Password hashing (bcrypt)
- Input validation (Zod)
- Rate limiting (coming soon)
- Secure share tokens

## 🐛 Troubleshooting

### Backend Issues

```bash
# Check migrations
python manage.py showmigrations

# Create superuser
python manage.py createsuperuser

# Database shell
python manage.py dbshell

# Clear cache
python manage.py clear_cache
```

### Frontend Issues

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Type check
npm run type-check
```

### Docker Issues

```bash
# View logs
docker-compose logs -f [service]

# Rebuild
docker-compose up --build

# Clean reset
docker-compose down -v
docker-compose up --build
```

## 📝 Contributing

1. Create a feature branch
2. Make changes
3. Run tests
4. Submit pull request

### Code Style

- Backend: Black, isort, flake8
- Frontend: ESLint, Prettier
- TypeScript: Strict mode

## 📚 Documentation

- [Master Prompt](./V1%20Implementation%20Master%20Prompt%20—%20Canva-Style%20Design%20Platform.md)
- [Backend README](./apps/api/README.md)
- [Frontend README](./apps/web/README.md)
- [Design Schema](./packages/design-schema/README.md)

## 📞 Support

- Open GitHub issues for bugs
- Check documentation for features
- Review master prompt for design decisions

## 📄 License

Proprietary - All rights reserved

```
design-platform/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   ├── app/
│   │   ├── components/
│   │   ├── editor/
│   │   ├── stores/
│   │   └── ...
│   └── api/                 # Django backend
│       ├── config/
│       ├── apps/
│       ├── common/
│       └── manage.py
├── packages/
│   └── design-schema/       # Shared design schema
├── workers/                 # Celery workers
├── infrastructure/          # Docker and deployment configs
├── docker-compose.yml
└── README.md
```

## Architecture

### Key Principles

1. **Design JSON is the source of truth** - All rendering systems consume the same Design JSON format
2. **Local-first editing** - Editor operations don't depend on API availability
3. **Modular monolith** - Backend is well-separated Django applications, not microservices
4. **Canvas abstraction** - Fabric.js is abstracted behind a CanvasAdapter interface

### Tech Stack

**Frontend:**
- Next.js 14+
- React 18+
- TypeScript
- Zustand (state management)
- Fabric.js (canvas rendering)
- Tailwind CSS
- Zod (validation)
- Vitest (unit tests)
- Playwright (E2E tests)

**Backend:**
- Django 4.2+
- Django REST Framework
- PostgreSQL
- Redis
- Celery
- Pillow (image processing)
- boto3 (AWS S3)
- JWT authentication

## Development

### Running Tests

```bash
# Frontend unit tests
cd apps/web
npm run test

# Frontend E2E tests
npm run test:e2e

# Backend unit tests
cd apps/api
pytest

# Backend integration tests
pytest --integration
```

### API Documentation

Interactive API documentation is available at:
- Swagger UI: http://localhost:8000/api/schema/swagger/
- ReDoc: http://localhost:8000/api/schema/redoc/

### Design Schema Documentation

See [packages/design-schema/README.md](packages/design-schema/README.md) for the complete Design JSON schema specification.

## Features

### V1 Implementation

#### Editor
- Canvas with Fabric.js
- Text, Images, Rectangles, Circles, Lines
- Selection, Move, Resize, Rotate, Delete, Duplicate
- Layer management (reorder, lock, visibility)
- Alignment and snapping
- Zoom and pan
- Undo/redo
- Keyboard shortcuts

#### Design Management
- Create, read, update, delete designs
- Autosave with debouncing
- Version tracking
- Multi-page support

#### Assets
- Upload images
- Image library
- Thumbnail generation
- Image placement and cropping

#### Templates
- Browse templates by category
- Create designs from templates
- Template library

#### Export
- PNG export
- JPEG export
- PDF export (single and multi-page)

#### Sharing
- Public share links
- Viewer and editor permissions
- Token-based sharing

#### Platform
- User authentication (JWT)
- Authorization checks
- Error handling
- Structured logging
- API documentation
- Docker environment

## Future Enhancements (Out of Scope for V1)

- Real-time collaboration
- Comments and feedback
- AI design generation
- AI image generation
- Advanced animations
- Video editing
- Brand kits
- Mobile apps
- Advanced typography engine

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture overview
- [API.md](API.md) - API documentation
- [DESIGN_SCHEMA.md](DESIGN_SCHEMA.md) - Design JSON schema specification
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [TESTING.md](TESTING.md) - Testing strategy

## Security

- JWT authentication with access/refresh tokens
- Object-level authorization
- CORS configuration
- Input validation and sanitization
- XSS protection
- SQL injection protection (Django ORM)
- Secure file handling
- Rate limiting
- Secure HTTP headers

## Performance

- Optimized for 100-200 objects per page
- Debounced autosave
- Lazy loading of assets
- Efficient canvas rendering
- Pagination for large datasets
- Caching strategies

## License

Private - Internal Use Only

## Support

For issues, questions, or contributions, please refer to the internal documentation.
