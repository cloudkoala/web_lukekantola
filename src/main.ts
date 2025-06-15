import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { Viewer as GaussianSplatViewer } from '@mkkellogg/gaussian-splats-3d'
import { ProgressiveLoader } from './ProgressiveLoader.js'


const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!

// Model configuration interface
interface ModelConfig {
  fileName: string
  gaussianSplatFile?: string
  displayName: string
  renderType: 'point-cloud' | 'gaussian-splat'
  defaultPointSize: number
  rotation: {
    x: number
    y: number
    z: number
  }
  gaussianSplatRotation?: {
    x: number
    y: number
    z: number
  }
  loadingAnimation: {
    startPosition: { x: number, y: number, z: number }
    endPosition: { x: number, y: number, z: number }
    target: { x: number, y: number, z: number }
    duration: number
  }
  footerPosition: {
    cameraPosition: { x: number, y: number, z: number }
    target: { x: number, y: number, z: number }
    scale: number
    duration: number
  }
  idleRotation: {
    speed: number
    direction: number
  }
}

interface ModelsConfig {
  basePaths: {
    pointcloud: string
    gsplat: string
  }
  models: { [key: string]: ModelConfig }
  currentModel: string
}

// Global models configuration
let modelsConfig: ModelsConfig
let isModelSwitching: boolean = false
let isQualitySwitching: boolean = false
let currentRenderObject: THREE.Points | THREE.Object3D | null = null
let currentQuality: 'low' | 'high' = 'low'

// Interface state management
const InterfaceMode = {
  HOME: 'home',
  REEL: 'reel',
  PROJECTS: 'projects',
  PROJECT_DETAIL: 'project-detail',
  ABOUT: 'about',
  CONTACT: 'contact'
} as const

type InterfaceMode = typeof InterfaceMode[keyof typeof InterfaceMode]

let currentInterfaceMode: InterfaceMode = InterfaceMode.HOME
let currentProjectId: string | null = null
// let currentProjectIndex: number = 0

// Projects data interface
interface ProjectData {
  title: string
  description: string
  image: string
  content: string
  tech: string[]
  year: string
  status: string
}

interface ProjectsConfig {
  projects: { [key: string]: ProjectData }
}

let projectsConfig: ProjectsConfig | null = null

// Create circular texture for points
function createCircularTexture() {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const size = 64
  
  canvas.width = size
  canvas.height = size
  
  // Clear canvas
  context.clearRect(0, 0, size, size)
  
  // Create circular gradient
  const center = size / 2
  const radius = size / 2
  
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  
  return texture
}

// Three.js setup
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

const camera = new THREE.PerspectiveCamera(
  75, 
  window.innerWidth / window.innerHeight, 
  0.1, 
  1000
)

const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas,
  antialias: true 
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.05

// Progressive loader for chunked PLY files
const progressiveLoader = new ProgressiveLoader(scene, `${import.meta.env.BASE_URL}`)

class OrbitalCameraSystem {
  private currentMousePos = { x: 0, y: 0 }
  private rotationAngle: number = 0
  private startTime: number = Date.now()
  private clickedPoint: THREE.Vector3 | null = null
  
  // Configurable parameters
  public rotationSpeed: number = 0.1
  public rotationRadius: number = 5.0
  public pointSize: number = 0.001
  public interactionMode: string = 'free-nav'
  
  private savedCameraPosition: THREE.Vector3 | null = null
  private savedCameraTarget: THREE.Vector3 | null = null
  private currentPointCloud: THREE.Points | null = null
  
  // Animation properties
  private isAnimating: boolean = false
  private animationStartTime: number = 0
  private animationDuration: number = 1000 // 1 second
  private animationStartPosition: THREE.Vector3 = new THREE.Vector3()
  private animationStartTarget: THREE.Vector3 = new THREE.Vector3()
  private animationEndPosition: THREE.Vector3 = new THREE.Vector3()
  private animationEndTarget: THREE.Vector3 = new THREE.Vector3()
  private animationStartQuaternion: THREE.Quaternion = new THREE.Quaternion()
  private animationEndQuaternion: THREE.Quaternion = new THREE.Quaternion()
  
  // Auto-rotation properties
  private lastInteractionTime: number = Date.now()
  private autoRotationEnabled: boolean = true
  private autoRotationIntensity: number = 0 // Starts at 0, eases up to 1
  private readonly INACTIVITY_THRESHOLD: number = 2000 // 2 seconds
  private readonly EASE_IN_DURATION: number = 3000 // 3 seconds to reach full intensity
  
  
  
  // Navigation state management
  private pendingTransition: InterfaceMode | null = null
  
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls

  constructor(
    camera: THREE.PerspectiveCamera, 
    controls: OrbitControls
  ) {
    this.camera = camera
    this.controls = controls
    this.setupMouseTracking()
    this.setupControlsInteractionTracking()
    this.setupControls()
    this.setupCollapsiblePanel()
    this.setupNavigation()
    
    // Initialize orbit center at target point
    this.clickedPoint = new THREE.Vector3(0.08, 0.80, -0.21)
    
    // Set initial camera position for loading animation (will be updated from config)
    this.camera.position.set(1.03, 2.83, 6.08)
    this.camera.lookAt(0, 0, 0)
    
    // Load saved camera position after setting initial position
    this.loadSavedCameraPosition()
  }
  
  private resetInteractionTimer() {
    this.lastInteractionTime = Date.now()
    this.autoRotationIntensity = 0 // Reset intensity when user interacts
  }
  
  private setupMouseTracking() {
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect()
      this.currentMousePos.x = event.clientX - rect.left
      this.currentMousePos.y = event.clientY - rect.top
      // Don't reset timer on mouse move - only on clicks
    })
    
    canvas.addEventListener('mousedown', () => {
      this.resetInteractionTimer()
    })
    
    // Don't stop auto-rotation on zoom/scroll
    // canvas.addEventListener('wheel', () => {
    //   this.resetInteractionTimer()
    // })
    
    canvas.addEventListener('mouseleave', () => {
      // Mouse left canvas
    })
    
    // Add double-click handler for point cloud interaction
    canvas.addEventListener('dblclick', (event) => {
      this.handleCanvasClick(event)
      this.resetInteractionTimer()
    })
    
    // Add touch handler for mobile devices (double-tap)
    let lastTouchTime = 0
    canvas.addEventListener('touchstart', () => {
      this.resetInteractionTimer()
    })
    
    // Don't reset timer on touch move - only on touch start/end
    canvas.addEventListener('touchmove', () => {
      // this.resetInteractionTimer()
    })
    
    canvas.addEventListener('touchend', (event) => {
      this.resetInteractionTimer()
      
      if (event.touches.length === 0 && event.changedTouches.length === 1) {
        const currentTime = Date.now()
        const timeDiff = currentTime - lastTouchTime
        
        if (timeDiff < 300 && timeDiff > 0) { // Double-tap within 300ms
          this.handleCanvasTouch(event.changedTouches[0])
        }
        
        lastTouchTime = currentTime
      }
    })
  }
  
  update() {
    // Update camera position display
    this.updateCameraPositionDisplay()
    this.updateOrbitCenterDisplay()
    
    // Handle camera animation
    if (this.isAnimating) {
      this.updateCameraAnimation()
      return // Skip other controls during animation
    }
    
    // Handle auto-rotation
    this.updateAutoRotation()
    
    // Skip orbital controls in free navigation mode
    if (this.interactionMode === 'free-nav') {
      return
    }
    
    if (!this.clickedPoint) {
      return
    }
    
    // Update rotation angle based on time and speed
    const currentTime = Date.now()
    const deltaTime = (currentTime - this.startTime) / 1000
    this.rotationAngle += this.rotationSpeed * deltaTime
    this.startTime = currentTime
    
    if (this.interactionMode === 'orbit') {
      // Calculate orbital position around clicked point
      const orbitX = this.clickedPoint.x + Math.cos(this.rotationAngle) * this.rotationRadius
      const orbitY = this.clickedPoint.y
      const orbitZ = this.clickedPoint.z + Math.sin(this.rotationAngle) * this.rotationRadius
      
      const targetPosition = new THREE.Vector3(orbitX, orbitY, orbitZ)
      
      // Direct position update (no smoothness needed)
      this.camera.position.copy(targetPosition)
      
      // Always look at the clicked point
      this.camera.lookAt(this.clickedPoint)
    }
  }
  
  private setupControlsInteractionTracking() {
    // Don't track OrbitControls events at all - they fire for zoom too
    // We'll rely on direct mouse/touch events instead
    
    // this.controls.addEventListener('start', () => {
    //   this.resetInteractionTimer('controls-start')
    // })
    
    // this.controls.addEventListener('end', () => {
    //   this.resetInteractionTimer('controls-end')
    // })
  }
  
  private updateAutoRotation() {
    // Only apply auto-rotation in free navigation mode and when not animating
    if (this.interactionMode !== 'free-nav' || this.isAnimating || !this.autoRotationEnabled) {
      return
    }
    
    // Only apply on home page, not on subpages
    if (currentInterfaceMode !== InterfaceMode.HOME) {
      return
    }
    
    // Get current model configuration
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel || !currentModel.idleRotation) {
      return
    }
    
    const currentTime = Date.now()
    const timeSinceLastInteraction = currentTime - this.lastInteractionTime
    
    // Only start auto-rotation after inactivity threshold
    if (timeSinceLastInteraction < this.INACTIVITY_THRESHOLD) {
      return
    }
    
    // Calculate how long we've been in auto-rotation mode
    const autoRotationTime = timeSinceLastInteraction - this.INACTIVITY_THRESHOLD
    
    // Gradually ease in the rotation intensity over EASE_IN_DURATION
    const targetIntensity = Math.min(autoRotationTime / this.EASE_IN_DURATION, 1)
    
    // Smooth ease-in using smoothstep function for natural feel
    this.autoRotationIntensity = targetIntensity * targetIntensity * (3 - 2 * targetIntensity)
    
    
    // Apply rotation around Y axis using model configuration
    if (this.autoRotationIntensity > 0) {
      const rotationAmount = currentModel.idleRotation.speed * currentModel.idleRotation.direction * this.autoRotationIntensity * 0.016 // Assuming ~60fps
      
      // Get current camera position relative to target
      const target = this.controls.target.clone()
      const cameraPos = this.camera.position.clone()
      const offset = cameraPos.sub(target)
      
      // Rotate around Y axis
      const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationAmount)
      offset.applyMatrix4(rotationMatrix)
      
      // Apply new position
      this.camera.position.copy(target.add(offset))
      this.camera.lookAt(this.controls.target)
    }
  }
  
  private setupControls() {
    const modeSelect = document.querySelector('#mode') as HTMLSelectElement
    const rotationSpeedSlider = document.querySelector('#rotation-speed') as HTMLInputElement
    const rotationRadiusSlider = document.querySelector('#rotation-radius') as HTMLInputElement
    const pointSizeSlider = document.querySelector('#point-size') as HTMLInputElement
    
    const rotationSpeedValue = document.querySelector('#rotation-speed-value') as HTMLSpanElement
    const rotationRadiusValue = document.querySelector('#rotation-radius-value') as HTMLSpanElement
    const pointSizeValue = document.querySelector('#point-size-value') as HTMLSpanElement
    
    modeSelect?.addEventListener('change', (e) => {
      this.interactionMode = (e.target as HTMLSelectElement).value
    })
    
    rotationSpeedSlider?.addEventListener('input', (e) => {
      this.rotationSpeed = parseFloat((e.target as HTMLInputElement).value)
      rotationSpeedValue.textContent = this.rotationSpeed.toFixed(2)
    })
    
    rotationRadiusSlider?.addEventListener('input', (e) => {
      this.rotationRadius = parseFloat((e.target as HTMLInputElement).value)
      rotationRadiusValue.textContent = this.rotationRadius.toFixed(1)
    })
    
    pointSizeSlider?.addEventListener('input', (e) => {
      this.pointSize = parseFloat((e.target as HTMLInputElement).value)
      pointSizeValue.textContent = this.pointSize.toFixed(3)
      this.updatePointSize()
    })
    
    // Set default point size button
    const setDefaultPointSizeButton = document.querySelector('#set-default-point-size') as HTMLButtonElement
    setDefaultPointSizeButton?.addEventListener('click', () => {
      this.setDefaultPointSize()
    })
    
    
    // Clear point button
    const clearButton = document.querySelector('#clear-point') as HTMLButtonElement
    clearButton?.addEventListener('click', () => {
      this.clickedPoint = new THREE.Vector3(0, 0, 0)
      this.controls.target.copy(this.clickedPoint)
      this.controls.update()
      console.log('Orbit center reset to origin')
    })
    
    // Camera position controls
    const saveCameraButton = document.querySelector('#save-camera') as HTMLButtonElement
    const loadCameraButton = document.querySelector('#load-camera') as HTMLButtonElement
    
    saveCameraButton?.addEventListener('click', () => {
      this.saveCameraPosition()
    })
    
    loadCameraButton?.addEventListener('click', () => {
      this.loadSavedCameraPosition()
    })
    
    // Camera presets
    const presetTopButton = document.querySelector('#preset-top') as HTMLButtonElement
    const presetFrontButton = document.querySelector('#preset-front') as HTMLButtonElement
    const presetSideButton = document.querySelector('#preset-side') as HTMLButtonElement
    
    const savePresetTopButton = document.querySelector('#save-preset-top') as HTMLButtonElement
    const savePresetFrontButton = document.querySelector('#save-preset-front') as HTMLButtonElement
    const savePresetSideButton = document.querySelector('#save-preset-side') as HTMLButtonElement
    
    presetTopButton?.addEventListener('click', () => {
      this.setCameraPreset('top')
    })
    
    presetFrontButton?.addEventListener('click', () => {
      this.setCameraPreset('front')
    })
    
    presetSideButton?.addEventListener('click', () => {
      this.setCameraPreset('side')
    })
    
    savePresetTopButton?.addEventListener('click', () => {
      this.savePreset('top')
    })
    
    savePresetFrontButton?.addEventListener('click', () => {
      this.savePreset('front')
    })
    
    savePresetSideButton?.addEventListener('click', () => {
      this.savePreset('side')
    })
    
    // Model controls
    const centerModelButton = document.querySelector('#center-model') as HTMLButtonElement
    const resetModelButton = document.querySelector('#reset-model') as HTMLButtonElement
    
    centerModelButton?.addEventListener('click', () => {
      this.centerModel()
    })
    
    resetModelButton?.addEventListener('click', () => {
      this.resetModel()
    })
    
    // Animation configuration controls
    const saveStartPositionButton = document.querySelector('#save-start-position') as HTMLButtonElement
    const saveEndPositionButton = document.querySelector('#save-end-position') as HTMLButtonElement
    const previewAnimationButton = document.querySelector('#preview-animation') as HTMLButtonElement
    const saveDisplayNameButton = document.querySelector('#save-display-name') as HTMLButtonElement
    
    saveStartPositionButton?.addEventListener('click', () => {
      this.saveStartPosition()
    })
    
    saveEndPositionButton?.addEventListener('click', () => {
      this.saveEndPosition()
    })
    
    previewAnimationButton?.addEventListener('click', () => {
      this.previewAnimation()
    })
    
    saveDisplayNameButton?.addEventListener('click', () => {
      this.saveDisplayName()
    })
    
  }
  
  private setupCollapsiblePanel() {
    const controlsHeader = document.querySelector('#controls-header') as HTMLDivElement
    const controlsContent = document.querySelector('#controls-content') as HTMLDivElement
    const collapseButton = document.querySelector('#collapse-button') as HTMLButtonElement
    
    controlsHeader?.addEventListener('click', () => {
      const isCollapsed = controlsContent.classList.contains('collapsed')
      
      if (isCollapsed) {
        controlsContent.classList.remove('collapsed')
        collapseButton.textContent = '−'
      } else {
        controlsContent.classList.add('collapsed')
        collapseButton.textContent = '+'
      }
    })
  }
  
  
  private updateCameraPositionDisplay() {
    const posDisplay = document.querySelector('#camera-position-display') as HTMLDivElement
    const targetDisplay = document.querySelector('#camera-target-display') as HTMLDivElement
    
    if (posDisplay) {
      const pos = this.camera.position
      posDisplay.textContent = `X: ${this.formatNumber(pos.x)}, Y: ${this.formatNumber(pos.y)}, Z: ${this.formatNumber(pos.z)}`
    }
    
    if (targetDisplay) {
      const target = this.controls.target
      targetDisplay.textContent = `X: ${this.formatNumber(target.x)}, Y: ${this.formatNumber(target.y)}, Z: ${this.formatNumber(target.z)}`
    }
  }
  
  private formatNumber(value: number): string {
    const formatted = value.toFixed(2)
    // Add a leading non-breaking space for positive numbers to align with negative numbers
    return value >= 0 ? `\u00A0${formatted}` : formatted
  }
  
  private updateOrbitCenterDisplay() {
    const display = document.querySelector('#orbit-center-display') as HTMLDivElement
    if (display && this.clickedPoint) {
      display.textContent = `X: ${this.clickedPoint.x.toFixed(2)}, Y: ${this.clickedPoint.y.toFixed(2)}, Z: ${this.clickedPoint.z.toFixed(2)}`
    } else if (display) {
      display.textContent = 'X: 0.00, Y: 0.00, Z: 0.00'
    }
  }
  
  private updateCameraAnimation() {
    const currentTime = Date.now()
    const elapsed = currentTime - this.animationStartTime
    const progress = Math.min(elapsed / this.animationDuration, 1)
    
    // Simple ease-in-out sine for smooth, predictable animation
    const easeProgress = -(Math.cos(Math.PI * progress) - 1) / 2
    
    // Interpolate camera position
    this.camera.position.lerpVectors(this.animationStartPosition, this.animationEndPosition, easeProgress)
    
    // Interpolate camera orientation using quaternion slerp (spherical linear interpolation)
    this.camera.quaternion.slerpQuaternions(this.animationStartQuaternion, this.animationEndQuaternion, easeProgress)
    
    // Interpolate controls target
    this.controls.target.lerpVectors(this.animationStartTarget, this.animationEndTarget, easeProgress)
    
    // Don't call controls.update() during animation to avoid interference
    
    // Check if animation is complete
    if (progress >= 1) {
      this.isAnimating = false
      // Reset animation duration to default
      this.animationDuration = 1000
      // Final update to ensure controls are in sync
      this.controls.update()
      console.log('Camera animation completed')
      
      // Check for pending navigation transitions
      if (this.pendingTransition) {
        const pendingMode = this.pendingTransition
        this.pendingTransition = null
        console.log('Executing pending transition to:', pendingMode)
        this.transitionToMode(pendingMode)
      }
    }
  }
  
  private animateToPosition(targetPosition: THREE.Vector3, targetTarget: THREE.Vector3, duration: number = 1000) {
    // Store current positions as animation start
    this.animationStartPosition.copy(this.camera.position)
    this.animationStartTarget.copy(this.controls.target)
    this.animationStartQuaternion.copy(this.camera.quaternion)
    
    // Store target positions as animation end
    this.animationEndPosition.copy(targetPosition)
    this.animationEndTarget.copy(targetTarget)
    
    // Calculate target quaternion using matrix lookAt for more stable results
    const lookAtMatrix = new THREE.Matrix4()
    lookAtMatrix.lookAt(targetPosition, targetTarget, new THREE.Vector3(0, 1, 0))
    this.animationEndQuaternion.setFromRotationMatrix(lookAtMatrix)
    
    // Ensure quaternions take the shortest path (avoid long rotation)
    if (this.animationStartQuaternion.dot(this.animationEndQuaternion) < 0) {
      this.animationEndQuaternion.x *= -1
      this.animationEndQuaternion.y *= -1
      this.animationEndQuaternion.z *= -1
      this.animationEndQuaternion.w *= -1
    }
    
    // Start animation with custom duration
    this.animationDuration = duration
    this.isAnimating = true
    this.animationStartTime = Date.now()
    
    console.log('Starting camera animation to position:', targetPosition, 'target:', targetTarget, 'duration:', duration + 'ms')
    console.log('Start quaternion:', this.animationStartQuaternion)
    console.log('End quaternion:', this.animationEndQuaternion)
    console.log('Quaternion dot product:', this.animationStartQuaternion.dot(this.animationEndQuaternion))
  }
  
  public startLoadingAnimation() {
    // Don't animate if there's a saved camera position
    if (this.savedCameraPosition) {
      console.log('Skipping loading animation - saved camera position exists')
      return
    }
    
    // Get current model's animation configuration
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) {
      console.error('No current model configuration found')
      return
    }
    
    const animConfig = currentModel.loadingAnimation
    
    // Set camera to loading start position without animation
    this.camera.position.set(animConfig.startPosition.x, animConfig.startPosition.y, animConfig.startPosition.z)
    this.camera.lookAt(0, 0, 0)
    this.controls.target.set(0, 0, 0)
    
    // Update orbit center to match target
    this.clickedPoint = new THREE.Vector3(animConfig.target.x, animConfig.target.y, animConfig.target.z)
    
    // Animate to configured end position
    const endPosition = new THREE.Vector3(animConfig.endPosition.x, animConfig.endPosition.y, animConfig.endPosition.z)
    const endTarget = new THREE.Vector3(animConfig.target.x, animConfig.target.y, animConfig.target.z)
    this.animateToPosition(endPosition, endTarget, animConfig.duration)
    
    console.log(`Starting loading animation for ${currentModel.displayName}`)
    console.log(`From: ${JSON.stringify(animConfig.startPosition)} To: ${JSON.stringify(animConfig.endPosition)}`)
  }
  
  
  private saveCameraPosition() {
    this.savedCameraPosition = this.camera.position.clone()
    this.savedCameraTarget = this.controls.target.clone()
    
    // Save to localStorage
    localStorage.setItem('cameraPosition', JSON.stringify({
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z }
    }))
    
    console.log('Camera position saved:', this.savedCameraPosition, this.savedCameraTarget)
  }
  
  private loadSavedCameraPosition() {
    const saved = localStorage.getItem('cameraPosition')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        this.savedCameraPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z)
        this.savedCameraTarget = new THREE.Vector3(data.target.x, data.target.y, data.target.z)
        
        this.camera.position.copy(this.savedCameraPosition)
        this.controls.target.copy(this.savedCameraTarget)
        this.controls.update()
        
        console.log('Camera position loaded:', this.savedCameraPosition, this.savedCameraTarget)
      } catch (error) {
        console.error('Failed to load saved camera position:', error)
      }
    }
  }
  
  private setCameraPreset(preset: string) {
    let targetPosition: THREE.Vector3
    let targetTarget: THREE.Vector3
    
    // Check for saved preset first
    const savedPreset = localStorage.getItem(`cameraPreset_${preset}`)
    if (savedPreset) {
      try {
        const data = JSON.parse(savedPreset)
        targetPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z)
        targetTarget = new THREE.Vector3(data.target.x, data.target.y, data.target.z)
        this.animateToPosition(targetPosition, targetTarget)
        console.log(`Animating to saved ${preset} preset`)
        return
      } catch (error) {
        console.error(`Failed to load saved ${preset} preset:`, error)
      }
    }
    
    // Fallback to default preset calculation
    let distance = 15
    if (this.currentPointCloud && this.currentPointCloud.geometry.boundingBox) {
      const size = this.currentPointCloud.geometry.boundingBox.getSize(new THREE.Vector3())
      const maxDimension = Math.max(size.x, size.y, size.z)
      distance = Math.max(maxDimension * 1.5, 15)
    }
    
    targetTarget = new THREE.Vector3(0, 0, 0)
    
    switch (preset) {
      case 'top':
        targetPosition = new THREE.Vector3(0, distance, 0)
        break
      case 'front':
        targetPosition = new THREE.Vector3(0, 0, distance)
        break
      case 'side':
        targetPosition = new THREE.Vector3(distance, 0, 0)
        break
      default:
        targetPosition = new THREE.Vector3(0, 0, distance)
    }
    
    this.animateToPosition(targetPosition, targetTarget)
    console.log(`Animating to default ${preset} view`)
  }
  
  private savePreset(preset: string) {
    const presetData = {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      target: { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z }
    }
    
    localStorage.setItem(`cameraPreset_${preset}`, JSON.stringify(presetData))
    console.log(`${preset} preset saved:`, presetData)
  }
  
  private centerModel() {
    if (this.currentPointCloud && this.currentPointCloud.geometry.boundingBox) {
      const center = this.currentPointCloud.geometry.boundingBox.getCenter(new THREE.Vector3())
      this.currentPointCloud.position.sub(center)
      console.log('Model centered at origin')
    }
  }
  
  private resetModel() {
    if (this.currentPointCloud) {
      this.currentPointCloud.position.set(0, 0, 0)
      this.currentPointCloud.scale.set(1, 1, 1)
      this.currentPointCloud.rotation.set(0, 0, 0)
      console.log('Model position, scale, and rotation reset')
    }
  }
  
  
  setCurrentPointCloud(pointCloud: THREE.Points) {
    this.currentPointCloud = pointCloud
    currentRenderObject = pointCloud
  }
  
  setCurrentRenderObject(object: THREE.Object3D) {
    // Update global reference
    currentRenderObject = object
    // If it's a Points object, also set the currentPointCloud for compatibility
    if (object instanceof THREE.Points) {
      this.currentPointCloud = object
    } else {
      this.currentPointCloud = null
    }
  }
  
  clearClickedPoint() {
    this.clickedPoint = new THREE.Vector3(0, 0, 0)
    // Reset controls to origin
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }
  
  
  public updatePointSize() {
    // Update point size for ALL point clouds in the scene
    scene.children.forEach(child => {
      if (child instanceof THREE.Points && child.material) {
        const material = child.material as THREE.PointsMaterial
        material.size = this.pointSize
        material.needsUpdate = true
      }
    })
    
    // Also update progressive loader if it has loaded chunks
    progressiveLoader.setPointSize(this.pointSize)
    
    console.log('Point size updated to:', this.pointSize, 'for all point clouds')
    // Note: Gaussian splats don't use point size in the same way
    // Point size control may not apply to Gaussian splat rendering
  }
  
  private saveStartPosition() {
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    currentModel.loadingAnimation.startPosition = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    }
    
    this.saveModelsConfig()
    console.log('Start position saved:', currentModel.loadingAnimation.startPosition)
  }
  
  private saveEndPosition() {
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    currentModel.loadingAnimation.endPosition = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z
    }
    
    currentModel.loadingAnimation.target = {
      x: this.controls.target.x,
      y: this.controls.target.y,
      z: this.controls.target.z
    }
    
    this.saveModelsConfig()
    console.log('End position and target saved:', currentModel.loadingAnimation.endPosition, currentModel.loadingAnimation.target)
  }
  
  private previewAnimation() {
    // Reset to start position and trigger animation
    this.savedCameraPosition = null // Temporarily disable saved position check
    this.startLoadingAnimation()
  }
  
  private saveDisplayName() {
    const displayNameInput = document.querySelector('#display-name') as HTMLInputElement
    const newName = displayNameInput.value.trim()
    
    if (!newName) {
      alert('Please enter a display name')
      return
    }
    
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    currentModel.displayName = newName
    this.saveModelsConfig()
    this.updateModelDropdown()
    console.log('Display name saved:', newName)
  }
  
  private saveModelsConfig() {
    // In a real application, this would make an API call to save the config
    // For now, we'll store it in localStorage as a fallback
    localStorage.setItem('modelsConfig', JSON.stringify(modelsConfig))
    console.log('Models configuration saved to localStorage')
  }
  
  private updateModelDropdown() {
    const dropdown = document.querySelector('#model-dropdown') as HTMLSelectElement
    if (!dropdown) return
    
    // Update the current option text
    const currentOption = dropdown.querySelector(`option[value="${modelsConfig.currentModel}"]`) as HTMLOptionElement
    if (currentOption) {
      currentOption.textContent = modelsConfig.models[modelsConfig.currentModel].displayName
    }
  }
  
  private setDefaultPointSize() {
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    currentModel.defaultPointSize = this.pointSize
    this.saveModelsConfig()
    console.log('Default point size saved for', currentModel.displayName + ':', this.pointSize)
  }
  
  public updateDisplayNameField() {
    const displayNameInput = document.querySelector('#display-name') as HTMLInputElement
    if (displayNameInput) {
      displayNameInput.value = modelsConfig.models[modelsConfig.currentModel].displayName
    }
  }
  
  public loadDefaultPointSize() {
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    this.pointSize = currentModel.defaultPointSize
    
    // Update UI controls
    const pointSizeSlider = document.querySelector('#point-size') as HTMLInputElement
    const pointSizeValue = document.querySelector('#point-size-value') as HTMLSpanElement
    
    if (pointSizeSlider) {
      pointSizeSlider.value = this.pointSize.toString()
    }
    if (pointSizeValue) {
      pointSizeValue.textContent = this.pointSize.toFixed(3)
    }
    
    // Update the point cloud if it exists
    this.updatePointSize()
    
    console.log('Loaded default point size for', currentModel.displayName + ':', this.pointSize)
  }
  
  
  public transitionToMode(mode: InterfaceMode) {
    if (currentInterfaceMode === mode) return
    
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    if (mode === InterfaceMode.HOME) {
      // Transition back to normal view from footer mode
      this.exitFooterMode()
      
      const endPos = currentModel.loadingAnimation.endPosition
      const endTarget = currentModel.loadingAnimation.target
      
      this.animateToPosition(
        new THREE.Vector3(endPos.x, endPos.y, endPos.z),
        new THREE.Vector3(endTarget.x, endTarget.y, endTarget.z),
        currentModel.footerPosition.duration
      )
      
      
      
      this.showHomeInterface()
      currentInterfaceMode = mode
      
    } else {
      // Check if we're already in a subpage for immediate transition
      const isAlreadyInSubpage = currentInterfaceMode !== InterfaceMode.HOME
      
      if (isAlreadyInSubpage) {
        console.log('Direct subpage transition from', currentInterfaceMode, 'to', mode)
        // Immediate transition - no camera animation needed
        this.enterFooterMode()
        this.showContentInterface(mode)
        currentInterfaceMode = mode
      } else {
        // If currently animating (loading animation), queue the transition
        if (this.isAnimating) {
          console.log('Animation in progress, queuing transition to:', mode)
          this.pendingTransition = mode
          this.updateHeaderPath(mode)
          return
        }
        
        // Start footer transition sequence for transition from home
        this.startFooterTransition(mode)
      }
    }
    
    this.updateHeaderPath(mode)
  }
  
  private startFooterTransition(mode: InterfaceMode) {
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    console.log('Starting footer transition to:', mode)
    currentInterfaceMode = mode
    
    // Show navigation animation overlay
    this.showNavigationAnimation(mode)
    
    // Animate to footer position
    const footerPos = currentModel.footerPosition
    this.animateToPosition(
      new THREE.Vector3(footerPos.cameraPosition.x, footerPos.cameraPosition.y, footerPos.cameraPosition.z),
      new THREE.Vector3(footerPos.target.x, footerPos.target.y, footerPos.target.z),
      footerPos.duration
    )
    
    
    
    // Enable footer mode after typewriter finishes (after 700ms)
    setTimeout(() => {
      this.enterFooterMode()
      this.showContentInterface(mode)
    }, 700)
    
    // Hide navigation animation sooner (after 800ms)
    setTimeout(() => {
      this.hideNavigationAnimation()
    }, 800)
  }
  
  private enterFooterMode() {
    // Disable orbital controls
    this.controls.enabled = false
    
    // Position canvas as footer
    const canvas = document.querySelector('#canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.classList.add('footer-mode')
      canvas.style.pointerEvents = 'none'
    }
    
    console.log('Entered footer mode - interactions disabled')
  }
  
  private exitFooterMode() {
    // Re-enable orbital controls
    this.controls.enabled = true
    
    // Remove footer positioning
    const canvas = document.querySelector('#canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.classList.remove('footer-mode')
      canvas.style.pointerEvents = 'auto'
    }
    
    console.log('Exited footer mode - interactions enabled')
  }
  
  
  
  private showHomeInterface() {
    // Show point size control, camera info, model selector container, hide content area
    const pointSizeControl = document.querySelector('.point-size-control') as HTMLElement
    const cameraInfo = document.querySelector('.camera-info') as HTMLElement
    const contentArea = document.querySelector('#content-area') as HTMLElement
    const modelSelectorContainer = document.querySelector('.model-selector-container') as HTMLElement
    const titleHeader = document.querySelector('.title-header') as HTMLElement
    const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
    const navigationHelp = document.querySelector('#navigation-help') as HTMLElement
    const topFadeOverlay = document.querySelector('.content-fade-overlay-top') as HTMLElement
    
    if (pointSizeControl) pointSizeControl.style.display = 'flex'
    if (cameraInfo) cameraInfo.style.display = 'flex'
    if (contentArea) {
      contentArea.style.display = 'none'
      contentArea.classList.remove('fade-in', 'has-scroll', 'reel-mode')
    }
    if (modelSelectorContainer) modelSelectorContainer.style.display = 'flex'
    if (titleHeader) titleHeader.classList.remove('subpage-mode')
    if (navigationHelp) navigationHelp.style.display = 'flex'
    if (topFadeOverlay) topFadeOverlay.classList.remove('visible')
    if (homeNavigation) {
      homeNavigation.style.display = 'flex'
      homeNavigation.style.visibility = 'visible'
      console.log('Showing home navigation indicators', homeNavigation)
    } else {
      console.log('Home navigation element not found')
    }
    
    // Remove any existing subpage navigation when returning to home
    const existingSubpageNav = document.querySelector('.subpage-navigation')
    if (existingSubpageNav) {
      existingSubpageNav.remove()
    }
    
    // Re-enable orbital controls for home page
    this.controls.enabled = true
    
    // Enable canvas interaction for home page
    this.enableCanvasInteraction()
    
    // Close hamburger menu if open
    this.closeHamburgerMenu()
  }
  
  private showContentInterface(mode: InterfaceMode) {
    // Hide point size control, camera info, model selector container, show content area
    const pointSizeControl = document.querySelector('.point-size-control') as HTMLElement
    const cameraInfo = document.querySelector('.camera-info') as HTMLElement
    const contentArea = document.querySelector('#content-area') as HTMLElement
    const titleHeader = document.querySelector('.title-header') as HTMLElement
    const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
    const navigationHelp = document.querySelector('#navigation-help') as HTMLElement
    const modelSelectorContainer = document.querySelector('.model-selector-container') as HTMLElement
    
    if (pointSizeControl) pointSizeControl.style.display = 'none'
    if (cameraInfo) cameraInfo.style.display = 'none'
    if (navigationHelp) navigationHelp.style.display = 'none'
    if (modelSelectorContainer) modelSelectorContainer.style.display = 'none'
    if (contentArea) {
      contentArea.style.display = 'block'
      // Add reel-mode class for full-screen video
      if (mode === InterfaceMode.REEL) {
        contentArea.classList.add('reel-mode')
      } else {
        contentArea.classList.remove('reel-mode')
      }
      this.updateContentArea(mode)
      // Add fade-in effect
      setTimeout(() => {
        contentArea.classList.add('fade-in')
        this.checkScrollable(contentArea)
      }, 50)
    }
    if (titleHeader) titleHeader.classList.add('subpage-mode')
    if (homeNavigation) {
      homeNavigation.style.display = 'none'
      console.log('Hiding home navigation indicators')
    }
    
    // Disable canvas interaction and layer above content
    this.disableCanvasInteraction()
    
    // Close hamburger menu if open
    this.closeHamburgerMenu()
  }
  
  private enableCanvasInteraction() {
    const canvas = document.querySelector('#canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.classList.remove('above-content')
      canvas.classList.add('interactive')
    }
  }
  
  private disableCanvasInteraction() {
    const canvas = document.querySelector('#canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.classList.remove('interactive')
      canvas.classList.add('above-content')
    }
  }
  
  private updateContentArea(mode: InterfaceMode) {
    const contentArea = document.querySelector('#content-area') as HTMLElement
    if (!contentArea) return
    
    // Create content based on the current mode (vertical only)
    let content = ''
    
    switch (mode) {
      case InterfaceMode.REEL:
        content = `
          <div class="terminal-section reel-section">
            <h3><span class="green-text">$ ./</span><span class="white-text">play_motion_reel.sh</span></h3>
            <div class="video-container">
              <video 
                preload="metadata"
                poster="${import.meta.env.BASE_URL}images/reel-poster.jpg"
                class="motion-reel-video"
                id="motion-reel-video"
              >
                <source src="${import.meta.env.BASE_URL}videos/motion-reel.mp4" type="video/mp4">
                <p class="video-fallback">
                  Your browser doesn't support HTML5 video.
                </p>
              </video>
              
              <!-- Custom Play Controls -->
              <div class="custom-video-controls" id="custom-video-controls">
                <div class="play-controls-container">
                  <button class="play-button fullscreen-play" id="fullscreen-play-btn">
                    <span class="fullscreen-box">
                      <span class="corner-top-left">⌜</span>
                      <span class="corner-top-right">⌝</span>
                      <span class="play-arrow">▶</span>
                      <span class="corner-bottom-left">⌞</span>
                      <span class="corner-bottom-right">⌟</span>
                    </span>
                    <span class="tooltip-text">Play Fullscreen</span>
                  </button>
                  <button class="play-button normal-play" id="normal-play-btn">
                    <span class="play-arrow">▶</span>
                    <span class="tooltip-text">Play in Page</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `
        break
        
      case InterfaceMode.PROJECTS:
        content = this.generateProjectsListingContent()
        break
        
      case InterfaceMode.PROJECT_DETAIL:
        content = this.generateProjectDetailContent()
        break
        
      case InterfaceMode.ABOUT:
        content = `
          <div class="terminal-section">
            <div class="headshot-container">
              <img src="${import.meta.env.BASE_URL}images/about/headshot.jpg" alt="Luke Kantola" class="headshot-image">
            </div>
            <h3>Meet Luke</h3>
            <p>A Motion-Design artist specializing in GIS mapping, spatial-data visualization, and 3D photogrammetry for film and televison productions as well as realtime applications.</p>
          </div>
          
          <div class="terminal-section">
            <h3>Background</h3>
            <p>Background in computational photography and computer vision with focus on 3D scene reconstruction techniques. Experience developing interactive visualization tools for complex spatial data, including point clouds, neural radiance fields, and Gaussian splats.</p>
            
            <p>Currently exploring the intersection of traditional photogrammetry with modern neural rendering techniques, particularly in applications for cultural heritage documentation and environmental monitoring.</p>
            
            <p><strong>Research Interests:</strong><br>
            • Gaussian splatting and neural radiance fields<br>
            • Real-time 3D reconstruction from imagery<br>
            • Point cloud processing and visualization<br>
            • WebGL and GPU-accelerated rendering<br>
            • Spatial computing applications</p>
            
            <p><strong>Education & Experience:</strong><br>
            • B.S. Economics<br>
            • B.S. Studio Art<br>
            • 10+ years developing 3D visualization systems<br>
            • Real-time 3D rendering and visualization for film and video production<br>
            • Open source contributor to spatial computing tools</p>
          </div>
          
          <div class="terminal-section">
            <h3>$ ls ~/interests/</h3>
            <div class="interest-listing">
              <span>photography/</span>
              <span>drone-mapping/</span>
              <span>open-source/</span>
              <span>hiking/</span>
              <span>climbing/</span>
            </div>
          </div>
        `
        break
        
      case InterfaceMode.CONTACT:
        content = `
          <div class="terminal-section">
            <h3>$ Availability Status</h3>
            <p><span class="status-indicator">●</span> <strong>Currently:</strong> Available for new projects</p>
            <p><span class="status-indicator">●</span> <strong>Response Time:</strong> Usually within 48 hours</p>
            <p><span class="status-indicator">●</span> <strong>Timezone:</strong> Mountain Time (MST/MDT)</p>
          </div>
          
          <div class="terminal-section">
            <h3>$ Contact Form</h3>
            <form class="terminal-form" action="https://formspree.io/f/xgvykakv" method="POST">
              <div class="form-field">
                <label for="name">Enter Name:</label>
                <input type="text" id="name" name="name" required>
              </div>
              
              <div class="form-field">
                <label for="subject">Enter Subject:</label>
                <input type="text" id="subject" name="subject" required>
              </div>
              
              <div class="form-field">
                <label for="email">Enter Email:</label>
                <input type="email" id="email" name="email" required>
              </div>
              
              <div class="form-field">
                <label for="phone">Enter Phone:</label>
                <input type="tel" id="phone" name="phone">
              </div>
              
              <div class="form-field">
                <label for="content">Enter Message:</label>
                <textarea id="content" name="content" rows="4" required></textarea>
              </div>
              
              <button type="submit" class="terminal-submit">Send Message</button>
            </form>
          </div>
        `
        break
    }
    
    contentArea.innerHTML = content
    
    // Create subpage navigation if it doesn't exist (for subpage-to-subpage transitions)
    if (!document.querySelector('.subpage-navigation')) {
      this.showDestinationNavigation(mode)
    }
    
    // Ensure all navigation elements have event listeners (with small delay for DOM updates)
    setTimeout(() => {
      this.setupPageNavigation()
      // Initialize video controls if we're on the reel page
      if (mode === InterfaceMode.REEL) {
        this.initializeVideoControls()
      }
    }, 10)
  }
  
  private generatePageNavigation(currentMode: InterfaceMode): string {
    const pageOrder = [InterfaceMode.REEL, InterfaceMode.PROJECTS, InterfaceMode.ABOUT, InterfaceMode.CONTACT]
    const currentIndex = pageOrder.indexOf(currentMode as any)
    
    const prevIndex = currentIndex - 1
    const nextIndex = currentIndex + 1
    
    const prevMode = prevIndex >= 0 ? pageOrder[prevIndex] : null
    const nextMode = nextIndex < pageOrder.length ? pageOrder[nextIndex] : null
    
    const prevLink = prevMode 
      ? `<div class="nav-indicator" data-mode="${prevMode}">
           <span class="nav-key">&lt;</span>
           <span class="nav-label"><span class="green-text">../</span><span class="white-text">${prevMode}</span></span>
         </div>`
      : `<div class="nav-indicator" data-mode="${InterfaceMode.HOME}">
           <span class="nav-key">&lt;</span>
           <span class="nav-label"><span class="green-text">$</span><span class="white-text">HOME</span></span>
         </div>`
      
    const nextLink = nextMode
      ? `<div class="nav-indicator" data-mode="${nextMode}">
           <span class="nav-label"><span class="green-text">../</span><span class="white-text">${nextMode}</span></span>
           <span class="nav-key">&gt;</span>
         </div>`
      : `<div class="nav-indicator" data-mode="${InterfaceMode.HOME}">
           <span class="nav-label"><span class="green-text">$</span><span class="white-text">HOME</span></span>
           <span class="nav-key">&gt;</span>
         </div>`
    
    return `
      <div class="subpage-navigation">
        ${prevLink}
        ${nextLink}
      </div>
    `
  }
  
  public setupPageNavigation() {
    // Remove existing event listeners to prevent duplicates
    const existingNavLinks = document.querySelectorAll('.nav-indicator[data-mode]')
    existingNavLinks.forEach(link => {
      // Clone and replace to remove all event listeners
      const newLink = link.cloneNode(true)
      link.parentNode?.replaceChild(newLink, link)
    })
    
    // Add fresh event listeners
    const navLinks = document.querySelectorAll('.nav-indicator[data-mode]')
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        
        // Get the mode from the clicked element or traverse up to find it
        let targetElement = e.target as HTMLElement
        let mode = targetElement.getAttribute('data-mode') as InterfaceMode
        
        // If the target doesn't have data-mode, look up the parent chain
        while (!mode && targetElement.parentElement) {
          targetElement = targetElement.parentElement
          mode = targetElement.getAttribute('data-mode') as InterfaceMode
        }
        
        console.log('Navigation click detected, mode:', mode, 'currentMode:', currentInterfaceMode)
        
        if (mode) {
          // Update navigation text immediately for subpages
          if (currentInterfaceMode !== InterfaceMode.HOME) {
            this.updateNavigationText(mode)
          } else {
            // For home page, hide controls and show destination navigation immediately
            this.hideControlsImmediately()
            this.showDestinationNavigation(mode)
          }
          this.transitionToMode(mode)
        }
      })
    })
    
    // Add project link event listeners (for old terminal style)
    const projectLinks = document.querySelectorAll('.project-name-link[data-project-id]')
    projectLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        
        const projectId = (e.target as HTMLElement).getAttribute('data-project-id')
        if (projectId) {
          console.log('Project link clicked:', projectId)
          currentProjectId = projectId
          this.transitionToMode(InterfaceMode.PROJECT_DETAIL)
        }
      })
    })
    
    // Initialize Glide.js carousel if we're in projects mode
    if (currentInterfaceMode === InterfaceMode.PROJECTS) {
      setTimeout(() => {
        this.initializeProjectCards()
      }, 50)
    }
  }
  
  private updateNavigationText(newMode: InterfaceMode) {
    const subpageNav = document.querySelector('.subpage-navigation')
    if (subpageNav && newMode !== InterfaceMode.HOME) {
      // Generate new navigation for the target mode
      const newNavHTML = this.generatePageNavigation(newMode)
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = newNavHTML
      const newNavElement = tempDiv.querySelector('.subpage-navigation')
      
      if (newNavElement) {
        subpageNav.innerHTML = newNavElement.innerHTML
      }
    }
  }
  
  private showDestinationNavigation(mode: InterfaceMode) {
    if (mode === InterfaceMode.HOME) return
    
    // Hide home navigation
    const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
    if (homeNavigation) {
      homeNavigation.style.display = 'none'
    }
    
    // Remove any existing subpage navigation
    const existingSubpageNav = document.querySelector('.subpage-navigation')
    if (existingSubpageNav) {
      existingSubpageNav.remove()
    }
    
    // Create and show destination subpage navigation
    const navHTML = this.generatePageNavigation(mode)
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = navHTML
    const newNavElement = tempDiv.querySelector('.subpage-navigation')
    if (newNavElement) {
      document.body.appendChild(newNavElement)
      
      // Add event listeners only to the new navigation elements
      const newNavLinks = newNavElement.querySelectorAll('.nav-indicator[data-mode]')
      newNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          
          // Get the mode from the clicked element or traverse up to find it
          let targetElement = e.target as HTMLElement
          let mode = targetElement.getAttribute('data-mode') as InterfaceMode
          
          // If the target doesn't have data-mode, look up the parent chain
          while (!mode && targetElement.parentElement) {
            targetElement = targetElement.parentElement
            mode = targetElement.getAttribute('data-mode') as InterfaceMode
          }
          
          console.log('Dynamic navigation click detected, mode:', mode, 'currentMode:', currentInterfaceMode)
          
          if (mode) {
            this.updateNavigationText(mode)
            this.transitionToMode(mode)
          }
        })
      })
    }
  }
  
  private updateHeaderPath(mode: InterfaceMode) {
    const currentSection = document.querySelector('#current-section') as HTMLElement
    if (!currentSection) return
    
    if (mode === InterfaceMode.HOME) {
      currentSection.innerHTML = ''
    } else if (mode === InterfaceMode.PROJECT_DETAIL && currentProjectId) {
      currentSection.innerHTML = `<span class="green-text">/</span><span id="projects-link" class="clickable-path projects-text">projects</span><span class="green-text">/</span><span class="project-name-text">${currentProjectId}</span>`
    } else {
      currentSection.innerHTML = `<span class="green-text">/</span><span class="white-text">${mode}</span>`
    }
    
    // Re-setup click handlers after updating the content
    this.setupCurrentSectionClick()
  }
  
  private setupCurrentSectionClick() {
    // Handle /projects link when in project detail
    const projectsLink = document.querySelector('#projects-link') as HTMLElement
    if (projectsLink) {
      projectsLink.addEventListener('click', (e) => {
        e.stopPropagation()
        this.transitionToMode(InterfaceMode.PROJECTS)
      })
    }
  }
  
  private setupNavigation() {
    // Hamburger menu links
    const hamburgerReel = document.querySelector('#hamburger-reel') as HTMLAnchorElement
    const hamburgerProjects = document.querySelector('#hamburger-projects') as HTMLAnchorElement
    const hamburgerAbout = document.querySelector('#hamburger-about') as HTMLAnchorElement
    const hamburgerContact = document.querySelector('#hamburger-contact') as HTMLAnchorElement
    
    // Home path (only ./kantola/luke portion)
    const homePath = document.querySelector('#home-path') as HTMLElement
    
    // Set up hamburger menu navigation handlers
    hamburgerReel?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode(InterfaceMode.REEL)
      this.closeHamburgerMenu()
    })
    
    hamburgerProjects?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode(InterfaceMode.PROJECTS)
      this.closeHamburgerMenu()
    })
    
    hamburgerAbout?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode(InterfaceMode.ABOUT)
      this.closeHamburgerMenu()
    })
    
    hamburgerContact?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode(InterfaceMode.CONTACT)
      this.closeHamburgerMenu()
    })
    
    // Make home path clickable to return home
    homePath?.addEventListener('click', () => {
      this.transitionToMode(InterfaceMode.HOME)
    })
    
    // Make current section clickable for navigation
    this.setupCurrentSectionClick()
    
    // Setup hamburger menu toggle
    this.setupHamburgerMenu()
    
    // Removed: Click outside green elements to return home
    // Users now navigate intentionally via navigation elements only
    
    // Escape key to return home, arrow keys for navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && currentInterfaceMode !== InterfaceMode.HOME) {
        this.transitionToMode(InterfaceMode.HOME)
      }
      
      const pageOrder = [InterfaceMode.REEL, InterfaceMode.PROJECTS, InterfaceMode.ABOUT, InterfaceMode.CONTACT]
      
      // Arrow key navigation
      if (currentInterfaceMode === InterfaceMode.HOME) {
        // From home page, go to reel (left) or projects (right)
        if (e.key === 'ArrowLeft') {
          this.hideControlsImmediately()
          this.showDestinationNavigation(InterfaceMode.REEL)
          this.transitionToMode(InterfaceMode.REEL)
        } else if (e.key === 'ArrowRight') {
          this.hideControlsImmediately()
          this.showDestinationNavigation(InterfaceMode.PROJECTS)
          this.transitionToMode(InterfaceMode.PROJECTS)
        }
      } else {
        // Navigation when in subpages
        const currentIndex = pageOrder.indexOf(currentInterfaceMode as any)
        
        if (e.key === 'ArrowLeft') {
          if (currentIndex > 0) {
            const newMode = pageOrder[currentIndex - 1]
            this.updateNavigationText(newMode)
            this.transitionToMode(newMode)
          } else {
            this.transitionToMode(InterfaceMode.HOME)
          }
        } else if (e.key === 'ArrowRight') {
          if (currentIndex < pageOrder.length - 1) {
            const newMode = pageOrder[currentIndex + 1]
            this.updateNavigationText(newMode)
            this.transitionToMode(newMode)
          } else {
            this.transitionToMode(InterfaceMode.HOME)
          }
        }
      }
    })
    
    // Click outside green elements to return home
    // COMMENTED OUT: Interfering with project card clicks
    /*
    document.addEventListener('click', (e) => {
      // Only trigger when not on home page
      if (currentInterfaceMode === InterfaceMode.HOME) return
      
      const target = e.target as HTMLElement
      console.log('Document click detected on:', target.tagName, target.className, target)
      
      // Check if click is on or inside a green element
      const isGreenElement = this.isClickOnGreenElement(target)
      console.log('Is green element?', isGreenElement)
      
      if (!isGreenElement) {
        console.log('Click detected outside green elements, returning to home')
        this.transitionToMode(InterfaceMode.HOME)
      } else {
        console.log('Click on green element, staying in current mode')
      }
    })
    */
  }
  
  private setupHamburgerMenu() {
    const hamburgerButton = document.querySelector('#hamburger-button') as HTMLButtonElement
    const hamburgerDropdown = document.querySelector('#hamburger-dropdown') as HTMLElement
    
    hamburgerButton?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const isOpen = hamburgerDropdown?.classList.contains('open')
      if (isOpen) {
        this.closeHamburgerMenu()
      } else {
        this.openHamburgerMenu()
      }
    })
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      const hamburgerMenu = document.querySelector('#hamburger-menu') as HTMLElement
      const isHamburgerClick = hamburgerMenu && hamburgerMenu.contains(e.target as Node)
      const isDropdownOpen = hamburgerDropdown?.classList.contains('open')
      
      if (!isHamburgerClick && isDropdownOpen) {
        this.closeHamburgerMenu()
      }
    })
  }
  
  private openHamburgerMenu() {
    const hamburgerButton = document.querySelector('#hamburger-button') as HTMLButtonElement
    const hamburgerDropdown = document.querySelector('#hamburger-dropdown') as HTMLElement
    
    hamburgerButton?.classList.add('active')
    hamburgerDropdown?.classList.add('open')
  }
  
  private closeHamburgerMenu() {
    const hamburgerButton = document.querySelector('#hamburger-button') as HTMLButtonElement
    const hamburgerDropdown = document.querySelector('#hamburger-dropdown') as HTMLElement
    
    hamburgerButton?.classList.remove('active')
    hamburgerDropdown?.classList.remove('open')
  }
  
  private checkScrollable(_element: HTMLElement) {
    // Create top fade overlay if it doesn't exist
    let topFadeOverlay = document.querySelector('.content-fade-overlay-top') as HTMLElement
    if (!topFadeOverlay) {
      topFadeOverlay = document.createElement('div')
      topFadeOverlay.className = 'content-fade-overlay-top'
      document.body.appendChild(topFadeOverlay)
    }
    
    // Show top fade overlay immediately for subpages
    topFadeOverlay.classList.add('visible')
  }
  
  private hideControlsImmediately() {
    const pointSizeControl = document.querySelector('.point-size-control') as HTMLElement
    const cameraInfo = document.querySelector('.camera-info') as HTMLElement
    const modelSelectorContainer = document.querySelector('.model-selector-container') as HTMLElement
    const navigationHelp = document.querySelector('#navigation-help') as HTMLElement
    
    if (pointSizeControl) {
      pointSizeControl.style.display = 'none'
    }
    if (cameraInfo) {
      cameraInfo.style.display = 'none'
    }
    if (modelSelectorContainer) {
      modelSelectorContainer.style.display = 'none'
    }
    if (navigationHelp) {
      navigationHelp.style.display = 'none'
    }
  }
  
  private showNavigationAnimation(mode: InterfaceMode) {
    // Hide model selector container
    const selectorContainer = document.querySelector('.model-selector-container') as HTMLElement
    if (selectorContainer) {
      selectorContainer.style.display = 'none'
    }
    
    // Create navigation animation in the same position as model selector
    const animationElement = document.createElement('div')
    animationElement.id = 'navigation-animation'
    animationElement.className = 'navigation-command'
    const text = `cd ./${mode}`
    
    // Create a hidden span to measure text width
    const measureSpan = document.createElement('span')
    measureSpan.style.visibility = 'hidden'
    measureSpan.style.position = 'absolute'
    measureSpan.style.fontFamily = "'Space Mono', monospace"
    measureSpan.style.fontSize = '0.8rem'
    measureSpan.textContent = text
    document.body.appendChild(measureSpan)
    const fullWidth = measureSpan.offsetWidth
    document.body.removeChild(measureSpan)
    
    // Create typewriter element with proper initial state
    animationElement.innerHTML = `<span class="typewriter" style="width: 0; overflow: hidden;">${text}</span>`
    
    // Insert into the model selector container
    const animationContainer = document.querySelector('.model-selector-container')
    if (animationContainer) {
      animationContainer.appendChild(animationElement)
      
      // Start animation immediately
      setTimeout(() => {
        const typewriterElement = animationElement.querySelector('.typewriter') as HTMLElement
        if (typewriterElement) {
          // Set the animation with steps based on text length
          const steps = text.length
          // Add extra width for the block cursor
          const cursorWidth = fullWidth / text.length // approximate character width
          const totalWidth = fullWidth + cursorWidth + 8 // extra padding for cursor
          typewriterElement.style.setProperty('--target-width', `${totalWidth}px`)
          // 0.7s for typing + 0.3s pause with full text visible
          typewriterElement.style.animation = `typewriter-expand 0.7s steps(${steps}) forwards`
          typewriterElement.classList.add('animate')
        }
      }, 10)
    }
  }
  
  private hideNavigationAnimation() {
    const animationElement = document.querySelector('#navigation-animation')
    if (animationElement) {
      animationElement.remove()
    }
  }
  
  private handleCanvasClick(event: MouseEvent) {
    // Only handle clicks when on home page and canvas is interactive
    if (currentInterfaceMode !== InterfaceMode.HOME) return
    
    const rect = canvas.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const clickY = event.clientY - rect.top
    
    this.handlePointCloudClick(clickX, clickY)
  }
  
  private handleCanvasTouch(touch: Touch) {
    // Only handle touches when on home page and canvas is interactive
    if (currentInterfaceMode !== InterfaceMode.HOME) return
    
    const rect = canvas.getBoundingClientRect()
    const touchX = touch.clientX - rect.left
    const touchY = touch.clientY - rect.top
    
    this.handlePointCloudClick(touchX, touchY)
  }
  
  private handlePointCloudClick(x: number, y: number) {
    if (!this.currentPointCloud) return
    
    // Convert screen coordinates to normalized device coordinates (-1 to 1)
    const mouse = new THREE.Vector2()
    mouse.x = (x / canvas.clientWidth) * 2 - 1
    mouse.y = -(y / canvas.clientHeight) * 2 + 1
    
    // Create raycaster
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    
    // Find nearest point within click radius
    const nearestPoint = this.findNearestPointToRay(raycaster)
    
    if (nearestPoint) {
      console.log('Double-clicked near point at:', nearestPoint)
      
      // Update look-at target and orbit center
      this.clickedPoint = nearestPoint.clone()
      this.controls.target.copy(nearestPoint)
      this.controls.update()
      
      console.log('Updated look-at target to:', nearestPoint)
    }
  }
  
  private findNearestPointToRay(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    const clickRadius = 0.5 // Maximum distance from ray to consider a point
    let nearestPoint: THREE.Vector3 | null = null
    let nearestDistance = Infinity
    
    // Check all point clouds in the scene
    scene.children.forEach(child => {
      if (child instanceof THREE.Points && child.geometry) {
        const geometry = child.geometry
        const positions = geometry.attributes.position
        if (!positions) return
        
        const tempPoint = new THREE.Vector3()
        const worldMatrix = child.matrixWorld
        
        // Sample points and find the nearest one to the ray
        for (let i = 0; i < positions.count; i += 10) { // Sample every 10th point for performance
          tempPoint.fromBufferAttribute(positions, i)
          tempPoint.applyMatrix4(worldMatrix) // Transform to world coordinates
          
          // Calculate distance from point to ray
          const distanceToRay = raycaster.ray.distanceToPoint(tempPoint)
          
          if (distanceToRay < clickRadius && distanceToRay < nearestDistance) {
            nearestDistance = distanceToRay
            nearestPoint = tempPoint.clone()
          }
        }
      }
    })
    
    return nearestPoint
  }
  
  // @ts-ignore
  private isClickOnGreenElement(target: HTMLElement): boolean {
    // List of green element selectors based on the CSS classes and IDs
    const greenElementSelectors = [
      '.nav-indicator',
      '.nav-key',
      '.nav-label',
      '.terminal-section',
      '.terminal-section h3',
      '.project-type',
      '.project-name',
      '.project-name-link',
      '.project-carousel',
      '.carousel-indicator',
      '.project-card',
      '.project-info',
      '.tech-tag',
      '.status-indicator',
      '.form-field',
      '.form-field label',
      '.form-field input',
      '.form-field textarea',
      '.terminal-submit',
      '.interest-listing span',
      '.hamburger-menu',
      '.hamburger-button',
      '.hamburger-dropdown',
      '.hamburger-dropdown a',
      '.typewriter',
      '.navigation-command',
      '.subpage-navigation',
      '.home-navigation',
      '.project-card',
      '.project-card-content',
      '.project-card-title',
      '.project-card-description',
      '.project-read-more',
      '.projects-grid',
      '.projects-blog-layout',
      '.custom-video-controls',
      '.play-button',
      '.video-container'
    ]
    
    // Check if the target or any of its parents match green element selectors
    let currentElement: HTMLElement | null = target
    
    while (currentElement && currentElement !== document.body) {
      
      // Check if current element matches any green selector
      for (const selector of greenElementSelectors) {
        if (currentElement.matches && currentElement.matches(selector)) {
          return true
        }
      }
      
      // Also check by class names and IDs for specific green elements
      if (currentElement.classList) {
        const classList = Array.from(currentElement.classList)
        
        // Check for green-related classes
        if (classList.some(className => 
          className.includes('nav-') || 
          className.includes('terminal') ||
          className.includes('project') ||
          className.includes('form') ||
          className.includes('hamburger') ||
          className.includes('typewriter') ||
          className.includes('navigation')
        )) {
          return true
        }
      }
      
      // Check for specific green elements by tag and context
      if (currentElement.tagName === 'H3' && currentElement.closest('.terminal-section')) {
        return true
      }
      
      if (currentElement.tagName === 'SPAN' && currentElement.closest('.interest-listing')) {
        return true
      }
      
      // Move to parent element
      currentElement = currentElement.parentElement
    }
    
    return false
  }
  
  private generateProjectsListingContent(): string {
    if (!projectsConfig) {
      return `
        <div class="projects-error">
          <p>Error: Projects configuration not loaded</p>
        </div>
      `
    }
    
    const projectEntries = Object.entries(projectsConfig.projects)
    
    if (projectEntries.length === 0) {
      return `
        <div class="projects-error">
          <p>No projects found</p>
        </div>
      `
    }
    
    // Generate card-style blog layout
    const projectCards = projectEntries.map(([projectId, projectData]) => {
      return `
        <article class="project-card" data-project-id="${projectId}">
          <div class="project-card-image" style="background-image: url('${import.meta.env.BASE_URL}images/projects/default.png');">
            <span>Project Image</span>
          </div>
          <div class="project-card-content">
            <div class="project-card-meta">
              <span class="project-year">${projectData.year}</span>
              <span class="project-status">${projectData.status}</span>
            </div>
            <h3 class="project-card-title">${projectData.title}</h3>
            <p class="project-card-description">${projectData.description}</p>
            <div class="project-card-tech">
              ${projectData.tech.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
            </div>
            <div class="project-card-actions">
              <button class="project-read-more" data-project-id="${projectId}">
                Read More <span class="arrow">→</span>
              </button>
            </div>
          </div>
        </article>
      `
    }).join('')
    
    return `
      <div class="projects-blog-layout">
        <div class="projects-grid">
          ${projectCards}
        </div>
      </div>
    `
  }
  
  private generateProjectDetailContent(): string {
    if (!projectsConfig || !currentProjectId || !projectsConfig.projects[currentProjectId]) {
      return `
        <div class="terminal-section">
          <h3>$ cat ~/projects/error.log</h3>
          <p>Error: Project not found</p>
        </div>
      `
    }
    
    const project = projectsConfig.projects[currentProjectId]
    const techList = project.tech.map(tech => `• ${tech}`).join('<br>')
    
    return `
      <div class="terminal-section project-detail-header">
        <h3>$ cd ~/projects/${currentProjectId}/</h3>
        <div class="project-detail-meta">
          <span class="project-year">${project.year}</span>
          <span class="project-status">${project.status}</span>
        </div>
      </div>
      
      <div class="terminal-section">
        <h3>$ cat README.md</h3>
        <h2 class="project-detail-title">${project.title}</h2>
        <div class="project-detail-content">
          ${project.content.split('\n\n').map(paragraph => `<p>${paragraph}</p>`).join('')}
        </div>
      </div>
      
      <div class="terminal-section">
        <h3>$ cat tech-stack.txt</h3>
        <div class="project-tech-stack">
          ${techList}
        </div>
      </div>
    `
  }
  
  private initializeProjectCards() {
    // Add click handlers for project cards and read more buttons
    const projectCards = document.querySelectorAll('.project-card[data-project-id]')
    const readMoreButtons = document.querySelectorAll('.project-read-more[data-project-id]')
    
    // Handle card clicks (entire card clickable)
    projectCards.forEach(card => {
      card.addEventListener('click', (e) => {
        const projectId = (e.currentTarget as HTMLElement).getAttribute('data-project-id')
        if (projectId) {
          currentProjectId = projectId
          this.transitionToMode(InterfaceMode.PROJECT_DETAIL)
        }
      })
    })
    
    // Handle read more button clicks
    readMoreButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation() // Prevent card click from firing
        const projectId = (e.currentTarget as HTMLElement).getAttribute('data-project-id')
        if (projectId) {
          currentProjectId = projectId
          this.transitionToMode(InterfaceMode.PROJECT_DETAIL)
        }
      })
    })
  }

  private initializeVideoControls() {
    const video = document.getElementById('motion-reel-video') as HTMLVideoElement
    const controls = document.getElementById('custom-video-controls') as HTMLElement
    const fullscreenBtn = document.getElementById('fullscreen-play-btn') as HTMLButtonElement
    const normalPlayBtn = document.getElementById('normal-play-btn') as HTMLButtonElement

    if (!video || !controls || !fullscreenBtn || !normalPlayBtn) return

    // Handle fullscreen play button
    fullscreenBtn.addEventListener('click', async () => {
      try {
        // Hide custom controls
        controls.classList.add('hidden')
        
        // Start playing the video
        await video.play()
        
        // Request fullscreen
        if (video.requestFullscreen) {
          await video.requestFullscreen()
        }
        
        // Show native controls
        video.setAttribute('controls', 'true')
      } catch (error) {
        console.error('Error playing video in fullscreen:', error)
        // Show controls again if there was an error
        controls.classList.remove('hidden')
      }
    })

    // Handle normal play button
    normalPlayBtn.addEventListener('click', async () => {
      try {
        // Hide custom controls
        controls.classList.add('hidden')
        
        // Start playing the video
        await video.play()
        
        // Show native controls
        video.setAttribute('controls', 'true')
      } catch (error) {
        console.error('Error playing video:', error)
        // Show controls again if there was an error
        controls.classList.remove('hidden')
      }
    })

    // Handle video ended - show custom controls again
    video.addEventListener('ended', () => {
      video.removeAttribute('controls')
      controls.classList.remove('hidden')
    })

    // Handle fullscreen exit - keep native controls but allow custom controls to return
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && video.paused) {
        video.removeAttribute('controls')
        controls.classList.remove('hidden')
      }
    })
  }
  
}

// Helper function to get full model path
function getModelPath(fileName: string, isGaussianSplat: boolean = false): string {
  if (!modelsConfig?.basePaths) {
    // Fallback to old behavior if basePaths not available
    return fileName
  }
  
  const basePath = isGaussianSplat ? modelsConfig.basePaths.gsplat : modelsConfig.basePaths.pointcloud
  return basePath + fileName
}

// Load models configuration
async function loadModelsConfig() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}models-config.json`)
    modelsConfig = await response.json()
    console.log('Models configuration loaded:', modelsConfig)
  } catch (error) {
    console.error('Failed to load models configuration:', error)
    // Fallback to localStorage
    const saved = localStorage.getItem('modelsConfig')
    if (saved) {
      modelsConfig = JSON.parse(saved)
      console.log('Models configuration loaded from localStorage')
    } else {
      console.error('No models configuration available')
    }
  }
}

// Load projects configuration
async function loadProjectsConfig() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}projects.json`)
    projectsConfig = await response.json()
    console.log('Projects configuration loaded:', projectsConfig)
  } catch (error) {
    console.error('Failed to load projects configuration:', error)
  }
}

// Setup model dropdown functionality
function setupModelDropdown() {
  const dropdown = document.querySelector('#model-dropdown') as HTMLSelectElement
  if (!dropdown) return
  
  // Populate dropdown options with display names from config
  Object.keys(modelsConfig.models).forEach(modelKey => {
    const option = dropdown.querySelector(`option[value="${modelKey}"]`) as HTMLOptionElement
    if (option) {
      option.textContent = modelsConfig.models[modelKey].displayName
    }
  })
  
  dropdown.addEventListener('change', (e) => {
    const newModel = (e.target as HTMLSelectElement).value
    switchToModel(newModel)
    updateQualityDropdown()
  })
  
  // Set initial selection
  dropdown.value = modelsConfig.currentModel
}

// Setup quality dropdown functionality
function setupQualityDropdown() {
  const dropdown = document.querySelector('#quality-dropdown') as HTMLSelectElement
  if (!dropdown) return
  
  dropdown.addEventListener('change', (e) => {
    const newQuality = (e.target as HTMLSelectElement).value as 'low' | 'high'
    switchToQuality(newQuality)
  })
  
  // Set initial selection
  dropdown.value = currentQuality
  
  // Update initial state
  updateQualityDropdown()
}

// Update quality dropdown availability
function updateQualityDropdown() {
  const dropdown = document.querySelector('#quality-dropdown') as HTMLSelectElement
  const qualitySelector = document.querySelector('.quality-selector') as HTMLElement
  if (!dropdown || !qualitySelector) return
  
  const currentModel = modelsConfig.models[modelsConfig.currentModel]
  const hasGaussianSplat = currentModel && currentModel.gaussianSplatFile
  
  // Hide entire quality selector if no high quality available
  if (hasGaussianSplat) {
    qualitySelector.style.display = 'block'
    dropdown.disabled = false
  } else {
    qualitySelector.style.display = 'none'
    // Switch to low quality if we were on high
    if (currentQuality === 'high') {
      currentQuality = 'low'
      dropdown.value = 'low'
    }
  }
}

// Switch to different quality
function switchToQuality(quality: 'low' | 'high') {
  const currentModel = modelsConfig.models[modelsConfig.currentModel]
  
  // Don't allow high quality if no Gaussian splat file available
  if (quality === 'high' && (!currentModel || !currentModel.gaussianSplatFile)) {
    console.log('High quality not available for this model')
    return
  }
  
  // If switching from high to low, revert the Z scaling on animation config
  if (currentQuality === 'high' && quality === 'low') {
    if (currentModel && currentModel.loadingAnimation) {
      const scaledEndZ = currentModel.loadingAnimation.endPosition.z
      const originalEndZ = scaledEndZ / 10
      currentModel.loadingAnimation.endPosition.z = originalEndZ
      console.log('Reverted loading animation end Z position from 10x scaling:', scaledEndZ, '->', originalEndZ)
    }
    
    // Also scale down current camera Z position
    const scaledCameraZ = camera.position.z
    const originalCameraZ = scaledCameraZ / 10
    camera.position.z = originalCameraZ
    controls.update()
    console.log('Reverted camera Z position from 10x scaling:', scaledCameraZ, '->', originalCameraZ)
  }
  
  currentQuality = quality
  isQualitySwitching = true
  
  // Reload the current model with new quality
  switchToModel(modelsConfig.currentModel)
  
  // Update point size control visibility
  updatePointSizeControlVisibility()
}

// Update point size control visibility based on quality
function updatePointSizeControlVisibility() {
  const pointSizeControl = document.querySelector('.point-size-control') as HTMLElement
  if (pointSizeControl) {
    pointSizeControl.style.display = currentQuality === 'high' ? 'none' : 'flex'
  }
}

// Switch to a different model
async function switchToModel(modelKey: string) {
  if (!modelsConfig.models[modelKey]) {
    console.error('Model not found:', modelKey)
    return
  }
  
  modelsConfig.currentModel = modelKey
  const model = modelsConfig.models[modelKey]
  isModelSwitching = true
  
  // Cancel any ongoing progressive loading from previous model
  progressiveLoader.cancelLoading()
  
  console.log('Switching to model:', model.displayName)
  
  // Update display name field and load default point size
  orbitalCamera.updateDisplayNameField()
  orbitalCamera.loadDefaultPointSize()
  
  // Clear current scene - but preserve point cloud when upgrading to high quality
  const isUpgradingToHighQuality = isQualitySwitching && currentQuality === 'high' && 
                                   currentRenderObject instanceof THREE.Points
  
  if (currentRenderObject && !isUpgradingToHighQuality) {
    // Check if it's a Gaussian splat viewer
    if ((currentRenderObject as any).dispose && typeof (currentRenderObject as any).dispose === 'function') {
      console.log('Disposing Gaussian splat viewer')
      ;(currentRenderObject as any).dispose()
      
      // Remove splat canvas
      const splatCanvas = document.getElementById('splat-canvas')
      if (splatCanvas) {
        splatCanvas.remove()
      }
      
      // Restore main Three.js canvas
      canvas.style.display = 'block'
      
      // Restore UI elements that were hidden for splat mode
      const elementsToRestore = [
        '.point-size-control',
        '.camera-info', 
        '.home-navigation',
        '.navigation-help'
      ]
      elementsToRestore.forEach(selector => {
        const element = document.querySelector(selector) as HTMLElement
        if (element) {
          element.style.display = ''
        }
      })
    } else {
      // Regular Three.js object
      scene.remove(currentRenderObject)
    }
    currentRenderObject = null
  }
  
  // Clear any existing point clouds or other objects (except when upgrading to high quality)
  if (!isUpgradingToHighQuality) {
    const existingObjects = scene.children.filter(child => 
      child instanceof THREE.Points || 
      (child.type === 'Mesh' && child.userData?.isSplatMesh)
    )
    existingObjects.forEach(obj => scene.remove(obj))
  }
  
  // Clear camera system references
  orbitalCamera.setCurrentRenderObject(new THREE.Object3D()) // Clear reference
  
  // Only show loading screen for high quality Gaussian splats
  const willLoadGaussianSplat = currentQuality === 'high' && model.gaussianSplatFile
  if (willLoadGaussianSplat) {
    progressEl.style.display = 'flex'
    progressFill.style.width = '0%'
    progressEl.querySelector('p')!.textContent = `Loading ${model.displayName}...`
  } else {
    // Ensure loading screen is hidden for point clouds
    progressEl.style.display = 'none'
  }
  
  // Load new model
  await loadModelByFileName(model.fileName)
}

// Create orbital camera system
const orbitalCamera = new OrbitalCameraSystem(camera, controls)

async function loadModelByFileName(fileName: string) {
  const currentModel = modelsConfig.models[modelsConfig.currentModel]
  if (!currentModel) {
    console.error('Current model not found in configuration')
    return
  }
  
  if (currentModel.renderType === 'gaussian-splat') {
    // Load with Gaussian splat viewer
    await loadGaussianSplat(fileName)
  } else if (currentQuality === 'high' && currentModel.gaussianSplatFile) {
    // Load dedicated Gaussian splat file for high quality
    await loadGaussianSplat(currentModel.gaussianSplatFile)
  } else {
    // Load point cloud version
    await loadPointCloudByFileName(fileName)
  }
}

async function loadPointCloudByFileName(fileName: string) {
  console.log('=== LOAD POINT CLOUD START ===')
  console.log('Loading point cloud:', fileName)
  
  
  
  // Check if chunked version exists by looking for manifest file in model subfolder
  const baseFileName = fileName.replace('.ply', '')
  const manifestPath = `models/chunks/${baseFileName}/${baseFileName}_manifest.json`
  
  console.log('Checking for chunked version at:', manifestPath)
  
  try {
    // Try to load the manifest file first
    const manifestResponse = await fetch(`${import.meta.env.BASE_URL}${manifestPath}`)
    
    if (manifestResponse.ok) {
      console.log('Found chunked version, loading progressively...')
      
      // Hide loading screen immediately for streaming effect
      progressEl.style.display = 'none'
      
      // Clear any existing point clouds
      const existingPointClouds = scene.children.filter(child => child instanceof THREE.Points)
      existingPointClouds.forEach(obj => scene.remove(obj))
      
      // Set model rotation before loading chunks
      const currentModel = modelsConfig.models[modelsConfig.currentModel]
      if (currentModel && currentModel.rotation) {
        progressiveLoader.setModelRotation(currentModel.rotation)
      } else {
        progressiveLoader.setModelRotation(null)
      }
      
      // Start loading animation immediately before chunks appear
      if (isModelSwitching && !isQualitySwitching) {
        orbitalCamera.startLoadingAnimation()
      }
      
      // Setup progressive loader callbacks
      progressiveLoader.setOnChunkLoaded((loaded, total) => {
        console.log(`Progressive loading: ${loaded}/${total} chunks loaded`)
        // Update point size for all loaded chunks to match orbital camera setting
        progressiveLoader.setPointSize(orbitalCamera.pointSize)
      })
      
      progressiveLoader.setOnLoadComplete(() => {
        console.log('Progressive loading complete!')
        
        // Register the first chunk with orbital camera system for interactions
        const loadedPointClouds = progressiveLoader.getLoadedPointClouds()
        if (loadedPointClouds.length > 0) {
          orbitalCamera.setCurrentPointCloud(loadedPointClouds[0])
        }
        
        // Reset switching flags
        if (isModelSwitching) {
          isModelSwitching = false
        }
        if (isQualitySwitching) {
          isQualitySwitching = false
        }
      })
      
      // Start progressive loading
      await progressiveLoader.loadChunkedModel(manifestPath)
      
    } else {
      // No chunked version found, fall back to regular loading
      console.log('No chunked version found, loading single file...')
      // Cancel any ongoing progressive loading
      progressiveLoader.cancelLoading()
      loadSinglePointCloud(fileName)
    }
    
  } catch (error) {
    console.log('Error checking for chunked version, falling back to single file loading:', error)
    // Cancel any ongoing progressive loading
    progressiveLoader.cancelLoading()
    loadSinglePointCloud(fileName)
  }
}

function loadSinglePointCloud(fileName: string) {
  const loader = new PLYLoader()
  
  console.log('Loading single point cloud file:', fileName)
  
  try {
    const fullPath = getModelPath(fileName)
    loader.load(
      `${import.meta.env.BASE_URL}${fullPath}`,
      onLoad,
      onStreamingProgress,
      onError
    )
  } catch (error) {
    console.error('Failed to load point cloud:', error)
    // Show error briefly, then hide
    progressEl.style.display = 'flex'
    progressEl.querySelector('p')!.textContent = 'Failed to load point cloud'
    setTimeout(() => {
      progressEl.style.display = 'none'
    }, 2000)
  }
}


async function loadGaussianSplat(fileName: string) {
  try {
    console.log('Loading real Gaussian splat:', fileName)
    
    // Create a dedicated canvas for the Gaussian splat viewer
    const splatCanvas = document.createElement('canvas')
    splatCanvas.id = 'splat-canvas'
    splatCanvas.style.position = 'absolute'
    splatCanvas.style.top = '0'
    splatCanvas.style.left = '0'
    splatCanvas.style.width = '100%'
    splatCanvas.style.height = '100%'
    splatCanvas.style.zIndex = '2001'
    splatCanvas.style.pointerEvents = 'auto'
    splatCanvas.style.touchAction = 'none'
    
    // We're using the main canvas, so don't hide it or add splat canvas
    
    // We'll position the camera after the splat loads
    
    // Try regular Viewer with our existing canvas
    console.log('Trying regular Viewer with canvas integration')
    
    // Show our canvas instead of hiding it
    canvas.style.display = 'block'
    canvas.style.zIndex = '1'
    
    const viewer = new GaussianSplatViewer({
      'canvas': canvas,
      'renderer': renderer,
      'camera': camera,
      'useBuiltInControls': false,
      'enableThreeJSRendering': true
    })
    
    console.log('Regular Viewer created, starting and loading splat scene...')
    
    // Remove our custom canvas since we're using the main canvas
    if (splatCanvas.parentNode) {
      splatCanvas.parentNode.removeChild(splatCanvas)
    }
    
    // Remove preserved point cloud before starting Gaussian splat viewer
    // since they can't render simultaneously
    if (isQualitySwitching && currentQuality === 'high') {
      const existingPointClouds = scene.children.filter(child => child instanceof THREE.Points)
      existingPointClouds.forEach(obj => {
        console.log('Removing point cloud before starting Gaussian splat viewer')
        scene.remove(obj)
      })
    }
    
    // Start the viewer first
    await viewer.start()
    
    // Add the splat scene
    const fullPath = getModelPath(fileName, true)
    await viewer.addSplatScene(`${import.meta.env.BASE_URL}${fullPath}`, {
      'showLoadingUI': false,
      'progressiveLoad': true
    })
    
    console.log('Regular Viewer scene loaded successfully')
    console.log('Viewer object:', viewer)
    console.log('Splat mesh:', (viewer as any).splatMesh)
    
    // Log splat info for debugging
    const splat = (viewer as any).splatMesh
    if (splat && splat.geometry) {
      console.log('=== HIGH QUALITY GAUSSIAN SPLAT BOUNDING BOX ===')
      console.log('Splat geometry:', splat.geometry)
      splat.geometry.computeBoundingBox()
      if (splat.geometry.boundingBox) {
        const box = splat.geometry.boundingBox
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDimension = Math.max(size.x, size.y, size.z)
        
        console.log('Bounding box min:', box.min)
        console.log('Bounding box max:', box.max)
        console.log('Size (width, height, depth):', size)
        console.log('Center:', center)
        console.log('Max dimension:', maxDimension)
        console.log('Point count:', splat.geometry.attributes.position?.count || 'Unknown')
        console.log('=== END HIGH QUALITY INFO ===')
      }
    }
    
    // Scale Z position for Gaussian splat by factor of 10
    const originalZ = camera.position.z
    camera.position.z = camera.position.z * 10
    controls.update()
    
    console.log('Scaled camera Z position for Gaussian splat by 10x')
    console.log('Original Z:', originalZ, '-> Scaled Z:', camera.position.z)
    console.log('Our camera position:', camera.position)
    console.log('Our camera target:', controls.target)
    
    console.log('Real Gaussian splat loaded successfully!')
    console.log('Canvas controls - try click and drag to orbit, scroll to zoom')
    
    // Store viewer reference globally for cleanup
    currentRenderObject = viewer as any
    
    // Hide loading screen
    progressEl.style.display = 'none'
    
    // Trigger loading animation if switching models (but not quality)
    if (isModelSwitching && !isQualitySwitching) {
      // For high quality models, scale the landing Z position by 10
      if (currentQuality === 'high') {
        const currentModel = modelsConfig.models[modelsConfig.currentModel]
        if (currentModel && currentModel.loadingAnimation) {
          const originalEndZ = currentModel.loadingAnimation.endPosition.z
          currentModel.loadingAnimation.endPosition.z = originalEndZ * 10
          console.log('Scaled loading animation end Z position by 10x:', originalEndZ, '->', currentModel.loadingAnimation.endPosition.z)
        }
      }
      orbitalCamera.startLoadingAnimation()
    }
    if (isModelSwitching) {
      isModelSwitching = false
    }
    if (isQualitySwitching) {
      isQualitySwitching = false
    }
    
  } catch (error) {
    console.error('Failed to load real Gaussian splat:', error)
    console.error('Gaussian Splat loading failed - no fallback enabled')
    
    // Restore main canvas
    canvas.style.display = 'block'
    
    // Remove splat canvas if it exists
    const splatCanvas = document.getElementById('splat-canvas')
    if (splatCanvas) {
      splatCanvas.remove()
    }
    
    // Show error message instead of fallback
    progressEl.style.display = 'flex'
    progressEl.querySelector('p')!.textContent = 'Gaussian Splat loading failed'
  }
}


// Removed Gaussian splat PLY fallback functions - no fallback enabled

async function loadPointCloud() {
  console.log('loadPointCloud() called')
  
  if (!modelsConfig) {
    console.error('Models configuration not loaded')
    return
  }
  
  console.log('Models config loaded:', modelsConfig)
  
  const currentModel = modelsConfig.models[modelsConfig.currentModel]
  if (!currentModel) {
    console.error('Current model not found in configuration')
    return
  }
  
  console.log('Current model:', currentModel)
  
  // Load the normal model first
  await loadModelByFileName(currentModel.fileName)
}



function onLoad(geometry: THREE.BufferGeometry) {
  // Configure material for the point cloud
  const material = new THREE.PointsMaterial({
    size: orbitalCamera.pointSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    map: createCircularTexture(),
    alphaTest: 0.1
  })
  
  const pointCloud = new THREE.Points(geometry, material)
  
  // Apply per-model rotation from configuration
  const currentModel = modelsConfig.models[modelsConfig.currentModel]
  if (currentModel && currentModel.rotation) {
    // Convert degrees to radians and apply rotation
    pointCloud.rotateX((currentModel.rotation.x * Math.PI) / 180)
    pointCloud.rotateY((currentModel.rotation.y * Math.PI) / 180)
    pointCloud.rotateZ((currentModel.rotation.z * Math.PI) / 180)
  }
  
  scene.add(pointCloud)
  
  // Register with orbital camera system
  orbitalCamera.setCurrentPointCloud(pointCloud)
  
  // Update point size to current setting (important for model switching)
  orbitalCamera.updatePointSize()
  
  // Calculate bounding box for model info
  console.log('=== BOUNDING BOX ANALYSIS ===')
  geometry.computeBoundingBox()
  if (geometry.boundingBox) {
    const box = geometry.boundingBox
    const size = box.getSize(new THREE.Vector3())
    // const center = box.getCenter(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z)
    
    console.log('Computed bounding box:')
    console.log('  Min:', box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2))
    console.log('  Max:', box.max.x.toFixed(2), box.max.y.toFixed(2), box.max.z.toFixed(2))
    console.log('  Size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2))
    console.log('  Max dimension:', maxDimension.toFixed(2))
    console.log('  Point count:', geometry.attributes.position.count)
    
    // Auto-scale very large models to reasonable size
    if (maxDimension > 50) {
      const scale = 20 / maxDimension  // Scale to max 20 units
      pointCloud.scale.setScalar(scale)
      console.log('Model auto-scaled by factor:', scale, '(', maxDimension.toFixed(2), '->', (maxDimension * scale).toFixed(2), ')')
    } else {
      console.log('  SCALING: Model is appropriately sized (max dimension <= 50)')
    }
  } else {
    console.log('  ERROR: No bounding box computed!')
  }
  console.log('=== END BOUNDING BOX ANALYSIS ===')
  
  // Camera position is already set by loading animation or saved position
  
  // Trigger loading animation if switching models (but not quality)
  if (isModelSwitching && !isQualitySwitching) {
    orbitalCamera.startLoadingAnimation()
  }
  if (isModelSwitching) {
    isModelSwitching = false
  }
  if (isQualitySwitching) {
    isQualitySwitching = false
  }
  
  console.log('PLY file loaded successfully:', geometry.attributes.position.count, 'points')
}

// Removed onProgress function - no longer needed without fallback

function onStreamingProgress(progress: ProgressEvent) {
  // For streaming mode, just log progress without showing loading bar
  if (progress.lengthComputable) {
    const percentComplete = (progress.loaded / progress.total) * 100
    console.log('Streaming progress:', Math.round(percentComplete) + '%')
  }
}

function onError(error: any) {
  console.error('Error loading PLY file:', error)
  progressEl.querySelector('p')!.textContent = 'Failed to load PLY file'
  
  // Fallback to demo point cloud if PLY fails to load
  console.log('Falling back to demo point cloud...')
  createDemoPointCloud()
  progressEl.style.display = 'none'
}

function createDemoPointCloud() {
  const geometry = new THREE.BufferGeometry()
  const pointCount = 10000
  
  const positions = new Float32Array(pointCount * 3)
  const colors = new Float32Array(pointCount * 3)
  
  // Create a bonsai-like point cloud structure
  for (let i = 0; i < pointCount; i++) {
    const i3 = i * 3
    
    // Create branching tree structure
    const angle = Math.random() * Math.PI * 2
    const height = Math.random() * 4 - 2
    const radius = Math.max(0.1, 2 - Math.abs(height) * 0.5) * (0.5 + Math.random() * 0.5)
    
    positions[i3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 0.5
    positions[i3 + 1] = height + (Math.random() - 0.5) * 0.2
    positions[i3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.5
    
    // Green to brown gradient based on height
    const greenness = Math.max(0, (height + 2) / 4)
    colors[i3] = 0.4 + greenness * 0.2      // R
    colors[i3 + 1] = 0.2 + greenness * 0.6  // G  
    colors[i3 + 2] = 0.1                    // B
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  
  const material = new THREE.PointsMaterial({
    size: 0.001,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    map: createCircularTexture(),
    alphaTest: 0.1
  })
  
  const pointCloud = new THREE.Points(geometry, material)
  scene.add(pointCloud)
  
  // Register with orbital camera system
  orbitalCamera.setCurrentPointCloud(pointCloud)
  
  console.log('Demo point cloud created with', pointCount, 'points')
}

// Main render loop
function animate() {
  requestAnimationFrame(animate)
  
  controls.update()
  orbitalCamera.update()
  renderer.render(scene, camera)
}

// Handle window resize
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

window.addEventListener('resize', handleResize)


// Initialize application
async function initialize() {
  console.log('Initialize() called')
  // Hide loading screen immediately since we start with point clouds
  progressEl.style.display = 'none'
  
  await loadModelsConfig()
  await loadProjectsConfig()
  setupModelDropdown()
  setupQualityDropdown()
  orbitalCamera.updateDisplayNameField()
  orbitalCamera.loadDefaultPointSize()
  
  // Show home navigation indicators on initial load
  const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
  if (homeNavigation) {
    homeNavigation.style.display = 'flex'
    homeNavigation.style.visibility = 'visible'
  }
  
  // Setup navigation event listeners
  orbitalCamera.setupPageNavigation()
  
  // Update initial point size control visibility
  updatePointSizeControlVisibility()
  
  // Start loading animation every time (regardless of caching)
  orbitalCamera.startLoadingAnimation()
  
  loadPointCloud().catch(console.error)
  animate()
}

// Start the application
initialize()

