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

**Blur Effects**: Blur, Bloom, Motion Blur, Glow, Depth of Field

**Grain Effects**: CRT Grain, Film 35mm, Pixelate, 2D Noise

**3D Effects**: Concentric Circles, Point Network, Material Effects, Topographic, Distance Fog, Sky Sphere, Sin Radius

**Circle Packing Effect** (New): Groups similar colors using posterization and circle packing algorithms. Features adjustable packing density, color levels, circle sizes, spacing, and color tolerance for creative stylized rendering.

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
└── style.css                   # Application styling

public/
├── models-config.json          # Model defaults and metadata
├── scenes-config.json          # Preset scene configurations
└── models/                     # Point cloud files
```

## Specialized Documentation

- **MobileSlider.md** - Comprehensive mobile slider implementation guide
- **ColorPicker.md** - Mobile HSV color picker system and integration guide
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