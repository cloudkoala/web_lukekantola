# Application Initialization Technical Reference

## Overview

This document provides a comprehensive technical reference for the Gaussian Splat Showcase application's initialization process. The system implements a sophisticated 8-phase startup sequence with robust error handling, progressive loading, and optimized performance characteristics.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Initialization Phases](#initialization-phases)
3. [Module Dependencies](#module-dependencies)
4. [Configuration System](#configuration-system)
5. [Progressive Loading](#progressive-loading)
6. [Camera Animation](#camera-animation)
7. [Error Handling](#error-handling)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)
10. [Code Examples](#code-examples)

## Architecture Overview

### Core Technologies
- **Three.js**: 3D rendering engine with WebGL backend
- **TypeScript**: Type-safe JavaScript with strict mode enabled
- **Vite**: Build tool with hot module replacement
- **Progressive Loading**: Custom chunked point cloud loading system

### System Design Principles
- **Non-blocking initialization**: UI setup proceeds while configs load asynchronously
- **Progressive enhancement**: Basic functionality available immediately, advanced features load progressively
- **Graceful degradation**: Multiple fallback mechanisms prevent blank screens
- **Performance-first**: Optimized for both desktop and mobile devices

## Initialization Phases

### Phase 1: HTML Structure & Loading Screen (0ms)

**Purpose**: Provide immediate visual feedback while JavaScript loads

**Components**:
- Immediate loading screen with animated border chase effect
- All UI elements present but hidden behind overlay
- Terminal-style aesthetic established (#00ff00 green theme)

**Key Elements**:
```html
<div id="immediate-loading" style="position: fixed; z-index: 9999;">
  <!-- Animated border chase effect -->
  <div class="square-border">
    <div class="border-top" style="animation: chase-border 0.6s linear infinite;"></div>
    <!-- ... other borders with staggered timing -->
  </div>
</div>
```

### Phase 2: JavaScript Module Loading & Three.js Setup (0-100ms)

**Purpose**: Initialize core rendering infrastructure

**Three.js Configuration**:
```typescript
const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas,
  antialias: true,
  alpha: true,
  logarithmicDepthBuffer: true,  // Better depth precision
  preserveDrawingBuffer: true    // Enable canvas reading for capture
})

// Optimization settings
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // Cap at 2x
renderer.sortObjects = true
renderer.toneMapping = THREE.NoToneMapping

// Scene setup
const scene = new THREE.Scene()
const backgroundColor = new THREE.Color(0x151515)
scene.background = backgroundColor
scene.fog = new THREE.FogExp2(backgroundColor.getHex(), 0.003)
```

**Camera Configuration**:
```typescript
const camera = new THREE.PerspectiveCamera(
  75,                    // Field of view
  window.innerWidth / window.innerHeight,
  0.01,                 // Near plane (close detail)
  500                   // Far plane (depth precision)
)
```

### Phase 3: Core Module Instantiation (100-150ms)

**Purpose**: Create all core modules with proper dependency injection

**Instantiation Order**:
```typescript
// 1. Progressive loader (no dependencies)
const progressiveLoader = new ProgressiveLoader(scene, basePath)

// 2. Post-processing (depends on renderer)
const postProcessingPass = new PostProcessingPass(width, height, renderer)
postProcessingPass.setMainScene(scene, camera)

// 3. Content management (no dependencies)
const contentLoader = new ContentLoader()

// 4. Gallery system (depends on renderer, scene, camera)
const galleryManager = new GalleryManager()
const cameraCapture = new CameraCapture(renderer, scene, camera)
galleryManager.setCameraCapture(cameraCapture)

// 5. Model management (depends on scene, progressiveLoader)
const modelManager = new ModelManager(
  scene, progressEl, progressFill, progressiveLoader, null
)

// 6. Camera system (depends on all previous modules)
const orbitalCamera = new OrbitalCameraSystem(
  camera, controls, canvas, scene,
  () => modelManager.getModelsConfig()!,
  // ... other dependencies
)

// 7. Set mutual references
;(modelManager as any).orbitalCamera = orbitalCamera
;(orbitalCamera as any).modelManager = modelManager
```

### Phase 4: Main Initialize Function Execution (150ms+)

#### Sub-Phase 4A: Environment Setup
```typescript
// Input type detection for responsive layout
detectAndApplyInputType()

// Hide initial progress bar (keep immediate loading screen)
progressEl.style.display = 'none'
```

#### Sub-Phase 4B: Asynchronous Configuration Loading
```typescript
const configLoadPromise = Promise.all([
  modelManager.loadModelsConfig(),      // Load model configurations
  contentLoader.loadProjectsConfig()    // Load project data
]).then(() => {
  // Setup dropdowns and defaults after configs load
  modelManager.setupModelDropdown()
  modelManager.setupQualityDropdown() 
  modelManager.setupProgressiveSphereConversion()
  
  // Setup camera defaults
  orbitalCamera.updateDisplayNameField()
  orbitalCamera.loadDefaultPointSize()
  orbitalCamera.loadDefaultFocalLength()
  orbitalCamera.loadDefaultAutoRotationSpeed()
  
  // Start loading animation
  orbitalCamera.startLoadingAnimation()
})
```

#### Sub-Phase 4C: UI Control Setup (Parallel to config loading)
```typescript
// Setup all UI controls
setupSettingsButton()
setupEffectsButton()
setupAutoRotationControl()
setupBackgroundColorControl()  // 100ms delay for DOM readiness
await setupSceneDropdown()

// Mobile controls
setupMobileEffectsButton()
setupMobileSettings()

// Additional systems
setupFogControl()
setupSceneSharing()
setupGalleryButtons()
setupGalleryModal()
```

#### Sub-Phase 4D: Navigation & Home Setup
```typescript
// Show home navigation indicators
const homeNavigation = document.querySelector('#home-navigation')
if (homeNavigation) {
  homeNavigation.style.display = 'flex'
  homeNavigation.style.visibility = 'visible'
}

// Setup navigation event listeners
orbitalCamera.setupPageNavigation()

// Update point size control visibility
modelManager.updatePointSizeControlVisibility()
```

### Phase 5: Model Loading Priority Chain (500-2000ms)

**Purpose**: Load appropriate content based on context and availability

**Priority Cascade**:
```typescript
// Wait for configs before proceeding
await configLoadPromise

// Priority 1: Shared scene from URL
const hasSceneUrl = await orbitalCamera.loadSceneFromUrl()

if (!hasSceneUrl) {
  // Priority 2: Random scene from collection
  const hasRandomScene = await orbitalCamera.loadRandomScene()
  
  if (!hasRandomScene) {
    // Priority 3: Default scene
    const hasDefaultScene = await orbitalCamera.loadDefaultScene()
    
    if (!hasDefaultScene) {
      // Priority 4: Fallback point cloud
      modelManager.loadPointCloud().then(() => {
        orbitalCamera.initializeSphereMode()
      })
    } else {
      orbitalCamera.initializeSphereMode()
    }
  } else {
    orbitalCamera.initializeSphereMode()
  }
} else {
  orbitalCamera.initializeSphereMode()
}
```

### Phase 6: Progressive Loading System (500-4000ms)

**Purpose**: Load point cloud data with visual feedback

**Technical Specifications**:
- **Chunk Size**: 150KB (optimized from 768KB)
- **Loading Pattern**: Sequential (1 chunk at a time)
- **Update Frequency**: 300-600ms visual updates
- **Sphere Processing**: Progressive with 50ms stagger

**Implementation**:
```typescript
class ProgressiveLoader {
  private chunkSize = 150 * 1024  // 150KB chunks
  
  async loadChunks(manifest: ChunkManifest): Promise<void> {
    for (let i = 0; i < manifest.totalChunks; i++) {
      const chunk = await this.loadSingleChunk(manifest.chunks[i])
      this.addChunkToScene(chunk)
      
      // Progressive sphere conversion callback
      if (this.onChunkAddedCallback) {
        this.onChunkAddedCallback(chunk)
      }
      
      // Update progress
      this.updateProgress((i + 1) / manifest.totalChunks)
      
      // Allow UI updates between chunks
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
}
```

### Phase 7: Camera Animation System (2000-5000ms)

**Purpose**: Cinematic introduction to the 3D scene

**Vector-Based Positioning**:
```typescript
// Calculate start position mathematically
calculateVectorBasedStartPosition(): THREE.Vector3 {
  const config = this.getCurrentAnimationConfig()
  if (!config.lookAtPoint || !config.rotationOffset) {
    return this.getDefaultStartPosition()
  }
  
  const lookAtPoint = new THREE.Vector3(
    config.lookAtPoint.x, 
    config.lookAtPoint.y, 
    config.lookAtPoint.z
  )
  
  // Calculate orbital start position
  const rotationAxis = config.rotationOffset.axis
  const degrees = config.rotationOffset.degrees
  const radians = degrees * (Math.PI / 180)
  
  // Start with default end position, rotate around lookAt point
  const endPos = new THREE.Vector3(config.endPosition.x, config.endPosition.y, config.endPosition.z)
  const direction = endPos.clone().sub(lookAtPoint)
  
  // Apply rotation based on axis
  if (rotationAxis === 'y') {
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians)
  }
  // ... other axes
  
  return lookAtPoint.clone().add(direction)
}
```

**Focal Length Animation**:
```typescript
animateToPositionWithFocalLength(
  startPos: THREE.Vector3, 
  endPos: THREE.Vector3, 
  target: THREE.Vector3,
  duration: number
): void {
  const config = this.getCurrentAnimationConfig()
  const targetFocalLength = this.camera.fov
  const initialFocalLength = targetFocalLength * (config.initialFocalLengthMultiplier || 1)
  
  // Set initial focal length before animation
  this.updateFocalLength(initialFocalLength)
  
  const startTime = performance.now()
  
  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // Sine-based easing for natural motion
    const easedProgress = 0.5 * (1 - Math.cos(progress * Math.PI))
    
    // Interpolate position (quaternion-based to avoid gimbal lock)
    const currentPos = startPos.clone().lerp(endPos, easedProgress)
    this.camera.position.copy(currentPos)
    
    // Interpolate focal length (zoom-in effect)
    const currentFocalLength = initialFocalLength + 
      (targetFocalLength - initialFocalLength) * easedProgress
    this.updateFocalLength(currentFocalLength)
    
    // Update camera orientation
    this.camera.lookAt(target)
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      this.isAnimating = false
    }
  }
  
  requestAnimationFrame(animate)
}
```

### Phase 8: Animation Loop Start & Loading Screen Removal (5000ms)

**Purpose**: Begin continuous rendering and remove loading overlay

**Animation Loop**:
```typescript
function animate() {
  requestAnimationFrame(animate)
  
  // FPS monitoring for performance optimization
  frameCount++
  const now = performance.now()
  const deltaTime = now - lastFramerateCheck
  
  // Update FPS display
  const fpsElement = document.getElementById('fps-value')
  if (fpsElement && deltaTime > 0) {
    const instantFPS = 1000 / (now - (lastFrameTime || now))
    fpsElement.textContent = Math.round(instantFPS).toString()
  }
  
  // Automatic sphere detail adjustment based on framerate
  if (deltaTime >= 1000) {
    currentFramerate = (frameCount * 1000) / deltaTime
    frameCount = 0
    lastFramerateCheck = now
    
    // Adjust sphere detail if enabled
    if (modelManager && modelManager.getSphereInstancer()?.isEnabled()) {
      adjustSphereDetailBasedOnFramerate(currentFramerate)
    }
  }
  
  lastFrameTime = now
  
  // Update controls
  controls.update()
  
  // Render with post-processing
  if ((window as any).postProcessingPass) {
    (window as any).postProcessingPass.render()
  } else {
    renderer.render(scene, camera)
  }
}
```

**Loading Screen Removal**:
```typescript
// Hide immediate loading screen with fade out
const immediateLoading = document.getElementById('immediate-loading')
if (immediateLoading) {
  immediateLoading.style.opacity = '0'
  setTimeout(() => {
    immediateLoading.style.display = 'none'
  }, 500) // Match CSS transition duration
}
```

## Module Dependencies

### Dependency Graph
```
ProgressiveLoader (no deps)
    ↓
PostProcessingPass (renderer)
    ↓
ContentLoader (no deps)
    ↓
GalleryManager + CameraCapture (renderer, scene, camera)
    ↓
ModelManager (scene, progressiveLoader)
    ↓
OrbitalCameraSystem (all previous modules)
```

### Cross-References
```typescript
// Mutual references for tight integration
;(modelManager as any).orbitalCamera = orbitalCamera
;(orbitalCamera as any).modelManager = modelManager

// Global access for effects system
;(window as any).effectsChainManager = orbitalCamera.getEffectsChainManager()
;(window as any).postProcessingPass = postProcessingPass
;(window as any).modelManager = modelManager
;(window as any).galleryManager = galleryManager
```

## Configuration System

### Models Configuration (`public/models-config.json`)
```json
{
  "basePaths": {
    "pointcloud": "./models/base/pointcloud/",
    "gsplat": "./models/base/gsplat/"
  },
  "models": {
    "castleton": {
      "fileName": "Castleton_002_hd01.ply",
      "displayName": "Castleton Tower",
      "renderType": "point-cloud",
      "defaultPointSize": 0.001,
      "defaultFocalLength": 50,
      "loadingAnimation": {
        "startPosition": { "x": 2.49, "y": 2.09, "z": -0.56 },
        "endPosition": { "x": 0.13, "y": 2.24, "z": 2.0 },
        "target": { "x": -0.13, "y": 0.87, "z": -0.29 },
        "lookAtPoint": { "x": -0.13, "y": 0.87, "z": -0.29 },
        "rotationOffset": { "axis": "y", "degrees": 30 },
        "initialFocalLengthMultiplier": 10,
        "duration": 4000
      },
      "autoRotationSpeed": 0.0
    }
  },
  "currentModel": "castleton"
}
```

### Scenes Configuration (`public/scenes-config.json`)
```json
{
  "scenes": {
    "scene_001": {
      "name": "Castleton Overview",
      "modelKey": "castleton",
      "quality": "high",
      "cameraPosition": { "x": 1.23, "y": 2.45, "z": 3.67 },
      "cameraTarget": { "x": 0.0, "y": 1.0, "z": 0.0 },
      "focalLength": 45,
      "effectsChain": [],
      "pointSize": 0.001,
      "sphereMode": true,
      "fogDensity": 0.003,
      "autoRotation": false,
      "autoRotationSpeed": 0.0,
      "backgroundColor": "#1a0e17",
      "timestamp": 1641024000000,
      "version": "1.0"
    }
  },
  "randomScenes": ["scene_001"],
  "defaultScene": "scene_001"
}
```

## Progressive Loading

### Chunk Manifest Structure
```json
{
  "originalFile": "Castleton_002_hd01.ply",
  "totalChunks": 17,
  "totalPoints": 2847392,
  "boundingBox": {
    "min": [-12.5, -8.2, -15.3],
    "max": [12.1, 24.7, 8.9]
  },
  "chunks": [
    {
      "filename": "Castleton_002_hd01_chunk_000.ply",
      "points": 167494,
      "size": 150000
    }
  ]
}
```

### Loading Implementation
```typescript
class ProgressiveLoader {
  private async loadSingleChunk(chunkInfo: ChunkInfo): Promise<THREE.Points> {
    const url = `${this.basePath}models/chunks/${this.currentModelName}/${chunkInfo.filename}`
    
    try {
      const plyLoader = new PLYLoader()
      const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
        plyLoader.load(url, resolve, undefined, reject)
      })
      
      // Apply consistent material
      const material = new THREE.PointsMaterial({
        size: this.pointSize,
        vertexColors: true,
        sizeAttenuation: true
      })
      
      const points = new THREE.Points(geometry, material)
      return points
      
    } catch (error) {
      console.error(`Failed to load chunk ${chunkInfo.filename}:`, error)
      throw error
    }
  }
  
  private addChunkToScene(chunk: THREE.Points): void {
    this.scene.add(chunk)
    this.loadedChunks.push(chunk)
    
    // Progressive sphere conversion callback
    if (this.onChunkAddedCallback) {
      // Small delay to ensure chunk is in scene
      setTimeout(() => {
        this.onChunkAddedCallback!(chunk)
      }, 10)
    }
  }
}
```

## Camera Animation

### Configuration Schema
```typescript
interface LoadingAnimationConfig {
  // Legacy support (will be calculated if not present)
  startPosition?: { x: number, y: number, z: number }
  endPosition: { x: number, y: number, z: number }
  target?: { x: number, y: number, z: number }
  
  // New vector-based approach
  lookAtPoint?: { x: number, y: number, z: number }
  rotationOffset?: { axis: 'x' | 'y' | 'z', degrees: number }
  initialFocalLengthMultiplier?: number
  
  // Animation settings
  duration: number
  enableAutoRotationDuringAnimation?: boolean
  animationAutoRotationSpeed?: number
}
```

### Mathematical Calculations
```typescript
// Calculate start position by rotating around lookAt point
private calculateStartPosition(config: LoadingAnimationConfig): THREE.Vector3 {
  if (!config.lookAtPoint || !config.rotationOffset) {
    return config.startPosition ? new THREE.Vector3(...Object.values(config.startPosition)) : this.getDefaultStartPosition()
  }
  
  const lookAt = new THREE.Vector3(config.lookAtPoint.x, config.lookAtPoint.y, config.lookAtPoint.z)
  const endPos = new THREE.Vector3(config.endPosition.x, config.endPosition.y, config.endPosition.z)
  
  // Calculate direction vector from lookAt to end position
  const direction = endPos.clone().sub(lookAt)
  
  // Apply rotation based on specified axis and degrees
  const radians = config.rotationOffset.degrees * (Math.PI / 180)
  const axis = new THREE.Vector3(
    config.rotationOffset.axis === 'x' ? 1 : 0,
    config.rotationOffset.axis === 'y' ? 1 : 0, 
    config.rotationOffset.axis === 'z' ? 1 : 0
  )
  
  direction.applyAxisAngle(axis, radians)
  
  // Return lookAt point + rotated direction
  return lookAt.clone().add(direction)
}
```

## Error Handling

### Config Loading Failures
```typescript
const configLoadPromise = Promise.all([
  modelManager.loadModelsConfig(),
  contentLoader.loadProjectsConfig()
]).then(() => {
  // Success path
  this.setupAfterConfigLoad()
}).catch(error => {
  console.error('Config loading failed:', error)
  
  // Fallback: use hardcoded defaults
  this.setupWithDefaultConfig() 
  
  // Still start loading animation with defaults
  orbitalCamera.startLoadingAnimation()
})
```

### Model Loading Failures
```typescript
// 4-tier fallback system prevents blank screens
try {
  const hasSceneUrl = await orbitalCamera.loadSceneFromUrl()
  if (hasSceneUrl) return
  
  const hasRandomScene = await orbitalCamera.loadRandomScene()
  if (hasRandomScene) return
  
  const hasDefaultScene = await orbitalCamera.loadDefaultScene()
  if (hasDefaultScene) return
  
  // Final fallback
  await modelManager.loadPointCloud()
  
} catch (error) {
  console.error('All model loading attempts failed:', error)
  
  // Emergency fallback: show error message
  this.showEmergencyErrorMessage()
}
```

### Loading Screen Guarantees
```typescript
// Always hide loading screen, even on error
try {
  await initialize()
} catch (error) {
  console.error('Initialization failed:', error)
} finally {
  // Guaranteed loading screen removal
  const immediateLoading = document.getElementById('immediate-loading')
  if (immediateLoading) {
    immediateLoading.style.opacity = '0'
    setTimeout(() => {
      immediateLoading.style.display = 'none'
    }, 500)
  }
}
```

## Performance Optimization

### Render Settings
```typescript
// Optimal Three.js configuration
const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  logarithmicDepthBuffer: true,  // Better depth precision
  preserveDrawingBuffer: true    // Enable capture
})

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // Cap at 2x
renderer.sortObjects = true

// Fog for atmospheric depth (matches background)
scene.fog = new THREE.FogExp2(backgroundColor.getHex(), 0.003)
```

### Memory Management
```typescript
// Efficient chunk loading with cleanup
private cleanupPreviousChunks(): void {
  this.loadedChunks.forEach(chunk => {
    this.scene.remove(chunk)
    chunk.geometry.dispose()
    if (chunk.material instanceof THREE.Material) {
      chunk.material.dispose()
    }
  })
  this.loadedChunks = []
}
```

### FPS-Based Quality Adjustment
```typescript
// Automatic sphere detail adjustment
private adjustSphereDetailBasedOnFramerate(fps: number): void {
  const timeSinceLastAdjustment = performance.now() - this.lastSphereDetailAdjustment
  
  // Only adjust every 3 seconds to avoid rapid changes
  if (timeSinceLastAdjustment >= 3000) {
    if (fps < 30 && this.sphereDetailLevel > 0) {
      // Reduce detail
      this.sphereDetailLevel--
      this.applySphereDetail(this.sphereDetailLevel)
      console.log(`Reduced sphere detail to level ${this.sphereDetailLevel} (FPS: ${fps.toFixed(1)})`)
      
    } else if (fps > 45 && this.sphereDetailLevel < 2) {
      // Increase detail
      this.sphereDetailLevel++
      this.applySphereDetail(this.sphereDetailLevel)
      console.log(`Increased sphere detail to level ${this.sphereDetailLevel} (FPS: ${fps.toFixed(1)})`)
    }
    
    this.lastSphereDetailAdjustment = performance.now()
  }
}
```

## Troubleshooting

### Common Issues

#### 1. Loading Screen Stuck
**Symptoms**: Loading screen never disappears
**Causes**:
- Config files not found (404 errors)
- Network timeout during chunk loading
- JavaScript errors during initialization

**Solutions**:
```typescript
// Check browser console for specific errors
// Verify config files are accessible:
// - /public/models-config.json
// - /public/scenes-config.json

// Test config loading directly:
fetch('./models-config.json')
  .then(response => response.json())
  .then(config => console.log('Models config:', config))
  .catch(error => console.error('Config error:', error))
```

#### 2. Point Cloud Not Loading
**Symptoms**: Black screen after loading animation
**Causes**:
- PLY files not found or corrupted
- Chunk manifest missing or invalid
- CORS issues with model files

**Solutions**:
```typescript
// Check network tab for 404s on .ply files
// Verify chunk manifest structure
// Test direct PLY loading:
const loader = new PLYLoader()
loader.load('./models/base/pointcloud/Castleton_002_hd01.ply', 
  geometry => console.log('PLY loaded:', geometry),
  progress => console.log('Progress:', progress),
  error => console.error('PLY error:', error)
)
```

#### 3. Animation Not Playing
**Symptoms**: Model loads but no camera animation
**Causes**:
- Animation config missing or malformed
- Camera position already at end position
- Animation system disabled

**Solutions**:
```typescript
// Check animation config in models-config.json
// Verify animation is enabled:
orbitalCamera.startLoadingAnimation()

// Test manual animation:
orbitalCamera.animateToPosition(
  new THREE.Vector3(5, 5, 5),  // start
  new THREE.Vector3(1, 2, 3),  // end
  new THREE.Vector3(0, 1, 0),  // target
  3000  // duration
)
```

#### 4. Performance Issues
**Symptoms**: Low FPS, laggy interactions
**Causes**:
- Too many points/spheres for device capability
- High pixel ratio on mobile devices
- Inefficient render loop

**Solutions**:
```typescript
// Check FPS counter in top-right
// Reduce point size: orbitalCamera.updatePointSize(0.0005)
// Disable sphere mode temporarily
// Check pixel ratio: renderer.getPixelRatio()

// Monitor performance:
console.log('Rendered objects:', scene.children.length)
console.log('Total vertices:', scene.children.reduce((sum, obj) => {
  return sum + (obj.geometry?.attributes?.position?.count || 0)
}, 0))
```

### Debug Mode

Enable comprehensive logging:
```typescript
// Add to main.ts for debug mode
(window as any).DEBUG_INITIALIZATION = true

// This enables:
// - Detailed console logging for each phase
// - Performance timing measurements  
// - Config and loading state inspection
// - Error stack traces

// Access debug info:
console.log('Orbital Camera:', orbitalCamera)
console.log('Model Manager:', modelManager)
console.log('Current Config:', orbitalCamera.getModelsConfig())
```

## Code Examples

### Custom Loading Animation
```typescript
// Add to models-config.json
"customModel": {
  "fileName": "custom.ply",
  "displayName": "Custom Model", 
  "renderType": "point-cloud",
  "defaultPointSize": 0.002,
  "defaultFocalLength": 60,
  "loadingAnimation": {
    "endPosition": { "x": 2.0, "y": 3.0, "z": 4.0 },
    "lookAtPoint": { "x": 0.0, "y": 1.5, "z": 0.0 },
    "rotationOffset": { "axis": "y", "degrees": 45 },
    "initialFocalLengthMultiplier": 8,
    "duration": 6000
  }
}
```

### Manual Initialization Override
```typescript
// Override default initialization behavior
async function customInitialize() {
  // Skip random/default scenes, load specific model
  await modelManager.loadModelsConfig()
  await modelManager.switchToModel('customModel', 'high')
  
  // Custom camera position
  camera.position.set(5, 5, 5)
  camera.lookAt(0, 0, 0)
  
  // Skip loading animation
  orbitalCamera.isAnimating = false
  
  // Hide loading screen immediately
  const immediateLoading = document.getElementById('immediate-loading')
  if (immediateLoading) {
    immediateLoading.style.display = 'none'
  }
  
  // Start render loop
  animate()
}

// Replace default initialization
// initialize() 
customInitialize()
```

### Performance Monitoring
```typescript
// Add performance monitoring
class PerformanceMonitor {
  private frameTimings: number[] = []
  private lastLogTime = 0
  
  logFrame() {
    const now = performance.now()
    this.frameTimings.push(now)
    
    // Keep only last 60 frames
    if (this.frameTimings.length > 60) {
      this.frameTimings.shift()
    }
    
    // Log stats every 5 seconds
    if (now - this.lastLogTime > 5000) {
      this.logStats()
      this.lastLogTime = now
    }
  }
  
  private logStats() {
    if (this.frameTimings.length < 2) return
    
    const deltas = this.frameTimings.slice(1).map((time, i) => 
      time - this.frameTimings[i]
    )
    
    const avgFrameTime = deltas.reduce((a, b) => a + b) / deltas.length
    const fps = 1000 / avgFrameTime
    const minFps = 1000 / Math.max(...deltas)
    const maxFps = 1000 / Math.min(...deltas)
    
    console.log(`Performance: ${fps.toFixed(1)} FPS (min: ${minFps.toFixed(1)}, max: ${maxFps.toFixed(1)})`)
  }
}

// Use in animation loop
const perfMonitor = new PerformanceMonitor()

function animate() {
  requestAnimationFrame(animate)
  perfMonitor.logFrame()
  
  // ... rest of animation loop
}
```

This comprehensive technical reference should provide all the necessary information for understanding, debugging, and extending the application's initialization system.