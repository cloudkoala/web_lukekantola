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

### 4. Configuration Management

**Models Config** (`public/models-config.json`):
- Single source of truth for model defaults
- Use simple bidirectional values: `"autoRotationSpeed": 0.0`
- Avoid redundant properties (speed + direction)

**Scenes Config** (`public/scenes-config.json`):
- Complete scene snapshots with all settings
- Must include `focalLength`, `cameraPosition`, `cameraTarget`
- Effects chains with full parameter sets

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

See `CreateEffect.md` and `Postprocess.md` for effects system documentation.

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

## Performance Optimizations

This application has been extensively optimized for exceptional loading performance and user experience:

### **Latest Improvements (2025)**:
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