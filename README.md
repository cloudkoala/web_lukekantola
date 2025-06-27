# Gaussian Splat Showcase

A Three.js-based point cloud viewer built for showcasing Gaussian splat models with advanced camera controls, effects processing, and mobile-optimized UI.

## Quick Start

```bash
npm install
npm run dev
```

## Architecture Overview

This application uses a modular architecture with clear separation between camera controls, model management, and interface components.

### Core Modules
- **Camera System** (`src/camera/OrbitalCameraSystem.ts`) - Advanced camera controls and animations
- **Model Manager** (`src/models/ModelManager.ts`) - Point cloud loading and quality management  
- **Effects System** (`src/effects/`) - Post-processing effects chain
- **Interface Components** (`src/interface/`) - Dynamic content and mobile UI
- **Gallery System** (`src/gallery/`) - PNG-based scene capture and visual gallery

## Key Architectural Patterns

### 1. Bidirectional Value System

**Problem**: Rotation controls need both speed and direction in a clean UI.

**Solution**: Single bidirectional values where sign indicates direction:
```typescript
// Positive = clockwise, negative = counter-clockwise, zero = disabled
setBidirectionalRotationSpeed(1.5)   // 1.5 speed clockwise
setBidirectionalRotationSpeed(-1.5)  // 1.5 speed counter-clockwise  
setBidirectionalRotationSpeed(0)     // Disabled
```

**Key Methods**:
- `setBidirectionalRotationSpeed(value: number)` - Apply speed and direction
- `getBidirectionalRotationSpeed(): number` - Get current bidirectional value
- Built-in 5% center snap zone for better UX

### 2. Scene State Management

**Critical Rule**: Always use proper update methods, never direct property assignment.

**✅ Correct**:
```typescript
// Focal length: Use conversion method (mm → degrees)
this.updateFocalLength(sceneState.focalLength)

// Point size: Use update method  
this.pointSize = sceneState.pointSize
this.updatePointSize()

// Rotation: Use bidirectional method
this.setBidirectionalRotationSpeed(rotationValue)
```

**❌ Incorrect**:
```typescript
// Don't assign directly - missing conversions and matrix updates
this.camera.fov = sceneState.focalLength  // Wrong: no mm→degree conversion
```

**Scene State Restoration Pattern**:
1. Apply to system (camera, settings)
2. Update desktop UI controls  
3. Update mobile UI controls (if present)
4. Trigger any dependent updates

### 3. Mobile Slider Integration

**Desktop-Mobile Synchronization**: All sliders must sync bidirectionally.

**Pattern for Model Defaults**:
```typescript
// 1. Add default loading method
public loadDefaultSomeSetting() {
  const defaultValue = this.modelsConfig().models[currentModel].someSetting
  
  // Update system
  this.updateSomeSetting(defaultValue)
  
  // Update desktop UI
  const desktopSlider = document.querySelector('#some-setting') as HTMLInputElement
  if (desktopSlider) desktopSlider.value = defaultValue.toString()
  
  // Update mobile UI  
  const mobileCard = document.getElementById('mobile-some-setting-card') as HTMLElement
  if (mobileCard && (mobileCard as any).updateValue) {
    (mobileCard as any).updateValue(defaultValue.toString())
  }
}

// 2. Call during initialization
orbitalCamera.loadDefaultSomeSetting()
```

**Mobile Card Creation Pattern**:
```typescript
const sliderCard = createSliderCard('Setting Name', currentValue, min, max, step, (value) => {
  // Update desktop controls
  desktopSlider.value = value.toString()
  desktopSlider.dispatchEvent(new Event('input'))
})
sliderCard.id = 'mobile-setting-name-card'  // Always assign ID for external access
```

### 4. Camera Animation System

**Vector-Based Animation Configuration**:
```json
"loadingAnimation": {
  "endPosition": { "x": 0.13, "y": 2.24, "z": 2.0 },         // Camera destination
  "lookAtPoint": { "x": -0.13, "y": 0.87, "z": -0.29 },      // Focal center point
  "rotationOffset": { "axis": "y", "degrees": 30 },           // Orbital approach angle
  "initialFocalLengthMultiplier": 10,                          // Zoom effect intensity
  "enableAutoRotationDuringAnimation": false,                 // Future: layered rotation
  "duration": 4000
}
```

**Key Features**:
- **Mathematical Positioning**: Start position calculated by rotating around lookAt point
- **Focal Length Animation**: Smooth zoom-in effect during orbital motion
- **Unified Target System**: Shared focal point for camera animation and auto-rotation
- **Model-Specific Calibration**: Each model has optimized multiplier values

**Animation Flow**:
1. Calculate start position by rotating around `lookAtPoint`
2. Set initial focal length using `initialFocalLengthMultiplier`
3. Animate simultaneously: position (orbital) + focal length (zoom-in)
4. Smooth quaternion interpolation with sine-based easing

### 5. Configuration Management

**Models Config** (`public/models-config.json`):
- Single source of truth for model defaults
- Use simple bidirectional values: `"autoRotationSpeed": 0.0`
- Enhanced animation configuration with vector-based properties
- Avoid redundant properties (speed + direction)

**Scenes Config** (`public/scenes-config.json`):
- Complete scene snapshots with all settings
- Must include `focalLength`, `cameraPosition`, `cameraTarget`
- Can override animation configuration per scene
- Effects chains with full parameter sets and blend modes
- Supports three blend modes: `normal`, `add`, `multiply`

## Application Startup

### Initialization Overview
The application follows a sophisticated 8-phase startup sequence designed for optimal user experience with no loading delays and progressive visual feedback.

### Module Dependency Order
Core modules are instantiated in strict dependency order:
```typescript
ProgressiveLoader → PostProcessingPass → ContentLoader → 
GalleryManager → CameraCapture → ModelManager → OrbitalCameraSystem
```

### Startup Timeline
- **0-100ms**: HTML loads, JavaScript modules initialize, Three.js setup
- **100-200ms**: Core modules instantiated with cross-references
- **200-500ms**: Async config loading (models/projects), UI controls setup
- **500-2000ms**: Model loading priority chain execution
- **2000-5000ms**: Progressive loading (150KB chunks) + camera animation
- **5000ms+**: Fully interactive with loading screen fadeout

### Model Loading Priority
The system follows a 4-tier fallback approach:
1. **Shared Scene URL**: Load from URL parameters if present
2. **Random Scene**: Select from `scenes-config.json` collection
3. **Default Scene**: Load predefined default configuration
4. **Point Cloud Fallback**: Load basic point cloud if all else fails

### Progressive Loading System
- **Chunk Size**: 150KB optimized chunks (5x improvement from 768KB)
- **Pattern**: Sequential loading (1 chunk at a time, not batches)
- **Visual Updates**: 300-600ms update frequency during loading
- **Sphere Processing**: Progressive conversion with 50ms stagger prevents pop-in

### Performance Optimizations
- **Logarithmic depth buffer**: Better precision for large point clouds
- **Pixel ratio capping**: Maximum 2x for high-DPI performance
- **FPS monitoring**: Real-time adjustment of sphere detail levels
- **Memory management**: Streaming chunks with proper cleanup
- **Mobile detection**: Responsive layout based on input capabilities

### Error Handling
- **Config failures**: Graceful degradation with fallback values  
- **Model loading**: Multi-tier fallback prevents blank screens
- **Loading screen**: Guaranteed removal on success or error
- **Console logging**: Comprehensive debugging throughout process

For detailed technical specifications, see the "Initial Page Load Process" section in `CLAUDE.md`.

## Mobile vs Desktop Implementations

The application provides distinct, optimized experiences for mobile and desktop devices through sophisticated capability detection and responsive design patterns.

### Draggable Panel System

The application features a sophisticated draggable panel system that provides users with complete control over their workspace layout.

### Panel Architecture

**Two Main Draggable Panels**:
- **Settings Panel**: Grid-based layout (2 rows × 3 columns) for core application settings
- **Effects Panel**: Resizable panel with scrollable content and fixed footer controls

### Settings Panel Features

**Layout & Positioning**:
- **Fixed Grid**: 2 rows, 3 columns (750px width to prevent text wrapping)
- **Default Position**: Center screen at bottom (40px from bottom edge)
- **Drag Handle**: Visual indicator with 6 dots and "Settings" label
- **Viewport Constraints**: Panel stays within screen boundaries during drag

**Grid Contents** (Left to Right, Top to Bottom):
1. **Point Size Slider** - Controls individual point rendering size
2. **Sphere Radius Slider** - Adjusts sphere mode radius (shown only in sphere mode)
3. **Focal Length Slider** - Camera field of view control
4. **Fog Density Slider** - Atmospheric depth effect
5. **Sphere Mode Toggle** - Switches between point and sphere rendering
6. **Background Color Picker** - Scene background color with HSV modal
7. **Auto-Rotation Speed** - Bidirectional rotation control (-2.0 to +2.0)

### Effects Panel Features

**Advanced Panel System**:
- **Resizable**: Drag bottom-right corner to adjust width (280-600px) and height (200px to 80% viewport)
- **Scrollable Content**: Effects list scrolls independently while header and footer remain fixed
- **Default Position**: Top-left corner (150px from top, 12px from left)
- **Default Size**: 360px × 400px

**Panel Structure**:
```
┌─────────────────────────────────┐
│ [Drag Handle] Effects        [×]│ ← Fixed header
├─────────────────────────────────┤
│ Effect: [Dropdown] ▼           │ ← Controls section
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │                             │ │ ← Scrollable content
│ │   [Effect Cards]            │ │   (effect chain)
│ │   [Parameters]              │ │
│ │                             │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ [+ Add Effect] [× Reset All]   │ ← Fixed footer
└─────────────────────────────────┘
```

**Footer Controls**:
- **Add Effect Button**: Opens searchable effects modal (toggles open/closed)
- **Reset All Button**: Clears entire effects chain
- **Always Visible**: Footer remains accessible regardless of content scroll

### Drag Implementation

**Technical Architecture**:
```typescript
// Drag handle detection with proper event handling
const onMouseDown = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('.settings-close-button')) return // Exclude close button
  
  // Convert from transform-based to absolute positioning
  panel.style.setProperty('transform', 'none', 'important')
  panel.style.setProperty('left', `${rect.left}px`, 'important')
  panel.style.setProperty('top', `${rect.top}px`, 'important')
}
```

**Key Features**:
- **Transform Override**: Uses `setProperty()` with `!important` to override CSS positioning
- **Viewport Clamping**: Prevents panels from being dragged off-screen
- **Event Exclusion**: Close buttons don't trigger drag operations
- **Cursor States**: Visual feedback with `grab` and `grabbing` cursors

### Resize Implementation (Effects Panel Only)

**Resize Handle Design**:
- **Visual Indicator**: Small triangular grip in bottom-right corner
- **Cursor Feedback**: Changes to `nw-resize` cursor on hover
- **Color Feedback**: Background lightens on hover for clear interaction

**Constraints**:
- **Minimum Size**: 280px × 200px (ensures usability)
- **Maximum Size**: 600px × 80% viewport height (prevents overwhelm)
- **Real-time Updates**: Panel content adjusts smoothly during resize

### CSS Architecture

**Critical Override Pattern**:
```css
.desktop-only .effects-panel {
  position: fixed !important;
  left: 12px !important;
  top: 150px !important;
  transform: none !important; /* Enables drag positioning */
}
```

**Responsive Layout**:
```css
.effects-panel-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Enables scroll in content area */
}

.effects-panel-content {
  flex: 1;
  overflow-y: auto; /* Scrollable content */
  overflow-x: hidden;
}

.effects-panel-footer {
  flex-shrink: 0; /* Always visible footer */
  border-top: 1px solid rgba(0, 255, 0, 0.2);
}
```

### Integration with Effects System

**Modal Integration**:
The "Add Effect" button reuses the existing effects system infrastructure:
```typescript
// Accesses the EffectsPanel instance through OrbitalCameraSystem
const effectsPanel = orbitalCamera.getEffectsPanel()
if (effectsPanel) {
  // Toggle the searchable effects modal
  const modal = document.querySelector('.add-effect-dropdown') as HTMLElement
  if (modal?.style.display === 'flex') {
    effectsPanel.hideAddEffectModal()
  } else {
    effectsPanel.showAddEffectModal()
  }
}
```

**Critical Discovery**: The effects preset dropdown is essential for effects to display properly. Without selecting a preset, effects remain invisible in the chain.

### User Experience Enhancements

**Workflow Optimization**:
1. **Effects Panel**: Opens near model controls for immediate access
2. **Settings Panel**: Centers at bottom for non-intrusive global controls
3. **Resize Capability**: Users can optimize panel size for their content
4. **Fixed Footer**: Core actions remain accessible during long effect chains

**Visual Consistency**:
- **Terminal Aesthetic**: Green borders, Space Mono font, retro styling
- **Hover Effects**: Subtle color changes for interactive elements
- **Proper Spacing**: 8px gaps, consistent padding throughout

## Platform Detection

**Multi-Modal Detection System**:
```typescript
// Primary detection logic
const hasTouch = navigator.maxTouchPoints > 0
const hasHover = window.matchMedia('(hover: hover)').matches  
const hasFinePointer = window.matchMedia('(pointer: fine)').matches

// Device classification
if (hasTouch && !hasHover) {
  body.classList.add('touch-layout')    // Pure touch (phones/tablets)
} else if (!hasTouch && hasHover && hasFinePointer) {
  body.classList.add('mouse-layout')    // Desktop computers
} else {
  body.classList.add('hybrid-layout')   // Hybrid devices (tablets with keyboards)
}
```

### Key Differences

| Feature | Desktop | Mobile |
|---------|---------|---------|
| **Input Method** | Mouse + Keyboard | Touch Gestures |
| **UI Layout** | Collapsible panels | Slide-up panels |
| **Control Precision** | Fine adjustment (mouse wheel) | Touch-optimized sliders |
| **Navigation** | Hover effects + shortcuts | Tap interactions |
| **Performance** | Higher quality rendering | Optimized for battery/memory |
| **Screen Space** | Multiple simultaneous panels | Modal/overlay approach |

### Desktop Implementation Highlights

**Advanced Control Systems**:
- **Precise Camera Controls**: Mouse wheel fine adjustment, modifier key support
- **Hover Effects**: Rich visual feedback and enhanced interactions  
- **Keyboard Shortcuts**: ESC, Ctrl+S, Ctrl+R for power users
- **Multi-Panel Layout**: Settings, effects, camera info simultaneously visible
- **Real-time Monitoring**: FPS counter, camera position display, performance stats

**Desktop-Specific Features**:
- Drag & drop effect reordering
- Tooltips with detailed information
- Context-sensitive cursor states
- Advanced color picker with precise controls
- Full-featured effects chain management

### Mobile Implementation Highlights

**Touch-Optimized Interface**:
- **Gesture Recognition**: Pinch-to-zoom, two-finger pan, tap/long-press detection
- **Strategic Button Placement**: Core controls (bottom-left), scene actions (bottom-right)
- **Slide-Up Panels**: Space-efficient modal approach for complex controls
- **Touch-Safe Design**: 44px minimum touch targets, prevention of accidental zoom

**Mobile-Specific Features**:
- Progressive disclosure UI patterns
- Horizontal scrolling effect chains  
- Virtual keyboard awareness
- Device orientation handling
- Battery/performance optimizations

### Implementation Architecture

**Shared Core Logic**:
Both platforms use the same underlying systems for 3D rendering, effects processing, and state management. Only the interface layer adapts to device capabilities.

**Responsive CSS Structure**:
```css
/* Base styles apply to all devices */
.control-button { /* shared styles */ }

/* Desktop enhancements */
@media (hover: hover) and (pointer: fine) {
  .control-button:hover { /* hover effects */ }
  .desktop-only { display: block; }
}

/* Mobile optimizations */  
@media (hover: none) and (pointer: coarse) {
  .mobile-only { display: block; }
  .desktop-only { display: none; }
  button { min-height: 44px; } /* touch targets */
}
```

**Synchronized State Management**:
```typescript
// Desktop and mobile controls stay synchronized
updatePointSize(value: number): void {
  // Update system state
  this.pointSize = value
  
  // Update desktop UI
  const desktopSlider = document.querySelector('#point-size') as HTMLInputElement
  if (desktopSlider) desktopSlider.value = value.toString()
  
  // Update mobile UI
  const mobileCard = document.getElementById('mobile-point-size-card') as HTMLElement
  if (mobileCard && (mobileCard as any).updateValue) {
    (mobileCard as any).updateValue(value.toString())
  }
}
```

### Agent Orientation Quick Reference

**For Desktop Development**: See [`DESKTOP.md`](./DESKTOP.md)
- Advanced control panel systems
- Mouse interaction patterns  
- Keyboard shortcuts implementation
- Performance monitoring setup
- Hover effects and animations

**For Mobile Development**: See [`MOBILE.md`](./MOBILE.md)  
- Touch gesture recognition
- Slide-up panel systems
- Mobile-optimized controls
- Performance optimizations for mobile
- Responsive design patterns

**Platform Detection**: Both files include complete device detection logic and CSS media queries for implementing responsive features.

## Development Guidelines

### Adding New Sliders

1. **Choose Architecture**: 
   - Settings panel cards (recommended) - automatic mobile optimization
   - Camera panel sliders (legacy) - manual mobile handling

2. **Create Default Loading Method**:
   - Add property to models-config.json
   - Create `loadDefaultXXX()` method in OrbitalCameraSystem
   - Call method during initialization in main.ts

3. **Add Scene State Support**:
   - Add property to SceneState interface
   - Update `captureCurrentSceneState()`
   - Update `applySceneState()` with proper methods

4. **Mobile Integration**:
   - Assign ID to mobile card
   - Update default loading method to sync mobile
   - Update scene state restoration to sync mobile

### Camera System Updates

**Focal Length**: Always use `updateFocalLength(mm)` - handles mm→degree conversion
**Rotations**: Use `setBidirectionalRotationSpeed(value)` - handles speed+direction+enable
**Positions**: Use vector copy methods - `camera.position.copy(newPosition)`

### Effects Integration

The application includes a comprehensive effects system with 40+ visual effects organized into 6 categories:

**Post-Process Effects**: Halftone Dithering, **Circle Packing**, ASCII Dithering, Engraving, Sobel Edge Detection, Oil Painting, Datamosh, Pixel Sorting, Vignette, Afterimage, Threshold

**Color Effects**: Background Color, Gamma Correction, Sepia, Colorify, Split Tone, Gradient, Invert, Bleach Bypass, Posterize

**Blur Effects**: Blur, Bloom, Motion Blur, **Gaussian Blur**, **Glow**, Depth of Field

**Grain Effects**: CRT Grain, Film 35mm, Pixelate, 2D Noise, **Voronoi Noise**

**3D Effects**: Concentric Circles, Point Network, Material Effects, Topographic, Distance Fog, Sky Sphere, Sin Radius

**Voronoi Noise Effect** (New): Procedural texture generation based on Voronoi diagrams with multiple distance functions (Euclidean, Manhattan, Chebyshev) and visualization modes (solid cells, outlined borders, distance fields). Features real-time animation, customizable scaling, and full color control.

**Circle Packing Effect**: Advanced post-processing technique that transforms visualizations into stylized circular representations using multi-scale hierarchical placement, QuadTree spatial optimization, and WebWorker parallelization. Features comprehensive parameter control and intelligent content analysis.

See `CreateEffect.md`, `Postprocess.md`, and `BlendingModes.md` for effects system documentation.

## File Structure

```
src/
├── main.ts                     # App initialization and event handling
├── types.ts                    # Shared TypeScript interfaces  
├── camera/OrbitalCameraSystem.ts  # Camera controls, animations, scene state
├── models/ModelManager.ts      # Point cloud loading and management
├── effects/                    # Post-processing effects system
├── interface/                  # UI components and content loading
├── gallery/                    # PNG capture and gallery management
└── style.css                   # Application styling

public/
├── models-config.json          # Model defaults and metadata
├── scenes-config.json          # Preset scene configurations
└── models/                     # Point cloud files
```

## Specialized Documentation

- **DraggablePanels.md** - Complete draggable panel system: implementation, architecture, and UX design
- **Gallery.md** - Complete PNG-based gallery system: capture, metadata, and management
- **MobileSlider.md** - Comprehensive mobile slider implementation guide
- **ColorPicker.md** - Mobile HSV color picker system and integration guide
- **CirclePackingEffect.md** - Circle Packing effect: algorithms, parameters, performance, and usage guide
- **CLAUDE.md** - Complete development history and technical decisions
- **CreateEffect.md** - Effects system development guide
- **Postprocess.md** - Post-processing pipeline documentation
- **BlendingModes.md** - Effect blending modes system and usage guide

## Performance Optimizations

This application has been extensively optimized for exceptional loading performance and user experience:

### **Latest Improvements (2025)**:
- **Vector-Based Camera Animation**: Mathematical approach using lookAt points and rotation offsets for more flexible camera movements
- **Focal Length Animation**: Cinematic zoom-in effects during orbital motion for professional camera movements
- **Progressive Sphere Loading**: Spheres now appear chunk-by-chunk with no pop-in effects
- **Optimized Chunk Size**: Reduced from 768KB to ~150KB for 5x more frequent visual updates
- **Sequential Loading**: True progressive loading - chunks appear every 300-600ms instead of 2-3 seconds
- **Dead Code Removal**: Removed unused TSL effects system for faster bundle loading

### **Core Performance Features**:
- **50-60% faster model loading** via optimized chunk processing and smaller chunk sizes
- **30-40% faster initial page load** through asynchronous configuration loading  
- **Smooth progressive rendering** with chunk-by-chunk model building
- **Mobile optimized** with efficient loading on slower connections
- **Memory efficient** with smaller individual chunk sizes

### **Technical Optimizations**:
- **Chunk Size**: Optimized to ~150KB (down from 768KB) for frequent visual feedback
- **Loading Pattern**: Sequential chunk loading for true progressive experience
- **Sphere Instancing**: Progressive sphere conversion eliminates pop-in effects
- **Bundle Optimization**: Removed unused code and optimized asset loading

See `optimize.md` for detailed optimization methodology and implementation guide.

## Commands

```bash
npm run dev      # Development server
npm run build    # Production build  
npm run preview  # Preview build locally
```

## Key Technologies

- **Three.js** - 3D rendering and camera controls
- **TypeScript** - Type-safe development
- **Vite** - Build tool and development server
- **PLYLoader** - Point cloud file loading