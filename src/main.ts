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
    setCameraButtonPosition()
    updateCameraButtonVisibility()
  }, 200)
  
  // Update position only when window resizes (recalculate for new screen size)
  window.addEventListener('resize', () => {
    setTimeout(setCameraButtonPosition, 100)
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