# Design Schema Package

Canonical design document format for the visual design platform.

## Overview

The Design JSON is the source of truth for all designs. All systems (editor, backend, export, future collaboration) consume this same format.

## Schema Structure

```typescript
interface Design {
  schemaVersion: string
  width: number
  height: number
  background: Background
  pages: Page[]
}

interface Page {
  id: string
  name?: string
  objects: DesignObject[]
}

interface Background {
  type: 'color' | 'gradient'
  value: string // Color value or gradient definition
}

type DesignObject = 
  | TextObject
  | ImageObject
  | RectangleObject
  | CircleObject
  | LineObject
  | GroupObject

interface BaseDesignObject {
  id: string
  type: DesignObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
  visible: boolean
  locked: boolean
  zIndex: number
}

type DesignObjectType = 'text' | 'image' | 'rectangle' | 'circle' | 'line' | 'group'
```

## Usage

### TypeScript

```typescript
import { Design, TextObject, ImageObject } from '@design-platform/design-schema'

const design: Design = {
  schemaVersion: '1.0',
  width: 1080,
  height: 1080,
  background: {
    type: 'color',
    value: '#FFFFFF'
  },
  pages: [
    {
      id: 'page_01',
      objects: []
    }
  ]
}
```

### Python/Pydantic

```python
from design_schema.models import Design, TextObject

design = Design(
    schema_version='1.0',
    width=1080,
    height=1080,
    background={'type': 'color', 'value': '#FFFFFF'},
    pages=[{'id': 'page_01', 'objects': []}]
)
```

## Versioning

Designs are versioned to support schema evolution. Always include `schemaVersion` in persisted designs.

Migration system is available for future schema upgrades.

## Validation

- Use Zod for TypeScript validation
- Use Pydantic for Python validation
- Backend validates all incoming design documents
- Frontend validates before sending to backend
