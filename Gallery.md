# Gallery System Documentation

A comprehensive PNG-based scene capture and gallery management system that embeds complete scene metadata into PNG files for visual scene selection and sharing.

## Overview

The Gallery System provides a visual alternative to traditional scene presets by capturing high-quality PNG images with embedded scene metadata. Users can capture, browse, and load scenes through an intuitive visual interface that shows exactly what each scene looks like.

## Key Features

- **PNG Metadata Embedding**: Complete scene state stored in PNG tEXt chunks
- **High-Quality Capture**: Square, center-cropped images with post-processing effects
- **Visual Gallery Interface**: Grid-based browsing with search and filtering
- **Cross-Platform Support**: Desktop and mobile capture/gallery access
- **Scene Restoration**: One-click loading of saved scenes with all settings
- **Progressive Enhancement**: Works alongside existing preset system

## Architecture

### Core Components

```
src/gallery/
├── PngMetadata.ts      # PNG metadata embedding/extraction utilities
├── CameraCapture.ts    # High-quality scene capture system
├── GalleryManager.ts   # Gallery organization and file management
└── index.ts           # Module exports and types
```

### System Flow

1. **Capture**: User clicks camera button → high-quality PNG generated with metadata
2. **Storage**: PNG file with embedded scene data (no separate database)
3. **Gallery**: Visual grid interface for browsing captured scenes
4. **Loading**: Click scene thumbnail → complete scene restoration

## PNG Metadata System

### Technical Implementation

The gallery system uses PNG tEXt chunks to embed scene metadata directly into image files, making them completely self-contained.

```typescript
// Embedding scene data into PNG
const pngWithMetadata = embedSceneMetadata(imageBuffer, sceneState)

// Extracting scene data from PNG
const metadata = extractSceneMetadata(pngBuffer)
```

### Metadata Structure

```typescript
interface PngMetadata {
  sceneState: SceneState      // Complete scene configuration
  version: string             // Metadata format version
  timestamp: number           // Capture timestamp
}

interface SceneState {
  // Camera settings
  cameraPosition: { x: number, y: number, z: number }
  cameraTarget: { x: number, y: number, z: number }
  focalLength: number
  
  // Visual settings
  pointSize: number
  sphereMode: boolean
  sphereRadius?: number
  autoRotationSpeed: number
  backgroundHex: string
  fogDensity: number
  
  // Model information
  currentModel: string
  currentQuality: 'low' | 'high'
  
  // Effects chain
  effects: EffectInstanceState[]
  
  // Scene metadata
  name?: string
  description?: string
}
```

### PNG tEXt Chunk Format

- **Chunk Type**: `tEXt` (standard PNG text chunk)
- **Keyword**: `SceneData` (identifies gallery-related metadata)
- **Data**: JSON-encoded scene state with CRC32 validation
- **Compression**: None (for maximum compatibility)

## Camera Capture System

### Capture Process

The capture system creates high-quality, square PNG images with all post-processing effects applied:

1. **Canvas Reading**: Direct capture from WebGL canvas with `preserveDrawingBuffer: true`
2. **Center Cropping**: Smart cropping to square format preserving scene focus
3. **Quality Scaling**: Device-appropriate resolution (1080x1080 to 1440x1440)
4. **Metadata Embedding**: Scene state embedded into PNG tEXt chunks
5. **Progressive Feedback**: Real-time progress updates during capture

### Capture Options

```typescript
interface CaptureOptions {
  width?: number              // Output width (default: device-appropriate)
  height?: number             // Output height (default: matches width)
  quality?: number            // PNG quality 0-1 (default: 0.9-0.95)
  filename?: string           // Custom filename (default: auto-generated)
  downloadImmediately?: boolean // Auto-download file (default: true)
}
```

### Device-Specific Settings

- **Mobile**: 1080×1080 at 85% quality (smaller files, faster processing)
- **Desktop**: 1080×1080 at 90% quality (balanced performance)
- **High-End**: 1440×1440 at 95% quality (maximum detail)

### Center Cropping Algorithm

```typescript
// Smart center cropping for square output
const sourceAspect = img.width / img.height
const targetAspect = width / height

if (sourceAspect > targetAspect) {
  // Source is wider - crop horizontally
  sourceWidth = img.height * targetAspect
  sourceX = (img.width - sourceWidth) / 2
} else if (sourceAspect < targetAspect) {
  // Source is taller - crop vertically  
  sourceHeight = img.width / targetAspect
  sourceY = (img.height - sourceHeight) / 2
}
```

## Gallery Interface

### Visual Design

- **Grid Layout**: Responsive auto-fill grid (minmax(250px, 1fr))
- **Square Thumbnails**: Consistent 1:1 aspect ratio with object-fit: cover
- **Hover Effects**: Smooth transitions and visual feedback
- **Modal Design**: Full-screen overlay with dark background

### Search and Filtering

```typescript
// Available filters
interface GalleryFilters {
  search: string              // Text search in scene names/descriptions
  model: string              // Filter by point cloud model
  effects: 'none' | 'has' | ''  // Filter by effects presence
  dateRange?: [Date, Date]   // Filter by capture date
}
```

### Gallery Controls

- **Search Bar**: Real-time text filtering
- **Model Filter**: Dropdown with all available models
- **Effects Filter**: Show scenes with/without effects
- **Sort Options**: Date, name, model (planned)
- **View Options**: Grid size adjustment (planned)

## User Interface Integration

### Desktop Interface

**Location**: Camera info panel (bottom-right)
**Elements**:
- Camera button (next to Share Scene)
- Gallery button (opens modal)
- Capture feedback notifications

```html
<button id="capture-scene-button" class="capture-scene-button">
  <svg><!-- camera icon --></svg>
  Capture Scene
</button>

<button id="gallery-button" class="gallery-button">
  <svg><!-- gallery icon --></svg>
  Gallery
</button>
```

### Mobile Interface

**Location**: Floating action buttons
**Elements**:
- Mobile capture button (camera icon)
- Mobile gallery button (gallery icon)
- Mobile-optimized gallery modal

```html
<div class="mobile-capture-button mobile-only">
  <button id="mobile-capture-button-element">
    <svg><!-- camera icon --></svg>
  </button>
</div>

<div class="mobile-gallery-button mobile-only">
  <button id="mobile-gallery-button-element">
    <svg><!-- gallery icon --></svg>
  </button>
</div>
```

### Progress Feedback

```typescript
interface CaptureProgress {
  stage: 'rendering' | 'processing' | 'embedding' | 'saving' | 'complete'
  progress: number        // 0-100
  message: string         // User-friendly status message
}
```

**Progress Stages**:
1. **Rendering** (10%): Capturing from canvas
2. **Processing** (40%): Converting image data
3. **Embedding** (70%): Adding scene metadata
4. **Saving** (90%): Preparing download
5. **Complete** (100%): Scene captured successfully

## API Reference

### PngMetadata Module

```typescript
// Embed scene data into PNG buffer
function embedSceneMetadata(
  pngBuffer: ArrayBuffer, 
  sceneState: SceneState
): ArrayBuffer

// Extract scene data from PNG buffer
function extractSceneMetadata(
  pngBuffer: ArrayBuffer
): PngMetadata | null

// Generate filename from scene state
function generateSceneFilename(
  sceneState: SceneState
): string

// Validate PNG has scene metadata
function validateScenePng(
  file: File
): Promise<boolean>
```

### CameraCapture Class

```typescript
class CameraCapture {
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  )
  
  // Capture scene with metadata
  async captureScene(
    sceneState: SceneState,
    options?: CaptureOptions
  ): Promise<string>
  
  // Capture thumbnail version
  async captureThumbnail(
    sceneState: SceneState,
    size?: number
  ): Promise<string>
  
  // Check if capture is possible
  canCapture(): { canCapture: boolean; reason?: string }
  
  // Get device-appropriate settings
  getRecommendedSettings(): CaptureOptions
  
  // Set progress callback
  setProgressCallback(
    callback: (progress: CaptureProgress) => void
  ): void
}
```

### GalleryManager Class

```typescript
class GalleryManager {
  constructor(cameraCapture?: CameraCapture)
  
  // Initialize gallery system
  initialize(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void
  
  // Capture and add scene to gallery
  async captureCurrentScene(
    sceneState: SceneState,
    options?: CaptureOptions,
    progressCallback?: (progress: CaptureProgress) => void
  ): Promise<GalleryItem>
  
  // Add existing PNG file to gallery
  async addPngFile(file: File): Promise<GalleryItem | null>
  
  // Get filtered gallery items
  getFilteredItems(filters: GalleryFilters): GalleryItem[]
  
  // Load scene from gallery item
  loadScene(item: GalleryItem): Promise<void>
  
  // Remove item from gallery
  removeItem(itemId: string): void
  
  // Subscribe to gallery updates
  onUpdate(callback: (items: GalleryItem[]) => void): void
}
```

## Integration Guide

### Basic Setup

```typescript
// 1. Initialize gallery system
const galleryManager = new GalleryManager()
galleryManager.initialize(renderer, scene, camera)

// 2. Set up capture buttons
document.getElementById('capture-scene-button')
  ?.addEventListener('click', async () => {
    const sceneState = orbitalCamera.captureCurrentSceneState()
    await galleryManager.captureCurrentScene(sceneState)
  })

// 3. Set up gallery modal
document.getElementById('gallery-button')
  ?.addEventListener('click', () => {
    showGalleryModal()
  })
```

### Scene State Integration

```typescript
// Capture current scene state
const sceneState: SceneState = {
  // Camera settings
  cameraPosition: camera.position.clone(),
  cameraTarget: controls.target.clone(),
  focalLength: focalLengthMm,
  
  // Visual settings  
  pointSize: currentPointSize,
  sphereMode: modelManager.isSphereMode(),
  sphereRadius: modelManager.getSphereRadius(),
  autoRotationSpeed: getCurrentRotationSpeed(),
  backgroundHex: getCurrentBackgroundColor(),
  fogDensity: scene.fog?.density || 0.003,
  
  // Model info
  currentModel: modelManager.getCurrentModel(),
  currentQuality: modelManager.getCurrentQuality(),
  
  // Effects
  effects: effectsChainManager.getEffectsChain(),
  
  // Metadata
  name: generateSceneName(),
  description: generateSceneDescription()
}
```

### Custom Gallery UI

```typescript
// Custom gallery interface
function createCustomGallery() {
  const galleryContainer = document.createElement('div')
  
  galleryManager.onUpdate((items) => {
    galleryContainer.innerHTML = ''
    
    items.forEach(item => {
      const thumbnail = document.createElement('img')
      thumbnail.src = item.url
      thumbnail.onclick = () => galleryManager.loadScene(item)
      
      const info = document.createElement('div')
      info.textContent = item.info.displayName
      
      const card = document.createElement('div')
      card.appendChild(thumbnail)
      card.appendChild(info)
      
      galleryContainer.appendChild(card)
    })
  })
  
  return galleryContainer
}
```

## Performance Considerations

### Capture Performance

- **WebGL Canvas Reading**: Requires `preserveDrawingBuffer: true` on renderer
- **Memory Usage**: ~2-4MB per captured image in memory during processing
- **Processing Time**: 200-800ms depending on resolution and device
- **Storage**: ~500KB-2MB per PNG file depending on complexity

### Gallery Performance

- **Lazy Loading**: Thumbnails loaded as needed during scrolling
- **Virtual Scrolling**: Large galleries use virtualization (planned)
- **Image Caching**: Browser handles PNG caching automatically
- **Search Performance**: Client-side filtering for <1000 items

### Mobile Optimizations

- **Reduced Resolution**: 1080×1080 vs 1440×1440 for desktop
- **Lower Quality**: 85% vs 90-95% quality setting
- **Progressive Loading**: Gallery items load progressively
- **Memory Management**: Automatic cleanup of unused image objects

## Troubleshooting

### Common Issues

**Black Captures**:
- **Cause**: `preserveDrawingBuffer: false` on WebGLRenderer
- **Solution**: Set `preserveDrawingBuffer: true` in renderer options

**Missing Effects in Captures**:
- **Cause**: Post-processing not applied to captured canvas
- **Solution**: Verify post-processing pass is active and applied

**Large File Sizes**:
- **Cause**: High resolution or quality settings
- **Solution**: Adjust quality in `getRecommendedSettings()`

**Gallery Not Loading**:
- **Cause**: Invalid PNG metadata or file corruption
- **Solution**: Check console for metadata extraction errors

### Error Handling

```typescript
try {
  const galleryItem = await galleryManager.captureCurrentScene(sceneState)
  console.log('Scene captured:', galleryItem.filename)
} catch (error) {
  if (error.message.includes('preserveDrawingBuffer')) {
    console.error('WebGL configuration issue:', error)
  } else if (error.message.includes('metadata')) {
    console.error('Scene state issue:', error)
  } else {
    console.error('Capture failed:', error)
  }
}
```

### Debug Information

```typescript
// Check capture capability
const canCapture = cameraCapture.canCapture()
if (!canCapture.canCapture) {
  console.warn('Capture not available:', canCapture.reason)
}

// Validate scene state
const sceneState = orbitalCamera.captureCurrentSceneState()
console.log('Scene state:', {
  hasCamera: !!sceneState.cameraPosition,
  hasEffects: sceneState.effects.length,
  modelInfo: sceneState.currentModel
})

// Check PNG metadata
const metadata = extractSceneMetadata(pngBuffer)
if (metadata) {
  console.log('PNG metadata valid:', metadata.version)
} else {
  console.warn('No valid metadata found in PNG')
}
```

## Future Enhancements

### Planned Features

- **Cloud Storage Integration**: Sync gallery across devices
- **Scene Sharing**: Direct sharing via URLs with embedded data
- **Batch Operations**: Multi-select for batch delete/organize
- **Advanced Filters**: Date ranges, tags, custom metadata
- **Export Options**: Different formats and resolutions
- **Scene Comparison**: Side-by-side comparison view

### Technical Improvements

- **Virtual Scrolling**: Handle galleries with 1000+ items
- **Progressive Enhancement**: Better fallbacks for older browsers
- **Compression Optimization**: Smaller file sizes without quality loss
- **Background Processing**: Web Workers for heavy operations
- **Incremental Search**: Real-time search as user types

## Best Practices

### For Developers

1. **Always validate scene state** before capture
2. **Handle capture failures gracefully** with user feedback
3. **Test on multiple devices** for performance variations
4. **Implement progressive loading** for large galleries
5. **Provide clear error messages** for troubleshooting

### For Users

1. **Capture meaningful scenes** with distinctive visual elements
2. **Use descriptive names** for easier gallery organization
3. **Regular cleanup** of unused gallery items
4. **Test scene loading** after capture to verify integrity
5. **Keep galleries manageable** (suggested max: 500 items)

---

The Gallery System provides a revolutionary approach to scene management by combining visual browsing with complete scene state preservation. This documentation covers all aspects of implementation, integration, and usage for developers and users alike.