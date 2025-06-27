# Mobile Implementation Reference

## Overview

The mobile implementation provides a touch-optimized interface specifically designed for smartphones and tablets. It features streamlined controls, gesture-based interactions, and a responsive layout that maximizes the 3D viewing experience on smaller screens.

## Table of Contents

1. [Detection & Classification](#detection--classification)
2. [Mobile UI Architecture](#mobile-ui-architecture)
3. [Touch Interaction System](#touch-interaction-system)
4. [Control Systems](#control-systems)
5. [Performance Optimizations](#performance-optimizations)
6. [Responsive Design](#responsive-design)
7. [Code Examples](#code-examples)

## Detection & Classification

### Device Detection Logic

Mobile devices are identified using comprehensive capability detection:

```typescript
function detectAndApplyInputType() {
  const body = document.body
  const hasTouch = navigator.maxTouchPoints > 0
  const hasHover = window.matchMedia('(hover: hover)').matches
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  
  // Touch layout classification
  if (hasTouch && !hasHover) {
    body.classList.add('touch-layout')
    console.log('Touch device detected')
  }
  // Hybrid devices (tablets with keyboards)
  else if (hasTouch) {
    body.classList.add('hybrid-layout') 
    console.log('Hybrid device detected')
  }
}
```

**Mobile Device Criteria**:
- **Touch Support**: `navigator.maxTouchPoints > 0`
- **No Hover**: `(hover: none)` media query
- **Coarse Pointer**: `(pointer: coarse)` media query

### Alternative Detection Methods

```typescript
// Secondary mobile detection (EffectsPanel.ts)
const isMobile = document.body.classList.contains('touch-layout') || 
                 document.body.classList.contains('hybrid-layout') ||
                 window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
                 'ontouchstart' in window
```

### CSS Media Query Detection

```css
@media (hover: none) and (pointer: coarse) {
  /* Show mobile UI, hide desktop UI */
  .mobile-only { display: block; }
  .desktop-only { display: none; }
  
  /* Touch-specific optimizations */
  .touch-layout button { 
    min-height: 44px; 
    min-width: 44px; 
  }
}

@media (max-width: 768px) {
  /* Small screen optimizations */
  .camera-info { display: none; }
  .fps-counter { display: none; }
  .navigation-help { display: none; }
}
```

## Mobile UI Architecture

### Core Button Groups

The mobile interface is organized into distinct button groups positioned strategically around the screen:

#### 1. **Mobile Core Buttons** (Bottom Left)
```html
<div class="mobile-core-buttons mobile-only" id="mobile-core-buttons">
  <button class="mobile-core-button camera-reset-button" id="mobile-camera-reset-button">
    <!-- Camera reset icon -->
  </button>
  <button class="mobile-core-button effects-button" id="mobile-effects-button">
    <!-- Effects icon -->
  </button>
  <button class="mobile-core-button settings-button" id="mobile-settings-button">
    <!-- Settings icon -->
  </button>
</div>
```

**Features**:
- **Camera Reset**: Quick return to default view
- **Effects**: Toggle effects panel
- **Settings**: Open settings panel

#### 2. **Mobile Scene Buttons** (Bottom Right)
```html
<div class="mobile-scene-buttons mobile-only" id="mobile-scene-buttons">
  <button class="mobile-scene-button capture-button" id="mobile-capture-button">
    <!-- Capture icon -->
  </button>
  <button class="mobile-scene-button gallery-button" id="mobile-gallery-button">
    <!-- Gallery icon -->
  </button>
  <button class="mobile-scene-button share-button" id="mobile-share-button">
    <!-- Share icon -->
  </button>
</div>
```

**Features**:
- **Capture**: Save current scene as PNG
- **Gallery**: Browse saved scenes
- **Share**: Generate shareable links

#### 3. **Mobile Preset Selector** (Top)
```html
<div class="mobile-preset-selector mobile-only" id="mobile-preset-selector">
  <div class="preset-label">Effect Preset:</div>
  <div class="preset-dropdown" id="mobile-preset-dropdown">
    <span class="preset-name" id="mobile-preset-name">None</span>
    <span class="preset-arrow">▼</span>
  </div>
  <div class="preset-dropdown-menu" id="mobile-preset-dropdown-menu">
    <!-- Dynamic preset options -->
  </div>
</div>
```

### Slide-Up Panel System

#### 1. **Mobile Horizontal Effects Panel**
```html
<div class="mobile-horizontal-effects-panel mobile-only" id="mobile-horizontal-effects-panel">
  <div class="horizontal-effects-content">
    <div class="horizontal-effects-chain" id="horizontal-effects-chain">
      <!-- Effect cards displayed horizontally -->
    </div>
    <div class="horizontal-effects-controls" id="horizontal-effects-controls">
      <!-- Parameter controls -->
    </div>
  </div>
</div>
```

#### 2. **Mobile Horizontal Settings Panel**
```html
<div class="mobile-horizontal-settings-panel mobile-only" id="mobile-horizontal-settings-panel">
  <div class="horizontal-settings-content">
    <div class="horizontal-settings-options" id="horizontal-settings-options">
      <div class="settings-option-card">Point Size</div>
      <div class="settings-option-card">Focal Length</div>
      <div class="settings-option-card">Fog Density</div>
      <div class="settings-option-card">Auto-Rotate</div>
    </div>
  </div>
</div>
```

#### 3. **Mobile Effect Parameters Box**
```html
<div class="mobile-effect-parameters-box mobile-only" id="mobile-effect-parameters-box">
  <div class="parameters-box-header">
    <span class="parameters-box-title" id="parameters-box-title">Effect Parameters</span>
    <button class="parameters-box-close" id="parameters-box-close">×</button>
  </div>
  <div class="parameters-box-content" id="parameters-box-content">
    <!-- Dynamic parameter controls -->
  </div>
</div>
```

## Touch Interaction System

### Canvas Touch Events

```typescript
// Touch movement handling
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault() // Prevent scroll
  const touch = e.touches[0]
  this.handleTouchMove(touch)
}, { passive: false })

// Touch start/end for interaction tracking
canvas.addEventListener('touchstart', () => {
  this.resetInteractionTimer()
})

canvas.addEventListener('touchend', (event) => {
  this.resetInteractionTimer()
})
```

### Multi-Touch Gesture Support

```typescript
class TouchGestureHandler {
  private touches: Touch[] = []
  private initialDistance: number = 0
  private initialAngle: number = 0
  
  handleTouchStart(event: TouchEvent): void {
    this.touches = Array.from(event.touches)
    
    if (this.touches.length === 2) {
      // Initialize pinch-to-zoom
      this.initialDistance = this.getDistanceBetweenTouches()
      this.initialAngle = this.getAngleBetweenTouches()
    }
  }
  
  handleTouchMove(event: TouchEvent): void {
    event.preventDefault()
    this.touches = Array.from(event.touches)
    
    if (this.touches.length === 1) {
      // Single finger rotation
      this.handleSingleTouchRotation(this.touches[0])
    } else if (this.touches.length === 2) {
      // Two finger gestures
      this.handlePinchZoom()
      this.handleTwoFingerPan()
    }
  }
  
  private handlePinchZoom(): void {
    const currentDistance = this.getDistanceBetweenTouches()
    const scale = currentDistance / this.initialDistance
    
    // Apply zoom
    this.camera.fov *= (2 - scale)
    this.camera.fov = Math.max(10, Math.min(120, this.camera.fov))
    this.camera.updateProjectionMatrix()
  }
  
  private handleTwoFingerPan(): void {
    const center = this.getCenterOfTouches()
    // Apply pan movement based on center movement
    this.controls.pan(center.deltaX, center.deltaY)
  }
}
```

### Touch-Safe Event Handling

```typescript
// Color picker touch events
satLumSquare.addEventListener('touchstart', (e) => {
  handleSatLumInteraction(e)
  e.preventDefault() // Prevent default touch behavior
}, { passive: false })

// Drag and drop touch events
card.addEventListener('touchstart', (e) => {
  e.preventDefault()
  handleStart(e.touches[0].clientX)
}, { passive: false })

card.addEventListener('touchmove', (e) => {
  e.preventDefault()
  handleMove(e.touches[0].clientX)
}, { passive: false })
```

## Control Systems

### Mobile Slider Implementation

Mobile controls use a custom slider implementation optimized for touch:

```typescript
function createSliderCard(
  name: string,
  currentValue: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void
): HTMLElement {
  const card = document.createElement('div')
  card.className = 'horizontal-control-card'
  
  card.innerHTML = `
    <div class="control-card-header">
      <span class="control-card-name">${name}</span>
      <span class="control-card-value">${currentValue}</span>
    </div>
    <input type="range" 
           class="mobile-control-slider" 
           min="${min}" 
           max="${max}" 
           step="${step}" 
           value="${currentValue}">
  `
  
  const slider = card.querySelector('.mobile-control-slider') as HTMLInputElement
  const valueDisplay = card.querySelector('.control-card-value') as HTMLElement
  
  // Touch-optimized event handling
  slider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value)
    valueDisplay.textContent = value.toString()
    onChange(value)
  })
  
  // External value update method
  ;(card as any).updateValue = (newValue: string) => {
    slider.value = newValue
    valueDisplay.textContent = newValue
  }
  
  return card
}
```

### Mobile Effects Panel Integration

```typescript
class MobileEffectsManager {
  private mobileChainContainer: HTMLElement
  private mobileParametersContainer: HTMLElement
  
  constructor() {
    this.setupMobileElements()
    this.setupMobileEventHandlers()
  }
  
  private setupMobileElements(): void {
    this.mobileChainContainer = document.getElementById('horizontal-effects-chain')!
    this.mobileParametersContainer = document.getElementById('horizontal-effects-controls')!
  }
  
  updateMobileEffectsChain(effects: EffectInstance[]): void {
    this.mobileChainContainer.innerHTML = ''
    
    effects.forEach((effect, index) => {
      const card = this.createMobileEffectCard(effect, index)
      this.mobileChainContainer.appendChild(card)
    })
  }
  
  private createMobileEffectCard(effect: EffectInstance, index: number): HTMLElement {
    const card = document.createElement('div')
    card.className = 'mobile-effect-card'
    card.innerHTML = `
      <div class="mobile-effect-name">${effect.displayName}</div>
      <div class="mobile-effect-controls">
        <button class="mobile-effect-toggle ${effect.enabled ? 'enabled' : ''}"
                data-effect-id="${effect.id}">
          ${effect.enabled ? '●' : '○'}
        </button>
        <button class="mobile-effect-params" data-effect-id="${effect.id}">⚙</button>
        <button class="mobile-effect-remove" data-effect-id="${effect.id}">×</button>
      </div>
    `
    
    // Touch event handlers
    this.attachMobileCardHandlers(card, effect)
    
    return card
  }
  
  private attachMobileCardHandlers(card: HTMLElement, effect: EffectInstance): void {
    const toggleBtn = card.querySelector('.mobile-effect-toggle') as HTMLElement
    const paramsBtn = card.querySelector('.mobile-effect-params') as HTMLElement
    const removeBtn = card.querySelector('.mobile-effect-remove') as HTMLElement
    
    toggleBtn.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.toggleEffect(effect.id)
    })
    
    paramsBtn.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.showParametersModal(effect)
    })
    
    removeBtn.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.removeEffect(effect.id)
    })
  }
}
```

### Mobile Color Picker

```typescript
class MobileColorPicker {
  private container: HTMLElement
  private isActive: boolean = false
  
  constructor(container: HTMLElement) {
    this.container = container
    this.setupTouchHandlers()
  }
  
  private setupTouchHandlers(): void {
    const satLumSquare = this.container.querySelector('.sat-lum-square') as HTMLElement
    const hueSlider = this.container.querySelector('.hue-slider') as HTMLElement
    
    // Saturation/Luminance touch handling
    satLumSquare.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this.isActive = true
      this.handleSatLumTouch(e.touches[0])
    }, { passive: false })
    
    satLumSquare.addEventListener('touchmove', (e) => {
      if (!this.isActive) return
      e.preventDefault()
      this.handleSatLumTouch(e.touches[0])
    }, { passive: false })
    
    satLumSquare.addEventListener('touchend', () => {
      this.isActive = false
    })
    
    // Hue slider touch handling
    hueSlider.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this.handleHueTouch(e.touches[0])
    }, { passive: false })
  }
  
  private handleSatLumTouch(touch: Touch): void {
    const rect = (touch.target as HTMLElement).getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height))
    
    this.updateSaturationLuminance(x, 1 - y)
  }
  
  private handleHueTouch(touch: Touch): void {
    const rect = (touch.target as HTMLElement).getBoundingClientRect()
    const y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height))
    
    this.updateHue(y * 360)
  }
}
```

## Performance Optimizations

### Touch-Specific Optimizations

```typescript
// Disable default touch behaviors that can interfere
document.body.style.cssText = `
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
`

// Optimized touch event handling
canvas.addEventListener('touchmove', (e) => {
  // Use passive: false only when necessary for preventDefault
  e.preventDefault()
  this.handleTouchMove(e)
}, { passive: false })

// Use passive listeners for non-critical events
window.addEventListener('touchstart', () => {
  this.resetIdleTimer()
}, { passive: true })
```

### Mobile Rendering Optimizations

```typescript
class MobileRenderer {
  private renderer: THREE.WebGLRenderer
  private isMobile: boolean
  
  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    this.isMobile = this.detectMobile()
    this.applyMobileOptimizations()
  }
  
  private applyMobileOptimizations(): void {
    if (this.isMobile) {
      // Reduce pixel ratio for mobile performance
      const pixelRatio = Math.min(window.devicePixelRatio, 1.5)
      this.renderer.setPixelRatio(pixelRatio)
      
      // Disable shadows on mobile
      this.renderer.shadowMap.enabled = false
      
      // Reduce anti-aliasing
      this.renderer.antialias = false
      
      // Optimize sphere detail for mobile
      this.adjustSphereDetailForMobile()
    }
  }
  
  private adjustSphereDetailForMobile(): void {
    // Reduce sphere segments for better performance
    const sphereGeometry = new THREE.SphereGeometry(1, 8, 6) // Lower detail
    // vs desktop: new THREE.SphereGeometry(1, 16, 12)
  }
}
```

### Memory Management for Mobile

```typescript
class MobileMemoryManager {
  private readonly MAX_MOBILE_POINTS = 500000 // Limit for mobile devices
  
  optimizeForMobile(pointCloud: THREE.Points): void {
    const geometry = pointCloud.geometry
    const positionArray = geometry.attributes.position.array
    
    if (positionArray.length / 3 > this.MAX_MOBILE_POINTS) {
      // Reduce point count for mobile
      this.decimatePointCloud(geometry, 0.5) // 50% reduction
    }
    
    // Use smaller textures
    this.optimizeTextures()
    
    // Clear unnecessary buffers
    this.clearUnusedBuffers()
  }
  
  private decimatePointCloud(geometry: THREE.BufferGeometry, factor: number): void {
    const positions = geometry.attributes.position.array
    const colors = geometry.attributes.color?.array
    
    const newPositions = new Float32Array(positions.length * factor)
    const newColors = colors ? new Uint8Array(colors.length * factor) : null
    
    // Sample points at regular intervals
    const step = Math.floor(1 / factor)
    let newIndex = 0
    
    for (let i = 0; i < positions.length; i += step * 3) {
      newPositions[newIndex] = positions[i]
      newPositions[newIndex + 1] = positions[i + 1]
      newPositions[newIndex + 2] = positions[i + 2]
      
      if (newColors && colors) {
        newColors[newIndex] = colors[i]
        newColors[newIndex + 1] = colors[i + 1]
        newColors[newIndex + 2] = colors[i + 2]
      }
      
      newIndex += 3
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
    if (newColors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3, true))
    }
  }
}
```

## Responsive Design

### Viewport Configuration

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

**Key Settings**:
- **user-scalable=no**: Prevents accidental zoom
- **maximum-scale=1.0**: Locks zoom level
- **viewport-fit=cover**: Safe area support for notched screens

### CSS Layout System

```css
/* Base mobile styles */
.mobile-only {
  display: none;
}

.desktop-only {
  display: block;
}

/* Mobile-specific layouts */
@media (hover: none) and (pointer: coarse) {
  .mobile-only {
    display: block;
  }
  
  .desktop-only {
    display: none;
  }
  
  /* Touch-friendly button sizing */
  button {
    min-height: 44px;
    min-width: 44px;
    touch-action: manipulation;
  }
  
  /* Prevent text selection on touch */
  * {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
}

/* Small screen adjustments */
@media (max-width: 768px) {
  .camera-info,
  .fps-counter,
  .navigation-help {
    display: none;
  }
  
  .hamburger-menu {
    display: block;
  }
}
```

### Dynamic Layout Adjustments

```typescript
function handleMobileResize(): void {
  const vh = window.innerHeight * 0.01
  document.documentElement.style.setProperty('--vh', `${vh}px`)
  
  // Adjust camera aspect ratio
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  
  // Update renderer size
  renderer.setSize(window.innerWidth, window.innerHeight)
  
  // Reposition mobile UI elements
  repositionMobileElements()
}

function repositionMobileElements(): void {
  const coreButtons = document.getElementById('mobile-core-buttons')
  const sceneButtons = document.getElementById('mobile-scene-buttons')
  
  // Adjust for virtual keyboard
  if (window.visualViewport) {
    const keyboardHeight = window.innerHeight - window.visualViewport.height
    if (keyboardHeight > 0) {
      coreButtons!.style.bottom = `${keyboardHeight + 12}px`
      sceneButtons!.style.bottom = `${keyboardHeight + 12}px`
    }
  }
}

// Listen for viewport changes (virtual keyboard)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleMobileResize)
}
```

## Code Examples

### Complete Mobile Panel Implementation

```typescript
class MobilePanelManager {
  private activePanels: Set<string> = new Set()
  private panelElements: Map<string, HTMLElement> = new Map()
  
  constructor() {
    this.initializePanels()
    this.setupPanelHandlers()
  }
  
  private initializePanels(): void {
    const panels = [
      'mobile-horizontal-effects-panel',
      'mobile-horizontal-settings-panel',
      'mobile-effect-parameters-box'
    ]
    
    panels.forEach(panelId => {
      const panel = document.getElementById(panelId)
      if (panel) {
        this.panelElements.set(panelId, panel)
      }
    })
  }
  
  showPanel(panelId: string): void {
    // Hide other panels first
    this.hideAllPanels()
    
    const panel = this.panelElements.get(panelId)
    if (!panel) return
    
    // Show panel with slide-up animation
    panel.style.display = 'block'
    panel.style.transform = 'translateY(100%)'
    
    requestAnimationFrame(() => {
      panel.style.transition = 'transform 0.3s ease-out'
      panel.style.transform = 'translateY(0)'
    })
    
    this.activePanels.add(panelId)
    
    // Setup outside tap to close
    this.setupOutsideTapHandler(panelId)
  }
  
  hidePanel(panelId: string): void {
    const panel = this.panelElements.get(panelId)
    if (!panel) return
    
    panel.style.transform = 'translateY(100%)'
    
    setTimeout(() => {
      panel.style.display = 'none'
      panel.style.transition = ''
    }, 300)
    
    this.activePanels.delete(panelId)
  }
  
  private setupOutsideTapHandler(panelId: string): void {
    const handler = (event: TouchEvent) => {
      const panel = this.panelElements.get(panelId)
      if (!panel) return
      
      if (!panel.contains(event.target as Node)) {
        this.hidePanel(panelId)
        document.removeEventListener('touchstart', handler)
      }
    }
    
    // Delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('touchstart', handler)
    }, 100)
  }
  
  hideAllPanels(): void {
    this.activePanels.forEach(panelId => {
      this.hidePanel(panelId)
    })
  }
}
```

### Mobile Gesture Recognition

```typescript
class MobileGestureRecognizer {
  private startTime: number = 0
  private startPos: { x: number, y: number } = { x: 0, y: 0 }
  private threshold = {
    tap: 150, // ms
    swipe: 100, // pixels
    longPress: 500 // ms
  }
  
  constructor(private element: HTMLElement) {
    this.setupGestureHandlers()
  }
  
  private setupGestureHandlers(): void {
    this.element.addEventListener('touchstart', (e) => {
      this.startTime = performance.now()
      this.startPos.x = e.touches[0].clientX
      this.startPos.y = e.touches[0].clientY
      
      // Setup long press detection
      this.setupLongPressDetection()
    })
    
    this.element.addEventListener('touchend', (e) => {
      const endTime = performance.now()
      const duration = endTime - this.startTime
      
      const endPos = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY
      }
      
      const deltaX = endPos.x - this.startPos.x
      const deltaY = endPos.y - this.startPos.y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      
      if (duration < this.threshold.tap && distance < 10) {
        this.handleTap(endPos)
      } else if (distance > this.threshold.swipe) {
        this.handleSwipe(deltaX, deltaY, duration)
      }
    })
  }
  
  private handleTap(position: { x: number, y: number }): void {
    this.element.dispatchEvent(new CustomEvent('mobileTap', {
      detail: { position }
    }))
  }
  
  private handleSwipe(deltaX: number, deltaY: number, duration: number): void {
    const direction = this.getSwipeDirection(deltaX, deltaY)
    const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / duration
    
    this.element.dispatchEvent(new CustomEvent('mobileSwipe', {
      detail: { direction, velocity, deltaX, deltaY }
    }))
  }
  
  private getSwipeDirection(deltaX: number, deltaY: number): string {
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right' : 'left'
    } else {
      return deltaY > 0 ? 'down' : 'up'
    }
  }
  
  private setupLongPressDetection(): void {
    const longPressTimer = setTimeout(() => {
      this.element.dispatchEvent(new CustomEvent('mobileLongPress', {
        detail: { position: this.startPos }
      }))
    }, this.threshold.longPress)
    
    // Clear timer on touch end or move
    const clearTimer = () => {
      clearTimeout(longPressTimer)
      this.element.removeEventListener('touchend', clearTimer)
      this.element.removeEventListener('touchmove', clearTimer)
    }
    
    this.element.addEventListener('touchend', clearTimer)
    this.element.addEventListener('touchmove', clearTimer)
  }
}
```

### Mobile-Optimized Effects Interface

```typescript
class MobileEffectsInterface {
  private effectsPanel: HTMLElement
  private parametersBox: HTMLElement
  private currentEffect: EffectInstance | null = null
  
  constructor() {
    this.effectsPanel = document.getElementById('mobile-horizontal-effects-panel')!
    this.parametersBox = document.getElementById('mobile-effect-parameters-box')!
    this.setupMobileEffectsHandlers()
  }
  
  private setupMobileEffectsHandlers(): void {
    // Mobile effects button
    const effectsButton = document.getElementById('mobile-effects-button')
    effectsButton?.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.toggleEffectsPanel()
    })
    
    // Parameter box close button
    const closeButton = document.getElementById('parameters-box-close')
    closeButton?.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.hideParametersBox()
    })
  }
  
  showEffectParameters(effect: EffectInstance): void {
    this.currentEffect = effect
    
    const titleElement = document.getElementById('parameters-box-title')
    if (titleElement) {
      titleElement.textContent = `${effect.displayName} Parameters`
    }
    
    const contentElement = document.getElementById('parameters-box-content')
    if (contentElement) {
      contentElement.innerHTML = ''
      this.populateParameterControls(contentElement, effect)
    }
    
    // Show with slide-in animation
    this.parametersBox.style.display = 'block'
    this.parametersBox.style.transform = 'translateY(-100%)'
    
    requestAnimationFrame(() => {
      this.parametersBox.style.transition = 'transform 0.3s ease-out'
      this.parametersBox.style.transform = 'translateY(0)'
    })
  }
  
  private populateParameterControls(container: HTMLElement, effect: EffectInstance): void {
    Object.entries(effect.parameters).forEach(([paramName, paramValue]) => {
      const paramConfig = this.getParameterConfig(effect.type, paramName)
      if (!paramConfig) return
      
      const controlElement = this.createMobileParameterControl(
        paramName,
        paramValue,
        paramConfig,
        (newValue) => this.updateEffectParameter(effect.id, paramName, newValue)
      )
      
      container.appendChild(controlElement)
    })
  }
  
  private createMobileParameterControl(
    name: string,
    value: number | boolean,
    config: ParameterConfig,
    onChange: (value: number | boolean) => void
  ): HTMLElement {
    const container = document.createElement('div')
    container.className = 'mobile-parameter-control'
    
    if (typeof value === 'boolean') {
      // Boolean toggle
      container.innerHTML = `
        <div class="parameter-label">${name}</div>
        <button class="mobile-toggle-button ${value ? 'active' : ''}" 
                data-param="${name}">
          ${value ? 'ON' : 'OFF'}
        </button>
      `
      
      const button = container.querySelector('.mobile-toggle-button') as HTMLElement
      button.addEventListener('touchend', (e) => {
        e.preventDefault()
        const newValue = !value
        button.textContent = newValue ? 'ON' : 'OFF'
        button.classList.toggle('active', newValue)
        onChange(newValue)
      })
      
    } else {
      // Number slider
      container.innerHTML = `
        <div class="parameter-label">${name}</div>
        <div class="mobile-slider-container">
          <input type="range" 
                 class="mobile-parameter-slider"
                 min="${config.min}" 
                 max="${config.max}" 
                 step="${config.step}"
                 value="${value}">
          <span class="mobile-parameter-value">${value}</span>
        </div>
      `
      
      const slider = container.querySelector('.mobile-parameter-slider') as HTMLInputElement
      const valueDisplay = container.querySelector('.mobile-parameter-value') as HTMLElement
      
      slider.addEventListener('input', (e) => {
        const newValue = parseFloat((e.target as HTMLInputElement).value)
        valueDisplay.textContent = newValue.toString()
        onChange(newValue)
      })
    }
    
    return container
  }
}

interface ParameterConfig {
  min: number
  max: number
  step: number
  type: 'number' | 'boolean'
}
```

This mobile implementation provides a comprehensive touch-optimized interface that maintains full feature parity with the desktop version while being specifically designed for touch interaction patterns and mobile device constraints.