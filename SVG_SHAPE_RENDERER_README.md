# SVG Shape Renderer - Enhanced Badge Types and Interfaces

This document provides comprehensive documentation for the new SVG Shape Renderer system, which offers advanced badge rendering capabilities with support for complex SVG shapes, gradients, filters, and interactive elements.

## Overview

The SVG Shape Renderer system consists of three main components:

1. **Type Definitions** (`src/types/svg-shape-renderer.ts`) - Comprehensive TypeScript interfaces
2. **Renderer Utility** (`src/utils/svg-shape-renderer.ts`) - Core SVG generation logic
3. **React Component** (`src/components/SvgBadgeRenderer.tsx`) - Interactive React component

## Key Features

### 🎨 Advanced SVG Support
- **Multiple Shape Types**: Rectangles, circles, ellipses, lines, polylines, polygons, and custom paths
- **Gradients**: Linear and radial gradients with multiple stops
- **Patterns**: Custom SVG patterns for backgrounds
- **Filters**: Drop shadows, blur effects, color matrix transformations
- **Transforms**: Scale, rotate, skew, and translate operations

### 🔧 Enhanced Typography
- **Rich Text Styling**: Font weight, style, decoration, spacing
- **Text Effects**: Shadows, strokes, filters
- **Advanced Positioning**: Precise control over text placement
- **Alignment Options**: Left, center, right, justify

### 🖼️ Image Handling
- **Flexible Positioning**: Precise control over image placement and scaling
- **Aspect Ratio Control**: Maintain or override aspect ratios
- **Opacity and Blending**: Advanced image compositing
- **Transform Support**: Scale, rotate, and skew images

### 🎯 Interactive Features
- **Element Selection**: Click to select and edit elements
- **Hover Effects**: Visual feedback on element hover
- **Validation**: Real-time validation with error/warning display
- **Debug Mode**: Comprehensive debugging information

## Usage Examples

### Basic Usage

```typescript
import { SvgBadgeRenderer } from '../components/SvgBadgeRenderer';
import type { SvgBadge, SvgTemplate } from '../types/svg-shape-renderer';

// Create a simple badge
const badge: SvgBadge = {
  id: 'example-badge',
  lines: [
    {
      id: 'line-1',
      text: 'Hello World',
      fontSize: 24,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      lineHeight: 1.2,
      letterSpacing: 0,
      wordSpacing: 0,
      position: { x: 150, y: 50 },
      alignment: 'center',
      fill: { type: 'solid', color: '#000000' },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  background: { type: 'solid', color: '#FFFFFF' },
  backing: 'pin',
  padding: { top: 10, right: 10, bottom: 10, left: 10 },
  exportSettings: {
    format: 'svg',
    resolution: 300,
    colorSpace: 'RGB'
  },
  validation: {
    maxLines: 4,
    minLines: 1,
    maxTextLength: 100,
    requiredFields: []
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  version: '1.0',
  tags: []
};

// Create a template
const template: SvgTemplate = {
  id: 'rect-template',
  name: 'Rectangle Template',
  category: 'basic',
  tags: ['rectangle', 'basic'],
  artboardWidth: 300,
  artboardHeight: 100,
  safeInset: 10,
  mask: {
    type: 'rect',
    shape: {
      type: 'rect',
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      rx: 10,
      ry: 10
    }
  },
  viewBox: [0, 0, 300, 100],
  coordinateSystem: 'userSpaceOnUse',
  maxLines: 4,
  minLines: 1,
  supportedBackings: ['pin', 'magnetic', 'adhesive'],
  createdAt: new Date(),
  updatedAt: new Date(),
  version: '1.0'
};

// Render the badge
function MyBadgeComponent() {
  return (
    <SvgBadgeRenderer
      badge={badge}
      template={template}
      debug={true}
      onElementClick={(elementId) => console.log('Clicked:', elementId)}
      onElementHover={(elementId) => console.log('Hovered:', elementId)}
    />
  );
}
```

### Advanced Usage with Gradients and Filters

```typescript
// Create a badge with gradient background and text shadow
const advancedBadge: SvgBadge = {
  id: 'advanced-badge',
  lines: [
    {
      id: 'gradient-text',
      text: 'Gradient Text',
      fontSize: 32,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      lineHeight: 1.2,
      letterSpacing: 2,
      wordSpacing: 0,
      position: { x: 150, y: 50 },
      alignment: 'center',
      fill: { 
        type: 'gradient', 
        gradientId: 'text-gradient' 
      },
      shadow: {
        offsetX: 2,
        offsetY: 2,
        blurRadius: 4,
        color: '#000000',
        opacity: 0.5
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  background: { 
    type: 'gradient', 
    gradient: {
      id: 'bg-gradient',
      type: 'linear',
      x1: 0,
      y1: 0,
      x2: 300,
      y2: 100,
      stops: [
        { offset: 0, color: '#ff6b6b' },
        { offset: 1, color: '#4ecdc4' }
      ]
    }
  },
  backing: 'pin',
  gradients: [
    {
      id: 'text-gradient',
      type: 'linear',
      x1: 0,
      y1: 0,
      x2: 300,
      y2: 0,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 0.5, color: '#f0f0f0' },
        { offset: 1, color: '#e0e0e0' }
      ]
    }
  ],
  filters: [
    {
      id: 'drop-shadow',
      effects: [
        {
          type: 'feDropShadow',
          params: {
            dx: 2,
            dy: 2,
            stdDeviation: 4,
            'flood-color': '#000000',
            'flood-opacity': 0.5
          }
        }
      ]
    }
  ],
  padding: { top: 10, right: 10, bottom: 10, left: 10 },
  exportSettings: {
    format: 'svg',
    resolution: 300,
    colorSpace: 'RGB'
  },
  validation: {
    maxLines: 4,
    minLines: 1,
    maxTextLength: 100,
    requiredFields: []
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  version: '1.0',
  tags: ['gradient', 'shadow']
};
```

### Using the Renderer Hook

```typescript
import { useSvgRenderer } from '../components/SvgBadgeRenderer';

function InteractiveBadgeEditor() {
  const { state, actions } = useSvgRenderer(initialBadge, initialTemplate, {
    includeDebugInfo: true,
    showSafeArea: true,
    showCutLines: true
  });

  const handleAddLine = () => {
    actions.addLine({
      text: 'New Line',
      fontSize: 16,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      lineHeight: 1.2,
      letterSpacing: 0,
      wordSpacing: 0,
      position: { x: 150, y: 80 },
      alignment: 'center',
      fill: { type: 'solid', color: '#000000' }
    });
  };

  const handleUpdateLine = (lineId: string) => {
    actions.updateLine(lineId, {
      fontSize: 20,
      fontWeight: 'bold'
    });
  };

  return (
    <div>
      <SvgBadgeRenderer
        badge={state.badge}
        template={state.template}
        config={state.config}
        debug={true}
        onElementClick={actions.selectElement}
      />
      
      <div>
        <button onClick={handleAddLine}>Add Line</button>
        {state.badge.lines.map(line => (
          <button 
            key={line.id} 
            onClick={() => handleUpdateLine(line.id)}
          >
            Update {line.text}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Custom Shape Creation

```typescript
// Add custom SVG shapes to your badge
const customShape: SvgElement = {
  id: 'custom-star',
  type: 'path',
  shape: {
    type: 'path',
    d: 'M150,10 L180,70 L250,70 L190,110 L220,170 L150,130 L80,170 L110,110 L50,70 L120,70 Z'
  },
  fill: { type: 'solid', color: '#ffd700' },
  stroke: {
    color: '#ff6b6b',
    width: 2,
    linecap: 'round',
    linejoin: 'round'
  },
  transform: {
    translateX: 0,
    translateY: 0,
    scaleX: 0.5,
    scaleY: 0.5,
    rotation: 0,
    skewX: 0,
    skewY: 0
  }
};

// Add the custom shape to your badge
actions.addCustomShape(customShape);
```

## Configuration Options

### Renderer Configuration

```typescript
interface SvgRendererConfig {
  // Rendering options
  includeDebugInfo: boolean;        // Show debug information
  showSafeArea: boolean;            // Show safe area guides
  showCutLines: boolean;            // Show cut lines for production
  showGrid: boolean;                // Show grid overlay
  
  // Performance options
  optimizePaths: boolean;          // Optimize SVG paths
  minifyOutput: boolean;            // Minify SVG output
  includeComments: boolean;         // Include comments in SVG
  
  // Export options
  embedFonts: boolean;              // Embed font data
  embedImages: boolean;             // Embed image data
  rasterizeText: boolean;           // Convert text to paths
}
```

### Validation Configuration

```typescript
interface SvgValidationResult {
  isValid: boolean;
  errors: SvgValidationError[];     // Critical issues
  warnings: SvgValidationError[];   // Non-critical issues
  info: SvgValidationError[];      // Informational messages
}

interface SvgValidationError {
  field: string;                    // Field name
  message: string;                  // Error message
  code: string;                     // Error code
  severity: 'error' | 'warning' | 'info';
}
```

## Migration from Legacy System

The new SVG Shape Renderer maintains compatibility with the existing `renderSvg.ts` system through the `renderBadgeToSvgString` function:

```typescript
// Legacy usage still works
import { renderBadgeToSvgString } from '../utils/svg-shape-renderer';

const svg = renderBadgeToSvgString(legacyBadge, legacyTemplate, uid);
```

## Performance Considerations

1. **SVG Optimization**: Enable `optimizePaths` for better performance
2. **Minification**: Use `minifyOutput` for production builds
3. **Image Embedding**: Consider `embedImages` based on your use case
4. **Debug Mode**: Disable debug features in production

## Best Practices

1. **Use TypeScript**: Leverage the comprehensive type system for better development experience
2. **Validate Input**: Always validate badge data before rendering
3. **Handle Errors**: Implement proper error handling for render failures
4. **Performance**: Use the renderer hook for state management in complex applications
5. **Accessibility**: Ensure proper alt text and ARIA labels for images

## Troubleshooting

### Common Issues

1. **Render Errors**: Check console for detailed error messages
2. **Missing Elements**: Verify all required properties are provided
3. **Performance Issues**: Enable optimization options
4. **Validation Errors**: Check the validation overlay for specific issues

### Debug Mode

Enable debug mode to see:
- Template information
- Element counts
- Hover/selection states
- Validation issues
- Performance metrics

```typescript
<SvgBadgeRenderer
  badge={badge}
  template={template}
  debug={true}
  config={{
    includeDebugInfo: true,
    showSafeArea: true,
    showCutLines: true,
    showGrid: true
  }}
/>
```

This enhanced SVG Shape Renderer system provides a solid foundation for advanced badge rendering with comprehensive type safety, interactive features, and extensible architecture.


