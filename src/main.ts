import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ProgressiveLoader } from './ProgressiveLoader.js'
import { OrbitalCameraSystem } from './camera'
import { ModelManager } from './models'
import { ContentLoader } from './interface'
import { PostProcessingPass } from './effects'
import { GalleryManager, CameraCapture } from './gallery'
import type { InterfaceMode } from './types'
import type { EffectsChainManager, EffectInstance } from './effects/EffectsChainManager'
import type { GalleryItem, CaptureProgress } from './gallery'

// Extend Window interface for effects chain manager
declare global {
  interface Window {
    effectsChainManager: EffectsChainManager
    refreshHorizontalEffects: () => void
  }
}

// DOM elements
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!

// Global state
let currentInterfaceMode: InterfaceMode = 'home'
let currentProjectId: string | null = null

// Framerate monitoring for automatic sphere detail adjustment
let frameCount = 0
let lastFramerateCheck = performance.now()
let lastFrameTime = performance.now()
let currentFramerate = 60
let sphereDetailLevel = 1 // Start with medium detail
let lastSphereDetailAdjustment = 0

// Input type detection and layout management
function detectAndApplyInputType() {
  const body = document.body
  const hasTouch = navigator.maxTouchPoints > 0
  const hasHover = window.matchMedia('(hover: hover)').matches
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  
  // Remove previous classes
  body.classList.remove('touch-layout', 'mouse-layout', 'hybrid-layout')
  
  if (hasTouch && !hasHover) {
    body.classList.add('touch-layout')
    console.log('Touch device detected')
  } else if (!hasTouch && hasHover && hasFinePointer) {
    body.classList.add('mouse-layout')
    console.log('Mouse device detected')
  } else {
    body.classList.add('hybrid-layout')
    console.log('Hybrid device detected')
  }
}

// Three.js setup
const scene = new THREE.Scene()
const backgroundColor = new THREE.Color(0x151515)
scene.background = backgroundColor

// Add fog for atmospheric depth - matches background color
scene.fog = new THREE.FogExp2(backgroundColor.getHex(), 0.003)

const camera = new THREE.PerspectiveCamera(
  75, 
  window.innerWidth / window.innerHeight, 
  0.01,  // Closer near plane for better close-up detail
  500    // Reduced far plane for better depth precision
)

const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas,
  antialias: true,
  alpha: true,
  logarithmicDepthBuffer: true,  // Better depth precision
  preserveDrawingBuffer: true    // Enable canvas reading for capture
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Improve depth testing and culling
renderer.sortObjects = true

// Enable HDR tone mapping and environment lighting
// Disable built-in tone mapping to use consistent custom shaders
renderer.toneMapping = THREE.NoToneMapping
renderer.toneMappingExposure = 1

// Basic lighting setup without HDR environment

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.05

// Progressive loader
const progressiveLoader = new ProgressiveLoader(scene, `${import.meta.env.BASE_URL}`)

// Post-processing effects (includes effects chain management)
const postProcessingPass = new PostProcessingPass(window.innerWidth, window.innerHeight, renderer)
postProcessingPass.setMainScene(scene, camera)

const pixelRatio = Math.min(window.devicePixelRatio, 2)
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * pixelRatio, 
  window.innerHeight * pixelRatio, 
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    generateMipmaps: false,
    stencilBuffer: false
  }
)

// Initialize module instances
const contentLoader = new ContentLoader()

// Gallery system
const galleryManager = new GalleryManager()
const cameraCapture = new CameraCapture(renderer, scene, camera)
galleryManager.setCameraCapture(cameraCapture)

// Expose contentLoader, effects, and gallery globally for OrbitalCameraSystem to access
;(window as any).contentLoader = contentLoader
;(window as any).postProcessingPass = postProcessingPass
;(window as any).updatePostProcessingPointClouds = () => postProcessingPass.updatePointClouds()
;(window as any).galleryManager = galleryManager
;(window as any).cameraCapture = cameraCapture

const modelManager = new ModelManager(
  scene,
  progressEl,
  progressFill,
  progressiveLoader,
  null // will be set after orbital camera is created
)

// Expose modelManager globally for effects system to access
;(window as any).modelManager = modelManager

const orbitalCamera = new OrbitalCameraSystem(
  camera,
  controls,
  canvas,
  scene,
  () => modelManager.getModelsConfig()!,
  () => currentInterfaceMode,
  (mode: InterfaceMode) => { currentInterfaceMode = mode },
  () => currentProjectId,
  (id: string | null) => { currentProjectId = id },
  () => contentLoader.getProjectsConfig(),
  progressiveLoader,
  (object: THREE.Points | import('@sparkjsdev/spark').SplatMesh | null) => modelManager.setCurrentRenderObject(object)
)

// Set mutual references between model manager and orbital camera
;(modelManager as any).orbitalCamera = orbitalCamera
;(orbitalCamera as any).modelManager = modelManager

// Expose effects chain manager globally for mobile effects system
;(window as any).effectsChainManager = orbitalCamera.getEffectsChainManager()

// Expose mobile rotation fill function globally for scene state updates
;(window as any).updateMobileRotationFill = null // Will be set when mobile camera is initialized

// Main render loop
function animate() {
  requestAnimationFrame(animate)
  
  // Monitor framerate for automatic sphere detail adjustment
  frameCount++
  const now = performance.now()
  const deltaTime = now - lastFramerateCheck
  
  // Update FPS counter display every frame
  const fpsElement = document.getElementById('fps-value')
  if (fpsElement && deltaTime > 0) {
    const instantFPS = 1000 / (now - (lastFrameTime || now))
    fpsElement.textContent = Math.round(instantFPS).toString()
  }
  
  // Check framerate every second for sphere detail adjustment
  if (deltaTime >= 1000) {
    currentFramerate = (frameCount * 1000) / deltaTime
    frameCount = 0
    lastFramerateCheck = now
    
    // Automatic sphere detail adjustment based on framerate
    if (modelManager && modelManager.getSphereInstancer()?.isEnabled()) {
      const timeSinceLastAdjustment = now - lastSphereDetailAdjustment
      
      // Only adjust sphere detail every 3 seconds to avoid rapid changes
      if (timeSinceLastAdjustment >= 3000) {
        let newDetailLevel = sphereDetailLevel
        
        // If framerate is low (below 30fps), decrease detail
        if (currentFramerate < 30 && sphereDetailLevel > 0) {
          newDetailLevel = sphereDetailLevel - 1
          console.log(`🔽 Low framerate (${currentFramerate.toFixed(1)}fps), reducing sphere detail to ${newDetailLevel}`)
        }
        // If framerate is high (above 50fps), increase detail
        else if (currentFramerate > 50 && sphereDetailLevel < 2) {
          newDetailLevel = sphereDetailLevel + 1
          console.log(`🔼 High framerate (${currentFramerate.toFixed(1)}fps), increasing sphere detail to ${newDetailLevel}`)
        }
        
        // Apply the new detail level if it changed
        if (newDetailLevel !== sphereDetailLevel) {
          sphereDetailLevel = newDetailLevel
          modelManager.getSphereInstancer()?.setSphereDetail(sphereDetailLevel)
          lastSphereDetailAdjustment = now
        }
      }
    }
  }
  
  // Store original camera position
  const originalPosition = camera.position.clone()
  const originalTarget = controls.target.clone()
  
  controls.update()
  
  // If we have a custom rotation center, adjust the camera rotation
  if (orbitalCamera.clickedPoint && !orbitalCamera.clickedPoint.equals(controls.target)) {
    // Calculate rotation that OrbitControls applied around its target
    const controlsOffset = originalPosition.clone().sub(originalTarget)
    const newOffset = camera.position.clone().sub(controls.target)
    
    // Apply the same rotation around our custom rotation center
    const customOffset = originalPosition.clone().sub(orbitalCamera.clickedPoint)
    
    // Calculate rotation quaternion from the change in OrbitControls
    const oldDir = controlsOffset.normalize()
    const newDir = newOffset.normalize()
    const quaternion = new THREE.Quaternion().setFromUnitVectors(oldDir, newDir)
    
    // Apply rotation to our custom offset
    customOffset.applyQuaternion(quaternion)
    
    // Set camera position relative to custom rotation center
    camera.position.copy(orbitalCamera.clickedPoint.clone().add(customOffset))
  }
  
  orbitalCamera.update()
  
  // Check if we actually have effects to apply and if post-processing is enabled
  const effectsChain = postProcessingPass.getEffectsChain()
  const hasActiveEffects = postProcessingPass.enabled && (
    effectsChain.some((effect: any) => effect.enabled && (
      effect.type === 'background' || // Background effects are always active when enabled
      effect.type === 'drawrange' ||  // DrawRange effects are always active when enabled
      effect.type === 'pointnetwork' || // Point network effects are always active when enabled
      effect.type === 'material' ||   // Material effects are always active when enabled
      effect.type === 'topographic' || // Topographic effects are always active when enabled
      (effect.parameters.intensity || 0) > 0 // Other effects need intensity > 0
    )) || 
    ((postProcessingPass as any).effectType !== 'none' && postProcessingPass.intensity > 0)
  )
  
  if (hasActiveEffects) {
    // Render scene to render target and apply effects
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)
    
    // Process effects through the modern chain system
    postProcessingPass.render(renderer, renderTarget.texture, null)
  } else {
    // Normal rendering - no effects to apply, render directly to screen
    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
  }
  
  // Update frame time for next FPS calculation
  lastFrameTime = now
}

// Handle window resize
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  
  // Update effect pass sizes
  const pixelRatio = Math.min(window.devicePixelRatio, 2)
  postProcessingPass.setSize(window.innerWidth, window.innerHeight)
  renderTarget.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio)
  
  // Reapply input type detection (useful for device orientation changes)
  detectAndApplyInputType()
}

function handleTouchMove(event: TouchEvent) {
  if (event.touches.length === 1) {
    event.preventDefault()
    // Touch handling code (no brush-specific logic needed)
  }
}

// Add event listeners 
canvas.addEventListener('touchmove', handleTouchMove, { passive: false })

window.addEventListener('resize', handleResize)

// Simple mobile button positioning (since bottom sheet is hidden)
let positioningInitialized = false
function setMobileButtonPositions() {
  // Only run once since CSS now has correct initial positions
  if (positioningInitialized) {
    console.log('🔧 setMobileButtonPositions skipped - already initialized')
    return
  }
  
  console.log('🔧 setMobileButtonPositions called (first time)')
  const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
  const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
  const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
  
  // Since bottom sheet is hidden and CSS has correct positions, just ensure they're set
  const fixedBottomPosition = 12 // 12px from bottom
  
  if (effectsButtonContainer && effectsButtonContainer.style.bottom !== `${fixedBottomPosition}px`) {
    effectsButtonContainer.style.bottom = `${fixedBottomPosition}px`
    console.log(`✅ Effects container positioned: ${effectsButtonContainer.style.bottom}`)
  }
  
  if (cameraButtonContainer && cameraButtonContainer.style.bottom !== `${fixedBottomPosition}px`) {
    cameraButtonContainer.style.bottom = `${fixedBottomPosition}px`
    console.log(`✅ Camera container positioned: ${cameraButtonContainer.style.bottom}`)
  }
  
  if (settingsButtonContainer && settingsButtonContainer.style.bottom !== `${fixedBottomPosition}px`) {
    settingsButtonContainer.style.bottom = `${fixedBottomPosition}px`
    console.log(`✅ Settings container positioned: ${settingsButtonContainer.style.bottom}`)
  }
  
  positioningInitialized = true
  console.log('🔧 Mobile button positioning initialized')
}

// Color conversion utilities
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 }
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const diff = max - min
  const s = max === 0 ? 0 : diff / max
  const v = max
  
  let h = 0
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / diff + 2) / 6
    else h = ((r - g) / diff + 4) / 6
  }
  
  return { h: h * 360, s, v }
}

function hsvToRgb(h: number, s: number, v: number) {
  h /= 360
  const c = v * s
  const x = c * (1 - Math.abs((h * 6) % 2 - 1))
  const m = v - c
  
  let r = 0, g = 0, b = 0
  if (h < 1/6) { r = c; g = x; b = 0 }
  else if (h < 2/6) { r = x; g = c; b = 0 }
  else if (h < 3/6) { r = 0; g = c; b = x }
  else if (h < 4/6) { r = 0; g = x; b = c }
  else if (h < 5/6) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}


function showMobileColorPicker(initialHex: string, onColorChange: (hex: string) => void) {
  // Find the mobile parameters box to position relative to it
  const parametersBox = document.getElementById('mobile-effect-parameters-box') as HTMLElement
  if (!parametersBox) return
  
  const rect = parametersBox.getBoundingClientRect()
  
  // Create small popup positioned at bottom left of parameters box
  const popup = document.createElement('div')
  popup.className = 'color-picker-popup'
  popup.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 10}px;
    background: rgba(0, 20, 0, 0.95);
    border: 1px solid #00ff00;
    border-radius: 6px;
    padding: 12px;
    width: 200px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 255, 0, 0.3);
    transform: translateY(-10px);
    opacity: 0;
    transition: all 0.2s ease;
  `
  
  // Convert initial color to HSV
  const rgb = hexToRgb(initialHex)
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  
  popup.innerHTML = `
    <div class="color-controls-compact" style="display: flex; gap: 8px; align-items: flex-start;">
      <div class="sat-lum-square" style="
        width: 140px;
        height: 100px;
        position: relative;
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 3px;
        cursor: crosshair;
        flex-shrink: 0;
      ">
        <div class="sat-lum-overlay"></div>
        <div class="sat-lum-cursor" style="left: ${hsv.s * 100}%; top: ${(1 - hsv.v) * 100}%;"></div>
      </div>
      <div class="hue-slider" style="
        width: 32px;
        height: 100px;
        position: relative;
        border: 1px solid rgba(255, 255, 255, 0.4);
        border-radius: 3px;
        cursor: pointer;
        flex-shrink: 0;
        background: linear-gradient(to bottom, 
          #ff0000 0%, 
          #ffff00 16.666%, 
          #00ff00 33.333%, 
          #00ffff 50%, 
          #0000ff 66.666%, 
          #ff00ff 83.333%, 
          #ff0000 100%);
      ">
        <div class="hue-cursor" style="top: ${hsv.h / 360 * 100}%;"></div>
      </div>
    </div>
    <div class="color-picker-buttons-compact" style="
      position: relative;
      margin-top: 8px;
      height: 20px;
    ">
      <button class="color-picker-confirm" style="
        background: rgba(0, 255, 0, 0.2);
        border: 0.5px solid #00ff00;
        color: #00ff00;
        padding: 2px;
        border-radius: 50%;
        font-family: 'Space Mono', monospace;
        font-size: 0.7rem;
        cursor: pointer;
        width: 20px;
        height: 20px;
        min-width: 20px;
        min-height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        position: absolute;
        left: 33%;
        transform: translateX(-50%);
      ">✓</button>
      <button class="color-picker-cancel" style="
        background: rgba(255, 0, 0, 0.2);
        border: 0.5px solid #ff0000;
        color: #ff0000;
        padding: 2px;
        border-radius: 50%;
        font-family: 'Space Mono', monospace;
        font-size: 0.7rem;
        cursor: pointer;
        width: 20px;
        height: 20px;
        min-width: 20px;
        min-height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        position: absolute;
        left: 66%;
        transform: translateX(-50%);
      ">×</button>
    </div>
  `
  
  document.body.appendChild(popup)
  
  // Animate in
  setTimeout(() => {
    popup.style.transform = 'translateY(0)'
    popup.style.opacity = '1'
  }, 10)
  
  // Set up color picker interaction
  let currentHsv = { ...hsv }
  const satLumSquare = popup.querySelector('.sat-lum-square') as HTMLElement
  const satLumCursor = popup.querySelector('.sat-lum-cursor') as HTMLElement
  const hueSlider = popup.querySelector('.hue-slider') as HTMLElement
  const hueCursor = popup.querySelector('.hue-cursor') as HTMLElement
  
  function updateModalColor() {
    const rgb = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v)
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
    
    // Update square background based on hue
    const hueRgb = hsvToRgb(currentHsv.h, 1, 1)
    const hueHex = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b)
    satLumSquare.style.backgroundColor = hueHex
    
    // Automatically apply the color change in real-time
    onColorChange(hex)
  }
  
  // Saturation/Luminance square interaction
  function handleSatLumInteraction(e: MouseEvent | TouchEvent) {
    const rect = satLumSquare.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    
    currentHsv.s = x
    currentHsv.v = 1 - y
    
    satLumCursor.style.left = `${x * 100}%`
    satLumCursor.style.top = `${y * 100}%`
    
    updateModalColor()
  }
  
  // Hue slider interaction (vertical)
  function handleHueInteraction(e: MouseEvent | TouchEvent) {
    const rect = hueSlider.getBoundingClientRect()
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    
    currentHsv.h = y * 360
    
    hueCursor.style.top = `${y * 100}%`
    
    updateModalColor()
  }
  
  // Event listeners
  let isMouseDown = false
  let isHueMouseDown = false
  
  satLumSquare.addEventListener('mousedown', (e) => {
    isMouseDown = true
    handleSatLumInteraction(e)
    e.preventDefault()
  })
  
  satLumSquare.addEventListener('touchstart', (e) => {
    handleSatLumInteraction(e)
    e.preventDefault()
  })
  
  document.addEventListener('mousemove', (e) => {
    if (isMouseDown) handleSatLumInteraction(e)
  })
  
  document.addEventListener('mouseup', () => {
    isMouseDown = false
  })
  
  satLumSquare.addEventListener('touchmove', handleSatLumInteraction)
  
  hueSlider.addEventListener('mousedown', (e) => {
    isHueMouseDown = true
    handleHueInteraction(e)
    e.preventDefault()
  })
  
  hueSlider.addEventListener('touchstart', (e) => {
    handleHueInteraction(e)
    e.preventDefault()
  })
  
  document.addEventListener('mousemove', (e) => {
    if (isHueMouseDown) handleHueInteraction(e)
  })
  
  document.addEventListener('mouseup', () => {
    isHueMouseDown = false
  })
  
  hueSlider.addEventListener('touchmove', handleHueInteraction)
  
  // Button handlers
  const cancelButton = popup.querySelector('.color-picker-cancel') as HTMLElement
  const confirmButton = popup.querySelector('.color-picker-confirm') as HTMLElement
  
  function acceptAndClose() {
    popup.style.transform = 'translateY(-10px)'
    popup.style.opacity = '0'
    setTimeout(() => {
      if (popup.parentNode) {
        document.body.removeChild(popup)
      }
    }, 200)
    // Color is already applied in real-time, so we just close
  }
  
  function cancelAndClose() {
    // Revert to original color
    onColorChange(initialHex)
    popup.style.transform = 'translateY(-10px)'
    popup.style.opacity = '0'
    setTimeout(() => {
      if (popup.parentNode) {
        document.body.removeChild(popup)
      }
    }, 200)
  }
  
  // Checkmark button accepts current color
  confirmButton.addEventListener('click', (e) => {
    e.stopPropagation()
    acceptAndClose()
  })
  
  // X button cancels and reverts
  cancelButton.addEventListener('click', (e) => {
    e.stopPropagation()
    cancelAndClose()
  })
  
  // Accept current value when clicking outside the popup
  setTimeout(() => {
    document.addEventListener('click', function closeOnClickOutside(e) {
      if (!popup.contains(e.target as Node)) {
        acceptAndClose()
        document.removeEventListener('click', closeOnClickOutside)
      }
    })
  }, 100)
  
  // Initialize color
  updateModalColor()
}

// Shared parameter slider card creation function
function createParameterSliderCard(label: string, currentValue: string, min: number, max: number, step: number, onChange: (value: number) => void, paramType?: string) {
  const card = document.createElement('div')
  card.className = 'parameter-control'
  
  if (paramType === 'color') {
    // Create color swatch for mobile (popup on click)
    const hexValue = '#' + Math.floor(parseFloat(currentValue)).toString(16).padStart(6, '0')
    
    card.innerHTML = `
      <label>${label}</label>
      <div class="mobile-color-swatch" style="
        width: 24px;
        height: 24px;
        background-color: ${hexValue};
        border: 1px solid #ffffff;
        border-radius: 50%;
        cursor: pointer;
        margin-left: auto;
        flex-shrink: 0;
      " data-color="${hexValue}"></div>
    `
    
    // Add click handler to show popup color picker
    const colorSwatch = card.querySelector('.mobile-color-swatch') as HTMLElement
    colorSwatch.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      showMobileColorPicker(hexValue, (newHex) => {
        const numericValue = parseInt(newHex.replace('#', ''), 16)
        colorSwatch.style.backgroundColor = newHex
        colorSwatch.setAttribute('data-color', newHex)
        onChange(numericValue)
      })
    })
  } else {
    // Create slider for numeric parameters
    const normalizedValue = (parseFloat(currentValue) - min) / (max - min)
    const fillPercentage = Math.max(0, Math.min(100, normalizedValue * 100))
    
    card.innerHTML = `
      <label>${label}</label>
      <div class="parameter-value">${parseFloat(currentValue).toFixed(3)}</div>
      <div class="parameter-fill" style="width: ${fillPercentage}%"></div>
    `
  }
  
  // Only add slider interaction for non-color parameters
  if (paramType !== 'color') {
    // Touch interaction for slider - relative movement only
    let isDragging = false
    let startX = 0
    let startValue = parseFloat(currentValue)
    let currentSliderValue = parseFloat(currentValue)
  
  const handleStart = (clientX: number) => {
    isDragging = true
    startX = clientX
    startValue = currentSliderValue
    card.classList.add('dragging')
  }
  
  const handleMove = (clientX: number) => {
    if (!isDragging) return
    
    const rect = card.getBoundingClientRect()
    const deltaX = clientX - startX
    const sensitivityFactor = 1.0
    const percentageChange = (deltaX * sensitivityFactor) / rect.width
    const valueRange = max - min
    const newValue = Math.max(min, Math.min(max, startValue + (percentageChange * valueRange)))
    const steppedValue = Math.round(newValue / step) * step
    
    // Update current slider value
    currentSliderValue = steppedValue
    
    // Update visual fill
    const fillPercent = ((steppedValue - min) / (max - min)) * 100
    const fillElement = card.querySelector('.parameter-fill') as HTMLElement
    const valueElement = card.querySelector('.parameter-value') as HTMLElement
    
    if (fillElement) fillElement.style.width = `${fillPercent}%`
    if (valueElement) valueElement.textContent = steppedValue.toFixed(3)
    
    onChange(steppedValue)
  }
  
  const handleEnd = () => {
    isDragging = false
    card.classList.remove('dragging')
  }
  
  // Touch events
  card.addEventListener('touchstart', (e) => {
    e.preventDefault()
    handleStart(e.touches[0].clientX)
  })
  
  card.addEventListener('touchmove', (e) => {
    e.preventDefault()
    handleMove(e.touches[0].clientX)
  })
  
  card.addEventListener('touchend', (e) => {
    e.preventDefault()
    handleEnd()
  })
  
  // Mouse events for desktop testing
  const handleMouseMove = (e: MouseEvent) => {
    handleMove(e.clientX)
  }
  
  const handleMouseUp = () => {
    handleEnd()
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  
  card.addEventListener('mousedown', (e) => {
    e.preventDefault()
    handleStart(e.clientX)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  })
  }
  
  return card
}

// Mobile effects button functionality
function setupMobileEffectsButton() {
  const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
  const effectsButton = document.getElementById('mobile-effects-button-element') as HTMLElement
  const horizontalEffectsPanel = document.getElementById('mobile-horizontal-effects-panel') as HTMLElement
  const horizontalEffectsChain = document.getElementById('horizontal-effects-chain') as HTMLElement
  const parametersBox = document.getElementById('mobile-effect-parameters-box') as HTMLElement
  const parametersBoxTitle = document.getElementById('parameters-box-title') as HTMLElement
  const parametersBoxContent = document.getElementById('parameters-box-content') as HTMLElement
  const parametersBoxClose = document.getElementById('parameters-box-close') as HTMLElement
  
  if (!effectsButtonContainer || !effectsButton || !horizontalEffectsPanel || !horizontalEffectsChain || 
      !parametersBox || !parametersBoxTitle || !parametersBoxContent || !parametersBoxClose) {
    console.warn('Mobile effects button elements not found')
    return
  }
  
  // Initialize panel manager and register this panel
  const manager = initializePanelManager()
  manager.registerPanel('effects', horizontalEffectsPanel)
  
  // Effects button is always visible now (no bottom sheet)
  function updateEffectsButtonVisibility() {
    effectsButtonContainer.style.opacity = '1'
    effectsButtonContainer.style.pointerEvents = 'auto'
  }
  
  function toggleEffectsPanel() {
    const isOpen = manager.togglePanel('effects')
    
    if (isOpen) {
      refreshHorizontalEffectsChain()
    } else {
      closeParametersBox()
    }
  }
  
  function closeParametersBox() {
    parametersBox.classList.remove('show')
    // Hide the panel after transition completes
    setTimeout(() => {
      if (!parametersBox.classList.contains('show')) {
        parametersBox.style.display = 'none'
      }
    }, 300) // Match the CSS transition duration
    
    // Hide trash icon when parameters box is closed
    hideTrashIcon()
    
    // Remove selection from all cards
    horizontalEffectsChain.querySelectorAll('.horizontal-effect-card').forEach(card => {
      card.classList.remove('selected')
    })
  }
  
  // Clean mobile drag system
  function setupMobileDrag(card: HTMLElement, effect: any) {
    let longPressTimer: number | null = null
    let isDragging = false
    let startX = 0
    let startY = 0
    let dragClone: HTMLElement | null = null
    
    card.addEventListener('touchstart', (e) => {
      const touch = e.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      
      // Start long press detection
      longPressTimer = setTimeout(() => {
        startDrag(touch.clientX, touch.clientY)
      }, 150)
    })
    
    card.addEventListener('touchmove', (e) => {
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - startX)
      const deltaY = Math.abs(touch.clientY - startY)
      
      // Cancel long press if user moves > 10px (scrolling)
      if (!isDragging && (deltaX > 10 || deltaY > 10)) {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
        return
      }
      
      // Update drag position if dragging
      if (isDragging && dragClone) {
        e.preventDefault()
        updateDragPosition(touch.clientX, touch.clientY)
        checkDropZones(touch.clientX, touch.clientY)
      }
    })
    
    card.addEventListener('touchend', (e) => {
      // Clean up long press timer
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      
      if (isDragging) {
        const touch = e.changedTouches[0]
        handleDrop(touch.clientX, touch.clientY)
      } else {
        // Quick tap - select effect
        selectEffect(effect.id)
      }
    })
    
    function startDrag(x: number, y: number) {
      isDragging = true
      
      // Create visual clone
      dragClone = card.cloneNode(true) as HTMLElement
      dragClone.style.position = 'fixed'
      dragClone.style.pointerEvents = 'none'
      dragClone.style.zIndex = '9999'
      dragClone.style.opacity = '0.8'
      dragClone.style.transform = 'rotate(5deg)'
      dragClone.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.5)'
      
      // Position clone at touch point
      const rect = card.getBoundingClientRect()
      dragClone.style.width = rect.width + 'px'
      dragClone.style.height = rect.height + 'px'
      dragClone.style.left = (x - rect.width/2) + 'px'
      dragClone.style.top = (y - rect.height/2) + 'px'
      
      document.body.appendChild(dragClone)
      
      // Hide original card
      card.style.opacity = '0.3'
      
      // Show trash icon
      showTrashIconPermanent()
      
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
    }
    
    function updateDragPosition(x: number, y: number) {
      if (!dragClone) return
      
      const rect = dragClone.getBoundingClientRect()
      dragClone.style.left = (x - rect.width/2) + 'px'
      dragClone.style.top = (y - rect.height/2) + 'px'
    }
    
    function checkDropZones(x: number, y: number) {
      // Check trash icon
      const trashIcon = document.getElementById('mobile-trash-icon')
      if (trashIcon) {
        const trashRect = trashIcon.getBoundingClientRect()
        const isOverTrash = (
          x >= trashRect.left && x <= trashRect.right &&
          y >= trashRect.top && y <= trashRect.bottom
        )
        
        if (isOverTrash) {
          trashIcon.classList.add('drag-over')
          const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
          if (trashButton) {
            trashButton.style.backgroundColor = 'rgba(255, 0, 0, 0.8)'
          }
        } else {
          trashIcon.classList.remove('drag-over')
          const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
          if (trashButton) {
            trashButton.style.backgroundColor = ''
          }
        }
      }
      
      // Check reorder zones (between other cards)
      const effectCards = horizontalEffectsChain.querySelectorAll('.horizontal-effect-card')
      
      // Clear any existing insertion indicators
      document.querySelectorAll('.insertion-indicator').forEach(indicator => {
        indicator.remove()
      })
      
      let insertionIndex = -1
      let insertionX = -1
      
      effectCards.forEach((otherCard, index) => {
        if (otherCard === card) return
        
        const rect = otherCard.getBoundingClientRect()
        const isOver = (
          x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom
        )
        
        if (isOver) {
          otherCard.classList.add('drop-target')
          insertionIndex = index
          
          // Determine if we're moving left or right
          const currentIndex = parseInt(card.dataset.effectIndex || '0')
          const targetIndex = index
          
          if (currentIndex < targetIndex) {
            // Moving right (downstream) - bar goes after the target card
            // Position exactly between target card and next card
            const nextCard = effectCards[index + 1] as HTMLElement
            if (nextCard && nextCard !== card) {
              const nextRect = nextCard.getBoundingClientRect()
              insertionX = rect.right + ((nextRect.left - rect.right) / 2)
            } else {
              insertionX = rect.right + 5 // fallback if no next card
            }
          } else {
            // Moving left (upstream) - bar goes before the target card
            // Position exactly between previous card and target card
            const prevCard = effectCards[index - 1] as HTMLElement
            if (prevCard && prevCard !== card) {
              const prevRect = prevCard.getBoundingClientRect()
              insertionX = prevRect.right + ((rect.left - prevRect.right) / 2)
            } else {
              insertionX = rect.left - 5 // fallback if no previous card
            }
          }
        } else {
          otherCard.classList.remove('drop-target')
        }
      })
      
      // Create insertion indicator if we have a valid position
      if (insertionIndex >= 0 && insertionX > 0) {
        const panelRect = horizontalEffectsChain.getBoundingClientRect()
        
        const indicator = document.createElement('div')
        indicator.className = 'insertion-indicator'
        indicator.style.position = 'fixed'
        indicator.style.left = insertionX + 'px'
        indicator.style.top = panelRect.top + 'px'
        indicator.style.width = '2px'
        indicator.style.height = panelRect.height + 'px'
        indicator.style.backgroundColor = '#00ff00'
        indicator.style.zIndex = '9998'
        indicator.style.pointerEvents = 'none'
        indicator.style.borderRadius = '2px'
        indicator.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.8)'
        
        document.body.appendChild(indicator)
      }
    }
    
    function handleDrop(x: number, y: number) {
      // Check if dropped on trash
      const trashIcon = document.getElementById('mobile-trash-icon')
      if (trashIcon) {
        const trashRect = trashIcon.getBoundingClientRect()
        const isOverTrash = (
          x >= trashRect.left && x <= trashRect.right &&
          y >= trashRect.top && y <= trashRect.bottom
        )
        
        if (isOverTrash) {
          // Animate trash deletion
          trashIcon.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
          trashIcon.style.opacity = '0'
          trashIcon.style.transform = 'translateX(-50%) scale(0.8)'
          
          // Delete effect after brief delay
          setTimeout(() => {
            if (window.effectsChainManager) {
              window.effectsChainManager.removeEffect(effect.id)
              refreshHorizontalEffectsChain()
            }
            
            // Reset trash icon for next use
            setTimeout(() => {
              trashIcon.style.transition = ''
              trashIcon.style.opacity = ''
              trashIcon.style.transform = ''
              trashIcon.style.display = 'none' // Hide until next drag
            }, 50)
          }, 150)
          
          cleanup()
          return
        }
        
        trashIcon.classList.remove('drag-over')
        const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
        if (trashButton) {
          trashButton.style.backgroundColor = ''
        }
      }
      
      // Check if dropped on another card for reordering
      const effectCards = horizontalEffectsChain.querySelectorAll('.horizontal-effect-card')
      let targetIndex = -1
      
      effectCards.forEach((otherCard, index) => {
        if (otherCard === card) return
        
        const rect = otherCard.getBoundingClientRect()
        const isOver = (
          x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom
        )
        
        if (isOver) {
          targetIndex = index
        }
        
        otherCard.classList.remove('drop-target')
      })
      
      // Perform reorder if valid target
      if (targetIndex >= 0 && window.effectsChainManager) {
        const currentIndex = parseInt(card.dataset.effectIndex || '0')
        window.effectsChainManager.moveEffect(currentIndex, targetIndex)
        refreshHorizontalEffectsChain()
      }
      
      cleanup()
    }
    
    function cleanup() {
      // Remove clone
      if (dragClone && dragClone.parentNode) {
        dragClone.parentNode.removeChild(dragClone)
      }
      
      // Restore original card
      card.style.opacity = ''
      
      // Reset state
      isDragging = false
      dragClone = null
      
      // Clear any remaining drop targets and insertion indicators
      document.querySelectorAll('.drop-target').forEach(el => {
        el.classList.remove('drop-target')
      })
      
      document.querySelectorAll('.insertion-indicator').forEach(indicator => {
        indicator.remove()
      })
      
      // Hide and reset trash can
      const trashIcon = document.getElementById('mobile-trash-icon')
      if (trashIcon) {
        trashIcon.classList.remove('drag-over')
        trashIcon.style.display = 'none'
        
        const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
        if (trashButton) {
          trashButton.style.backgroundColor = ''
        }
      }
    }
  }

  function refreshHorizontalEffectsChain() {
    horizontalEffectsChain.innerHTML = ''
    
    // Add existing effects first
    if (window.effectsChainManager) {
      const effects = window.effectsChainManager.getEffectsChain()
      
      effects.forEach((effect: EffectInstance, index: number) => {
        const card = document.createElement('div')
        card.className = 'horizontal-effect-card'
        card.dataset.effectId = effect.id
        card.dataset.effectIndex = index.toString()
        card.draggable = true
        
        if (!effect.enabled) {
          card.classList.add('disabled')
        }
        
        card.innerHTML = `
          <div class="effect-name">${getEffectDisplayName(effect.type)}</div>
          <div class="effect-drag-handle">
            <div class="drag-line"></div>
            <div class="drag-line"></div>
            <div class="drag-line"></div>
          </div>
        `
        
        // Add drag event listeners
        card.addEventListener('dragstart', handleDragStart)
        card.addEventListener('dragover', handleDragOver)
        card.addEventListener('drop', handleDrop)
        card.addEventListener('dragend', handleDragEnd)
        
        // Mobile drag system - clean implementation
        setupMobileDrag(card, effect)
        
        card.addEventListener('click', (e) => {
          // Only select effect if not clicking on drag handle
          if (!(e.target as HTMLElement).closest('.effect-drag-handle')) {
            selectEffect(effect.id)
          }
        })
        
        horizontalEffectsChain.appendChild(card)
      })
    }
    
    // Add the plus button at the end (far right)
    const addButton = document.createElement('div')
    addButton.className = 'horizontal-add-effect-button'
    addButton.draggable = false
    addButton.innerHTML = `
      <div class="add-effect-icon">+</div>
      <div class="add-effect-text">Add Effect</div>
    `
    addButton.addEventListener('click', () => {
      // Create a simple mobile effect selector menu
      if (window.effectsChainManager) {
        showMobileEffectSelector()
      }
    })
    horizontalEffectsChain.appendChild(addButton)
    
    // Add the reset button after the add button
    const resetButton = document.createElement('div')
    resetButton.className = 'horizontal-reset-button'
    resetButton.draggable = false
    resetButton.innerHTML = `
      <div class="reset-effect-icon">×</div>
      <div class="reset-effect-text">Reset</div>
    `
    resetButton.addEventListener('click', () => {
      // Clear all effects
      if (window.effectsChainManager) {
        window.effectsChainManager.clearEffects()
        refreshHorizontalEffectsChain()
        
        // Update the desktop dropdown to "None"
        const desktopDropdown = document.getElementById('effects-main-dropdown') as HTMLSelectElement
        if (desktopDropdown) {
          desktopDropdown.value = 'none'
        }
        
        // Also update mobile dropdown
        const mobileDropdown = document.getElementById('mobile-effects-main-dropdown') as HTMLSelectElement
        if (mobileDropdown) {
          mobileDropdown.value = 'none'
        }
      }
    })
    horizontalEffectsChain.appendChild(resetButton)
    
    // Scroll to the far right to show both buttons
    setTimeout(() => {
      const horizontalEffectsContent = horizontalEffectsChain.parentElement
      if (horizontalEffectsContent) {
        horizontalEffectsContent.scrollLeft = horizontalEffectsContent.scrollWidth
      }
    }, 50)
  }
  
  // Drag and drop functionality
  let draggedElement: HTMLElement | null = null
  let trashIconHideTimeout: number | null = null
  const trashIcon = document.getElementById('mobile-trash-icon') as HTMLElement
  
  function showTrashIcon() {
    if (trashIcon) {
      // Clear any existing hide timeout
      if (trashIconHideTimeout) {
        clearTimeout(trashIconHideTimeout)
        trashIconHideTimeout = null
      }
      
      trashIcon.classList.add('show')
      
      // Set timeout to hide after 2 seconds
      trashIconHideTimeout = setTimeout(() => {
        hideTrashIcon()
      }, 2000)
    }
  }
  
  function hideTrashIcon() {
    if (trashIcon) {
      trashIcon.classList.remove('show')
      trashIcon.classList.remove('drag-over')
      
      // Clear timeout reference
      if (trashIconHideTimeout) {
        clearTimeout(trashIconHideTimeout)
        trashIconHideTimeout = null
      }
    }
  }
  
  function showTrashIconPermanent() {
    if (trashIcon) {
      // Clear any existing hide timeout to keep it visible
      if (trashIconHideTimeout) {
        clearTimeout(trashIconHideTimeout)
        trashIconHideTimeout = null
      }
      
      // Reset trash icon state for new drag
      trashIcon.style.transition = ''
      trashIcon.style.opacity = ''
      trashIcon.style.transform = ''
      trashIcon.style.display = ''
      
      // Reset button background
      const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
      if (trashButton) {
        trashButton.style.backgroundColor = ''
      }
      
      trashIcon.classList.add('show')
    }
  }
  
  function handleDragStart(e: DragEvent) {
    draggedElement = e.target as HTMLElement
    draggedElement.classList.add('dragging')
    
    // Show trash icon permanently while dragging
    showTrashIconPermanent()
    
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/html', draggedElement.outerHTML)
  }
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    
    const target = e.target as HTMLElement
    const card = target.closest('.horizontal-effect-card') as HTMLElement
    
    if (card && card !== draggedElement) {
      const rect = card.getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      
      if (e.clientX < midpoint) {
        card.style.borderLeft = '2px solid #00ff00'
        card.style.borderRight = ''
      } else {
        card.style.borderRight = '2px solid #00ff00'
        card.style.borderLeft = ''
      }
    }
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault()
    
    const target = e.target as HTMLElement
    const targetCard = target.closest('.horizontal-effect-card') as HTMLElement
    
    if (targetCard && draggedElement && targetCard !== draggedElement) {
      const draggedIndex = parseInt(draggedElement.dataset.effectIndex || '0')
      const targetIndex = parseInt(targetCard.dataset.effectIndex || '0')
      
      // Reorder effects in the chain manager
      if (window.effectsChainManager) {
        window.effectsChainManager.moveEffect(draggedIndex, targetIndex)
        refreshHorizontalEffectsChain()
      }
    }
    
    // Clear border indicators
    document.querySelectorAll('.horizontal-effect-card').forEach(card => {
      ;(card as HTMLElement).style.borderLeft = ''
      ;(card as HTMLElement).style.borderRight = ''
    })
  }
  
  function handleDragEnd() {
    if (draggedElement) {
      draggedElement.classList.remove('dragging')
    }
    
    // Hide trash icon when dragging ends
    hideTrashIcon()
    
    // Clear border indicators
    document.querySelectorAll('.horizontal-effect-card').forEach(card => {
      ;(card as HTMLElement).style.borderLeft = ''
      ;(card as HTMLElement).style.borderRight = ''
    })
    
    draggedElement = null
  }
  
  // Setup trash icon drag and drop
  if (trashIcon) {
    trashIcon.addEventListener('dragover', (e) => {
      e.preventDefault()
      trashIcon.classList.add('drag-over')
      const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
      if (trashButton) {
        trashButton.classList.add('drag-over')
      }
    })
    
    trashIcon.addEventListener('dragleave', () => {
      trashIcon.classList.remove('drag-over')
      const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
      if (trashButton) {
        trashButton.classList.remove('drag-over')
      }
    })
    
    trashIcon.addEventListener('drop', (e) => {
      e.preventDefault()
      
      if (draggedElement && window.effectsChainManager) {
        const effectId = draggedElement.dataset.effectId
        if (effectId) {
          window.effectsChainManager.removeEffect(effectId)
          refreshHorizontalEffectsChain()
        }
      }
      
      trashIcon.classList.remove('drag-over')
      const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
      if (trashButton) {
        trashButton.classList.remove('drag-over')
      }
    })
    
    // Add click functionality to trash icon for deleting selected effects
    const trashButton = trashIcon.querySelector('.trash-button') as HTMLElement
    if (trashButton) {
      trashButton.addEventListener('click', () => {
        // Find the currently selected effect card
        const selectedCard = horizontalEffectsChain.querySelector('.horizontal-effect-card.selected') as HTMLElement
        
        if (selectedCard && window.effectsChainManager) {
          const effectId = selectedCard.dataset.effectId
          if (effectId) {
            window.effectsChainManager.removeEffect(effectId)
            refreshHorizontalEffectsChain()
            closeParametersBox() // Close parameters box since effect is deleted
          }
        }
      })
    }
  }
  
  function getEffectDisplayName(effectType: string): string {
    const effectMap: Record<string, string> = {
      'background': 'Background',
      'sepia': 'Sepia',
      'vignette': 'Vignette',
      'blur': 'Blur',
      'bloom': 'Bloom',
      'crtgrain': 'CRT Grain',
      'halftone': 'Halftone',
      'gamma': 'Gamma',
      'sobelthreshold': 'Edge Detect',
      'colorify': 'Colorify'
    }
    return effectMap[effectType] || effectType
  }
  
  function selectEffect(effectId: string) {
    horizontalEffectsChain.querySelectorAll('.horizontal-effect-card').forEach(card => {
      card.classList.remove('selected')
    })
    
    const selectedCard = horizontalEffectsChain.querySelector(`[data-effect-id="${effectId}"]`)
    if (selectedCard) {
      selectedCard.classList.add('selected')
      
      // Show trash icon with auto-hide when an effect is selected
      showTrashIcon()
    }
    
    showParametersForEffect(effectId)
  }
  
  function showParametersForEffect(effectId: string) {
    if (!window.effectsChainManager) return
    
    const effect = window.effectsChainManager.getEffectsChain().find((e: EffectInstance) => e.id === effectId)
    if (!effect) return
    
    const effectDefinition = window.effectsChainManager.getEffectDefinition(effect.type)
    if (!effectDefinition) return
    
    parametersBoxTitle.textContent = getEffectDisplayName(effect.type)
    parametersBoxContent.innerHTML = ''
    
    Object.entries(effectDefinition.parameterDefinitions).forEach(([paramName, paramDef]: [string, any]) => {
      const currentValue = effect.parameters[paramName] || paramDef.min
      
      // Create parameter slider card using the same system as settings
      const parameterCard = createParameterSliderCard(
        paramDef.label,
        currentValue.toString(),
        paramDef.min,
        paramDef.max,
        paramDef.step,
        (value) => {
          window.effectsChainManager.updateEffectParameter(effectId, paramName, value)
        },
        paramDef.type
      )
      
      parametersBoxContent.appendChild(parameterCard)
    })
    
    parametersBox.style.display = 'block' // Remove display: none
    parametersBox.classList.add('show')
  }
  
  function showMobileEffectSelector() {
    // Get available effects from the global effects chain manager
    if (!window.effectsChainManager) return
    
    import('./effects/EffectsChainManager').then(({ EFFECT_DEFINITIONS }) => {
      // Categorize effects
      const categories = {
        'Color': {
          color: '#FF6B6B',
          effects: ['background', 'gamma', 'sepia', 'colorify', 'splittone', 'gradient', 'invert', 'bleachbypass']
        },
        'Blur': {
          color: '#4ECDC4',
          effects: ['blur', 'bloom', 'motionblur', 'glow', 'dof', 'gaussianblur']
        },
        'Grain': {
          color: '#45B7D1',
          effects: ['crtgrain', 'film35mm', 'pixelate', 'noise2d']
        },
        'Post-Process': {
          color: '#96CEB4',
          effects: ['vignette', 'afterimage', 'sobel', 'sobelthreshold', 'threshold', 'depthpass', 'oilpainting', 'ascii', 'halftone', 'engraving', 'datamosh', 'pixelsort']
        },
        '3D Effects': {
          color: '#FECA57',
          effects: ['drawrange', 'pointnetwork', 'material', 'voronoi', 'topographic', 'fog']
        },
        'In Development': {
          color: '#888888',
          effects: ['tsl', 'dotscreen']
        }
      }

      // Create a simple overlay with categorized effect buttons
      const overlay = document.createElement('div')
      overlay.className = 'mobile-effect-selector-overlay'
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 20px;
      `
      
      const container = document.createElement('div')
      container.style.cssText = `
        background: rgba(21, 21, 21, 0.95);
        border: 1px solid #00ff00;
        border-radius: 8px;
        padding: 10px;
        max-width: 90vw;
        max-height: 70vh;
        overflow-y: auto;
        font-family: 'Space Mono', monospace;
      `
      
      const title = document.createElement('h3')
      title.textContent = 'Add Effect'
      title.style.cssText = `
        color: white;
        margin: 0 0 15px 0;
        text-align: center;
        font-size: 1rem;
      `
      container.appendChild(title)
      
      // Create categories
      Object.entries(categories).forEach(([categoryName, categoryData]) => {
        const categoryHeader = document.createElement('div')
        categoryHeader.style.cssText = `
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid ${categoryData.color};
          border-radius: 6px;
          padding: 8px 12px;
          margin: 10px 0 5px 0;
          color: ${categoryData.color};
          font-size: 0.8rem;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `
        categoryHeader.textContent = categoryName
        
        const arrow = document.createElement('span')
        arrow.textContent = '▼'
        arrow.style.fontSize = '0.7rem'
        categoryHeader.appendChild(arrow)
        
        const effectsGrid = document.createElement('div')
        effectsGrid.style.cssText = `
          display: none;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        `
        
        // Add effects for this category
        categoryData.effects.forEach(effectType => {
          const definition = EFFECT_DEFINITIONS.find(def => def.type === effectType)
          if (definition) {
            const button = document.createElement('button')
            button.textContent = definition.name
            button.style.cssText = `
              background: rgba(0, 0, 0, 0.7);
              border: 1px solid ${categoryData.color};
              border-radius: 6px;
              color: white;
              padding: 10px 6px;
              font-family: 'Space Mono', monospace;
              font-size: 0.72rem;
              cursor: pointer;
              transition: all 0.2s ease;
              text-align: center;
            `
            
            button.addEventListener('mouseenter', () => {
              button.style.background = `rgba(${parseInt(categoryData.color.slice(1,3), 16)}, ${parseInt(categoryData.color.slice(3,5), 16)}, ${parseInt(categoryData.color.slice(5,7), 16)}, 0.1)`
            })
            
            button.addEventListener('mouseleave', () => {
              button.style.background = 'rgba(0, 0, 0, 0.7)'
            })
            
            button.addEventListener('click', () => {
              // Add the effect
              const newEffect = window.effectsChainManager.addEffect(definition.type)
              refreshHorizontalEffectsChain()
              
              // Close the selector
              document.body.removeChild(overlay)
              
              // Auto-select and show parameters for the newly added effect
              if (newEffect) {
                selectEffect(newEffect.id)
              }
              
              // Enable effects and set to custom
              const desktopDropdown = document.getElementById('effects-main-dropdown') as HTMLSelectElement
              if (desktopDropdown) {
                desktopDropdown.value = 'custom'
              }
            })
            
            effectsGrid.appendChild(button)
          }
        })
        
        // Toggle category
        categoryHeader.addEventListener('click', () => {
          const isOpen = effectsGrid.style.display === 'grid'
          effectsGrid.style.display = isOpen ? 'none' : 'grid'
          arrow.textContent = isOpen ? '▼' : '▲'
        })
        
        container.appendChild(categoryHeader)
        container.appendChild(effectsGrid)
      })
      
      overlay.appendChild(container)
      
      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay)
        }
      })
      
      document.body.appendChild(overlay)
    })
  }
  
  // function showMobilePresetSelector() {
  //   // TODO: Implement preset selector functionality
  //   console.log('Mobile preset selector clicked - functionality to be implemented')
  // }

  // Setup mobile preset selector
  function setupMobilePresetSelector() {
    const presetDropdown = document.getElementById('mobile-preset-dropdown')
    const presetDropdownMenu = document.getElementById('mobile-preset-dropdown-menu')
    const presetName = document.getElementById('mobile-preset-name')
    
    if (!presetDropdown || !presetDropdownMenu || !presetName) return

    // Get actual presets from localStorage and default presets
    function getAvailablePresets() {
      const presets = [{ id: 'none', name: 'None' }]
      
      try {
        // Get saved user presets
        const saved = localStorage.getItem('effects-presets')
        const userPresets = saved ? JSON.parse(saved) : {}
        
        // Add actual default presets (matching EffectsPanel.ts)
        const defaultPresets = {
          'Cheeky Castleton': [],
          'Fisher Two-Tone': [],
          'Delicate Disco': [],
          'Delicate Noir': []
        }
        
        // Merge and add to preset list
        const allPresets = { ...defaultPresets, ...userPresets }
        Object.keys(allPresets).forEach(name => {
          presets.push({ id: name, name: name })
        })
      } catch (error) {
        console.error('Failed to load presets:', error)
      }
      
      return presets
    }

    const presets = getAvailablePresets()

    // Populate preset options
    presetDropdownMenu.innerHTML = ''
    presets.forEach(preset => {
      const option = document.createElement('div')
      option.className = 'preset-option'
      option.textContent = preset.name
      option.dataset.presetId = preset.id
      
      // Set default active preset to "Delicate Noir" to match the system default
      if (preset.id === 'Delicate Noir') {
        option.classList.add('active')
        presetName.textContent = preset.name // Set initial display name
      }
      
      option.addEventListener('click', () => {
        // Update selected preset
        presetName.textContent = preset.name
        
        // Remove active class from all options
        presetDropdownMenu.querySelectorAll('.preset-option').forEach(opt => {
          opt.classList.remove('active')
        })
        
        // Add active class to selected option
        option.classList.add('active')
        
        // Close dropdown
        presetDropdown.classList.remove('open')
        presetDropdownMenu.style.display = 'none'
        
        // Apply preset effects
        const desktopDropdown = document.getElementById('effects-main-dropdown') as HTMLSelectElement
        if (desktopDropdown) {
          desktopDropdown.value = preset.id
          // Trigger change event to apply preset
          const changeEvent = new Event('change', { bubbles: true })
          desktopDropdown.dispatchEvent(changeEvent)
        }
        
        // Refresh mobile effects display to show the new effects
        setTimeout(() => {
          refreshHorizontalEffectsChain()
          closeParametersBox() // Close any open parameters when preset loads
        }, 100) // Small delay to ensure preset is fully loaded
        
        console.log(`Applied preset: ${preset.name}`)
      })
      
      presetDropdownMenu.appendChild(option)
    })

    // Toggle dropdown on click
    presetDropdown.addEventListener('click', () => {
      const isOpen = presetDropdown.classList.contains('open')
      
      if (isOpen) {
        presetDropdown.classList.remove('open')
        presetDropdownMenu.style.display = 'none'
      } else {
        presetDropdown.classList.add('open')
        presetDropdownMenu.style.display = 'block'
      }
    })

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!presetDropdown.contains(e.target as Node)) {
        presetDropdown.classList.remove('open')
        presetDropdownMenu.style.display = 'none'
      }
    })
  }
  
  // Set initial position
  setTimeout(() => {
    setMobileButtonPositions()
    updateEffectsButtonVisibility()
    setupMobilePresetSelector()
  }, 50)
  
  // No need to monitor bottom sheet state (removed)
  
  // Event listeners
  effectsButton.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleEffectsPanel()
  })
  parametersBoxClose.addEventListener('click', closeParametersBox)
  
  // Remove global click listener - let panels stay open until manually closed
  
  // Expose refresh function for effects system integration
  ;(window as any).refreshHorizontalEffects = refreshHorizontalEffectsChain
}

// Unified panel positioning system
const PANEL_HEIGHT = 80 // px
let panelManager: {
  panels: Map<string, { element: HTMLElement, isOpen: boolean, position: number | null }>
  updatePositions: () => void
  registerPanel: (id: string, element: HTMLElement) => void
  togglePanel: (id: string) => boolean
} | null = null

function createPanelManager() {
  const panels = new Map<string, { element: HTMLElement, isOpen: boolean, position: number | null }>()
  // Note: bottomSheet is now hidden, but keeping reference for potential future use
  // const bottomSheet = document.getElementById('mobile-bottom-sheet') as HTMLElement
  const occupiedPositions = new Set<number>()
  
  
  function updatePositions() {
    // Note: Bottom sheet is now permanently hidden, so we don't need to manage its visibility
    // But we'll keep the logic for potential future use
    const hasOpenPanels = Array.from(panels.values()).some(panel => panel.isOpen)
    console.log(`Has open panels: ${hasOpenPanels}`)
    
    console.log('Panel states:', Array.from(panels.entries()).map(([id, panel]) => ({ 
      id, 
      isOpen: panel.isOpen, 
      position: panel.position 
    })))
    console.log('Occupied positions:', Array.from(occupiedPositions))
    
    // First pass: close panels and reset positions
    for (const [panelId, panel] of panels.entries()) {
      if (!panel.isOpen) {
        // Panel is closed - hide it and clear its position
        if (panel.position !== null) {
          console.log(`${panelId} freeing position: ${panel.position}`)
          occupiedPositions.delete(panel.position)
          panel.position = null
        }
        
        panel.element.classList.remove('show')
        panel.element.style.bottom = '-200px' // Move off-screen
      }
    }
    
    // Second pass: reassign positions to open panels sequentially (compact layout)
    const openPanels = Array.from(panels.entries()).filter(([, panel]) => panel.isOpen)
    occupiedPositions.clear() // Clear all positions for reassignment
    
    openPanels.forEach(([panelId, panel], index) => {
      const newPosition = index // Assign positions 0, 1, 2... sequentially
      panel.position = newPosition
      occupiedPositions.add(newPosition)
      
      const bottomPosition = panel.position * PANEL_HEIGHT
      panel.element.style.bottom = `${bottomPosition}px`
      panel.element.classList.add('show')
      
      console.log(`${panelId} reassigned to position: ${panel.position}`)
    })
    
    // Update icon active states and positions
    updateIconActiveStates()
    updateMobileButtonPositions()
  }
  
  function updateMobileButtonPositions() {
    // Use requestAnimationFrame to ensure DOM has updated before measuring heights
    requestAnimationFrame(() => {
      // Calculate how high the buttons should be positioned based on open panels
      const openPanels = Array.from(panels.values()).filter(panel => panel.isOpen)
      
      if (openPanels.length === 0) {
        // No panels open, use default position
        const defaultPosition = 12
        const defaultTrashPosition = 120
        const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
        const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
        const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
        const shareButtonContainer = document.getElementById('mobile-share-button') as HTMLElement
        const presetSelector = document.getElementById('mobile-preset-selector') as HTMLElement
        const trashIcon = document.getElementById('mobile-trash-icon') as HTMLElement
        
        if (cameraButtonContainer) cameraButtonContainer.style.bottom = `${defaultPosition}px`
        if (effectsButtonContainer) effectsButtonContainer.style.bottom = `${defaultPosition}px`
        if (settingsButtonContainer) settingsButtonContainer.style.bottom = `${defaultPosition}px`
        if (shareButtonContainer) shareButtonContainer.style.bottom = `${defaultPosition}px`
        if (presetSelector) presetSelector.style.bottom = `${defaultPosition}px`
        if (trashIcon) trashIcon.style.bottom = `${defaultTrashPosition}px`
        return
      }
      
      // Calculate total height of all open panels
      let totalPanelHeight = 0
      openPanels.forEach(panel => {
        if (panel.element.id === 'mobile-horizontal-settings-panel') {
          // Use actual height for settings panel since it's variable
          const rect = panel.element.getBoundingClientRect()
          totalPanelHeight += rect.height
        } else {
          // Use standard height for other panels
          totalPanelHeight += PANEL_HEIGHT
        }
      })
      
      const buttonBottomPosition = 12 + totalPanelHeight
      
      // Calculate trash icon position (above the highest panel with some spacing)
      const trashBottomPosition = openPanels.length > 0 ? 
        totalPanelHeight + 20 : // 20px above highest panel
        120 // Default position when no panels open
      
      // Update all mobile button positions
      const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
      const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
      const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
      const shareButtonContainer = document.getElementById('mobile-share-button') as HTMLElement
      const presetSelector = document.getElementById('mobile-preset-selector') as HTMLElement
      const trashIcon = document.getElementById('mobile-trash-icon') as HTMLElement
      
      if (cameraButtonContainer) {
        cameraButtonContainer.style.bottom = `${buttonBottomPosition}px`
      }
      if (effectsButtonContainer) {
        effectsButtonContainer.style.bottom = `${buttonBottomPosition}px`
      }
      if (settingsButtonContainer) {
        settingsButtonContainer.style.bottom = `${buttonBottomPosition}px`
      }
      if (shareButtonContainer) {
        shareButtonContainer.style.bottom = `${buttonBottomPosition}px`
      }
      if (presetSelector) {
        presetSelector.style.bottom = `${buttonBottomPosition}px`
      }
      if (trashIcon) {
        trashIcon.style.bottom = `${trashBottomPosition}px`
      }
      
      console.log(`Mobile buttons positioned at: ${buttonBottomPosition}px, trash icon at: ${trashBottomPosition}px (total panel height: ${totalPanelHeight}px)`)
    })
  }

  function updateIconActiveStates() {
    // Update button active states only, not positions
    const cameraButton = document.getElementById('camera-reset-button') as HTMLElement
    const cameraPanel = panels.get('camera')
    
    const effectsButton = document.getElementById('mobile-effects-button-element') as HTMLElement
    const effectsPanel = panels.get('effects')
    
    const settingsButton = document.getElementById('mobile-settings-button-element') as HTMLElement
    const settingsPanel = panels.get('settings')
    
    if (cameraButton && cameraPanel) {
      forceButtonReset(cameraButton, cameraPanel.isOpen)
    }
    
    if (effectsButton && effectsPanel) {
      forceButtonReset(effectsButton, effectsPanel.isOpen)
    }
    
    if (settingsButton) {
      console.log('🔧 Settings button found, checking SVG...')
      const svg = settingsButton.querySelector('svg')
      console.log('SVG element:', svg)
      if (svg) {
        console.log('SVG viewBox:', svg.getAttribute('viewBox'))
        console.log('SVG children:', svg.children.length)
      }
      
      if (settingsPanel) {
        forceButtonReset(settingsButton, settingsPanel.isOpen)
      } else {
        // Apply default styling for unregistered settings panel
        settingsButton.style.setProperty('background', 'rgba(0, 0, 0, 0.7)', 'important')
        settingsButton.style.setProperty('box-shadow', 'none', 'important')
        settingsButton.style.setProperty('border-color', '#00ff00', 'important')
        
        if (svg) {
          svg.style.stroke = '#00ff00'
          svg.style.fill = 'none'
          svg.style.strokeWidth = '2'
          console.log('✅ SVG styling applied')
        }
      }
    }
  }
  
  function forceButtonReset(button: HTMLElement, isActive: boolean) {
    // Force blur to remove focus/hover
    button.blur()
    
    // Only manipulate classes and styles, never touch innerHTML or content
    button.classList.remove('active', 'hover', 'focus')
    
    // More targeted style application that won't interfere with SVG content
    if (isActive) {
      // Active state - force bright styles but be careful with properties
      button.style.setProperty('background', 'rgba(0, 255, 0, 0.2)', 'important')
      button.style.setProperty('box-shadow', '0 0 15px rgba(0, 255, 0, 0.5)', 'important')
      button.classList.add('active')
    } else {
      // Default state - force dark styles
      button.style.setProperty('background', 'rgba(0, 0, 0, 0.7)', 'important')
      button.style.setProperty('box-shadow', 'none', 'important')
      button.style.setProperty('border-color', '#00ff00', 'important')
    }
    
    // Protect and restore SVG styling - never let it get corrupted
    const svg = button.querySelector('svg')
    if (svg) {
      // Force SVG properties that prevent single-pixel collapse
      svg.style.setProperty('width', '24px', 'important')
      svg.style.setProperty('height', '24px', 'important')
      svg.style.setProperty('stroke', '#00ff00', 'important')
      svg.style.setProperty('fill', 'none', 'important')
      svg.style.setProperty('stroke-width', '2', 'important')
      svg.style.setProperty('display', 'block', 'important')
      svg.style.setProperty('opacity', '1', 'important')
      svg.style.setProperty('visibility', 'visible', 'important')
    }
  }
  
  function registerPanel(id: string, element: HTMLElement) {
    panels.set(id, { element, isOpen: false, position: null })
  }
  
  function togglePanel(id: string): boolean {
    const panel = panels.get(id)
    if (!panel) return false
    
    panel.isOpen = !panel.isOpen
    updatePositions()
    
    return panel.isOpen
  }
  
  return {
    panels,
    updatePositions,
    registerPanel,
    togglePanel
  }
}

function initializePanelManager() {
  if (!panelManager) {
    panelManager = createPanelManager()
  }
  return panelManager
}

// This function has been replaced by combining camera controls with settings

// Shared function for creating slider cards (used by both settings and camera panels)
function createSliderCard(label: string, currentValue: string, min: number, max: number, step: number, onChange: (value: number) => void) {
  const card = document.createElement('div')
  card.className = 'settings-option-card slider-card'
  
  const initialValue = parseFloat(currentValue)
  let initialFillStyle = ''
  
  // Calculate initial fill based on whether this is bidirectional
  if (min < 0 && max > 0) {
    // Bidirectional slider - use center-out logic
    if (initialValue === 0) {
      initialFillStyle = 'width: 0%; display: none;'
    } else if (initialValue > 0) {
      const fillWidth = (initialValue / max) * 50
      initialFillStyle = `display: block; left: 50%; right: auto; width: ${fillWidth}%;`
    } else {
      const fillWidth = (Math.abs(initialValue) / Math.abs(min)) * 50
      initialFillStyle = `display: block; left: auto; right: 50%; width: ${fillWidth}%;`
    }
  } else {
    // Standard left-to-right fill
    const normalizedValue = (initialValue - min) / (max - min)
    const fillPercentage = Math.max(0, Math.min(100, normalizedValue * 100))
    initialFillStyle = `left: 0%; width: ${fillPercentage}%; display: block;`
  }
  
  card.innerHTML = `
    <div class="settings-option-name">${label}</div>
    <div class="settings-option-value">${currentValue}</div>
    <div class="slider-fill" style="${initialFillStyle}"></div>
  `
  
  // Touch interaction for slider - relative movement only
  let isDragging = false
  let startX = 0
  let startValue = parseFloat(currentValue)
  let currentSliderValue = startValue
  
  // Calculate range for relative movement
  const range = max - min
  const cardWidth = 120 // Approximate card width in pixels
  const sensitivityFactor = range / cardWidth // Value change per pixel
  
  const updateSliderValueInternal = (newValue: number) => {
    // Apply step rounding
    let steppedValue = Math.round(newValue / step) * step
    
    // Add snap to center (0) for bidirectional sliders
    if (min < 0 && max > 0) {
      const snapZone = Math.abs(max - min) * 0.05 // 5% of total range as snap zone (adjustable)
      if (Math.abs(steppedValue) <= snapZone) {
        steppedValue = 0 // Snap to center
      }
    }
    
    const clampedValue = Math.max(min, Math.min(max, steppedValue))
    
    // Only update if value actually changed
    if (Math.abs(clampedValue - currentSliderValue) < step * 0.01) return
    
    // Update current slider value
    currentSliderValue = clampedValue
    
    // Update visual fill - check if this is a bidirectional slider (min < 0 && max > 0)
    const fillElement = card.querySelector('.slider-fill') as HTMLElement
    const valueElement = card.querySelector('.settings-option-value') as HTMLElement
    
    if (fillElement) {
      if (min < 0 && max > 0) {
        // Bidirectional slider - use center-out logic
        if (clampedValue === 0) {
          // No fill at zero
          fillElement.style.width = '0%'
          fillElement.style.display = 'none'
        } else if (clampedValue > 0) {
          // Positive values: fill from center (50%) extending right
          const fillWidth = (clampedValue / max) * 50
          fillElement.style.display = 'block'
          fillElement.style.left = '50%'
          fillElement.style.right = 'auto' // Clear right
          fillElement.style.width = `${fillWidth}%`
        } else {
          // Negative values: fill from center (50%) extending left
          // Keep right edge fixed at 50%, grow leftward using 'right' property
          const fillWidth = (Math.abs(clampedValue) / Math.abs(min)) * 50
          fillElement.style.display = 'block'
          fillElement.style.left = 'auto' // Clear left
          fillElement.style.right = '50%' // Right edge fixed at center
          fillElement.style.width = `${fillWidth}%`
        }
      } else {
        // Standard left-to-right fill for non-bidirectional sliders
        const fillPercent = ((clampedValue - min) / (max - min)) * 100
        fillElement.style.left = '0%'
        fillElement.style.width = `${fillPercent}%`
        fillElement.style.display = 'block'
      }
    }
    if (valueElement) valueElement.textContent = clampedValue.toFixed(3)
    
    // Call the onChange callback
    onChange(clampedValue)
  }
  
  card.addEventListener('touchstart', (e) => {
    e.preventDefault()
    isDragging = true
    startX = e.touches[0].clientX
    startValue = currentSliderValue
    
    // Visual feedback without scale animation
    card.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.5)'
    card.style.zIndex = '999'
  })
  
  card.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    e.preventDefault()
    
    const currentX = e.touches[0].clientX
    const deltaX = currentX - startX
    const deltaValue = deltaX * sensitivityFactor
    const newValue = startValue + deltaValue
    
    updateSliderValueInternal(newValue)
  })
  
  card.addEventListener('touchend', (e) => {
    e.preventDefault()
    isDragging = false
    
    card.style.boxShadow = ''
    card.style.zIndex = ''
  })
  
  card.addEventListener('touchcancel', (e) => {
    e.preventDefault()
    isDragging = false
    
    card.style.boxShadow = ''
    card.style.zIndex = ''
  })
  
  // Method to update slider from external changes (desktop controls)
  const updateSliderValue = (newValue: string) => {
    currentSliderValue = parseFloat(newValue)
    const fillElement = card.querySelector('.slider-fill') as HTMLElement
    const valueElement = card.querySelector('.settings-option-value') as HTMLElement
    
    if (fillElement) {
      if (min < 0 && max > 0) {
        // Bidirectional slider - use center-out logic
        if (currentSliderValue === 0) {
          fillElement.style.width = '0%'
          fillElement.style.display = 'none'
        } else if (currentSliderValue > 0) {
          const fillWidth = (currentSliderValue / max) * 50
          fillElement.style.display = 'block'
          fillElement.style.left = '50%'
          fillElement.style.right = 'auto'
          fillElement.style.width = `${fillWidth}%`
        } else {
          const fillWidth = (Math.abs(currentSliderValue) / Math.abs(min)) * 50
          fillElement.style.display = 'block'
          fillElement.style.left = 'auto'
          fillElement.style.right = '50%'
          fillElement.style.width = `${fillWidth}%`
        }
      } else {
        // Standard left-to-right fill
        const fillPercent = ((currentSliderValue - min) / (max - min)) * 100
        fillElement.style.left = '0%'
        fillElement.style.width = `${fillPercent}%`
        fillElement.style.display = 'block'
      }
    }
    if (valueElement) valueElement.textContent = newValue
  }
  
  // Attach updater to card for external access
  ;(card as any).updateValue = updateSliderValue
  
  return card
}

// Combined mobile settings and camera button functionality
function setupMobileSettings() {
  const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
  const settingsButton = document.getElementById('mobile-settings-button-element') as HTMLElement
  const horizontalSettingsPanel = document.getElementById('mobile-horizontal-settings-panel') as HTMLElement
  const horizontalSettingsOptions = document.getElementById('horizontal-settings-options') as HTMLElement
  
  
  if (!settingsButtonContainer || !settingsButton || !horizontalSettingsPanel || !horizontalSettingsOptions) {
    console.warn('Mobile combined settings/camera button elements not found')
    return
  }
  
  // Initialize panel manager and register this panel
  const manager = initializePanelManager()
  manager.registerPanel('settings', horizontalSettingsPanel)
  
  // Position settings button to far left
  settingsButtonContainer.style.left = '12px'
  
  // Settings button is always visible now (no bottom sheet)
  function updateSettingsButtonVisibility() {
    settingsButtonContainer.style.opacity = '1'
    settingsButtonContainer.style.pointerEvents = 'auto'
  }
  
  function toggleCombinedPanel() {
    const isOpen = manager.togglePanel('settings')
    
    if (isOpen) {
      // Make panel fit content height by combining settings and camera options
      horizontalSettingsPanel.style.height = 'auto'
      horizontalSettingsPanel.style.minHeight = 'auto'
      
      // Force the options container to wrap to multiple rows with 3 items per row
      horizontalSettingsOptions.style.display = 'flex'
      horizontalSettingsOptions.style.flexWrap = 'wrap'
      horizontalSettingsOptions.style.justifyContent = 'space-between'
      horizontalSettingsOptions.style.alignContent = 'flex-start'
      horizontalSettingsOptions.style.gap = '8px'
      
      // Refresh both settings and camera options
      refreshHorizontalSettingsOptions()
      refreshHorizontalCameraOptions()
    } else {
      // Reset panel height when closed
      horizontalSettingsPanel.style.height = ''
      horizontalSettingsPanel.style.minHeight = ''
    }
  }
  
  // Using global createSliderCard function
  
  function createToggleCard(label: string, currentState: boolean, onChange: (checked: boolean) => void) {
    const card = document.createElement('div')
    card.className = 'settings-option-card toggle-card'
    
    card.innerHTML = `
      <div class="settings-option-name">${label}</div>
      <div class="settings-option-value">${currentState ? 'ON' : 'OFF'}</div>
      <div class="toggle-fill" style="width: ${currentState ? '100%' : '0%'}"></div>
    `
    
    card.addEventListener('click', () => {
      const newState = !currentState
      const valueElement = card.querySelector('.settings-option-value') as HTMLElement
      const fillElement = card.querySelector('.toggle-fill') as HTMLElement
      
      if (valueElement) valueElement.textContent = newState ? 'ON' : 'OFF'
      if (fillElement) fillElement.style.width = newState ? '100%' : '0%'
      
      onChange(newState)
      currentState = newState
    })
    
    return card
  }

  function refreshHorizontalSettingsOptions() {
    horizontalSettingsOptions.innerHTML = ''
    
    // Get current values from desktop controls
    const pointSizeSlider = document.getElementById('point-size') as HTMLInputElement
    const sphereRadiusSlider = document.getElementById('sphere-radius') as HTMLInputElement
    const sphereToggle = document.getElementById('sphere-toggle') as HTMLInputElement
    const focalLengthSlider = document.getElementById('focal-length') as HTMLInputElement
    const fogDensitySlider = document.getElementById('fog-density') as HTMLInputElement
    
    // Check if sphere mode is active to show appropriate slider
    const isSphereMode = sphereToggle && sphereToggle.checked
    
    // Add Point Size or Sphere Radius slider card based on mode
    if (isSphereMode && sphereRadiusSlider) {
      const sphereRadiusCard = createSliderCard('Sphere Radius', sphereRadiusSlider.value, 
        parseFloat(sphereRadiusSlider.min), parseFloat(sphereRadiusSlider.max), parseFloat(sphereRadiusSlider.step),
        (value) => {
          sphereRadiusSlider.value = value.toString()
          sphereRadiusSlider.dispatchEvent(new Event('input'))
        })
      sphereRadiusCard.id = 'mobile-sphere-radius-card'
      sphereRadiusCard.style.cssText += 'flex: 1; min-width: 80px; max-width: calc(33.33% - 8px);'
      horizontalSettingsOptions.appendChild(sphereRadiusCard)
    } else if (!isSphereMode && pointSizeSlider) {
      const pointSizeCard = createSliderCard('Point Size', pointSizeSlider.value, 
        parseFloat(pointSizeSlider.min), parseFloat(pointSizeSlider.max), parseFloat(pointSizeSlider.step),
        (value) => {
          pointSizeSlider.value = value.toString()
          pointSizeSlider.dispatchEvent(new Event('input'))
        })
      pointSizeCard.id = 'mobile-point-size-card'
      pointSizeCard.style.cssText += 'flex: 1; min-width: 80px; max-width: calc(33.33% - 8px);'
      horizontalSettingsOptions.appendChild(pointSizeCard)
    }
    
    // Add Focal Length slider card
    if (focalLengthSlider) {
      const focalLengthCard = createSliderCard('Focal Length', focalLengthSlider.value,
        parseFloat(focalLengthSlider.min), parseFloat(focalLengthSlider.max), parseFloat(focalLengthSlider.step),
        (value) => {
          focalLengthSlider.value = value.toString()
          focalLengthSlider.dispatchEvent(new Event('input'))
        })
      focalLengthCard.id = 'mobile-focal-length-card'
      focalLengthCard.style.cssText += 'flex: 1; min-width: 80px; max-width: calc(33.33% - 8px);'
      horizontalSettingsOptions.appendChild(focalLengthCard)
    }
    
    // Add Fog Density slider card
    if (fogDensitySlider) {
      const fogDensityCard = createSliderCard('Fog Density', fogDensitySlider.value,
        parseFloat(fogDensitySlider.min), parseFloat(fogDensitySlider.max), parseFloat(fogDensitySlider.step),
        (value) => {
          fogDensitySlider.value = value.toString()
          fogDensitySlider.dispatchEvent(new Event('input'))
        })
      fogDensityCard.id = 'mobile-fog-density-card'
      fogDensityCard.style.cssText += 'flex: 1; min-width: 80px; max-width: calc(33.33% - 8px);'
      horizontalSettingsOptions.appendChild(fogDensityCard)
    }
    
    // Add Sphere Mode toggle card (affects which size slider is shown)
    if (sphereToggle) {
      const sphereModeCard = createToggleCard('Sphere Mode', sphereToggle.checked,
        (checked) => {
          sphereToggle.checked = checked
          sphereToggle.dispatchEvent(new Event('change'))
          // Refresh the settings panel to show/hide appropriate slider
          setTimeout(() => {
            refreshHorizontalSettingsOptions()
            refreshHorizontalCameraOptions()
          }, 50)
        })
      sphereModeCard.style.cssText += 'flex: 1; min-width: 80px; max-width: calc(33.33% - 8px);'
      horizontalSettingsOptions.appendChild(sphereModeCard)
    }
  }
  
  // Add camera options to the bottom of the combined panel
  function refreshHorizontalCameraOptions() {
    // Instead of adding to horizontalCameraOptions, add camera controls directly to horizontalSettingsOptions
    
    // Add Reset Camera option
    const resetCard = document.createElement('div')
    resetCard.className = 'camera-option-card'
    resetCard.style.cssText = `
      flex: 1;
      min-width: 80px;
      max-width: calc(33.33% - 8px);
      order: 100;
    `
    resetCard.innerHTML = `
      <div class="camera-option-name">Reset<br>Camera</div>
    `
    resetCard.addEventListener('click', () => {
      if (orbitalCamera) {
        orbitalCamera.resetToAnimationEnd()
      }
    })
    horizontalSettingsOptions.appendChild(resetCard)
    
    // Add Play Animation option
    const animationCard = document.createElement('div')
    animationCard.className = 'camera-option-card'
    animationCard.style.cssText = `
      flex: 1;
      min-width: 80px;
      max-width: calc(33.33% - 8px);
      order: 101;
    `
    animationCard.innerHTML = `
      <div class="camera-option-name">Play<br>Animation</div>
    `
    animationCard.addEventListener('click', () => {
      if (orbitalCamera) {
        orbitalCamera.startLoadingAnimation()
      }
    })
    horizontalSettingsOptions.appendChild(animationCard)
    
    // Get current rotation speed from orbitalCamera or default
    const currentSpeed = '0.0' // Default value - will be updated by scene state
    
    // Create rotation speed slider card using the same method as settings panel
    const speedCard = createSliderCard('Rotation', currentSpeed, -2.0, 2.0, 0.01, (value) => {
      if (orbitalCamera) {
        orbitalCamera.setBidirectionalRotationSpeed(value)
        
        // Sync desktop slider
        const desktopSlider = document.getElementById('auto-rotation-speed') as HTMLInputElement
        const desktopValue = document.getElementById('auto-rotation-speed-value') as HTMLElement
        if (desktopSlider) desktopSlider.value = value.toString()
        if (desktopValue) desktopValue.textContent = value.toFixed(2)
      }
    })
    speedCard.id = 'mobile-rotation-speed-card'
    speedCard.style.cssText += 'flex: 1; min-width: 80px; max-width: calc(33.33% - 8px); order: 102;'
    horizontalSettingsOptions.appendChild(speedCard)
  }
  
  // Event listeners
  settingsButton.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleCombinedPanel()
  })
  
  // No need to monitor bottom sheet state (removed)
  
  // Listen for desktop sphere toggle changes to refresh mobile settings
  const sphereToggle = document.getElementById('sphere-toggle') as HTMLInputElement
  if (sphereToggle) {
    sphereToggle.addEventListener('change', () => {
      // Refresh mobile settings when desktop sphere toggle changes
      if (horizontalSettingsOptions) {
        setTimeout(() => refreshHorizontalSettingsOptions(), 50)
      }
    })
  }

  // Initial setup
  setTimeout(() => {
    setMobileButtonPositions()
    updateSettingsButtonVisibility()
  }, 50)
}



// Settings button functionality
function setupSettingsButton() {
  console.log('Setting up settings button...')
  const settingsButton = document.getElementById('settings-button') as HTMLButtonElement
  const settingsButtonContainer = settingsButton?.closest('.control-button-container') as HTMLElement
  const settingsPanel = document.getElementById('settings-panel') as HTMLElement
  const settingsCloseButton = document.getElementById('settings-close') as HTMLButtonElement
  
  console.log('Settings button:', settingsButton)
  console.log('Settings panel:', settingsPanel)
  console.log('Settings close button:', settingsCloseButton)
  
  if (!settingsButton || !settingsPanel || !settingsButtonContainer || !settingsCloseButton) {
    console.warn('Settings elements not found', { settingsButton, settingsPanel, settingsButtonContainer, settingsCloseButton })
    return
  }
  
  // Toggle settings panel
  settingsButton.addEventListener('click', () => {
    const isVisible = settingsPanel.style.display === 'flex'
    
    if (isVisible) {
      // Hide settings panel
      settingsPanel.style.setProperty('display', 'none', 'important')
      settingsButton.classList.remove('active')
    } else {
      // Show settings panel
      settingsPanel.style.setProperty('display', 'flex', 'important')
      settingsButton.classList.add('active')
      
      // Check if effects panel is also open for expansion logic
      checkBothPanelsOpen()
    }
  })
  
  // Close settings - hide panel, update button state
  settingsCloseButton.addEventListener('click', (e) => {
    console.log('Settings close button clicked!')
    e.stopPropagation() // Prevent event bubbling
    settingsPanel.style.setProperty('display', 'none', 'important')
    settingsButton.classList.remove('active')
    
    // Force update of effects panel state if both were open
    checkBothPanelsOpen()
  })
}

// Effects button functionality
function setupEffectsButton() {
  console.log('Setting up effects button...')
  const effectsButton = document.getElementById('effects-button') as HTMLButtonElement
  const effectsButtonContainer = effectsButton?.closest('.control-button-container') as HTMLElement
  const effectsPanel = document.getElementById('effects-panel') as HTMLElement
  const effectsCloseButton = document.getElementById('effects-close') as HTMLButtonElement
  
  console.log('Effects button:', effectsButton)
  console.log('Effects panel:', effectsPanel)
  console.log('Effects close button:', effectsCloseButton)
  
  if (!effectsButton || !effectsPanel || !effectsButtonContainer || !effectsCloseButton) {
    console.warn('Effects elements not found', { effectsButton, effectsPanel, effectsButtonContainer, effectsCloseButton })
    return
  }
  
  // Toggle effects panel
  effectsButton.addEventListener('click', () => {
    const isVisible = effectsPanel.style.display === 'flex'
    
    if (isVisible) {
      // Hide effects panel
      effectsPanel.style.setProperty('display', 'none', 'important')
      effectsButton.classList.remove('active')
      
      // Force reset button styling - override mobile interference
      setTimeout(() => {
        effectsButton.style.removeProperty('background')
        effectsButton.style.removeProperty('border-color') 
        effectsButton.style.removeProperty('text-shadow')
        effectsButton.style.removeProperty('box-shadow')
        
        // Force desktop button styling to override mobile interference
        effectsButton.style.setProperty('background', 'rgba(0, 255, 0, 0.2)', 'important')
        effectsButton.style.setProperty('border-color', 'rgba(0, 255, 0, 0.3)', 'important')
      }, 50) // Delay to run after mobile positioning code
      
      console.log('Effects button active class removed:', !effectsButton.classList.contains('active'))
    } else {
      // Show effects panel
      effectsPanel.style.setProperty('display', 'flex', 'important')
      effectsButton.classList.add('active')
      
      // Force active styling to override mobile interference
      setTimeout(() => {
        effectsButton.style.setProperty('background', 'rgba(0, 255, 0, 0.4)', 'important')
        effectsButton.style.setProperty('border-color', 'rgba(0, 255, 0, 0.8)', 'important')
        effectsButton.style.setProperty('text-shadow', '0 0 15px rgba(0, 255, 0, 0.9)', 'important')
        effectsButton.style.setProperty('box-shadow', '0 0 10px rgba(0, 255, 0, 0.4)', 'important')
      }, 50) // Delay to run after mobile positioning code
      
      console.log('Effects button active class added:', effectsButton.classList.contains('active'))
      
      // Check if both panels are open for expansion logic
      checkBothPanelsOpen()
    }
  })
  
  // Close effects - hide panel, update button state
  effectsCloseButton.addEventListener('click', (e) => {
    console.log('Effects close button clicked!')
    e.stopPropagation() // Prevent event bubbling
    effectsPanel.style.setProperty('display', 'none', 'important')
    effectsButton.classList.remove('active')
    
    // Force reset button styling - override mobile interference
    setTimeout(() => {
      effectsButton.style.removeProperty('background')
      effectsButton.style.removeProperty('border-color')
      effectsButton.style.removeProperty('text-shadow')
      effectsButton.style.removeProperty('box-shadow')
      
      // Force desktop button styling to override mobile interference
      effectsButton.style.setProperty('background', 'rgba(0, 255, 0, 0.2)', 'important')
      effectsButton.style.setProperty('border-color', 'rgba(0, 255, 0, 0.3)', 'important')
    }, 50) // Delay to run after mobile positioning code
    
    console.log('Effects button active class removed via close button:', !effectsButton.classList.contains('active'))
    
    // Force update of settings panel state if both were open
    checkBothPanelsOpen()
  })
  
  // Setup effects panel collapse/expand functionality
  const effectsCollapseArrow = document.getElementById('effects-panel-collapse') as HTMLElement
  const effectsCollapsible = document.getElementById('effects-panel-collapsible') as HTMLElement
  
  if (effectsCollapseArrow && effectsCollapsible) {
    console.log('Setting up effects collapse arrow...')
    
    effectsCollapseArrow.addEventListener('click', (e) => {
      console.log('Effects collapse arrow clicked!')
      e.stopPropagation() // Prevent event bubbling
      
      const isExpanded = effectsCollapsible.style.display !== 'none'
      console.log('Current state - isExpanded:', isExpanded)
      
      if (isExpanded) {
        // Collapse the panel
        effectsCollapsible.style.setProperty('display', 'none', 'important')
        effectsCollapseArrow.textContent = '▶' // Right arrow for collapsed
        console.log('Panel collapsed')
      } else {
        // Expand the panel
        effectsCollapsible.style.setProperty('display', 'flex', 'important')
        effectsCollapseArrow.textContent = '▼' // Down arrow for expanded
        console.log('Panel expanded')
      }
    })
    
    // Make arrow clickable
    effectsCollapseArrow.style.cursor = 'pointer'
    effectsCollapseArrow.style.pointerEvents = 'auto'
    effectsCollapseArrow.style.userSelect = 'none'
    console.log('Effects collapse arrow setup complete')
  } else {
    console.warn('Effects collapse arrow or collapsible not found:', { effectsCollapseArrow, effectsCollapsible })
  }
}

// Helper function to hide all panels and reset button states
function hideAllPanels() {
  const settingsPanel = document.getElementById('settings-panel') as HTMLElement
  const effectsPanel = document.getElementById('effects-panel') as HTMLElement
  const settingsButton = document.getElementById('settings-button') as HTMLElement
  const effectsButton = document.getElementById('effects-button') as HTMLElement
  
  if (settingsPanel) {
    settingsPanel.style.setProperty('display', 'none', 'important')
  }
  if (effectsPanel) {
    effectsPanel.style.setProperty('display', 'none', 'important')
  }
  if (settingsButton) {
    settingsButton.classList.remove('active')
    // Force reset styling
    settingsButton.style.removeProperty('background')
    settingsButton.style.removeProperty('border-color')
    settingsButton.style.removeProperty('text-shadow')
    settingsButton.style.removeProperty('box-shadow')
  }
  if (effectsButton) {
    effectsButton.classList.remove('active')
    // Force reset styling
    effectsButton.style.removeProperty('background')
    effectsButton.style.removeProperty('border-color')
    effectsButton.style.removeProperty('text-shadow')
    effectsButton.style.removeProperty('box-shadow')
  }
}

// Check if both panels are open and handle effects expansion
function checkBothPanelsOpen() {
  const settingsPanel = document.getElementById('settings-panel') as HTMLElement
  const effectsPanel = document.getElementById('effects-panel') as HTMLElement
  
  const settingsOpen = settingsPanel && settingsPanel.style.display === 'flex'
  const effectsOpen = effectsPanel && effectsPanel.style.display === 'flex'
  
  if (settingsOpen && effectsOpen) {
    // Both panels are open - expand effects by default
    expandEffectsPanel()
  }
}

// Expand effects panel modules by default
function expandEffectsPanel() {
  const effectsCollapsible = document.getElementById('effects-panel-collapsible') as HTMLElement
  const effectsCollapseArrow = document.getElementById('effects-panel-collapse') as HTMLElement
  
  if (effectsCollapsible) {
    effectsCollapsible.style.display = 'block'
  }
  if (effectsCollapseArrow) {
    effectsCollapseArrow.textContent = '▼' // Show expanded arrow
  }
}

// Populate scene dropdown with scenes from randomScenes list
async function populateSceneDropdown(sceneDropdown: HTMLSelectElement) {
  try {
    // Fetch scenes configuration
    const response = await fetch('scenes-config.json')
    if (!response.ok) {
      throw new Error(`Failed to fetch scenes config: ${response.status}`)
    }
    
    const scenesCollection = await response.json()
    
    if (!scenesCollection.randomScenes || !scenesCollection.scenes) {
      throw new Error('Invalid scenes configuration structure')
    }
    
    // Clear existing options
    sceneDropdown.innerHTML = ''
    
    // Add default option
    const defaultOption = document.createElement('option')
    defaultOption.value = ''
    defaultOption.textContent = 'Select a scene...'
    sceneDropdown.appendChild(defaultOption)
    
    // Add scenes from randomScenes list
    scenesCollection.randomScenes.forEach((sceneKey: string) => {
      const sceneDefinition = scenesCollection.scenes[sceneKey]
      if (sceneDefinition) {
        const option = document.createElement('option')
        option.value = sceneKey
        option.textContent = sceneDefinition.name
        sceneDropdown.appendChild(option)
      } else {
        console.warn('Scene definition not found for key:', sceneKey)
      }
    })
    
    console.log(`Populated scene dropdown with ${scenesCollection.randomScenes.length} scenes`)
    
  } catch (error) {
    console.error('Failed to populate scene dropdown:', error)
    
    // Fallback: show error message
    sceneDropdown.innerHTML = ''
    const errorOption = document.createElement('option')
    errorOption.value = ''
    errorOption.textContent = 'Failed to load scenes'
    sceneDropdown.appendChild(errorOption)
  }
}

// Scene dropdown functionality
async function setupSceneDropdown() {
  console.log('Setting up scene dropdown...')
  const sceneDropdown = document.getElementById('scene-dropdown') as HTMLSelectElement
  
  if (!sceneDropdown) {
    console.warn('Scene dropdown not found')
    return
  }

  // Populate dropdown with scenes from randomScenes list
  await populateSceneDropdown(sceneDropdown)
  
  sceneDropdown.addEventListener('change', async () => {
    const selectedScene = sceneDropdown.value
    console.log('Scene selected:', selectedScene)
    
    if (selectedScene && orbitalCamera) {
      try {
        await orbitalCamera.loadSceneByKey(selectedScene)
        console.log('Scene loaded successfully:', selectedScene)
        
        // Debug: Check if effects were loaded
        const effectsChainManager = orbitalCamera.getEffectsChainManager()
        const loadedEffects = effectsChainManager.getEffectsChain()
        console.log('Effects after scene load:', loadedEffects.length, loadedEffects)
        
        // Refresh mobile effects and close any open parameters
        if ((window as any).refreshHorizontalEffects) {
          (window as any).refreshHorizontalEffects()
        }
        // Close mobile parameters box if it exists
        const parametersBox = document.getElementById('mobile-effect-parameters-box') as HTMLElement
        if (parametersBox && parametersBox.style.display !== 'none') {
          const closeButton = document.getElementById('parameters-box-close') as HTMLElement
          if (closeButton) {
            closeButton.click()
          }
        }
        
      } catch (error) {
        console.error('Failed to load scene:', selectedScene, error)
      }
    }
  })
  
  console.log('Scene dropdown setup complete')
}

// Global ESC key handler to close panels
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideAllPanels()
  }
})

// Setup auto-rotation speed control (desktop)
function setupAutoRotationControl() {
  const autoRotationSpeedSlider = document.getElementById('auto-rotation-speed') as HTMLInputElement
  const autoRotationSpeedValue = document.getElementById('auto-rotation-speed-value') as HTMLSpanElement
  if (autoRotationSpeedSlider && autoRotationSpeedValue) {
    autoRotationSpeedSlider.addEventListener('input', () => {
      if (orbitalCamera) {
        const speed = parseFloat(autoRotationSpeedSlider.value)
        orbitalCamera.setBidirectionalRotationSpeed(speed)
        autoRotationSpeedValue.textContent = speed.toFixed(2)
        
        // Sync mobile slider
        const mobileSlider = document.getElementById('mobile-rotation-speed') as HTMLInputElement
        const mobileSpeedValue = document.getElementById('mobile-rotation-speed-value') as HTMLSpanElement
        if (mobileSlider && mobileSpeedValue) {
          mobileSlider.value = speed.toString()
          mobileSpeedValue.textContent = speed.toFixed(2)
        }
      }
    })
  }
  
  // Initialize mobile auto-rotation controls with default values
  if (orbitalCamera) {
    const mobileSpeedValue = document.getElementById('mobile-rotation-speed-value') as HTMLSpanElement
    const mobileSlider = document.getElementById('mobile-rotation-speed') as HTMLInputElement
    
    const bidirectionalValue = orbitalCamera.getBidirectionalRotationSpeed()
    
    if (mobileSpeedValue) {
      mobileSpeedValue.textContent = bidirectionalValue.toFixed(2)
    }
    if (mobileSlider) {
      mobileSlider.value = bidirectionalValue.toString()
    }
    
    // Update the mobile fill
    if ((window as any).updateMobileRotationFill) {
      (window as any).updateMobileRotationFill()
    }
  }
}

// Fog density control setup
function setupFogControl() {
  console.log('Setting up fog control...')
  const fogDensitySlider = document.getElementById('fog-density') as HTMLInputElement
  const fogDensityValue = document.getElementById('fog-density-value') as HTMLSpanElement
  const mobileFogDensitySlider = document.getElementById('mobile-fog-density') as HTMLInputElement
  const mobileFogDensityValue = document.getElementById('mobile-fog-density-value') as HTMLSpanElement
  
  console.log('Fog slider:', fogDensitySlider)
  console.log('Fog value span:', fogDensityValue)
  console.log('Mobile fog slider:', mobileFogDensitySlider)
  console.log('Mobile fog value span:', mobileFogDensityValue)
  
  function updateFogDensity(density: number) {
    // Update scene fog
    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = density
      
      // Sync fog color with current background color
      if (scene.background instanceof THREE.Color) {
        scene.fog.color.copy(scene.background)
      }
      
      // Also update sphere materials if they exist
      if (modelManager) {
        const sphereInstancer = modelManager.getSphereInstancer()
        if (sphereInstancer) {
          const fogColor = scene.fog.color
          sphereInstancer.updateFogSettings(fogColor, density)
        }
      }
      
      console.log(`Fog density updated to: ${density}, color: ${scene.fog.color.getHexString()}`)
    }
  }
  
  // Desktop fog control
  if (fogDensitySlider && fogDensityValue) {
    fogDensitySlider.addEventListener('input', () => {
      const density = parseFloat(fogDensitySlider.value)
      fogDensityValue.textContent = density.toFixed(4)
      
      // Sync with mobile
      if (mobileFogDensitySlider && mobileFogDensityValue) {
        mobileFogDensitySlider.value = fogDensitySlider.value
        mobileFogDensityValue.textContent = density.toFixed(4)
      }
      
      updateFogDensity(density)
    })
  }
  
  // Mobile fog control
  if (mobileFogDensitySlider && mobileFogDensityValue) {
    mobileFogDensitySlider.addEventListener('input', () => {
      const density = parseFloat(mobileFogDensitySlider.value)
      mobileFogDensityValue.textContent = density.toFixed(4)
      
      // Sync with desktop
      if (fogDensitySlider && fogDensityValue) {
        fogDensitySlider.value = mobileFogDensitySlider.value
        fogDensityValue.textContent = density.toFixed(4)
      }
      
      updateFogDensity(density)
    })
  }
  
  if (fogDensitySlider || mobileFogDensitySlider) {
    console.log('Fog control setup complete')
  } else {
    console.warn('No fog control elements found')
  }
}

// Background color functionality
function setupBackgroundColorControl() {
  console.log('Setting up background color control...')
  const colorSwatch = document.getElementById('background-color-swatch') as HTMLElement
  const colorPicker = document.getElementById('background-color-picker') as HTMLInputElement
  
  console.log('Color swatch element:', colorSwatch)
  console.log('Color picker element:', colorPicker)
  
  if (!colorSwatch || !colorPicker) {
    console.warn('Background color elements not found', { colorSwatch, colorPicker })
    return
  }
  
  // Helper function to convert hex to HSL
  function hexToHsl(hex: string): { h: number, s: number, l: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2
    
    if (max === min) {
      h = s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break
        case g: h = (b - r) / d + 2; break
        case b: h = (r - g) / d + 4; break
      }
      h /= 6
    }
    
    return { h, s: s * 100, l: l * 100 }
  }
  
  
  // Apply background color with gamma correction
  function applyBackgroundColor(hex: string) {
    const { h, s, l } = hexToHsl(hex)
    
    // Convert to normalized values
    const hue = h
    const saturation = s / 100
    let lightness = l / 100
    
    // Apply gamma correction to counteract tone mapping
    lightness = Math.pow(lightness, 2.2)
    
    // Create and apply the color to the scene
    const color = new THREE.Color()
    color.setHSL(hue, saturation, lightness)
    
    if (scene) {
      scene.background = color
      
      // Update fog color to match background
      if (scene.fog && scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(color)
      }
    }
  }
  
  // Set initial color
  const initialColor = colorPicker.value
  colorSwatch.style.backgroundColor = initialColor
  applyBackgroundColor(initialColor)
  
  // Note: Color picker input is positioned over the swatch for direct clicking
  
  // Handle color picker change with real-time feedback
  colorPicker.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement
    const newColor = target.value
    
    // Update swatch color
    colorSwatch.style.backgroundColor = newColor
    
    // Apply to scene immediately (real-time feedback)
    applyBackgroundColor(newColor)
  })
  
  // Also handle the 'change' event for final confirmation
  colorPicker.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement
    const newColor = target.value
    
    // Update swatch color
    colorSwatch.style.backgroundColor = newColor
    
    // Apply to scene
    applyBackgroundColor(newColor)
    
    console.log('Background color changed to:', newColor)
  })
}

// Scene sharing functionality
function setupSceneSharing() {
  console.log('Setting up scene sharing...')
  const shareButton = document.getElementById('share-scene-button') as HTMLButtonElement
  const mobileShareButton = document.getElementById('mobile-share-button-element') as HTMLButtonElement
  const shareFeedback = document.getElementById('share-feedback') as HTMLElement
  
  if (!shareButton || !shareFeedback) {
    console.warn('Desktop scene sharing elements not found', { shareButton, shareFeedback })
    return
  }
  
  shareButton.addEventListener('click', async () => {
    try {
      console.log('Share scene button clicked')
      
      // Disable button temporarily to prevent spam
      shareButton.disabled = true
      
      // Copy scene link to clipboard
      const success = await orbitalCamera.copySceneToClipboard()
      
      if (success) {
        // Show success feedback
        const feedbackText = shareFeedback.querySelector('.feedback-text') as HTMLElement
        if (feedbackText) {
          feedbackText.textContent = 'Link copied to clipboard!'
        }
        shareFeedback.style.display = 'block'
        
        // Hide feedback after animation completes
        setTimeout(() => {
          shareFeedback.style.display = 'none'
        }, 2000)
        
        console.log('Scene shared successfully')
      } else {
        // Show URL in a more user-friendly way
        const shareUrl = orbitalCamera.generateShareableLink()
        console.log('Share URL (manual copy required):', shareUrl)
        
        // Show the URL in a text area for manual copying
        const urlDisplay = document.createElement('div')
        urlDisplay.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.9);
          border: 1px solid #00ff00;
          border-radius: 8px;
          padding: 20px;
          z-index: 9999;
          font-family: 'Space Mono', monospace;
          color: #00ff00;
          max-width: 80vw;
        `
        urlDisplay.innerHTML = `
          <div style="margin-bottom: 10px; font-size: 0.9rem;">Share URL (click to select all):</div>
          <textarea readonly style="
            width: 100%;
            height: 60px;
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid #00ff00;
            color: #00ff00;
            font-family: 'Space Mono', monospace;
            font-size: 0.7rem;
            padding: 8px;
            resize: none;
            border-radius: 4px;
          ">${shareUrl}</textarea>
          <button onclick="this.parentElement.remove()" style="
            margin-top: 10px;
            background: rgba(0, 255, 0, 0.2);
            border: 1px solid #00ff00;
            color: #00ff00;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-family: 'Space Mono', monospace;
            font-size: 0.8rem;
          ">Close</button>
        `
        
        // Auto-select text when clicked
        const textarea = urlDisplay.querySelector('textarea') as HTMLTextAreaElement
        textarea.addEventListener('click', () => textarea.select())
        
        document.body.appendChild(urlDisplay)
        
        // Auto-select the text
        setTimeout(() => textarea.select(), 100)
      }
      
    } catch (error) {
      console.error('Failed to share scene:', error)
      alert('Failed to share scene. Please try again.')
    } finally {
      // Re-enable button
      setTimeout(() => {
        shareButton.disabled = false
      }, 1000)
    }
  })
  
  // Mobile share button handler
  if (mobileShareButton) {
    mobileShareButton.addEventListener('click', async () => {
      try {
        console.log('Mobile share button clicked')
        
        // Disable button temporarily to prevent spam
        mobileShareButton.disabled = true
        
        // Prompt user for scene name
        const userSceneName = prompt('Enter a name for your scene:', 'My Custom Scene')
        
        // If user cancelled the prompt, re-enable button and exit
        if (userSceneName === null) {
          mobileShareButton.disabled = false
          return
        }
        
        // Use provided name or fallback to default
        const sceneName = userSceneName.trim() || 'Untitled Scene'
        const sceneKey = sceneName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')
        
        // Generate scene config JSON for scenes-config
        const sceneState = orbitalCamera.captureCurrentSceneState()
        
        // Create SceneDefinition with metadata
        const sceneDefinition = {
          ...sceneState,
          name: sceneName,
          description: `Exported scene configuration - ${new Date().toLocaleDateString()}`,
          creator: "User",
          // Round coordinates for cleaner JSON
          cameraPosition: {
            x: parseFloat(sceneState.cameraPosition.x.toFixed(2)),
            y: parseFloat(sceneState.cameraPosition.y.toFixed(2)),
            z: parseFloat(sceneState.cameraPosition.z.toFixed(2))
          },
          cameraTarget: {
            x: parseFloat(sceneState.cameraTarget.x.toFixed(2)),
            y: parseFloat(sceneState.cameraTarget.y.toFixed(2)),
            z: parseFloat(sceneState.cameraTarget.z.toFixed(2))
          }
        }
        
        // Format as scenes-config JSON structure
        const scenesConfig = {
          scenes: {
            [sceneKey]: sceneDefinition
          },
          randomScenes: [],
          defaultScene: sceneKey
        }
        
        const jsonString = JSON.stringify(scenesConfig, null, 2)
        
        // Try to copy to clipboard with robust fallback
        let copySuccess = false
        
        // Method 1: Modern clipboard API (if available and secure context)
        if (navigator.clipboard && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(jsonString)
            copySuccess = true
            console.log('Copied using modern clipboard API')
          } catch (error) {
            console.log('Modern clipboard API failed:', error)
          }
        }
        
        // Method 2: Legacy execCommand fallback
        if (!copySuccess) {
          try {
            const textArea = document.createElement('textarea')
            textArea.value = jsonString
            textArea.style.position = 'fixed'
            textArea.style.left = '-999999px'
            textArea.style.top = '-999999px'
            document.body.appendChild(textArea)
            textArea.focus()
            textArea.select()
            
            const successful = document.execCommand('copy')
            document.body.removeChild(textArea)
            
            if (successful) {
              copySuccess = true
              console.log('Copied using execCommand')
            }
          } catch (error) {
            console.log('execCommand fallback failed:', error)
          }
        }
        
        if (copySuccess) {
          // Show success feedback with scene name
          const feedbackText = shareFeedback.querySelector('.feedback-text') as HTMLElement
          if (feedbackText) {
            feedbackText.textContent = `"${sceneName}" copied to clipboard!`
          }
          shareFeedback.style.display = 'block'
          
          // Hide feedback after animation completes
          setTimeout(() => {
            shareFeedback.style.display = 'none'
          }, 2000)
          
          console.log(`Mobile scene config "${sceneName}" copied successfully`)
          
          // Additional confirmation alert
          setTimeout(() => {
            alert(`Scene "${sceneName}" has been copied to your clipboard!\n\nYou can now paste it into your scenes-config.json file.`)
          }, 500)
        } else {
          // Final fallback: show JSON in alert for manual copy
          console.log('All clipboard methods failed, showing JSON in alert')
          alert(`Scene Config JSON for "${sceneName}":\n\n${jsonString}\n\nSelect all and copy manually.`)
        }
        
      } catch (error) {
        console.error('Failed to share scene from mobile:', error)
        alert('Failed to share scene. Please try again.')
      } finally {
        // Re-enable button
        setTimeout(() => {
          mobileShareButton.disabled = false
        }, 1000)
      }
    })
    console.log('Mobile share button setup complete')
  } else {
    console.warn('Mobile share button not found')
  }
  
  console.log('Scene sharing setup complete')
}

// Gallery system setup functions
function setupGalleryButtons() {
  console.log('Setting up gallery buttons...')
  
  // Desktop capture button
  const captureButton = document.getElementById('capture-scene-button') as HTMLButtonElement
  if (captureButton) {
    captureButton.addEventListener('click', async () => {
      try {
        await handleCaptureScene(false) // false = desktop
      } catch (error) {
        console.error('Error capturing scene:', error)
        showCaptureFeedback('Failed to capture scene', false)
      }
    })
    console.log('Desktop capture button setup complete')
  }
  
  // Desktop gallery button
  const galleryButton = document.getElementById('gallery-button') as HTMLButtonElement
  if (galleryButton) {
    galleryButton.addEventListener('click', () => {
      showGalleryModal()
    })
    console.log('Desktop gallery button setup complete')
  }
  
  // Mobile capture button
  const mobileCaptureButton = document.getElementById('mobile-capture-button-element') as HTMLButtonElement
  if (mobileCaptureButton) {
    mobileCaptureButton.addEventListener('click', async () => {
      try {
        await handleCaptureScene(true) // true = mobile
      } catch (error) {
        console.error('Error capturing scene:', error)
      }
    })
    console.log('Mobile capture button setup complete')
  }
  
  // Mobile gallery button
  const mobileGalleryButton = document.getElementById('mobile-gallery-button-element') as HTMLButtonElement
  if (mobileGalleryButton) {
    mobileGalleryButton.addEventListener('click', () => {
      showGalleryModal()
    })
    console.log('Mobile gallery button setup complete')
  }
}

function setupGalleryModal() {
  console.log('Setting up gallery modal...')
  
  const modal = document.getElementById('gallery-modal') as HTMLElement
  const closeButton = document.getElementById('gallery-close') as HTMLButtonElement
  const searchInput = document.getElementById('gallery-search') as HTMLInputElement
  const modelFilter = document.getElementById('gallery-model-filter') as HTMLSelectElement
  const effectsFilter = document.getElementById('gallery-effects-filter') as HTMLSelectElement
  
  // Close button
  if (closeButton) {
    closeButton.addEventListener('click', hideGalleryModal)
  }
  
  // Click outside to close
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideGalleryModal()
      }
    })
  }
  
  // Search functionality
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      updateGalleryDisplay()
    })
  }
  
  // Filter functionality
  if (modelFilter) {
    modelFilter.addEventListener('change', () => {
      updateGalleryDisplay()
    })
  }
  
  if (effectsFilter) {
    effectsFilter.addEventListener('change', () => {
      updateGalleryDisplay()
    })
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (modal && modal.style.display !== 'none') {
      if (e.key === 'Escape') {
        hideGalleryModal()
      }
    }
  })
  
  console.log('Gallery modal setup complete')
}

async function handleCaptureScene(isMobile: boolean) {
  console.log('Capturing scene...', { isMobile })
  
  // Validate that capture system is ready
  const validation = cameraCapture.canCapture()
  if (!validation.canCapture) {
    console.error('Cannot capture scene:', validation.reason)
    showCaptureFeedback(`Cannot capture: ${validation.reason}`, isMobile)
    return
  }
  
  // Show progress modal
  showCaptureProgressModal()
  
  try {
    // Get current scene state
    const sceneState = orbitalCamera.captureCurrentSceneState()
    
    // Validate scene state
    if (!sceneState.modelKey) {
      throw new Error('No model loaded')
    }
    
    if (!sceneState.cameraPosition || !sceneState.cameraTarget) {
      throw new Error('Invalid camera state')
    }
    
    // Add a name for gallery display
    if (!sceneState.name) {
      const timestamp = new Date().toLocaleString()
      sceneState.name = `Scene ${timestamp}`
    }
    
    // Get recommended settings
    const settings = cameraCapture.getRecommendedSettings()
    
    console.log('Capturing with settings:', settings)
    
    // Capture scene with progress callback
    const galleryItem = await galleryManager.captureCurrentScene(
      sceneState,
      settings,
      (progress: CaptureProgress) => {
        updateCaptureProgress(progress)
      }
    )
    
    console.log('Scene captured successfully:', galleryItem.id)
    
    // Hide progress modal
    hideCaptureProgressModal()
    
    // Show success feedback
    showCaptureFeedback('Scene captured successfully!', isMobile)
    
    // Refresh gallery display if modal is open
    const galleryModal = document.getElementById('gallery-modal') as HTMLElement
    if (galleryModal && galleryModal.style.display !== 'none') {
      updateGalleryDisplay()
      populateGalleryFilters()
    }
    
  } catch (error) {
    console.error('Error capturing scene:', error)
    hideCaptureProgressModal()
    
    let errorMessage = 'Failed to capture scene'
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`
    }
    
    showCaptureFeedback(errorMessage, isMobile)
    throw error
  }
}

function showGalleryModal() {
  console.log('Showing gallery modal...')
  
  const modal = document.getElementById('gallery-modal') as HTMLElement
  if (modal) {
    modal.style.display = 'flex'
    updateGalleryDisplay()
    populateGalleryFilters()
  }
}

function hideGalleryModal() {
  console.log('Hiding gallery modal...')
  
  const modal = document.getElementById('gallery-modal') as HTMLElement
  if (modal) {
    modal.style.display = 'none'
  }
}

function updateGalleryDisplay() {
  try {
    const searchInput = document.getElementById('gallery-search') as HTMLInputElement
    const modelFilter = document.getElementById('gallery-model-filter') as HTMLSelectElement
    const effectsFilter = document.getElementById('gallery-effects-filter') as HTMLSelectElement
    const galleryGrid = document.getElementById('gallery-grid') as HTMLElement
    const galleryEmpty = document.getElementById('gallery-empty') as HTMLElement
    const galleryCount = document.getElementById('gallery-count') as HTMLElement
    const galleryLoading = document.getElementById('gallery-loading') as HTMLElement
    
    // Show loading state
    if (galleryLoading) {
      galleryLoading.style.display = 'inline'
    }
    
    // Build filter
    const filter: any = {}
    
    if (searchInput?.value) {
      filter.searchTerm = searchInput.value.trim()
    }
    
    if (modelFilter?.value) {
      filter.model = modelFilter.value
    }
    
    if (effectsFilter?.value) {
      if (effectsFilter.value === 'none') {
        filter.hasEffects = false
      } else if (effectsFilter.value === 'has') {
        filter.hasEffects = true
      }
    }
    
    // Get filtered items
    const items = galleryManager.getItems(filter)
    
    // Update count
    if (galleryCount) {
      galleryCount.textContent = `${items.length} scene${items.length !== 1 ? 's' : ''}`
    }
    
    // Show/hide empty state
    if (galleryEmpty && galleryGrid) {
      if (items.length === 0) {
        galleryGrid.style.display = 'none'
        galleryEmpty.style.display = 'flex'
      } else {
        galleryGrid.style.display = 'grid'
        galleryEmpty.style.display = 'none'
        
        // Populate grid
        galleryGrid.innerHTML = ''
        items.forEach(item => {
          try {
            const element = createGalleryItemElement(item)
            galleryGrid.appendChild(element)
          } catch (error) {
            console.warn('Error creating gallery item element:', error, item)
          }
        })
      }
    }
    
    // Hide loading state
    if (galleryLoading) {
      galleryLoading.style.display = 'none'
    }
    
  } catch (error) {
    console.error('Error updating gallery display:', error)
    
    // Hide loading state
    const galleryLoading = document.getElementById('gallery-loading') as HTMLElement
    if (galleryLoading) {
      galleryLoading.style.display = 'none'
    }
    
    // Show error in count area
    const galleryCount = document.getElementById('gallery-count') as HTMLElement
    if (galleryCount) {
      galleryCount.textContent = 'Error loading gallery'
    }
  }
}

function createGalleryItemElement(item: GalleryItem): HTMLElement {
  const element = document.createElement('div')
  element.className = 'gallery-item'
  element.onclick = () => loadGalleryItem(item)
  
  // Escape HTML to prevent XSS
  const escapeHtml = (text: string) => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
  
  const safeName = escapeHtml(item.info.name || 'Untitled Scene')
  const safeModel = escapeHtml(item.info.model || 'Unknown')
  const effectsCount = typeof item.info.effects === 'number' ? item.info.effects : 0
  
  element.innerHTML = `
    <img src="${item.url}" alt="${safeName}" class="gallery-item-image" 
         onerror="this.style.backgroundColor='rgba(255,0,0,0.1)'; this.alt='Failed to load image'">
    <div class="gallery-item-info">
      <div class="gallery-item-name">${safeName}</div>
      <div class="gallery-item-details">
        <span class="gallery-item-model">${safeModel}</span>
        <span class="gallery-item-effects">${effectsCount} effect${effectsCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `
  
  return element
}

function loadGalleryItem(item: GalleryItem) {
  console.log('Loading gallery item:', item.id)
  
  try {
    // Validate scene metadata
    if (!item.metadata || !item.metadata.sceneState) {
      throw new Error('Invalid scene metadata')
    }
    
    const sceneState = item.metadata.sceneState
    
    // Validate required scene properties
    if (!sceneState.modelKey) {
      throw new Error('Missing model information')
    }
    
    if (!sceneState.cameraPosition || !sceneState.cameraTarget) {
      throw new Error('Missing camera information')
    }
    
    if (!Array.isArray(sceneState.effectsChain)) {
      sceneState.effectsChain = []
    }
    
    console.log('Loading scene:', {
      name: item.info.name,
      model: sceneState.modelKey,
      effects: sceneState.effectsChain.length,
      version: item.metadata.version
    })
    
    // Apply the scene state
    orbitalCamera.applySceneState(sceneState)
    
    // Hide gallery modal
    hideGalleryModal()
    
    console.log('Gallery item loaded successfully')
    
    // Show brief success feedback
    const feedback = document.getElementById('share-feedback') as HTMLElement
    if (feedback) {
      const textElement = feedback.querySelector('.feedback-text') as HTMLElement
      if (textElement) {
        textElement.textContent = `Loaded: ${item.info.name}`
      }
      
      feedback.style.display = 'block'
      setTimeout(() => {
        feedback.style.display = 'none'
      }, 1500)
    }
    
  } catch (error) {
    console.error('Error loading gallery item:', error)
    
    let errorMessage = 'Failed to load scene from gallery'
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`
    }
    
    alert(errorMessage)
  }
}

function populateGalleryFilters() {
  const modelFilter = document.getElementById('gallery-model-filter') as HTMLSelectElement
  
  if (modelFilter) {
    // Clear existing options (except "All Models")
    const allOption = modelFilter.querySelector('option[value=""]')
    modelFilter.innerHTML = ''
    if (allOption) {
      modelFilter.appendChild(allOption)
    }
    
    // Get available models from gallery stats
    const stats = galleryManager.getStats()
    stats.models.forEach(model => {
      const option = document.createElement('option')
      option.value = model
      option.textContent = model.charAt(0).toUpperCase() + model.slice(1).replace('_', ' ')
      modelFilter.appendChild(option)
    })
  }
}

function showCaptureProgressModal() {
  const modal = document.getElementById('capture-progress-modal') as HTMLElement
  if (modal) {
    modal.style.display = 'flex'
  }
}

function hideCaptureProgressModal() {
  const modal = document.getElementById('capture-progress-modal') as HTMLElement
  if (modal) {
    modal.style.display = 'none'
  }
}

function updateCaptureProgress(progress: CaptureProgress) {
  const progressFill = document.getElementById('capture-progress-fill') as HTMLElement
  const progressText = document.getElementById('capture-progress-text') as HTMLElement
  
  if (progressFill) {
    progressFill.style.width = `${progress.progress}%`
  }
  
  if (progressText) {
    progressText.textContent = progress.message
  }
}

function showCaptureFeedback(message: string, isMobile: boolean) {
  if (isMobile) {
    // For mobile, show a simple alert
    alert(message)
  } else {
    // For desktop, show the feedback element
    const feedback = document.getElementById('capture-feedback') as HTMLElement
    if (feedback) {
      const textElement = feedback.querySelector('.feedback-text') as HTMLElement
      if (textElement) {
        textElement.textContent = message
      }
      
      feedback.style.display = 'block'
      
      // Hide after animation
      setTimeout(() => {
        feedback.style.display = 'none'
      }, 2000)
    }
  }
}

// Initialize application
async function initialize() {
  console.log('🚀 Initialize() called')
  
  try {
    // Detect and apply input type for responsive layout
    detectAndApplyInputType()
    console.log('✅ Input type detection applied')
    
    // Hide loading screen immediately since we start with point clouds
    progressEl.style.display = 'none'
    console.log('✅ Loading screen hidden')
    
    // Start loading configs asynchronously (non-blocking)
    console.log('📁 Starting async config loading...')
    const configLoadPromise = Promise.all([
      modelManager.loadModelsConfig(),
      contentLoader.loadProjectsConfig()
    ]).then(() => {
      console.log('✅ Configs loaded - setting up dropdowns and camera defaults...')
      modelManager.setupModelDropdown()
      modelManager.setupQualityDropdown()
      
      // Set up progressive sphere conversion
      modelManager.setupProgressiveSphereConversion()
      
      // Setup camera system defaults after configs are loaded
      orbitalCamera.updateDisplayNameField()
      orbitalCamera.loadDefaultPointSize()
      orbitalCamera.loadDefaultFocalLength()
      orbitalCamera.loadDefaultAutoRotationSpeed()
      
      // Start loading animation after configs are available
      console.log('🎬 Starting loading animation...')
      orbitalCamera.startLoadingAnimation()
      console.log('✅ Loading animation started')
      
      console.log('✅ Dropdowns and camera defaults setup complete')
    }).catch(error => {
      console.error('❌ Config loading failed:', error)
    })
    console.log('✅ Config loading started in background')
    
    console.log('⚙️ Setting up control buttons...')
    setupSettingsButton()
    setupEffectsButton()
    setupAutoRotationControl()
    // Setup background color control with a small delay to ensure DOM is ready
    setTimeout(() => {
      setupBackgroundColorControl()
    }, 100)
    await setupSceneDropdown()
    console.log('✅ Control buttons setup complete')
    
    console.log('📱 Setting up mobile controls...')
    setupMobileEffectsButton()
    setupMobileSettings()
    
    // Hide separate camera button and panel since they're now combined with settings
    const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
    const cameraPanel = document.getElementById('mobile-horizontal-camera-panel') as HTMLElement
    if (cameraButtonContainer) {
      cameraButtonContainer.style.display = 'none'
    }
    if (cameraPanel) {
      cameraPanel.style.display = 'none'
    }
    
    console.log('✅ Mobile controls setup complete')
    
    console.log('🌫️ Setting up fog control...')
    setupFogControl()
    console.log('✅ Fog control setup complete')
    
    console.log('🔗 Setting up scene sharing...')
    setupSceneSharing()
    console.log('✅ Scene sharing setup complete')
    
    console.log('📸 Setting up gallery system...')
    setupGalleryButtons()
    setupGalleryModal()
    console.log('✅ Gallery system setup complete')
    
    // Show home navigation indicators on initial load
    console.log('🏠 Setting up navigation...')
    const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
    if (homeNavigation) {
      homeNavigation.style.display = 'flex'
      homeNavigation.style.visibility = 'visible'
    }
    
    // Setup navigation event listeners
    orbitalCamera.setupPageNavigation()
    console.log('✅ Navigation setup complete')
    
    // Update initial point size control visibility
    console.log('📏 Setting up point size controls...')
    modelManager.updatePointSizeControlVisibility()
    console.log('✅ Point size controls setup complete')
    
    // Wait for configs to load before model operations
    console.log('⏳ Waiting for configs before model loading...')
    await configLoadPromise
    
    // Check for scene URL parameter and load if present
    console.log('🔗 Checking for shared scene URL...')
    const hasSceneUrl = await orbitalCamera.loadSceneFromUrl()
    
    if (!hasSceneUrl) {
      // No shared scene, try to load a random scene
      console.log('🎲 Attempting to load random scene...')
      const hasRandomScene = await orbitalCamera.loadRandomScene()
      
      if (!hasRandomScene) {
        // No random scene available, try to load default scene
        console.log('🎯 Attempting to load default scene...')
        const hasDefaultScene = await orbitalCamera.loadDefaultScene()
        
        if (!hasDefaultScene) {
          // No default scene available, load default point cloud
          console.log('☁️ Loading default point cloud...')
          modelManager.loadPointCloud().then(() => {
            console.log('✅ Point cloud loaded, initializing sphere mode...')
            // Initialize sphere mode immediately after point cloud loads but before it's visible
            orbitalCamera.initializeSphereMode()
            console.log('✅ Sphere mode initialization complete')
          }).catch((error) => {
            console.error('❌ Point cloud loading failed:', error)
          })
        } else {
          console.log('✅ Default scene loaded')
          // Initialize sphere mode for default scene
          orbitalCamera.initializeSphereMode()
        }
      } else {
        console.log('✅ Random scene loaded')
        // Initialize sphere mode for random scene
        orbitalCamera.initializeSphereMode()
      }
    } else {
      console.log('✅ Shared scene loaded from URL')
      // Initialize sphere mode for shared scene
      orbitalCamera.initializeSphereMode()
    }
    
    console.log('🎮 Starting animation loop...')
    animate()
    console.log('✅ Initialization complete!')
    
    // Hide immediate loading screen with fade out
    console.log('🎬 Hiding immediate loading screen...')
    const immediateLoading = document.getElementById('immediate-loading')
    if (immediateLoading) {
      immediateLoading.style.opacity = '0'
      setTimeout(() => {
        immediateLoading.style.display = 'none'
      }, 500) // Match CSS transition duration
    }
    console.log('✅ Loading screen hidden')
    
  } catch (error) {
    console.error('❌ Initialization failed:', error)
    // Also hide loading screen on error
    const immediateLoading = document.getElementById('immediate-loading')
    if (immediateLoading) {
      immediateLoading.style.opacity = '0'
      setTimeout(() => {
        immediateLoading.style.display = 'none'
      }, 500)
    }
  }
}

// Start the application
initialize()