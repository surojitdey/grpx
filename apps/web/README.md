# Design Platform Web UI

A modern, responsive web-based visual design platform built with Next.js, React, TypeScript, and Fabric.js.

## Features

- **Visual Editor**: Intuitive drag-and-drop canvas with real-time rendering
- **Object Management**: Create and manipulate text, images, and shapes
- **Layers Panel**: Organize objects with layering and lock/visibility controls
- **Properties Panel**: Edit object properties like position, size, rotation, and opacity
- **Multi-page Support**: Create designs with multiple pages
- **Templates**: Start from pre-designed templates
- **Export**: Download designs as PNG, JPEG, or PDF
- **Sharing**: Generate shareable links for your designs
- **Responsive Design**: Works on desktop browsers

## Technology Stack

- **Frontend Framework**: Next.js 14
- **UI Library**: React 18
- **Type Safety**: TypeScript
- **State Management**: Zustand
- **Canvas Rendering**: Fabric.js
- **Styling**: Tailwind CSS
- **Form Handling**: React Hook Form
- **Validation**: Zod
- **HTTP Client**: Axios
- **Testing**: Vitest, Playwright

## Project Structure

```
apps/web/
├── app/              # Next.js app directory
├── components/       # Reusable UI components
├── editor/          # Editor-specific components
├── stores/          # Zustand stores
├── services/        # API and utility services
├── hooks/           # Custom React hooks
├── types/           # TypeScript types
├── utils/           # Utility functions
├── styles/          # Global styles
└── public/          # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd apps/web
npm install
```

### Environment Setup

```bash
cp .env.example .env.local
```

Edit `.env.local` and set the API URL:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm run start
```

## Key Components

### EditorLayout

The main editor container that loads a design and provides the complete editing interface.

```tsx
<EditorLayout designId="design-123" />
```

### Canvas

Renders the Fabric.js canvas and handles object rendering, selection, and manipulation.

### LeftSidebar

Provides tools and panels for:
- Templates
- Elements (shapes)
- Text tools
- Image upload
- Asset library

### RightSidebar

Shows:
- Properties panel for selected objects
- Layers panel with z-index management

### EditorToolbar

Top toolbar with:
- Undo/Redo
- Zoom controls
- Export
- Share
- Save status

## Editor State Management

Uses Zustand for managing:

- Current design and page
- Selected objects
- Active tool
- Zoom and pan
- UI panel states
- Grid and guides

```tsx
import { useEditorStore } from '@/stores/editor';

const { design, selectedObjectIds, setSelectedObjects } = useEditorStore();
```

## API Integration

Services layer for communicating with the backend:

```tsx
import { designApi, assetApi, templateApi } from '@/services/api';

// Load a design
const design = await designApi.getDesign('design-123');

// Update a page
await pageApi.updatePage(designId, pageId, document);

// Upload an asset
const uploadUrl = await assetApi.getUploadUrl(filename, contentType);
```

## Styling

Uses Tailwind CSS with custom global styles for:
- Canvas elements
- Panels and sidebars
- Toolbar buttons
- Forms and inputs
- Modals and dialogs

Extend in `tailwind.config.js` and `styles/globals.css`.

## Type Safety

All components are fully typed with TypeScript. Key types defined in `types/index.ts`:

- `Design`: Complete design document
- `DesignObject`: Base interface for all design objects
- `TextObject`, `ImageObject`, `ShapeObject`: Specific object types
- `Asset`, `Template`, `ExportJob`: Domain models

## Performance Considerations

- Zustand subscriptions for fine-grained reactivity
- Fabric.js canvas rendering optimization
- Debounced autosave to backend
- Lazy loading of assets and templates
- Memoization of heavy components

## Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests

```bash
npm run test:e2e
```

## Contributing

Follow the existing code style and patterns:

- Use TypeScript strict mode
- Create small, focused components
- Use custom hooks for logic reuse
- Maintain type safety throughout
- Write tests for important features

## Deployment

Build a production bundle:

```bash
npm run build
npm run start
```

Environment variables required:

- `NEXT_PUBLIC_API_URL`: Backend API endpoint

## License

Proprietary
