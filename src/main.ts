import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { ProgressiveLoader } from './ProgressiveLoader.js'
import { OrbitalCameraSystem } from './camera'
import { ModelManager } from './models'
import { ContentLoader } from './interface'
import { PostProcessingPass } from './effects'
import type { InterfaceMode } from './types'
import type { EffectsChainManager, EffectInstance } from './effects/EffectsChainManager'

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
  logarithmicDepthBuffer: true  // Better depth precision
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Improve depth testing and culling
renderer.sortObjects = true

// Enable HDR tone mapping and environment lighting
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1 // Reset to normal exposure

// Using only EXR environment lighting

// Load EXR environment map
const pmremGenerator = new THREE.PMREMGenerator(renderer)
pmremGenerator.compileEquirectangularShader()

const exrLoader = new EXRLoader()
exrLoader.load('/hdr/Twilight Sunset 1k.exr', (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture
  scene.environment = envMap
  texture.dispose()
  pmremGenerator.dispose()
  console.log('EXR environment loaded successfully')
}, undefined, (error) => {
  console.warn('Failed to load EXR environment:', error)
  console.log('Using fallback lighting only')
})

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.05

// Progressive loader
const progressiveLoader = new ProgressiveLoader(scene)

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

// Expose contentLoader and effects globally for OrbitalCameraSystem to access
;(window as any).contentLoader = contentLoader
;(window as any).postProcessingPass = postProcessingPass
;(window as any).updatePostProcessingPointClouds = () => postProcessingPass.updatePointClouds()

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

// Main render loop
function animate() {
  requestAnimationFrame(animate)
  
  // Monitor framerate for automatic sphere detail adjustment
  frameCount++
  const now = performance.now()
  const deltaTime = now - lastFramerateCheck
  
  // Check framerate every second
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
  
  // Update brush effects continuously (for physics simulation)
  postProcessingPass.updateBrushEffects()
  
  // Check if we actually have effects to apply and if post-processing is enabled
  const effectsChain = postProcessingPass.getEffectsChain()
  const hasActiveEffects = postProcessingPass.enabled && (
    effectsChain.some(effect => effect.enabled && (
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

// Mouse/touch event handlers for brush effect
function handleMouseDown(_event: MouseEvent) {
  // Don't interfere with camera controls
}

function handleMouseUp() {
  // Don't interfere with camera controls
}

function handleMouseMove(event: MouseEvent) {
  // Always update brush position on mouse move (brush will be active when effect is enabled)
  postProcessingPass.setBrushPosition(event.clientX, event.clientY, true)
}

function handleTouchStart(event: TouchEvent) {
  if (event.touches.length === 1) {
    event.preventDefault()
    const touch = event.touches[0]
    postProcessingPass.setBrushPosition(touch.clientX, touch.clientY, true)
  }
}

function handleTouchEnd() {
  // Touch ended, but brush can still be active on mouse move
}

function handleTouchMove(event: TouchEvent) {
  if (event.touches.length === 1) {
    event.preventDefault()
    const touch = event.touches[0]
    postProcessingPass.setBrushPosition(touch.clientX, touch.clientY, true)
  }
}

// Add event listeners
canvas.addEventListener('mousedown', handleMouseDown)
canvas.addEventListener('mouseup', handleMouseUp)
canvas.addEventListener('mousemove', handleMouseMove)
canvas.addEventListener('mouseleave', handleMouseUp) // Reset when mouse leaves canvas

canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
canvas.addEventListener('touchend', handleTouchEnd)
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

// Shared parameter slider card creation function
function createParameterSliderCard(label: string, currentValue: string, min: number, max: number, step: number, onChange: (value: number) => void) {
  const card = document.createElement('div')
  card.className = 'parameter-control'
  
  const normalizedValue = (parseFloat(currentValue) - min) / (max - min)
  const fillPercentage = Math.max(0, Math.min(100, normalizedValue * 100))
  
  card.innerHTML = `
    <label>${label}</label>
    <div class="parameter-value">${parseFloat(currentValue).toFixed(3)}</div>
    <div class="parameter-fill" style="width: ${fillPercentage}%"></div>
  `
  
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
  
  return card
}

// Mobile effects button functionality
function setupMobileEffectsButton() {
  const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
  const effectsButton = document.getElementById('effects-button') as HTMLElement
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
        
        // Add faster touch-based drag for mobile
        let touchStarted = false
        let touchMoved = false
        let dragTimeout: number | null = null
        
        card.addEventListener('touchstart', () => {
          touchStarted = true
          touchMoved = false
          
          // Only start drag if touch is held and moved
          dragTimeout = setTimeout(() => {
            if (touchStarted && touchMoved) {
              // Trigger drag start only after movement is detected
              const dragEvent = new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer()
              })
              card.dispatchEvent(dragEvent)
            }
          }, 20)
        })
        
        card.addEventListener('touchmove', () => {
          touchMoved = true
        })
        
        card.addEventListener('touchend', () => {
          touchStarted = false
          touchMoved = false
          if (dragTimeout) {
            clearTimeout(dragTimeout)
            dragTimeout = null
          }
        })
        
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
    
    // Add the preset selector button between add and reset
    const presetButton = document.createElement('div')
    presetButton.className = 'horizontal-preset-button'
    presetButton.innerHTML = `
      <div class="add-effect-icon">+</div>
      <div class="add-effect-text">Select Preset</div>
    `
    presetButton.addEventListener('click', () => {
      // Show mobile preset selector
      showMobilePresetSelector()
    })
    horizontalEffectsChain.appendChild(presetButton)
    
    // Add the reset button to the right of the preset button
    const resetButton = document.createElement('div')
    resetButton.className = 'horizontal-reset-button'
    resetButton.innerHTML = `
      <div class="reset-effect-icon">×</div>
      <div class="reset-effect-text">Reset All</div>
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
        }
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
          effects: ['background', 'gamma', 'sepia', 'colorify', 'invert', 'bleachbypass']
        },
        'Blur': {
          color: '#4ECDC4',
          effects: ['blur', 'bloom', 'motionblur', 'glow', 'dof']
        },
        'Grain': {
          color: '#45B7D1',
          effects: ['crtgrain', 'film35mm', 'pixelate']
        },
        'Post-Process': {
          color: '#96CEB4',
          effects: ['vignette', 'afterimage', 'sobel', 'sobelthreshold', 'oilpainting', 'ascii', 'halftone', 'floydsteinberg', 'datamosh', 'pixelsort']
        },
        '3D Effects': {
          color: '#FECA57',
          effects: ['drawrange', 'pointnetwork', 'material', 'brush', 'topographic', 'fog']
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
              window.effectsChainManager.addEffect(definition.type)
              refreshHorizontalEffectsChain()
              
              // Close the selector
              document.body.removeChild(overlay)
              
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
  
  function showMobilePresetSelector() {
    // TODO: Implement preset selector functionality
    console.log('Mobile preset selector clicked - functionality to be implemented')
  }

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
      
      if (preset.id === 'none') {
        option.classList.add('active')
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
    // Calculate how high the buttons should be positioned based on open panels
    const openPanels = Array.from(panels.values()).filter(panel => panel.isOpen)
    if (openPanels.length === 0) {
      // No panels open, use default position
      const defaultPosition = 12
      const defaultTrashPosition = 120
      const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
      const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
      const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
      const presetSelector = document.getElementById('mobile-preset-selector') as HTMLElement
      const trashIcon = document.getElementById('mobile-trash-icon') as HTMLElement
      
      if (cameraButtonContainer) cameraButtonContainer.style.bottom = `${defaultPosition}px`
      if (effectsButtonContainer) effectsButtonContainer.style.bottom = `${defaultPosition}px`
      if (settingsButtonContainer) settingsButtonContainer.style.bottom = `${defaultPosition}px`
      if (presetSelector) presetSelector.style.bottom = `${defaultPosition}px`
      if (trashIcon) trashIcon.style.bottom = `${defaultTrashPosition}px`
      return
    }
    
    const maxPosition = Math.max(...openPanels.map(panel => panel.position || 0), 0)
    const buttonBottomPosition = 12 + (maxPosition + 1) * PANEL_HEIGHT
    
    // Calculate trash icon position (above the highest panel with some spacing)
    const trashBottomPosition = openPanels.length > 0 ? 
      (maxPosition + 1) * PANEL_HEIGHT + 20 : // 20px above highest panel
      120 // Default position when no panels open
    
    // Update all mobile button positions
    const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
    const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
    const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
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
    if (presetSelector) {
      presetSelector.style.bottom = `${buttonBottomPosition}px`
    }
    if (trashIcon) {
      trashIcon.style.bottom = `${trashBottomPosition}px`
    }
    
    console.log(`Mobile buttons positioned at: ${buttonBottomPosition}px, trash icon at: ${trashBottomPosition}px (max panel position: ${maxPosition})`)
  }

  function updateIconActiveStates() {
    // Update button active states only, not positions
    const cameraButton = document.getElementById('camera-reset-button') as HTMLElement
    const cameraPanel = panels.get('camera')
    
    const effectsButton = document.getElementById('effects-button') as HTMLElement
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

// Mobile camera button functionality (unified horizontal panel system)
function setupMobileCameraReset() {
  const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
  const cameraButton = document.getElementById('camera-reset-button') as HTMLElement
  const horizontalCameraPanel = document.getElementById('mobile-horizontal-camera-panel') as HTMLElement
  const horizontalCameraOptions = document.getElementById('horizontal-camera-options') as HTMLElement
  
  if (!cameraButtonContainer || !cameraButton || !horizontalCameraPanel || !horizontalCameraOptions) {
    console.warn('Mobile camera button elements not found')
    return
  }
  
  // Initialize panel manager and register this panel
  const manager = initializePanelManager()
  manager.registerPanel('camera', horizontalCameraPanel)
  
  // Camera button is always visible now (no bottom sheet)
  function updateCameraButtonVisibility() {
    cameraButtonContainer.style.opacity = '1'
    cameraButtonContainer.style.pointerEvents = 'auto'
  }
  
  function toggleCameraPanel() {
    const isOpen = manager.togglePanel('camera')
    
    if (isOpen) {
      refreshHorizontalCameraOptions()
    } else {
      // No need to manage active state here - handled centrally
    }
  }
  
  function refreshHorizontalCameraOptions() {
    horizontalCameraOptions.innerHTML = ''
    
    // Add Reset Camera option
    const resetCard = document.createElement('div')
    resetCard.className = 'camera-option-card'
    resetCard.innerHTML = `
      <div class="camera-option-name">Reset Camera</div>
    `
    resetCard.addEventListener('click', () => {
      if (orbitalCamera) {
        orbitalCamera.resetToAnimationEnd()
      }
      // Don't close panel - let user manually close it
    })
    horizontalCameraOptions.appendChild(resetCard)
    
    // Add Play Animation option
    const animationCard = document.createElement('div')
    animationCard.className = 'camera-option-card'
    animationCard.innerHTML = `
      <div class="camera-option-name">Play Animation</div>
    `
    animationCard.addEventListener('click', () => {
      if (orbitalCamera) {
        orbitalCamera.startLoadingAnimation()
      }
      // Don't close panel - let user manually close it
    })
    horizontalCameraOptions.appendChild(animationCard)
  }
  
  // Event listeners
  cameraButton.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleCameraPanel()
  })
  
  // No need to monitor bottom sheet state (removed)
  
  // Initial setup
  setTimeout(() => {
    setMobileButtonPositions()
    updateCameraButtonVisibility()
  }, 50)
}

// Mobile settings button functionality (unified horizontal panel system)
function setupMobileSettings() {
  const settingsButtonContainer = document.getElementById('mobile-settings-button') as HTMLElement
  const settingsButton = document.getElementById('mobile-settings-button-element') as HTMLElement
  const horizontalSettingsPanel = document.getElementById('mobile-horizontal-settings-panel') as HTMLElement
  const horizontalSettingsOptions = document.getElementById('horizontal-settings-options') as HTMLElement
  
  if (!settingsButtonContainer || !settingsButton || !horizontalSettingsPanel || !horizontalSettingsOptions) {
    console.warn('Mobile settings button elements not found')
    return
  }
  
  // Initialize panel manager and register this panel
  const manager = initializePanelManager()
  manager.registerPanel('settings', horizontalSettingsPanel)
  
  // Settings button is always visible now (no bottom sheet)
  function updateSettingsButtonVisibility() {
    settingsButtonContainer.style.opacity = '1'
    settingsButtonContainer.style.pointerEvents = 'auto'
  }
  
  function toggleSettingsPanel() {
    const isOpen = manager.togglePanel('settings')
    
    if (isOpen) {
      refreshHorizontalSettingsOptions()
    } else {
      // No additional cleanup needed
    }
  }
  
  function createSliderCard(label: string, currentValue: string, min: number, max: number, step: number, onChange: (value: number) => void) {
    const card = document.createElement('div')
    card.className = 'settings-option-card slider-card'
    
    const normalizedValue = (parseFloat(currentValue) - min) / (max - min)
    const fillPercentage = Math.max(0, Math.min(100, normalizedValue * 100))
    
    card.innerHTML = `
      <div class="settings-option-name">${label}</div>
      <div class="settings-option-value">${currentValue}</div>
      <div class="slider-fill" style="width: ${fillPercentage}%"></div>
    `
    
    // Touch interaction for slider - relative movement only
    let isDragging = false
    let startX = 0
    let startValue = parseFloat(currentValue)
    let currentSliderValue = parseFloat(currentValue)
    
    const handleStart = (clientX: number) => {
      isDragging = true
      startX = clientX
      startValue = currentSliderValue // Use current slider value, not DOM value
      card.classList.add('dragging')
    }
    
    const handleMove = (clientX: number) => {
      if (!isDragging) return
      
      const rect = card.getBoundingClientRect()
      const deltaX = clientX - startX
      const sensitivityFactor = 1.0 // Adjust this to control sensitivity
      const percentageChange = (deltaX * sensitivityFactor) / rect.width
      const valueRange = max - min
      const newValue = Math.max(min, Math.min(max, startValue + (percentageChange * valueRange)))
      const steppedValue = Math.round(newValue / step) * step
      
      // Update current slider value
      currentSliderValue = steppedValue
      
      // Update visual fill
      const fillPercent = ((steppedValue - min) / (max - min)) * 100
      const fillElement = card.querySelector('.slider-fill') as HTMLElement
      const valueElement = card.querySelector('.settings-option-value') as HTMLElement
      
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
    
    // Mouse events for desktop testing - same relative behavior
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
    
    // Method to update slider from external changes (desktop controls)
    const updateSliderValue = (newValue: string) => {
      currentSliderValue = parseFloat(newValue)
      const fillPercent = ((currentSliderValue - min) / (max - min)) * 100
      const fillElement = card.querySelector('.slider-fill') as HTMLElement
      const valueElement = card.querySelector('.settings-option-value') as HTMLElement
      
      if (fillElement) fillElement.style.width = `${fillPercent}%`
      if (valueElement) valueElement.textContent = newValue
    }
    
    // Expose update method on the card element for external updates
    ;(card as any).updateValue = updateSliderValue
    
    return card
  }
  
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
    const autoRotateToggle = document.getElementById('auto-rotate-toggle') as HTMLInputElement
    
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
      horizontalSettingsOptions.appendChild(sphereRadiusCard)
    } else if (!isSphereMode && pointSizeSlider) {
      const pointSizeCard = createSliderCard('Point Size', pointSizeSlider.value, 
        parseFloat(pointSizeSlider.min), parseFloat(pointSizeSlider.max), parseFloat(pointSizeSlider.step),
        (value) => {
          pointSizeSlider.value = value.toString()
          pointSizeSlider.dispatchEvent(new Event('input'))
        })
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
      horizontalSettingsOptions.appendChild(fogDensityCard)
    }
    
    // Add Auto-Rotate toggle card
    if (autoRotateToggle) {
      const autoRotateCard = createToggleCard('Auto-Rotate', autoRotateToggle.checked,
        (checked) => {
          autoRotateToggle.checked = checked
          autoRotateToggle.dispatchEvent(new Event('change'))
        })
      horizontalSettingsOptions.appendChild(autoRotateCard)
    }
    
    // Add Sphere Mode toggle card (affects which size slider is shown)
    if (sphereToggle) {
      const sphereModeCard = createToggleCard('Sphere Mode', sphereToggle.checked,
        (checked) => {
          sphereToggle.checked = checked
          sphereToggle.dispatchEvent(new Event('change'))
          // Refresh the settings panel to show/hide appropriate slider
          setTimeout(() => refreshHorizontalSettingsOptions(), 50)
        })
      horizontalSettingsOptions.appendChild(sphereModeCard)
    }
  }
  
  // Event listeners
  settingsButton.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleSettingsPanel()
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
  const settingsButtonContainer = document.querySelector('.settings-button-container') as HTMLElement
  const settingsPanel = document.getElementById('settings-panel') as HTMLElement
  const settingsCloseButton = document.getElementById('settings-close') as HTMLButtonElement
  
  console.log('Settings button:', settingsButton)
  console.log('Settings panel:', settingsPanel)
  console.log('Settings close button:', settingsCloseButton)
  
  if (!settingsButton || !settingsPanel || !settingsButtonContainer || !settingsCloseButton) {
    console.warn('Settings elements not found', { settingsButton, settingsPanel, settingsButtonContainer, settingsCloseButton })
    return
  }
  
  // Open settings - hide button, show panel
  settingsButton.addEventListener('click', () => {
    settingsButtonContainer.style.display = 'none'
    settingsPanel.style.setProperty('display', 'flex', 'important')
  })
  
  // Close settings - hide panel, show button
  settingsCloseButton.addEventListener('click', (e) => {
    console.log('Close button clicked!')
    e.stopPropagation() // Prevent event bubbling
    settingsPanel.style.setProperty('display', 'none', 'important')
    settingsButtonContainer.style.display = 'block'
  })
  
  // Close settings panel when pressing Esc
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      settingsPanel.style.setProperty('display', 'none', 'important')
      settingsButtonContainer.style.display = 'block'
    }
  })
  
  // Setup auto-rotate checkbox (desktop)
  const autoRotateCheckbox = document.getElementById('auto-rotate-toggle') as HTMLInputElement
  if (autoRotateCheckbox) {
    autoRotateCheckbox.addEventListener('change', () => {
      if (orbitalCamera) {
        orbitalCamera.setAutoRotationEnabled(autoRotateCheckbox.checked)
        console.log(`Auto-rotation ${autoRotateCheckbox.checked ? 'enabled' : 'disabled'}`)
      }
    })
  }
  
  // Setup auto-rotate checkbox (mobile)
  const mobileAutoRotateCheckbox = document.getElementById('mobile-auto-rotate-toggle') as HTMLInputElement
  if (mobileAutoRotateCheckbox) {
    mobileAutoRotateCheckbox.addEventListener('change', () => {
      if (orbitalCamera) {
        orbitalCamera.setAutoRotationEnabled(mobileAutoRotateCheckbox.checked)
        console.log(`Mobile auto-rotation ${mobileAutoRotateCheckbox.checked ? 'enabled' : 'disabled'}`)
      }
    })
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
    
    console.log('📁 Loading models config...')
    await modelManager.loadModelsConfig()
    console.log('✅ Models config loaded')
    
    console.log('📁 Loading projects config...')
    await contentLoader.loadProjectsConfig()
    console.log('✅ Projects config loaded')
    
    console.log('🔧 Setting up dropdowns...')
    modelManager.setupModelDropdown()
    modelManager.setupQualityDropdown()
    console.log('✅ Dropdowns setup complete')
    
    console.log('🎯 Setting up camera system...')
    orbitalCamera.updateDisplayNameField()
    orbitalCamera.loadDefaultPointSize()
    orbitalCamera.loadDefaultFocalLength()
    console.log('✅ Camera system setup complete')
    
    console.log('⚙️ Setting up settings button...')
    setupSettingsButton()
    console.log('✅ Settings button setup complete')
    
    console.log('📱 Setting up mobile controls...')
    setupMobileCameraReset()
    setupMobileEffectsButton()
    setupMobileSettings()
    console.log('✅ Mobile controls setup complete')
    
    console.log('🌫️ Setting up fog control...')
    setupFogControl()
    console.log('✅ Fog control setup complete')
    
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
    
    // Start loading animation every time (regardless of caching)
    console.log('🎬 Starting loading animation...')
    orbitalCamera.startLoadingAnimation()
    console.log('✅ Loading animation started')
    
    // Load point cloud and initialize sphere mode when it's ready
    console.log('☁️ Loading point cloud...')
    modelManager.loadPointCloud().then(() => {
      console.log('✅ Point cloud loaded, initializing sphere mode...')
      // Initialize sphere mode immediately after point cloud loads but before it's visible
      orbitalCamera.initializeSphereMode()
      console.log('✅ Sphere mode initialization complete')
    }).catch((error) => {
      console.error('❌ Point cloud loading failed:', error)
    })
    
    console.log('🎮 Starting animation loop...')
    animate()
    console.log('✅ Initialization complete!')
    
  } catch (error) {
    console.error('❌ Initialization failed:', error)
  }
}

// Start the application
initialize()