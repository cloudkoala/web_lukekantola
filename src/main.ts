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
  
  // Setup auto-rotate checkbox
  const autoRotateCheckbox = document.getElementById('auto-rotate-toggle') as HTMLInputElement
  if (autoRotateCheckbox) {
    autoRotateCheckbox.addEventListener('change', () => {
      if (orbitalCamera) {
        orbitalCamera.setAutoRotationEnabled(autoRotateCheckbox.checked)
        console.log(`Auto-rotation ${autoRotateCheckbox.checked ? 'enabled' : 'disabled'}`)
      }
    })
  }
  
}

// Fog density control setup
function setupFogControl() {
  console.log('Setting up fog control...')
  const fogDensitySlider = document.getElementById('fog-density') as HTMLInputElement
  const fogDensityValue = document.getElementById('fog-density-value') as HTMLSpanElement
  
  console.log('Fog slider:', fogDensitySlider)
  console.log('Fog value span:', fogDensityValue)
  
  if (fogDensitySlider && fogDensityValue) {
    fogDensitySlider.addEventListener('input', () => {
      const density = parseFloat(fogDensitySlider.value)
      fogDensityValue.textContent = density.toFixed(4)
      
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
    })
    console.log('Fog control setup complete')
  } else {
    console.warn('Fog control elements not found')
  }
}

// Initialize application
async function initialize() {
  console.log('🚀 Initialize() called')
  
  try {
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