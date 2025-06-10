import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'


const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!

// Model configuration interface
interface ModelConfig {
  fileName: string
  displayName: string
  defaultPointSize: number
  rotation: {
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
}

interface ModelsConfig {
  models: { [key: string]: ModelConfig }
  currentModel: string
}

// Global models configuration
let modelsConfig: ModelsConfig
let isModelSwitching: boolean = false

// Interface state management
const InterfaceMode = {
  HOME: 'home',
  REEL: 'reel',
  PROJECTS: 'projects',
  ABOUT: 'about',
  CONTACT: 'contact'
} as const

type InterfaceMode = typeof InterfaceMode[keyof typeof InterfaceMode]

let currentInterfaceMode: InterfaceMode = InterfaceMode.HOME

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
  
  private setupMouseTracking() {
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect()
      this.currentMousePos.x = event.clientX - rect.left
      this.currentMousePos.y = event.clientY - rect.top
    })
    
    canvas.addEventListener('mouseleave', () => {
      // Mouse left canvas
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
    const display = document.querySelector('#camera-position-display') as HTMLDivElement
    if (display) {
      const pos = this.camera.position
      const target = this.controls.target
      display.textContent = `Pos: X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)} | Target: X: ${target.x.toFixed(2)}, Y: ${target.y.toFixed(2)}, Z: ${target.z.toFixed(2)}`
    }
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
  }
  
  clearClickedPoint() {
    this.clickedPoint = new THREE.Vector3(0, 0, 0)
    // Reset controls to origin
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }
  
  
  public updatePointSize() {
    if (this.currentPointCloud && this.currentPointCloud.material) {
      const material = this.currentPointCloud.material as THREE.PointsMaterial
      material.size = this.pointSize
      material.needsUpdate = true
      console.log('Point size updated to:', this.pointSize)
    }
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
      // If currently animating (loading animation), queue the transition
      if (this.isAnimating) {
        console.log('Animation in progress, queuing transition to:', mode)
        this.pendingTransition = mode
        this.updateHeaderPath(mode)
        return
      }
      
      // Start footer transition sequence for all pages including reel
      this.startFooterTransition(mode)
    }
    
    this.updateHeaderPath(mode)
  }
  
  private startFooterTransition(mode: InterfaceMode) {
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    console.log('Starting footer transition to:', mode)
    currentInterfaceMode = mode
    
    // Animate to footer position
    const footerPos = currentModel.footerPosition
    this.animateToPosition(
      new THREE.Vector3(footerPos.cameraPosition.x, footerPos.cameraPosition.y, footerPos.cameraPosition.z),
      new THREE.Vector3(footerPos.target.x, footerPos.target.y, footerPos.target.z),
      footerPos.duration
    )
    
    
    
    // Enable footer mode and show content after animation
    setTimeout(() => {
      this.enterFooterMode()
      this.showContentInterface(mode)
    }, footerPos.duration)
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
    // Show controls and model selector, hide content area
    const controlsPanel = document.querySelector('.controls-panel') as HTMLElement
    const contentArea = document.querySelector('#content-area') as HTMLElement
    const modelSelector = document.querySelector('.model-selector') as HTMLElement
    
    if (controlsPanel) controlsPanel.style.display = 'flex'
    if (contentArea) contentArea.style.display = 'none'
    if (modelSelector) modelSelector.style.display = 'block'
    
    // Re-enable orbital controls for home page
    this.controls.enabled = true
    
    // Enable canvas interaction for home page
    this.enableCanvasInteraction()
    
    // Close hamburger menu if open
    this.closeHamburgerMenu()
  }
  
  private showContentInterface(mode: InterfaceMode) {
    // Hide controls, show content area
    const controlsPanel = document.querySelector('.controls-panel') as HTMLElement
    const contentArea = document.querySelector('#content-area') as HTMLElement
    
    if (controlsPanel) controlsPanel.style.display = 'none'
    if (contentArea) {
      contentArea.style.display = 'block'
      this.updateContentArea(mode)
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
    
    // Create horizontal scrolling container with all sections including reel
    const allSections = `
      <div class="content-container">
        <div class="content-section reel-section">
          <div class="terminal-section">
            <h3>$ ./play_motion_reel.sh</h3>
            <div style="padding:56.25% 0 0 0;position:relative;"><iframe src="https://player.vimeo.com/video/661829952?badge=0&autopause=0&player_id=0&app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="Luke Kantola 2021 Motion Design Reel"></iframe></div>
          </div>
        </div>
        
        <div class="content-section">
          <div class="terminal-section">
            <h3>$ ls -la ~/projects/</h3>
            <div class="project-listing">
              <div class="project-item">
                <span class="project-type">drwxr-xr-x</span>
                <span class="project-name">gsplat-showcase/</span>
                <span class="project-desc">Interactive 3D point cloud viewer</span>
              </div>
              <div class="project-item">
                <span class="project-type">drwxr-xr-x</span>
                <span class="project-name">neural-radiance/</span>
                <span class="project-desc">NeRF implementation for scene reconstruction</span>
              </div>
              <div class="project-item">
                <span class="project-type">drwxr-xr-x</span>
                <span class="project-name">photogrammetry-tools/</span>
                <span class="project-desc">Computer vision pipeline for 3D reconstruction</span>
              </div>
              <div class="project-item">
                <span class="project-type">drwxr-xr-x</span>
                <span class="project-name">lidar-processing/</span>
                <span class="project-desc">Real-time LiDAR data visualization</span>
              </div>
            </div>
          </div>
          
          <div class="terminal-section">
            <h3>$ cat ~/projects/README.md</h3>
            <p>Specializing in 3D computer vision, real-time rendering, and spatial computing applications. Current focus on Gaussian splatting techniques for photorealistic scene reconstruction and visualization.</p>
            
            <p><strong>Tech Stack:</strong><br>
            • TypeScript/JavaScript, Three.js, WebGL<br>
            • Python, PyTorch, OpenCV<br>
            • C++, CUDA for performance-critical applications<br>
            • Point cloud processing (PLY, LAS, XYZ formats)</p>
            
            <p><strong>Recent Work:</strong><br>
            • Interactive Gaussian splat viewer with advanced camera controls<br>
            • Real-time point cloud streaming and visualization<br>
            • 3D scene reconstruction from drone imagery<br>
            • Neural radiance field implementations</p>
          </div>
          
        </div>
        
        <div class="content-section">
          <div class="terminal-section">
            <h3>$ whoami</h3>
            <p>luke@kantola:~$ Computational researcher and developer specializing in 3D computer vision, photogrammetry, and real-time rendering systems.</p>
          </div>
          
          <div class="terminal-section">
            <h3>$ cat ~/bio.txt</h3>
            <p>Background in computational photography and computer vision with focus on 3D scene reconstruction techniques. Experience developing interactive visualization tools for complex spatial data, including point clouds, neural radiance fields, and Gaussian splats.</p>
            
            <p>Currently exploring the intersection of traditional photogrammetry with modern neural rendering techniques, particularly in applications for cultural heritage documentation and environmental monitoring.</p>
            
            <p><strong>Research Interests:</strong><br>
            • Gaussian splatting and neural radiance fields<br>
            • Real-time 3D reconstruction from imagery<br>
            • Point cloud processing and visualization<br>
            • WebGL and GPU-accelerated rendering<br>
            • Spatial computing applications</p>
            
            <p><strong>Education & Experience:</strong><br>
            • M.S. Computer Science - Focus on Computer Vision<br>
            • 5+ years developing 3D visualization systems<br>
            • Published research in 3D reconstruction techniques<br>
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
        </div>
        
        <div class="content-section">
          <div class="terminal-section">
            <h3>$ cat ~/contact_info.sh</h3>
            <div class="contact-script">
              <p>#!/bin/bash</p>
              <p># Contact information and preferred communication methods</p>
              <p></p>
              <p><strong>EMAIL="luke@kantola.dev"</strong></p>
              <p><strong>GITHUB="github.com/lukekantola"</strong></p>
              <p><strong>LINKEDIN="linkedin.com/in/lukekantola"</strong></p>
              <p></p>
              <p># Professional inquiries welcome</p>
              <p>echo "Available for consulting on:"</p>
              <p>echo "  - 3D computer vision projects"</p>
              <p>echo "  - Point cloud visualization systems"</p>
              <p>echo "  - Real-time rendering applications"</p>
              <p>echo "  - Photogrammetry and reconstruction"</p>
            </div>
          </div>
          
          <div class="terminal-section">
            <h3>$ ./availability_status.sh</h3>
            <p><span class="status-indicator">●</span> <strong>Currently:</strong> Available for new projects</p>
            <p><span class="status-indicator">●</span> <strong>Response Time:</strong> Usually within 24 hours</p>
            <p><span class="status-indicator">●</span> <strong>Timezone:</strong> Mountain Time (MST/MDT)</p>
          </div>
          
          <div class="terminal-section">
            <h3>$ find ~/projects -name "*.collaboration" -type f</h3>
            <p>Open to collaborations on:</p>
            <p>• Open source 3D visualization tools</p>
            <p>• Research projects in neural rendering</p>
            <p>• Cultural heritage documentation initiatives</p>
            <p>• Educational content creation</p>
          </div>
          
          <div class="terminal-section">
            <p><em>Feel free to reach out about projects, collaborations, or just to discuss the latest in 3D computer vision!</em></p>
          </div>
        </div>
      </div>
    `
    
    contentArea.innerHTML = allSections
    
    // Scroll to the appropriate section based on mode
    const container = contentArea.querySelector('.content-container') as HTMLElement
    if (container) {
      let scrollPosition = 0
      switch (mode) {
        case InterfaceMode.REEL:
          scrollPosition = 0
          break
        case InterfaceMode.PROJECTS:
          scrollPosition = window.innerWidth
          break
        case InterfaceMode.ABOUT:
          scrollPosition = window.innerWidth * 2
          break
        case InterfaceMode.CONTACT:
          scrollPosition = window.innerWidth * 3
          break
      }
      
      contentArea.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  }
  
  private updateHeaderPath(mode: InterfaceMode) {
    const currentSection = document.querySelector('#current-section') as HTMLElement
    if (!currentSection) return
    
    if (mode === InterfaceMode.HOME) {
      currentSection.textContent = ''
    } else {
      currentSection.textContent = `/${mode}`
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
    
    // Setup hamburger menu toggle
    this.setupHamburgerMenu()
    
    // Escape key to return home
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && currentInterfaceMode !== InterfaceMode.HOME) {
        this.transitionToMode(InterfaceMode.HOME)
      }
    })
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
  
  private hideControlsImmediately() {
    const controlsPanel = document.querySelector('.controls-panel') as HTMLElement
    const modelSelector = document.querySelector('.model-selector') as HTMLElement
    
    if (controlsPanel) {
      controlsPanel.style.display = 'none'
    }
    if (modelSelector) {
      modelSelector.style.display = 'none'
    }
  }
  
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
  })
  
  // Set initial selection
  dropdown.value = modelsConfig.currentModel
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
  
  console.log('Switching to model:', model.displayName)
  
  // Update display name field and load default point size
  orbitalCamera.updateDisplayNameField()
  orbitalCamera.loadDefaultPointSize()
  
  // Clear current scene
  const existingPointCloud = scene.children.find(child => child instanceof THREE.Points)
  if (existingPointCloud) {
    scene.remove(existingPointCloud)
  }
  
  // Show loading screen
  progressEl.style.display = 'flex'
  progressFill.style.width = '0%'
  progressEl.querySelector('p')!.textContent = `Loading ${model.displayName}...`
  
  // Load new model
  loadPointCloudByFileName(model.fileName)
}

// Create orbital camera system
const orbitalCamera = new OrbitalCameraSystem(camera, controls)

function loadPointCloudByFileName(fileName: string) {
  const loader = new PLYLoader()
  
  try {
    loader.load(
      `${import.meta.env.BASE_URL}${fileName}`,
      onLoad,
      onProgress,
      onError
    )
  } catch (error) {
    console.error('Failed to load point cloud:', error)
    progressEl.querySelector('p')!.textContent = 'Failed to load point cloud'
  }
}

async function loadPointCloud() {
  if (!modelsConfig) {
    console.error('Models configuration not loaded')
    return
  }
  
  const currentModel = modelsConfig.models[modelsConfig.currentModel]
  if (!currentModel) {
    console.error('Current model not found in configuration')
    return
  }
  
  loadPointCloudByFileName(currentModel.fileName)
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
  
  // Hide loading screen
  progressEl.style.display = 'none'
  
  // Calculate bounding box for model info
  geometry.computeBoundingBox()
  if (geometry.boundingBox) {
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    const center = geometry.boundingBox.getCenter(new THREE.Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z)
    
    console.log('Model info - Size:', size, 'Center:', center, 'Max dimension:', maxDimension)
    
    // Auto-scale very large models to reasonable size
    if (maxDimension > 50) {
      const scale = 20 / maxDimension  // Scale to max 20 units
      pointCloud.scale.setScalar(scale)
      console.log('Model auto-scaled by factor:', scale)
    }
    
    // Camera position is already set by loading animation or saved position
  }
  
  // Trigger loading animation if switching models
  if (isModelSwitching) {
    orbitalCamera.startLoadingAnimation()
    isModelSwitching = false
  }
  
  console.log('PLY file loaded successfully:', geometry.attributes.position.count, 'points')
}

function onProgress(progress: ProgressEvent) {
  if (progress.lengthComputable) {
    const percentComplete = (progress.loaded / progress.total) * 100
    progressFill.style.width = `${percentComplete}%`
    console.log('Loading progress:', Math.round(percentComplete) + '%')
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
  await loadModelsConfig()
  setupModelDropdown()
  orbitalCamera.updateDisplayNameField()
  orbitalCamera.loadDefaultPointSize()
  
  // Start loading animation every time (regardless of caching)
  orbitalCamera.startLoadingAnimation()
  
  loadPointCloud()
  animate()
}

// Start the application
initialize()
