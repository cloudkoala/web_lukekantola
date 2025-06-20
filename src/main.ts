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

// Unified mobile button positioning
function setMobileButtonPositions() {
  const effectsButtonContainer = document.getElementById('mobile-effects-button') as HTMLElement
  const cameraButtonContainer = document.getElementById('mobile-camera-reset') as HTMLElement
  const bottomSheet = document.getElementById('mobile-bottom-sheet') as HTMLElement
  
  if (!bottomSheet) return
  
  const wasExpanded = bottomSheet.classList.contains('expanded')
  if (wasExpanded) bottomSheet.classList.remove('expanded')
  
  setTimeout(() => {
    const bottomSheetRect = bottomSheet.getBoundingClientRect()
    const distanceFromBottom = window.innerHeight - bottomSheetRect.top
    const newBottomPosition = distanceFromBottom + 12 // Changed to 12px margin
    
    // Position camera and effects buttons at the same time
    // (trash icon uses fixed CSS positioning and doesn't need JS positioning)
    if (effectsButtonContainer) {
      effectsButtonContainer.style.bottom = `${newBottomPosition}px`
    }
    if (cameraButtonContainer) {
      cameraButtonContainer.style.bottom = `${newBottomPosition}px`
    }
    
    if (wasExpanded) bottomSheet.classList.add('expanded')
  }, 100)
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
  const bottomSheet = document.getElementById('mobile-bottom-sheet') as HTMLElement
  
  if (!effectsButtonContainer || !effectsButton || !horizontalEffectsPanel || !horizontalEffectsChain || 
      !parametersBox || !parametersBoxTitle || !parametersBoxContent || !parametersBoxClose || !bottomSheet) {
    console.warn('Mobile effects button elements not found')
    return
  }
  
  let isEffectsPanelOpen = false
  
  // Show/hide effects button based on bottom sheet state
  function updateEffectsButtonVisibility() {
    const isExpanded = bottomSheet.classList.contains('expanded')
    if (isExpanded) {
      effectsButtonContainer.style.opacity = '0'
      effectsButtonContainer.style.pointerEvents = 'none'
      if (isEffectsPanelOpen) {
        closeEffectsPanel()
      }
    } else {
      effectsButtonContainer.style.opacity = '1'
      effectsButtonContainer.style.pointerEvents = 'auto'
    }
  }
  
  function toggleEffectsPanel() {
    isEffectsPanelOpen = !isEffectsPanelOpen
    
    if (isEffectsPanelOpen) {
      horizontalEffectsPanel.classList.add('show')
      effectsButton.classList.add('active')
      
      // Hide bottom sheet when effects panel is open
      bottomSheet.style.display = 'none'
      
      // Move camera and effects buttons up with the same timing as the panel
      setTimeout(() => {
        const cameraButton = document.getElementById('mobile-camera-reset') as HTMLElement
        if (cameraButton) {
          cameraButton.style.bottom = '92px' // 80px panel + 12px margin = 92px
        }
        effectsButtonContainer.style.bottom = '92px'
      }, 0) // Start immediately but allow CSS transitions to handle timing
      
      refreshHorizontalEffectsChain()
    } else {
      horizontalEffectsPanel.classList.remove('show')
      effectsButton.classList.remove('active')
      
      // Reset button positions with same timing as panel closes
      setTimeout(() => {
        // Show bottom sheet again
        bottomSheet.style.display = 'block'
        
        // Reset both button positions together
        setMobileButtonPositions()
      }, 0) // Start immediately but allow CSS transitions to handle timing
      
      closeParametersBox()
    }
  }
  
  function closeEffectsPanel() {
    isEffectsPanelOpen = false
    horizontalEffectsPanel.classList.remove('show')
    effectsButton.classList.remove('active')
    
    // Show bottom sheet again
    bottomSheet.style.display = 'block'
    
    // Reset both button positions together
    setMobileButtonPositions()
    
    closeParametersBox()
  }
  
  function closeParametersBox() {
    parametersBox.classList.remove('show')
    
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
    
    // Add the reset button to the right of the add button
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
    
    parametersBoxTitle.textContent = `${getEffectDisplayName(effect.type)} Parameters`
    parametersBoxContent.innerHTML = ''
    
    Object.entries(effectDefinition.parameterDefinitions).forEach(([paramName, paramDef]: [string, any]) => {
      const control = document.createElement('div')
      control.className = 'parameter-control'
      
      const currentValue = effect.parameters[paramName] || paramDef.min
      
      control.innerHTML = `
        <label for="param-${paramName}">${paramDef.label}:</label>
        <input type="range" 
               id="param-${paramName}" 
               min="${paramDef.min}" 
               max="${paramDef.max}" 
               step="${paramDef.step}" 
               value="${currentValue}">
        <div class="parameter-value">${currentValue}</div>
      `
      
      const slider = control.querySelector('input') as HTMLInputElement
      const valueDisplay = control.querySelector('.parameter-value') as HTMLElement
      
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value)
        valueDisplay.textContent = value.toString()
        window.effectsChainManager.updateEffectParameter(effectId, paramName, value)
      })
      
      parametersBoxContent.appendChild(control)
    })
    
    parametersBox.classList.add('show')
  }
  
  function showMobileEffectSelector() {
    // Get available effects from the global effects chain manager
    if (!window.effectsChainManager) return
    
    import('./effects/EffectsChainManager').then(({ EFFECT_DEFINITIONS }) => {
      // Create a simple overlay with effect buttons
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
        padding: 20px;
        max-width: 90vw;
        max-height: 70vh;
        overflow-y: auto;
        font-family: 'Space Mono', monospace;
      `
      
      const title = document.createElement('h3')
      title.textContent = 'Add Effect'
      title.style.cssText = `
        color: #00ff00;
        margin: 0 0 15px 0;
        text-align: center;
        font-size: 1.2rem;
      `
      container.appendChild(title)
      
      const effectsGrid = document.createElement('div')
      effectsGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
      `
      
      EFFECT_DEFINITIONS.forEach(definition => {
        const button = document.createElement('button')
        button.textContent = definition.name
        button.style.cssText = `
          background: rgba(0, 0, 0, 0.7);
          border: 1px solid #00ff00;
          border-radius: 6px;
          color: #00ff00;
          padding: 12px 8px;
          font-family: 'Space Mono', monospace;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        `
        
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
        
        button.addEventListener('mouseenter', () => {
          button.style.background = 'rgba(0, 255, 0, 0.1)'
          button.style.boxShadow = '0 0 8px rgba(0, 255, 0, 0.2)'
        })
        
        button.addEventListener('mouseleave', () => {
          button.style.background = 'rgba(0, 0, 0, 0.7)'
          button.style.boxShadow = 'none'
        })
        
        effectsGrid.appendChild(button)
      })
      
      const closeButton = document.createElement('button')
      closeButton.textContent = '× Close'
      closeButton.style.cssText = `
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid #666;
        border-radius: 6px;
        color: #666;
        padding: 10px 20px;
        font-family: 'Space Mono', monospace;
        cursor: pointer;
        margin-top: 15px;
        align-self: center;
      `
      
      closeButton.addEventListener('click', () => {
        document.body.removeChild(overlay)
      })
      
      container.appendChild(effectsGrid)
      container.appendChild(closeButton)
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
  
  // Set initial position
  setTimeout(() => {
    setMobileButtonPositions()
    updateEffectsButtonVisibility()
  }, 200)
  
  // Update position on resize
  window.addEventListener('resize', () => {
    setTimeout(setMobileButtonPositions, 100)
  })
  
  // Monitor bottom sheet state
  const observer = new MutationObserver(() => {
    updateEffectsButtonVisibility()
  })
  
  observer.observe(bottomSheet, {
    attributes: true,
    attributeFilter: ['class']
  })
  
  // Event listeners
  effectsButton.addEventListener('click', toggleEffectsPanel)
  parametersBoxClose.addEventListener('click', closeParametersBox)
  
  // Close panels when clicking outside (but not on mobile effect selector)
  document.addEventListener('click', (e) => {
    const target = e.target as Node
    const clickedOnEffectSelector = target && (target as Element).closest('.mobile-effect-selector-overlay')
    const clickedOnTrashIcon = target && (target as Element).closest('.mobile-trash-icon')
    
    if (isEffectsPanelOpen && 
        !horizontalEffectsPanel.contains(target) && 
        !effectsButton.contains(target) &&
        !clickedOnEffectSelector &&
        !clickedOnTrashIcon) {
      closeEffectsPanel()
    }
  })
  
  // Expose refresh function for effects system integration
  ;(window as any).refreshHorizontalEffects = refreshHorizontalEffectsChain
}

// Mobile camera reset button functionality
function setupMobileCameraReset() {
  const cameraResetContainer = document.getElementById('mobile-camera-reset') as HTMLElement
  const cameraResetButton = document.getElementById('camera-reset-button') as HTMLElement
  const cameraMenu = document.getElementById('camera-menu') as HTMLElement
  const resetCameraOption = document.getElementById('reset-camera-option') as HTMLElement
  const playAnimationOption = document.getElementById('play-animation-option') as HTMLElement
  const bottomSheet = document.getElementById('mobile-bottom-sheet') as HTMLElement
  
  if (!cameraResetContainer || !cameraResetButton || !cameraMenu || !resetCameraOption || !playAnimationOption || !bottomSheet) {
    console.warn('Mobile camera reset elements not found')
    return
  }
  
  let isMenuOpen = false
  
  // Function to calculate camera button position based on closed bottom sheet
  function setCameraButtonPosition() {
    // Ensure bottom sheet is in closed state for measurement
    const wasExpanded = bottomSheet.classList.contains('expanded')
    if (wasExpanded) {
      bottomSheet.classList.remove('expanded')
    }
    
    // Wait for any transitions to complete, then measure
    setTimeout(() => {
      const bottomSheetRect = bottomSheet.getBoundingClientRect()
      const bottomSheetTop = bottomSheetRect.top
      const viewportHeight = window.innerHeight
      
      // Calculate distance from bottom of viewport to top of closed bottom sheet
      const distanceFromBottom = viewportHeight - bottomSheetTop
      
      // Add some padding (20px) above the bottom sheet
      const newBottomPosition = distanceFromBottom + 20
      
      cameraResetContainer.style.bottom = `${newBottomPosition}px`
      
      console.log(`Camera button positioned ${newBottomPosition}px from bottom (closed bottom sheet top at ${bottomSheetTop}px)`)
      
      // Restore expanded state if it was expanded
      if (wasExpanded) {
        bottomSheet.classList.add('expanded')
      }
    }, 100)
  }
  
  // Function to show/hide camera button based on bottom sheet state
  function updateCameraButtonVisibility() {
    const isExpanded = bottomSheet.classList.contains('expanded')
    if (isExpanded) {
      cameraResetContainer.style.opacity = '0'
      cameraResetContainer.style.pointerEvents = 'none'
    } else {
      cameraResetContainer.style.opacity = '1'
      cameraResetContainer.style.pointerEvents = 'auto'
    }
  }
  
  // Set position once after DOM is fully loaded
  setTimeout(() => {
    setMobileButtonPositions()
    updateCameraButtonVisibility()
  }, 200)
  
  // Update position only when window resizes (recalculate for new screen size)
  window.addEventListener('resize', () => {
    setTimeout(setMobileButtonPositions, 100)
  })
  
  // Monitor bottom sheet state changes for visibility only
  const observer = new MutationObserver(() => {
    updateCameraButtonVisibility()
  })
  
  observer.observe(bottomSheet, {
    attributes: true,
    attributeFilter: ['class']
  })
  
  // Toggle menu on button click
  cameraResetButton.addEventListener('click', (e) => {
    e.stopPropagation()
    isMenuOpen = !isMenuOpen
    
    if (isMenuOpen) {
      cameraMenu.classList.add('show')
    } else {
      cameraMenu.classList.remove('show')
    }
  })
  
  // Close menu when clicking outside
  document.addEventListener('click', () => {
    if (isMenuOpen) {
      isMenuOpen = false
      cameraMenu.classList.remove('show')
    }
  })
  
  // Prevent menu clicks from closing the menu
  cameraMenu.addEventListener('click', (e) => {
    e.stopPropagation()
  })
  
  // Reset camera option
  resetCameraOption.addEventListener('click', () => {
    if (orbitalCamera) {
      // Reset to the end position of the loading animation
      orbitalCamera.resetToAnimationEnd()
    }
    isMenuOpen = false
    cameraMenu.classList.remove('show')
  })
  
  // Play animation option
  playAnimationOption.addEventListener('click', () => {
    if (orbitalCamera) {
      orbitalCamera.startLoadingAnimation()
    }
    isMenuOpen = false
    cameraMenu.classList.remove('show')
  })
  
  // Expose camera button positioning function globally
  ;(window as any).setCameraButtonPosition = setCameraButtonPosition
}

// Mobile bottom sheet functionality
function setupMobileBottomSheet() {
  console.log('Setting up mobile bottom sheet...')
  const bottomSheet = document.getElementById('mobile-bottom-sheet') as HTMLElement
  const bottomSheetHandle = document.getElementById('bottom-sheet-handle') as HTMLElement
  
  if (!bottomSheet || !bottomSheetHandle) {
    console.warn('Bottom sheet elements not found')
    return
  }
  
  let isExpanded = false
  let startY = 0
  let currentY = 0
  let isDragging = false
  let startTransform = 0
  let lastY = 0
  let lastTime = 0
  let velocity = 0
  let hasMoved = false
  let touchStartTime = 0
  
  // Get the closed and open positions as translateY values
  // The sheet is positioned at bottom: 0, so translateY moves it from that position
  const getClosedTransform = () => window.innerHeight - 45 // mostly hidden, showing 45px handle
  const getOpenTransform = () => 0 // fully open to top
  
  function updateBottomSheetPosition(translateY: number) {
    bottomSheet.style.transform = `translateY(${translateY}px)`
  }
  
  function snapBottomSheet() {
    const currentTransform = getCurrentTransformPx()
    const openTransform = getOpenTransform()
    const closedTransform = getClosedTransform()
    const threshold = (closedTransform + openTransform) / 2 // halfway point
    
    // Check for flick gestures
    const upwardFlickThreshold = -800 // pixels per second (upward)
    const downwardFlickThreshold = 400 // pixels per second (downward) - smaller threshold for easier closing
    const isUpwardFlick = velocity < upwardFlickThreshold
    const isDownwardFlick = velocity > downwardFlickThreshold
    
    if (isUpwardFlick) {
      // Fast upward flick - always open
      isExpanded = true
      bottomSheet.classList.add('expanded')
      bottomSheet.style.transform = '' // Let CSS handle the transform
      console.log(`Bottom sheet opened by upward flick (velocity: ${velocity.toFixed(0)}px/s)`)
    } else if (isDownwardFlick) {
      // Fast downward flick - always close
      isExpanded = false
      bottomSheet.classList.remove('expanded')
      bottomSheet.style.transform = '' // Let CSS handle the transform
      console.log(`Bottom sheet closed by downward flick (velocity: ${velocity.toFixed(0)}px/s)`)
    } else if (currentTransform > threshold) {
      // Snap to closed
      isExpanded = false
      bottomSheet.classList.remove('expanded')
      bottomSheet.style.transform = '' // Let CSS handle the transform
      console.log(`Bottom sheet snapped to collapsed`)
    } else {
      // Snap to open
      isExpanded = true
      bottomSheet.classList.add('expanded')
      bottomSheet.style.transform = '' // Let CSS handle the transform
      console.log(`Bottom sheet snapped to expanded`)
    }
  }
  
  function getCurrentTransformPx(): number {
    // Get the actual current position using getBoundingClientRect
    const rect = bottomSheet.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    
    // Calculate the translateY needed to position the sheet where it currently is
    // The sheet's natural position is at the bottom of the viewport
    // So translateY = how far from the bottom it should be positioned
    const currentDistanceFromBottom = viewportHeight - rect.bottom
    const translateY = -currentDistanceFromBottom
    
    return translateY
  }
  
  // Touch start
  bottomSheetHandle.addEventListener('touchstart', (e) => {
    isDragging = true
    hasMoved = false
    touchStartTime = Date.now()
    startY = e.touches[0].clientY
    lastY = startY
    lastTime = touchStartTime
    velocity = 0
    startTransform = getCurrentTransformPx()
    
    // Remove CSS transitions during drag
    bottomSheet.style.transition = 'none'
    
    // Prevent default to avoid scrolling
    e.preventDefault()
  }, { passive: false })
  
  // Touch move
  bottomSheetHandle.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    
    currentY = e.touches[0].clientY
    const currentTime = Date.now()
    const deltaY = currentY - startY
    
    // Check if this is significant movement (more than just a tap)
    if (Math.abs(deltaY) > 5) {
      hasMoved = true
    }
    
    // Calculate velocity (pixels per second)
    const timeDelta = currentTime - lastTime
    if (timeDelta > 0) {
      const yDelta = currentY - lastY
      velocity = (yDelta / timeDelta) * 1000 // convert to pixels per second
      lastY = currentY
      lastTime = currentTime
    }
    
    // Calculate new position in pixels
    let newTransform = startTransform + deltaY
    
    // Don't allow dragging beyond open/closed positions
    newTransform = Math.max(getOpenTransform(), Math.min(getClosedTransform(), newTransform))
    
    updateBottomSheetPosition(newTransform)
    
    // Prevent default to avoid scrolling
    e.preventDefault()
  }, { passive: false })
  
  // Touch end
  bottomSheetHandle.addEventListener('touchend', (e) => {
    if (!isDragging) return
    
    isDragging = false
    const touchDuration = Date.now() - touchStartTime
    
    // Restore CSS transitions
    bottomSheet.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    
    // Check if this was a tap (no significant movement and short duration)
    if (!hasMoved && touchDuration < 300) {
      // Toggle the sheet on tap
      isExpanded = !isExpanded
      if (isExpanded) {
        bottomSheet.classList.add('expanded')
      } else {
        bottomSheet.classList.remove('expanded')
      }
      bottomSheet.style.transform = '' // Let CSS handle the transform
      console.log(`Bottom sheet toggled by tap to ${isExpanded ? 'expanded' : 'collapsed'}`)
    } else {
      // This was a drag, use normal snapping logic
      snapBottomSheet()
    }
    
    e.preventDefault()
  }, { passive: false })
  
  // Fallback click handler for non-touch devices
  bottomSheetHandle.addEventListener('click', () => {
    // Only handle click if it wasn't a drag
    if (!isDragging) {
      isExpanded = !isExpanded
      if (isExpanded) {
        bottomSheet.classList.add('expanded')
      } else {
        bottomSheet.classList.remove('expanded')
      }
      console.log(`Bottom sheet ${isExpanded ? 'expanded' : 'collapsed'}`)
    }
  })
  
  // Sync mobile controls with desktop controls
  syncMobileControls()
}

// Synchronize mobile and desktop controls
function syncMobileControls() {
  // Model dropdown sync
  const desktopModelDropdown = document.getElementById('model-dropdown') as HTMLSelectElement
  const mobileModelDropdown = document.getElementById('mobile-model-dropdown') as HTMLSelectElement
  
  if (desktopModelDropdown && mobileModelDropdown) {
    // Sync mobile to desktop
    mobileModelDropdown.addEventListener('change', () => {
      desktopModelDropdown.value = mobileModelDropdown.value
      desktopModelDropdown.dispatchEvent(new Event('change'))
    })
    
    // Sync desktop to mobile
    desktopModelDropdown.addEventListener('change', () => {
      mobileModelDropdown.value = desktopModelDropdown.value
    })
  }
  
  // Quality dropdown sync
  const desktopQualityDropdown = document.getElementById('quality-dropdown') as HTMLSelectElement
  const mobileQualityDropdown = document.getElementById('mobile-quality-dropdown') as HTMLSelectElement
  
  if (desktopQualityDropdown && mobileQualityDropdown) {
    // Sync mobile to desktop
    mobileQualityDropdown.addEventListener('change', () => {
      desktopQualityDropdown.value = mobileQualityDropdown.value
      desktopQualityDropdown.dispatchEvent(new Event('change'))
    })
    
    // Sync desktop to mobile
    desktopQualityDropdown.addEventListener('change', () => {
      mobileQualityDropdown.value = desktopQualityDropdown.value
    })
  }
  
  // Point size control sync
  syncRangeControls('point-size', 'mobile-point-size', 'point-size-value', 'mobile-point-size-value')
  
  // Sphere radius control sync
  syncRangeControls('sphere-radius', 'mobile-sphere-radius', 'sphere-radius-value', 'mobile-sphere-radius-value')
  
  // Focal length control sync
  syncRangeControls('focal-length', 'mobile-focal-length', 'focal-length-value', 'mobile-focal-length-value')
  
  // Fog density control sync
  syncRangeControls('fog-density', 'mobile-fog-density', 'fog-density-value', 'mobile-fog-density-value')
  
  // Sphere toggle sync
  syncCheckboxControls('sphere-toggle', 'mobile-sphere-toggle')
  
  // Auto-rotate toggle sync
  syncCheckboxControls('auto-rotate-toggle', 'mobile-auto-rotate-toggle')
}

// Helper function to sync range controls
function syncRangeControls(desktopId: string, mobileId: string, desktopValueId: string, mobileValueId: string) {
  const desktopControl = document.getElementById(desktopId) as HTMLInputElement
  const mobileControl = document.getElementById(mobileId) as HTMLInputElement
  const desktopValue = document.getElementById(desktopValueId) as HTMLSpanElement
  const mobileValue = document.getElementById(mobileValueId) as HTMLSpanElement
  
  if (desktopControl && mobileControl && desktopValue && mobileValue) {
    // Sync mobile to desktop
    mobileControl.addEventListener('input', () => {
      desktopControl.value = mobileControl.value
      desktopValue.textContent = mobileControl.value
      mobileValue.textContent = mobileControl.value
      desktopControl.dispatchEvent(new Event('input'))
    })
    
    // Sync desktop to mobile
    desktopControl.addEventListener('input', () => {
      mobileControl.value = desktopControl.value
      desktopValue.textContent = desktopControl.value
      mobileValue.textContent = desktopControl.value
    })
  }
}

// Helper function to sync checkbox controls
function syncCheckboxControls(desktopId: string, mobileId: string) {
  const desktopControl = document.getElementById(desktopId) as HTMLInputElement
  const mobileControl = document.getElementById(mobileId) as HTMLInputElement
  
  if (desktopControl && mobileControl) {
    // Sync mobile to desktop
    mobileControl.addEventListener('change', () => {
      desktopControl.checked = mobileControl.checked
      desktopControl.dispatchEvent(new Event('change'))
    })
    
    // Sync desktop to mobile
    desktopControl.addEventListener('change', () => {
      mobileControl.checked = desktopControl.checked
    })
  }
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
    
    console.log('📱 Setting up mobile bottom sheet...')
    setupMobileBottomSheet()
    setupMobileCameraReset()
    setupMobileEffectsButton()
    console.log('✅ Mobile bottom sheet setup complete')
    
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