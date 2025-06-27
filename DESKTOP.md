# Desktop Implementation Reference

## Overview

The desktop implementation of the Gaussian Splat Showcase is optimized for mouse and keyboard interaction with sophisticated control panels, hover effects, and advanced features that leverage the precision and screen real estate available on desktop devices.

## Table of Contents

1. [Detection & Classification](#detection--classification)
2. [Desktop UI Architecture](#desktop-ui-architecture) 
3. [Control Systems](#control-systems)
4. [Interaction Patterns](#interaction-patterns)
5. [Performance Optimizations](#performance-optimizations)
6. [Advanced Features](#advanced-features)
7. [Code Examples](#code-examples)

## Detection & Classification

### Device Detection Logic

Desktop devices are identified using multiple criteria:

```typescript
function detectAndApplyInputType() {
  const body = document.body
  const hasTouch = navigator.maxTouchPoints > 0
  const hasHover = window.matchMedia('(hover: hover)').matches
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  
  // Desktop classification
  if (!hasTouch && hasHover && hasFinePointer) {
    body.classList.add('mouse-layout')
    console.log('Mouse device detected')
  }
}
```

**Desktop Device Criteria**:
- **No Touch Support**: `navigator.maxTouchPoints === 0`
- **Hover Capability**: `(hover: hover)` media query support
- **Fine Pointer**: `(pointer: fine)` media query support

### CSS Media Query Detection

```css
@media (hover: hover) and (pointer: fine) {
  /* Desktop-specific enhancements */
  .mouse-layout .nav-link:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 255, 0, 0.3);
  }
  
  .controls-container {
    display: block;
  }
  
  .desktop-only {
    display: block;
  }
}
```

## Desktop UI Architecture

### Primary Control Areas

#### 1. **Header Navigation**
```html
<header class="title-header">
  <h1>
    <span id="home-path">
      <span class="green-text">./</span>kantola<span class="green-text">/</span>luke
    </span>
    <span id="current-section"></span>
  </h1>
  
  <div class="hamburger-menu" id="hamburger-menu">
    <!-- Navigation dropdown -->
  </div>
</header>
```

**Features**:
- Terminal-style path display
- Hamburger menu with hover effects
- Section state indication

#### 2. **Main Controls Container**
```html
<div class="controls-container desktop-only">
  <div class="dropdown-row">
    <div class="dropdown-selector">
      <select id="model-dropdown">
        <option value="castleton">Castleton Tower</option>
        <!-- ... other models -->
      </select>
    </div>
    <div class="dropdown-selector">
      <select id="scene-dropdown">
        <option value="">Loading scenes...</option>
      </select>
    </div>
  </div>
  
  <div class="control-buttons-row">
    <button id="settings-button" class="control-button">Settings</button>
    <button id="effects-button" class="control-button">Effects</button>
  </div>
</div>
```

**Layout Features**:
- **Dropdown Row**: Model and scene selection
- **Control Buttons**: Settings and effects panels
- **Collapsible Panels**: Detailed controls when needed

#### 3. **Camera Information Panel**
```html
<div class="camera-info">
  <div class="camera-position-info">
    <label>Camera Position:</label>
    <div id="camera-position-display">X: 0.00, Y: 0.00, Z: 0.00</div>
  </div>
  <div class="camera-target-info">
    <label>Target:</label>
    <div id="camera-target-display">X: 0.00, Y: 0.00, Z: 0.00</div>
  </div>
  <div class="scene-share-info">
    <button id="capture-scene-button">Capture Scene</button>
    <button id="share-scene-button">Share Scene</button>
    <button id="gallery-button">Gallery</button>
  </div>
</div>
```

**Real-time Information**:
- Live camera position updates
- Current target coordinates 
- Scene management tools

#### 4. **FPS Counter**
```html
<div class="fps-counter desktop-only" id="fps-counter">
  <label>FPS:</label>
  <div id="fps-value">60</div>
</div>
```

#### 5. **Navigation Help**
```html
<div class="navigation-help" id="navigation-help">
  <span>click+drag == rotate</span>
  <span>double_click == adjust_rot_center</span>
  <span>cmd+click == move || two_finger_drag == move</span>
</div>
```

## Control Systems

### Settings Panel

**Panel Structure**:
```html
<div id="settings-panel" class="settings-panel">
  <button id="settings-close" class="settings-close-button">
    ×<span class="esc-hint">esc</span>
  </button>
  
  <div class="settings-slider-control">
    <label for="point-size">Point Size:</label>
    <input type="range" id="point-size" min="0.001" max="0.2" step="0.001" value="0.001">
    <span id="point-size-value">0.001</span>
  </div>
  
  <!-- Additional controls -->
</div>
```

**Control Types**:
- **Range Sliders**: Point size, focal length, fog density, rotation speed
- **Color Picker**: Background color with visual swatch
- **Checkbox**: Sphere mode toggle
- **Keyboard Shortcuts**: ESC to close, detailed hints

### Effects Panel

**Advanced Effects Management**:
```html
<div id="effects-panel" class="effects-panel">
  <div class="effects-panel-header">
    <select id="effects-main-dropdown" class="effects-main-dropdown">
      <option value="none">None</option>
    </select>
    <button id="save-preset" class="save-preset-button">Save</button>
  </div>
  
  <div class="effects-chain-container">
    <div id="effects-chain" class="effects-chain">
      <!-- Dynamic effect cards -->
    </div>
  </div>
  
  <div class="effect-parameters-container">
    <div id="effect-parameters" class="effect-parameters">
      <!-- Dynamic parameter controls -->
    </div>
  </div>
</div>
```

**Features**:
- **Effects Chain**: Visual representation of active effects
- **Parameter Controls**: Real-time adjustment of effect parameters
- **Preset Management**: Save and load effect combinations
- **Drag & Drop**: Reorder effects in chain

### Model & Scene Dropdowns

**Dynamic Population**:
```typescript
setupModelDropdown(): void {
  const dropdown = document.getElementById('model-dropdown') as HTMLSelectElement
  if (!dropdown || !this.modelsConfig) return
  
  dropdown.innerHTML = ''
  
  Object.entries(this.modelsConfig.models).forEach(([key, model]) => {
    const option = document.createElement('option')
    option.value = key
    option.textContent = model.displayName
    dropdown.appendChild(option)
  })
  
  dropdown.value = this.modelsConfig.currentModel
}
```

## Interaction Patterns

### Mouse-Specific Interactions

#### 1. **Precise Camera Controls**
```typescript
// Mouse movement tracking for precision
canvas.addEventListener('mousemove', (event) => {
  const rect = this.canvas.getBoundingClientRect()
  this.currentMousePos.x = event.clientX - rect.left
  this.currentMousePos.y = event.clientY - rect.top
})

// Double-click for rotation center adjustment
canvas.addEventListener('dblclick', (event) => {
  if (this.currentInterfaceMode() === 'home') {
    this.updateTargetFromClick(event)
  }
})
```

#### 2. **Hover Effects**
```css
.control-button:hover {
  background: rgba(0, 255, 0, 0.1);
  box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
  transform: translateY(-1px);
}

.nav-link:hover {
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 255, 0, 0.3);
}
```

#### 3. **Keyboard Shortcuts**
```typescript
// ESC key handling
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    this.closeAllPanels()
  }
})

// Modifier key support
canvas.addEventListener('mousedown', (event) => {
  if (event.metaKey || event.ctrlKey) {
    // Enable pan mode
    this.enablePanMode()
  }
})
```

### Advanced Mouse Features

#### 1. **Context-Sensitive Cursors**
```css
.canvas-container {
  cursor: grab;
}

.canvas-container:active {
  cursor: grabbing;
}

.canvas-container.pan-mode {
  cursor: move;
}
```

#### 2. **Drag & Drop Effects**
```typescript
// Effect chain reordering
effectCard.addEventListener('dragstart', (e) => {
  e.dataTransfer!.setData('text/plain', effectInstance.id)
  effectCard.classList.add('dragging')
})

effectCard.addEventListener('drop', (e) => {
  e.preventDefault()
  const draggedId = e.dataTransfer!.getData('text/plain')
  this.reorderEffects(draggedId, targetIndex)
})
```

## Performance Optimizations

### Desktop-Specific Optimizations

#### 1. **Higher Quality Rendering**
```typescript
// Desktop devices can handle higher pixel ratios
const pixelRatio = Math.min(window.devicePixelRatio, 2)
renderer.setPixelRatio(pixelRatio)

// Enhanced anti-aliasing for desktop
const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  logarithmicDepthBuffer: true,
  preserveDrawingBuffer: true
})
```

#### 2. **Advanced Effects Processing**
```typescript
// Desktop devices support more complex effects
if (!isMobile) {
  // Enable WebWorker-based processing
  this.enableWebWorkerEffects()
  
  // Higher resolution render targets
  this.setRenderTargetScale(2.0)
  
  // More sophisticated post-processing
  this.enableAdvancedPostProcessing()
}
```

#### 3. **Efficient Event Handling**
```typescript
// Mouse move throttling for performance
let mouseThrottle = false
canvas.addEventListener('mousemove', (event) => {
  if (mouseThrottle) return
  mouseThrottle = true
  
  requestAnimationFrame(() => {
    this.handleMouseMove(event)
    mouseThrottle = false
  })
})
```

### Memory Management

```typescript
// Desktop-specific cleanup
private cleanupDesktopResources(): void {
  // Remove hover event listeners
  this.removeAllHoverListeners()
  
  // Dispose of high-resolution textures
  this.disposeHighResTextures()
  
  // Clear render target caches
  this.clearRenderTargetCache()
}
```

## Advanced Features

### Sophisticated Panel Management

#### 1. **Collapsible Panels**
```typescript
class PanelManager {
  private activePanels: Set<string> = new Set()
  
  togglePanel(panelId: string): void {
    const panel = document.getElementById(panelId)
    if (!panel) return
    
    if (this.activePanels.has(panelId)) {
      this.collapsePanel(panelId)
    } else {
      this.expandPanel(panelId)
    }
  }
  
  private expandPanel(panelId: string): void {
    const panel = document.getElementById(panelId) as HTMLElement
    panel.style.display = 'block'
    panel.classList.add('expanding')
    
    // Animate expansion
    requestAnimationFrame(() => {
      panel.classList.add('expanded')
      panel.classList.remove('expanding')
    })
    
    this.activePanels.add(panelId)
  }
}
```

#### 2. **Smart Panel Positioning**
```typescript
private positionPanel(panel: HTMLElement): void {
  const rect = panel.getBoundingClientRect()
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  }
  
  // Ensure panel stays within viewport
  if (rect.right > viewport.width) {
    panel.style.right = '10px'
    panel.style.left = 'auto'
  }
  
  if (rect.bottom > viewport.height) {
    panel.style.bottom = '10px'
    panel.style.top = 'auto'
  }
}
```

### Real-time Information Display

#### 1. **Live Camera Tracking**
```typescript
private updateCameraDisplay(): void {
  const posDisplay = document.getElementById('camera-position-display')
  const targetDisplay = document.getElementById('camera-target-display')
  
  if (posDisplay) {
    const pos = this.camera.position
    posDisplay.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`
  }
  
  if (targetDisplay) {
    const target = this.controls.target
    targetDisplay.textContent = `X: ${target.x.toFixed(2)}, Y: ${target.y.toFixed(2)}, Z: ${target.z.toFixed(2)}`
  }
}
```

#### 2. **Performance Monitoring**
```typescript
private updatePerformanceDisplay(): void {
  const fpsElement = document.getElementById('fps-value')
  if (fpsElement) {
    const instantFPS = 1000 / (performance.now() - this.lastFrameTime)
    fpsElement.textContent = Math.round(instantFPS).toString()
  }
  
  // Memory usage (Chrome DevTools API)
  if ('memory' in performance) {
    const memory = (performance as any).memory
    console.log(`Memory: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`)
  }
}
```

### Accessibility Features

#### 1. **Keyboard Navigation**
```typescript
private setupKeyboardNavigation(): void {
  // Tab navigation through controls
  const focusableElements = document.querySelectorAll(
    'button, input, select, [tabindex]:not([tabindex="-1"])'
  )
  
  focusableElements.forEach((element, index) => {
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        this.handleTabNavigation(event, index, focusableElements)
      }
    })
  })
}
```

#### 2. **Screen Reader Support**
```html
<div class="settings-slider-control" role="group" aria-labelledby="point-size-label">
  <label id="point-size-label" for="point-size">Point Size:</label>
  <input 
    type="range" 
    id="point-size" 
    min="0.001" 
    max="0.2" 
    step="0.001" 
    value="0.001"
    aria-describedby="point-size-value"
  >
  <span id="point-size-value" aria-live="polite">0.001</span>
</div>
```

## Code Examples

### Custom Desktop Control Implementation

```typescript
class DesktopControlPanel {
  private container: HTMLElement
  private controls: Map<string, ControlElement> = new Map()
  
  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!
    this.setupDesktopFeatures()
  }
  
  private setupDesktopFeatures(): void {
    // Enable hover effects
    this.enableHoverEffects()
    
    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts()
    
    // Initialize tooltips
    this.setupTooltips()
    
    // Enable drag & drop
    this.setupDragAndDrop()
  }
  
  addSliderControl(
    id: string, 
    label: string, 
    min: number, 
    max: number, 
    value: number,
    callback: (value: number) => void
  ): void {
    const controlGroup = document.createElement('div')
    controlGroup.className = 'settings-slider-control'
    controlGroup.innerHTML = `
      <label for="${id}">${label}:</label>
      <input type="range" id="${id}" min="${min}" max="${max}" step="0.001" value="${value}">
      <span id="${id}-value">${value}</span>
    `
    
    const slider = controlGroup.querySelector('input') as HTMLInputElement
    const valueDisplay = controlGroup.querySelector('span') as HTMLElement
    
    // Desktop-specific enhancements
    slider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value)
      valueDisplay.textContent = value.toString()
      callback(value)
    })
    
    // Mouse wheel support for fine adjustment
    slider.addEventListener('wheel', (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.001 : 0.001
      const newValue = Math.max(min, Math.min(max, parseFloat(slider.value) + delta))
      slider.value = newValue.toString()
      slider.dispatchEvent(new Event('input'))
    })
    
    this.container.appendChild(controlGroup)
    this.controls.set(id, { element: controlGroup, slider, valueDisplay })
  }
  
  private enableHoverEffects(): void {
    const buttons = this.container.querySelectorAll('button')
    buttons.forEach(button => {
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(-1px)'
        button.style.boxShadow = '0 4px 8px rgba(0, 255, 0, 0.3)'
      })
      
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0)'
        button.style.boxShadow = 'none'
      })
    })
  }
  
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 's':
            event.preventDefault()
            this.saveCurrentSettings()
            break
          case 'r':
            event.preventDefault()
            this.resetToDefaults()
            break
        }
      }
    })
  }
  
  private setupTooltips(): void {
    const elements = this.container.querySelectorAll('[data-tooltip]')
    elements.forEach(element => {
      const tooltip = document.createElement('div')
      tooltip.className = 'desktop-tooltip'
      tooltip.textContent = element.getAttribute('data-tooltip')!
      
      element.addEventListener('mouseenter', () => {
        document.body.appendChild(tooltip)
        this.positionTooltip(tooltip, element as HTMLElement)
      })
      
      element.addEventListener('mouseleave', () => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip)
        }
      })
    })
  }
}

interface ControlElement {
  element: HTMLElement
  slider: HTMLInputElement
  valueDisplay: HTMLElement
}
```

### Advanced Desktop Interaction Handler

```typescript
class DesktopInteractionManager {
  private canvas: HTMLCanvasElement
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  
  constructor(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.canvas = canvas
    this.camera = camera
    this.controls = controls
    this.setupDesktopInteractions()
  }
  
  private setupDesktopInteractions(): void {
    // Precise mouse control
    this.setupMouseControl()
    
    // Keyboard modifiers
    this.setupKeyboardModifiers()
    
    // Mouse wheel enhancements
    this.setupWheelControl()
  }
  
  private setupMouseControl(): void {
    let isDragging = false
    let lastMousePos = { x: 0, y: 0 }
    
    this.canvas.addEventListener('mousedown', (event) => {
      isDragging = true
      lastMousePos.x = event.clientX
      lastMousePos.y = event.clientY
      
      // Change cursor
      this.canvas.style.cursor = 'grabbing'
    })
    
    this.canvas.addEventListener('mousemove', (event) => {
      if (!isDragging) return
      
      const deltaX = event.clientX - lastMousePos.x
      const deltaY = event.clientY - lastMousePos.y
      
      // Apply movement with modifier keys
      if (event.shiftKey) {
        // Constrained movement
        this.applyConstrainedMovement(deltaX, deltaY)
      } else if (event.altKey) {
        // Fine movement
        this.applyFineMovement(deltaX * 0.1, deltaY * 0.1)
      } else {
        // Normal movement
        this.applyNormalMovement(deltaX, deltaY)
      }
      
      lastMousePos.x = event.clientX
      lastMousePos.y = event.clientY
    })
    
    this.canvas.addEventListener('mouseup', () => {
      isDragging = false
      this.canvas.style.cursor = 'grab'
    })
  }
  
  private setupKeyboardModifiers(): void {
    let modifierState = {
      shift: false,
      ctrl: false,
      alt: false
    }
    
    document.addEventListener('keydown', (event) => {
      modifierState.shift = event.shiftKey
      modifierState.ctrl = event.ctrlKey || event.metaKey
      modifierState.alt = event.altKey
      
      this.updateControlMode(modifierState)
    })
    
    document.addEventListener('keyup', (event) => {
      modifierState.shift = event.shiftKey
      modifierState.ctrl = event.ctrlKey || event.metaKey
      modifierState.alt = event.altKey
      
      this.updateControlMode(modifierState)
    })
  }
  
  private updateControlMode(modifiers: any): void {
    if (modifiers.ctrl) {
      // Pan mode
      this.controls.enableRotate = false
      this.controls.enablePan = true
      this.canvas.style.cursor = 'move'
    } else if (modifiers.shift) {
      // Zoom mode
      this.controls.enableRotate = false
      this.controls.enablePan = false
      this.canvas.style.cursor = 'ns-resize'
    } else {
      // Default rotate mode
      this.controls.enableRotate = true
      this.controls.enablePan = true
      this.canvas.style.cursor = 'grab'
    }
  }
}
```

This desktop implementation provides a sophisticated, mouse-optimized interface with advanced controls, real-time feedback, and performance monitoring specifically designed for desktop users who expect precision and detailed control over the 3D visualization experience.