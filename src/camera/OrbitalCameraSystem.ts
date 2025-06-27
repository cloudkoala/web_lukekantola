import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SplatMesh } from '@sparkjsdev/spark'
import type { ModelsConfig, InterfaceMode, ProjectsConfig, SceneState, Vector3State } from '../types'
import { EffectsChainManager } from '../effects/EffectsChainManager'
import type { EffectType } from '../effects/PostProcessingPass'
import { EffectsPanel } from '../interface/EffectsPanel'

export class OrbitalCameraSystem {
  private currentMousePos = { x: 0, y: 0 }
  private rotationAngle: number = 0
  private startTime: number = Date.now()
  public clickedPoint: THREE.Vector3 | null = null
  public lookAtTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  
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
  private readonly INACTIVITY_THRESHOLD: number = 0 // Start immediately
  private readonly EASE_IN_DURATION: number = 3000 // 3 seconds to reach full intensity
  private autoRotationSpeed: number = 0.5 // User-configurable speed multiplier (0.0 to 2.0)
  private autoRotationDirection: number = 1 // 1 for clockwise, -1 for counter-clockwise
  
  
  
  
  // Navigation state management
  private pendingTransition: InterfaceMode | null = null
  
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  
  // Injected dependencies
  private canvas: HTMLCanvasElement
  private scene: THREE.Scene
  private modelsConfig: () => ModelsConfig
  private currentInterfaceMode: () => InterfaceMode
  private setCurrentInterfaceMode: (mode: InterfaceMode) => void
  private currentProjectId: () => string | null
  private setCurrentProjectId: (id: string | null) => void
  private projectsConfig: () => ProjectsConfig | null
  private progressiveLoader: any
  private setCurrentRenderObjectRef: (object: THREE.Points | SplatMesh | null) => void

  // Effects system
  private effectsChainManager: EffectsChainManager
  private effectsPanel: EffectsPanel | null = null
  
  // Model manager reference (set after initialization)
  public modelManager: any = null

  constructor(
    camera: THREE.PerspectiveCamera, 
    controls: OrbitControls,
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    modelsConfig: () => ModelsConfig,
    currentInterfaceMode: () => InterfaceMode,
    setCurrentInterfaceMode: (mode: InterfaceMode) => void,
    currentProjectId: () => string | null,
    setCurrentProjectId: (id: string | null) => void,
    projectsConfig: () => ProjectsConfig | null,
    progressiveLoader: any,
    setCurrentRenderObject: (object: THREE.Points | SplatMesh | null) => void
  ) {
    this.canvas = canvas
    this.scene = scene
    this.modelsConfig = modelsConfig
    this.currentInterfaceMode = currentInterfaceMode
    this.setCurrentInterfaceMode = setCurrentInterfaceMode
    this.currentProjectId = currentProjectId
    this.setCurrentProjectId = setCurrentProjectId
    this.projectsConfig = projectsConfig
    this.progressiveLoader = progressiveLoader
    this.setCurrentRenderObjectRef = setCurrentRenderObject
    this.camera = camera
    this.controls = controls
    
    // Initialize effects system
    this.effectsChainManager = new EffectsChainManager()
    
    this.setupMouseTracking()
    this.setupControlsInteractionTracking()
    this.setupControls()
    this.setupCollapsiblePanel()
    this.setupNavigation()
    this.setupClickToCopy()
    
    // Setup effects panel immediately - DOM should be ready at this point
    this.setupEffectsPanel()
    
    // Initialize orbit center at target point
    this.clickedPoint = new THREE.Vector3(0.08, 0.80, -0.21)
    
    // Set default background color (will be controlled by effects system)
    this.scene.background = new THREE.Color(0x151515)
    
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
    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect()
      this.currentMousePos.x = event.clientX - rect.left
      this.currentMousePos.y = event.clientY - rect.top
      // Don't reset timer on mouse move - only on clicks
    })
    
    this.canvas.addEventListener('mousedown', () => {
      this.resetInteractionTimer()
    })
    
    // Don't stop auto-rotation on zoom/scroll
    // canvas.addEventListener('wheel', () => {
    //   this.resetInteractionTimer()
    // })
    
    this.canvas.addEventListener('mouseleave', () => {
      // Mouse left canvas
    })
    
    // Add mouse handlers for point cloud interaction
    this.canvas.addEventListener('mousedown', (event) => {
      this.handleCanvasMouseDown(event)
      this.resetInteractionTimer()
    })
    this.canvas.addEventListener('mousemove', (event) => {
      this.handleCanvasMouseMove(event)
    })
    this.canvas.addEventListener('mouseup', () => {
      this.handleCanvasMouseUp()
    })
    
    // Add touch handler for mobile devices (double-tap)
    let lastTouchTime = 0
    this.canvas.addEventListener('touchstart', () => {
      this.resetInteractionTimer()
    })
    
    // Don't reset timer on touch move - only on touch start/end
    this.canvas.addEventListener('touchmove', () => {
      // this.resetInteractionTimer()
    })
    
    this.canvas.addEventListener('touchend', (event) => {
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
      
      // Update OrbitControls to be aware of new camera position
      this.controls.update()
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
    if (this.currentInterfaceMode() !== 'home') {
      return
    }
    
    // Get current model configuration
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) {
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
      // Use user-configurable speed and direction instead of model defaults
      const baseSpeed = this.autoRotationSpeed * 0.5 // Scale to reasonable range
      const rotationAmount = baseSpeed * this.autoRotationDirection * this.autoRotationIntensity * 0.016 // Assuming ~60fps
      
      // Use the synchronized rotation center (all three should be the same now)
      const target = this.clickedPoint ? this.clickedPoint.clone() : this.controls.target.clone()
      const cameraPos = this.camera.position.clone()
      const offset = cameraPos.sub(target)
      
      // Rotate around Y axis
      const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationAmount)
      offset.applyMatrix4(rotationMatrix)
      
      // Apply new position
      this.camera.position.copy(target.add(offset))
      
      // Update OrbitControls to be aware of new camera position
      this.controls.update()
    }
  }
  
  private setupControls() {
    const modeSelect = document.querySelector('#mode') as HTMLSelectElement
    const rotationSpeedSlider = document.querySelector('#rotation-speed') as HTMLInputElement
    const rotationRadiusSlider = document.querySelector('#rotation-radius') as HTMLInputElement
    const pointSizeSlider = document.querySelector('#point-size') as HTMLInputElement
    const sphereRadiusSlider = document.querySelector('#sphere-radius') as HTMLInputElement
    const focalLengthSlider = document.querySelector('#focal-length') as HTMLInputElement
    
    const rotationSpeedValue = document.querySelector('#rotation-speed-value') as HTMLSpanElement
    const rotationRadiusValue = document.querySelector('#rotation-radius-value') as HTMLSpanElement
    const pointSizeValue = document.querySelector('#point-size-value') as HTMLSpanElement
    const sphereRadiusValue = document.querySelector('#sphere-radius-value') as HTMLSpanElement
    const focalLengthValue = document.querySelector('#focal-length-value') as HTMLSpanElement
    
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
      if (pointSizeValue) pointSizeValue.textContent = this.pointSize.toFixed(3)
      this.updatePointSize()
    })
    
    sphereRadiusSlider?.addEventListener('input', (e) => {
      const sphereRadius = parseFloat((e.target as HTMLInputElement).value)
      if (sphereRadiusValue) sphereRadiusValue.textContent = sphereRadius.toFixed(3)
      if (this.modelManager) {
        this.modelManager.setSphereRadius(sphereRadius)
      }
    })
    
    focalLengthSlider?.addEventListener('input', (e) => {
      const focalLength = parseFloat((e.target as HTMLInputElement).value)
      focalLengthValue.textContent = focalLength.toString()
      this.updateFocalLength(focalLength)
    })
    
    
    // Post-Processing Controls
    const postProcessingEnabledCheckbox = document.querySelector('#post-processing-enabled') as HTMLInputElement
    const postProcessingEffectSelect = document.querySelector('#post-processing-effect') as HTMLSelectElement
    const postProcessingIntensitySlider = document.querySelector('#post-processing-intensity') as HTMLInputElement
    const postProcessingColorRSlider = document.querySelector('#post-processing-color-r') as HTMLInputElement
    const postProcessingColorGSlider = document.querySelector('#post-processing-color-g') as HTMLInputElement
    const postProcessingColorBSlider = document.querySelector('#post-processing-color-b') as HTMLInputElement
    const postProcessingThresholdSlider = document.querySelector('#post-processing-threshold') as HTMLInputElement
    
    const postProcessingIntensityValue = document.querySelector('#post-processing-intensity-value') as HTMLSpanElement
    const postProcessingColorRValue = document.querySelector('#post-processing-color-r-value') as HTMLSpanElement
    const postProcessingColorGValue = document.querySelector('#post-processing-color-g-value') as HTMLSpanElement
    const postProcessingColorBValue = document.querySelector('#post-processing-color-b-value') as HTMLSpanElement
    const postProcessingThresholdValue = document.querySelector('#post-processing-threshold-value') as HTMLSpanElement
    
    postProcessingEnabledCheckbox?.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked
      this.updatePostProcessingEnabled(enabled)
    })
    
    postProcessingEffectSelect?.addEventListener('change', (e) => {
      const effectType = (e.target as HTMLSelectElement).value
      this.updatePostProcessingEffect(effectType)
    })
    
    postProcessingIntensitySlider?.addEventListener('input', (e) => {
      const intensity = parseFloat((e.target as HTMLInputElement).value)
      postProcessingIntensityValue.textContent = intensity.toFixed(2)
      this.updatePostProcessingIntensity(intensity)
    })
    
    postProcessingColorRSlider?.addEventListener('input', (e) => {
      const colorR = parseFloat((e.target as HTMLInputElement).value)
      postProcessingColorRValue.textContent = colorR.toFixed(2)
      this.updatePostProcessingColorR(colorR)
    })
    
    postProcessingColorGSlider?.addEventListener('input', (e) => {
      const colorG = parseFloat((e.target as HTMLInputElement).value)
      postProcessingColorGValue.textContent = colorG.toFixed(2)
      this.updatePostProcessingColorG(colorG)
    })
    
    postProcessingColorBSlider?.addEventListener('input', (e) => {
      const colorB = parseFloat((e.target as HTMLInputElement).value)
      postProcessingColorBValue.textContent = colorB.toFixed(2)
      this.updatePostProcessingColorB(colorB)
    })
    
    postProcessingThresholdSlider?.addEventListener('input', (e) => {
      const threshold = parseFloat((e.target as HTMLInputElement).value)
      postProcessingThresholdValue.textContent = threshold.toFixed(2)
      this.updatePostProcessingThreshold(threshold)
    })
    
    
    // Set default point size button
    const setDefaultPointSizeButton = document.querySelector('#set-default-point-size') as HTMLButtonElement
    setDefaultPointSizeButton?.addEventListener('click', () => {
      this.setDefaultPointSize()
    })
    
    // Prevent canvas clicks when interacting with controls
    const controlsPanel = document.querySelector('#controls')
    controlsPanel?.addEventListener('mousedown', (e) => {
      e.stopPropagation()
    })
    controlsPanel?.addEventListener('click', (e) => {
      e.stopPropagation()
    })
    
    
    // Clear point button
    const clearButton = document.querySelector('#clear-point') as HTMLButtonElement
    clearButton?.addEventListener('click', () => {
      const origin = new THREE.Vector3(0, 0, 0)
      this.clickedPoint = origin.clone()
      this.lookAtTarget.copy(origin)
      this.controls.target.copy(origin)
      this.controls.update()
      console.log('All rotation centers reset to origin')
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
    
    // Sphere Controls
    const sphereToggleCheckbox = document.querySelector('#sphere-toggle') as HTMLInputElement
    const sphereDetailSlider = document.querySelector('#sphere-detail') as HTMLInputElement
    
    const sphereDetailValue = document.querySelector('#sphere-detail-value') as HTMLSpanElement
    
    const detailLabels = ['Low', 'Medium', 'High']
    
    sphereToggleCheckbox?.addEventListener('change', () => {
      if (this.modelManager) {
        this.modelManager.toggleSpheres()
        const isEnabled = this.modelManager.isSphereMode()
        
        // Update checkbox state
        sphereToggleCheckbox.checked = isEnabled
        
        // Toggle between point size and sphere radius controls
        this.toggleSizeControls(isEnabled)
        
        // Show/hide detail controls
        const detailControl = document.querySelector('.sphere-detail-control') as HTMLElement
        
        if (detailControl) {
          detailControl.style.display = isEnabled ? 'flex' : 'none'
        }
        
        console.log(`Sphere mode ${isEnabled ? 'enabled' : 'disabled'}`)
        if (isEnabled) {
          const stats = this.modelManager.getSphereStats()
          console.log(`Rendered ${stats.totalSpheres} spheres in ${stats.meshCount} meshes`)
        }
      }
    })
    
    
    sphereDetailSlider?.addEventListener('input', (e) => {
      const detail = parseInt((e.target as HTMLInputElement).value)
      sphereDetailValue.textContent = detailLabels[detail] || 'Medium'
      
      if (this.modelManager) {
        this.modelManager.setSphereDetail(detail)
      }
    })
    
    // Don't initialize spheres here - modelManager might not be set yet
    // This will be handled in initializeSphereMode() method
    
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
      // Show the unified target (both look-at and rotation center)
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
    const display = document.querySelector('#rotation-center-display') as HTMLDivElement
    if (display && this.clickedPoint) {
      display.textContent = `X: ${this.formatNumber(this.clickedPoint.x)}, Y: ${this.formatNumber(this.clickedPoint.y)}, Z: ${this.formatNumber(this.clickedPoint.z)}`
    } else if (display) {
      display.textContent = `X: ${this.formatNumber(0)}, Y: ${this.formatNumber(0)}, Z: ${this.formatNumber(0)}`
    }
  }

  private setupClickToCopy() {
    const cameraPositionDisplay = document.querySelector('#camera-position-display') as HTMLDivElement
    const cameraTargetDisplay = document.querySelector('#camera-target-display') as HTMLDivElement

    const createClickHandler = () => {
      return async () => {
        // Prompt user for scene name (like mobile version)
        const userSceneName = prompt('Enter a name for your scene:', 'My Custom Scene')
        
        // If user cancelled the prompt, exit
        if (userSceneName === null) {
          return
        }
        
        // Use provided name or fallback to default
        const sceneName = userSceneName.trim() || 'Untitled Scene'
        
        // Generate complete scene configuration using actual system state
        const sceneState = this.captureCurrentSceneState()
        
        // Format as complete scenes-config structure (like mobile version)
        const sceneConfig = {
          "name": sceneName,
          "description": `Exported scene configuration - ${new Date().toLocaleDateString()}`,
          "modelKey": sceneState.modelKey,
          "quality": sceneState.quality,
          "cameraPosition": {
            "x": parseFloat(sceneState.cameraPosition.x.toFixed(2)),
            "y": parseFloat(sceneState.cameraPosition.y.toFixed(2)),
            "z": parseFloat(sceneState.cameraPosition.z.toFixed(2))
          },
          "cameraTarget": {
            "x": parseFloat(sceneState.cameraTarget.x.toFixed(2)),
            "y": parseFloat(sceneState.cameraTarget.y.toFixed(2)),
            "z": parseFloat(sceneState.cameraTarget.z.toFixed(2))
          },
          "focalLength": sceneState.focalLength,
          "effectsChain": sceneState.effectsChain,
          "effectsDropdownValue": sceneState.effectsDropdownValue,
          "pointSize": sceneState.pointSize,
          "sphereMode": sceneState.sphereMode,
          "fogDensity": sceneState.fogDensity,
          "autoRotation": sceneState.autoRotation,
          "autoRotationSpeed": sceneState.autoRotationSpeed,
          "autoRotationDirection": sceneState.autoRotationDirection,
          "backgroundColor": sceneState.backgroundColor,
          "timestamp": sceneState.timestamp,
          "version": sceneState.version,
          "creator": "User"
        }
        
        const configJson = JSON.stringify(sceneConfig, null, 2)
        
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(configJson)
            this.showCopyFeedback(`"${sceneName}"`)
          } else {
            // Fallback for older browsers or insecure contexts
            const textArea = document.createElement('textarea')
            textArea.value = configJson
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            this.showCopyFeedback(`"${sceneName}"`)
          }
        } catch (err) {
          console.error('Failed to copy to clipboard:', err)
          // Log the config to console as a last resort
          console.log('Scene Config:', configJson)
          this.showCopyFeedback('Config logged to console')
        }
      }
    }

    if (cameraPositionDisplay) {
      cameraPositionDisplay.style.cursor = 'pointer'
      cameraPositionDisplay.addEventListener('click', createClickHandler())
    }

    if (cameraTargetDisplay) {
      cameraTargetDisplay.style.cursor = 'pointer'
      cameraTargetDisplay.addEventListener('click', createClickHandler())
    }

  }

  private showCopyFeedback(label: string) {
    // Create temporary feedback element
    const feedback = document.createElement('div')
    feedback.textContent = `${label} copied!`
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: 'Space Mono', monospace;
      font-size: 0.8rem;
      z-index: 10000;
      pointer-events: none;
    `
    
    document.body.appendChild(feedback)
    
    // Remove after 1 second
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback)
      }
    }, 1000)
  }
  
  private updateCameraAnimation() {
    // If user is dragging, interrupt the animation and let controls take over
    if (this.isDragging) {
      this.isAnimating = false
      this.controls.update()
      return
    }
    
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
      
      // Sync all target properties after animation completes
      this.syncAllTargets(this.controls.target)
      
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
  
  private syncAllTargets(newTarget: THREE.Vector3) {
    // Unified system - rotation center and look-at are the same
    this.clickedPoint = newTarget.clone()
    this.lookAtTarget = newTarget.clone()
    this.controls.target.copy(newTarget)
    this.controls.update()
    console.log('Synced all rotation targets to:', newTarget)
  }
  
  public startLoadingAnimation() {
    // Don't animate if there's a saved camera position
    if (this.savedCameraPosition) {
      console.log('Skipping loading animation - saved camera position exists')
      return
    }
    
    // Get current model's animation configuration
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) {
      console.error('No current model configuration found')
      return
    }
    
    const animConfig = currentModel.loadingAnimation
    
    // Update orbit center and look-at target from model config first
    // Set unified target from animation config  
    this.lookAtTarget = new THREE.Vector3(animConfig.target.x, animConfig.target.y, animConfig.target.z)
    this.clickedPoint = this.lookAtTarget.clone()
    
    // Set camera to loading start position without animation
    this.camera.position.set(animConfig.startPosition.x, animConfig.startPosition.y, animConfig.startPosition.z)
    this.camera.lookAt(this.lookAtTarget.x, this.lookAtTarget.y, this.lookAtTarget.z)
    this.controls.target.copy(this.lookAtTarget)
    
    // Animate to configured end position
    const endPosition = new THREE.Vector3(animConfig.endPosition.x, animConfig.endPosition.y, animConfig.endPosition.z)
    const endTarget = new THREE.Vector3(animConfig.target.x, animConfig.target.y, animConfig.target.z)
    this.animateToPosition(endPosition, endTarget, animConfig.duration)
    
    console.log(`Starting loading animation for ${currentModel.displayName}`)
    console.log(`From: ${JSON.stringify(animConfig.startPosition)} To: ${JSON.stringify(animConfig.endPosition)}`)
  }
  
  public resetToAnimationEnd() {
    // Get current model's animation configuration
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) {
      console.error('No current model configuration found')
      return
    }
    
    const animConfig = currentModel.loadingAnimation
    
    // Set camera to animation end position
    const endPosition = new THREE.Vector3(animConfig.endPosition.x, animConfig.endPosition.y, animConfig.endPosition.z)
    const endTarget = new THREE.Vector3(animConfig.target.x, animConfig.target.y, animConfig.target.z)
    
    // Animate to the end position with a quick duration
    this.animateToPosition(endPosition, endTarget, 1000) // 1 second animation
    
    console.log(`Resetting camera to animation end position for ${currentModel.displayName}`)
    console.log(`End position: ${JSON.stringify(animConfig.endPosition)}, Target: ${JSON.stringify(animConfig.target)}`)
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
    
    // Use current rotation center if available, otherwise default to origin
    targetTarget = this.clickedPoint ? this.clickedPoint.clone() : new THREE.Vector3(0, 0, 0)
    
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
    this.setCurrentRenderObjectRef(pointCloud)
  }
  
  setCurrentRenderObject(object: THREE.Points | SplatMesh | null) {
    // Update global reference via injected function
    this.setCurrentRenderObjectRef(object)
    // If it's a Points object, also set the currentPointCloud for compatibility
    if (object instanceof THREE.Points) {
      this.currentPointCloud = object
    } else {
      this.currentPointCloud = null
    }
  }

  /**
   * Check if any models are currently loaded in the scene
   */
  hasLoadedModel(): boolean {
    const loadedModels = this.scene.children.filter(child => 
      child instanceof THREE.Points || 
      (child as any).isSplatMesh ||
      (child.type === 'Mesh' && child.userData?.isSplatMesh)
    )
    return loadedModels.length > 0
  }
  
  clearClickedPoint() {
    const origin = new THREE.Vector3(0, 0, 0)
    this.clickedPoint = origin.clone()
    this.lookAtTarget.copy(origin)
    this.controls.target.copy(origin)
    this.controls.update()
    console.log('All rotation systems cleared to origin')
  }
  
  
  public updatePointSize() {
    // Update point size for ALL point clouds in the scene
    this.scene.children.forEach(child => {
      if (child instanceof THREE.Points && child.material) {
        const geometry = child.geometry as THREE.BufferGeometry
        
        // Calculate density-aware point size
        const adjustedSize = this.calculateDensityAwarePointSize(geometry, this.pointSize)
        
        // Handle both PointsMaterial and ShaderMaterial
        if (child.material instanceof THREE.PointsMaterial) {
          child.material.size = adjustedSize
          child.material.needsUpdate = true
        } else if (child.material instanceof THREE.ShaderMaterial) {
          // Handle different shader material types
          if (child.material.uniforms.pointSize) {
            child.material.uniforms.pointSize.value = adjustedSize
          } else if (child.material.uniforms.baseSize) {
            // Handle Random Scale effect shader materials (old version)
            child.material.uniforms.baseSize.value = adjustedSize
          } else if (child.material.uniforms.size) {
            // Handle ProgressiveLoader shader materials
            child.material.uniforms.size.value = adjustedSize
          }
          // Note: Random Scale effect uses base size directly in shader, no uniform needed
          child.material.needsUpdate = true
        }
      } else if (child instanceof THREE.InstancedMesh && child.geometry instanceof THREE.SphereGeometry) {
        // Handle new sphere-based instanced mesh point clouds
        const currentRadius = child.geometry.parameters.radius
        const targetRadius = this.pointSize
        
        // Only update if radius has changed significantly
        if (Math.abs(currentRadius - targetRadius) > 0.0001) {
          // Create new sphere geometry with updated radius
          const newSphereGeometry = new THREE.SphereGeometry(targetRadius, 8, 6)
          
          // Replace the geometry
          child.geometry.dispose() // Clean up old geometry
          child.geometry = newSphereGeometry
          
          console.log('Updated InstancedMesh sphere radius from', currentRadius, 'to', targetRadius)
        }
      }
    })
    
    // Also update progressive loader if it has loaded chunks
    this.progressiveLoader.setPointSize(this.pointSize)
    
    console.log('Point size updated to:', this.pointSize, 'for all point clouds and sphere instances')
    // Note: Gaussian splats don't use point size in the same way
    // Point size control may not apply to Gaussian splat rendering
  }
  

  public updateFocalLength(focalLength: number) {
    // Convert focal length (mm) to field of view (degrees)
    // Using standard 35mm film sensor width (36mm)
    // FOV = 2 * arctan(sensor_width / (2 * focal_length))
    const sensorWidth = 36 // mm
    const fovRadians = 2 * Math.atan(sensorWidth / (2 * focalLength))
    const fovDegrees = fovRadians * (180 / Math.PI)
    
    // Update camera field of view
    this.camera.fov = fovDegrees
    this.camera.updateProjectionMatrix()
    
    console.log(`Focal length updated to: ${focalLength}mm, FOV: ${fovDegrees.toFixed(1)}°`)
  }





  public updatePostProcessingEnabled(enabled: boolean) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.enabled = enabled
      console.log('Post-Processing enabled:', enabled)
    }
  }

  public updatePostProcessingEffect(effectType: string) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.effectType = effectType
      console.log('Post-Processing effect type updated to:', effectType)
    }
  }

  public updatePostProcessingIntensity(intensity: number) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.intensity = intensity
      console.log('Post-Processing intensity updated to:', intensity)
    }
  }

  public updatePostProcessingColorR(colorR: number) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.colorR = colorR
      console.log('Post-Processing color R updated to:', colorR)
    }
  }

  public updatePostProcessingColorG(colorG: number) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.colorG = colorG
      console.log('Post-Processing color G updated to:', colorG)
    }
  }

  public updatePostProcessingColorB(colorB: number) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.colorB = colorB
      console.log('Post-Processing color B updated to:', colorB)
    }
  }

  public updatePostProcessingThreshold(threshold: number) {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.sobelThreshold = threshold
      console.log('Post-Processing Sobel threshold updated to:', threshold)
    }
  }

  public setAutoRotationEnabled(enabled: boolean) {
    this.autoRotationEnabled = enabled
    console.log('Auto-rotation enabled:', enabled)
    
    // Reset rotation intensity when toggling
    if (!enabled) {
      this.autoRotationIntensity = 0
    }
  }

  public setAutoRotationSpeed(speed: number) {
    this.autoRotationSpeed = Math.max(0.0, Math.min(2.0, speed)) // Clamp between 0.0 and 2.0
    console.log('Auto-rotation speed set to:', this.autoRotationSpeed)
  }

  // New method for bidirectional slider support
  public setBidirectionalRotationSpeed(speed: number) {
    // Handle negative values by setting both speed and direction
    if (speed < 0) {
      this.autoRotationSpeed = Math.max(0.0, Math.min(2.0, Math.abs(speed))) // Store absolute value as speed
      this.autoRotationDirection = -1 // Set direction to counter-clockwise
    } else {
      this.autoRotationSpeed = Math.max(0.0, Math.min(2.0, speed)) // Clamp between 0.0 and 2.0
      this.autoRotationDirection = 1 // Set direction to clockwise
    }
    
    // Auto-enable/disable rotation based on speed
    this.autoRotationEnabled = speed !== 0
    
    console.log('Bidirectional rotation set to:', speed, '-> speed:', this.autoRotationSpeed, 'direction:', this.autoRotationDirection === 1 ? 'CW' : 'CCW', 'enabled:', this.autoRotationEnabled)
  }

  // Get the bidirectional value (speed * direction), considering enabled state
  public getBidirectionalRotationSpeed(): number {
    return this.autoRotationEnabled ? (this.autoRotationSpeed * this.autoRotationDirection) : 0
  }

  public getAutoRotationSpeed(): number {
    return this.autoRotationSpeed
  }

  public setAutoRotationDirection(direction: number) {
    this.autoRotationDirection = direction === -1 ? -1 : 1 // Only allow 1 or -1
    console.log('Auto-rotation direction set to:', this.autoRotationDirection === 1 ? 'clockwise' : 'counter-clockwise')
  }

  public getAutoRotationDirection(): number {
    return this.autoRotationDirection
  }

  public getAutoRotationEnabled(): boolean {
    return this.autoRotationEnabled
  }

  // Toggle between point size and sphere radius controls based on sphere mode
  private toggleSizeControls(sphereMode: boolean): void {
    const pointSizeControl = document.querySelector('#point-size-control') as HTMLElement
    const sphereRadiusControl = document.querySelector('#sphere-radius-control') as HTMLElement
    
    if (pointSizeControl && sphereRadiusControl) {
      if (sphereMode) {
        pointSizeControl.style.display = 'none'
        sphereRadiusControl.style.display = 'block'
      } else {
        pointSizeControl.style.display = 'block'
        sphereRadiusControl.style.display = 'none'
      }
    }
  }

  // Initialize sphere mode after ModelManager is available
  initializeSphereMode(): void {
    const sphereToggleCheckbox = document.querySelector('#sphere-toggle') as HTMLInputElement
    if (sphereToggleCheckbox?.checked && this.modelManager) {
      console.log('🔵 Initializing spheres because checkbox is checked (delayed)')
      
      const isSphereMode = this.modelManager.isSphereMode()
      const sphereStats = this.modelManager.getSphereStats()
      
      console.log('🔍 Current sphere state:', {
        isSphereMode,
        sphereStats,
        totalSpheres: sphereStats.totalSpheres,
        meshCount: sphereStats.meshCount
      })
      
      // Force toggle spheres regardless of current state to ensure they're visible
      console.log('🔵 Force toggling spheres to ensure they are created')
      
      // Set sphere radius BEFORE creating spheres to avoid visual pop
      // Use the default sphere radius from the slider
      const sphereRadiusSlider = document.querySelector('#sphere-radius') as HTMLInputElement
      const defaultSphereRadius = sphereRadiusSlider ? parseFloat(sphereRadiusSlider.value) : 0.01
      console.log('🔧 Pre-setting sphere radius to default:', defaultSphereRadius)
      this.modelManager.setSphereRadius(defaultSphereRadius)
      
      this.modelManager.toggleSpheres() // Turn off if on
      setTimeout(() => {
        console.log('🔵 Toggling spheres back ON')
        this.modelManager.toggleSpheres() // Turn back on
        
        // Show sphere radius control instead of point size control
        this.toggleSizeControls(true)
        
        const finalStats = this.modelManager.getSphereStats()
        console.log('🎯 Final sphere stats:', finalStats)
      }, 100)
      
    } else {
      console.log('🔴 Not initializing spheres:', { 
        checkboxChecked: sphereToggleCheckbox?.checked, 
        hasModelManager: !!this.modelManager 
      })
    }
  }

  private calculateDensityAwarePointSize(geometry: THREE.BufferGeometry, baseSize: number): number {
    // Get vertex count and bounding box
    const vertexCount = geometry.attributes.position.count
    geometry.computeBoundingBox()
    
    if (!geometry.boundingBox) return baseSize
    
    const box = geometry.boundingBox
    const size = box.getSize(new THREE.Vector3())
    const volume = size.x * size.y * size.z
    
    // Calculate point density (points per cubic unit)
    const density = vertexCount / Math.max(volume, 0.001) // Avoid division by zero
    
    // Adjust point size based on density
    // Higher density = smaller points to reduce overlap
    let densityFactor = 1.0
    if (density > 50000) {
      densityFactor = 0.3  // Very dense - much smaller points
    } else if (density > 10000) {
      densityFactor = 0.5  // Dense - smaller points
    } else if (density > 5000) {
      densityFactor = 0.7  // Medium density - slightly smaller
    } else if (density < 1000) {
      densityFactor = 1.3  // Sparse - larger points
    }
    
    return baseSize * densityFactor
  }

  private saveStartPosition() {
    const modelsConfig = this.modelsConfig()
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
    const modelsConfig = this.modelsConfig()
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
    
    const modelsConfig = this.modelsConfig()
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
    localStorage.setItem('modelsConfig', JSON.stringify(this.modelsConfig()))
    console.log('Models configuration saved to localStorage')
  }
  
  private updateModelDropdown() {
    const dropdown = document.querySelector('#model-dropdown') as HTMLSelectElement
    if (!dropdown) return
    
    const modelsConfig = this.modelsConfig()
    // Update the current option text
    const currentOption = dropdown.querySelector(`option[value="${modelsConfig.currentModel}"]`) as HTMLOptionElement
    if (currentOption) {
      currentOption.textContent = modelsConfig.models[modelsConfig.currentModel].displayName
    }
    
    // Update selected value to match current model
    dropdown.value = modelsConfig.currentModel
  }
  
  private updateQualityDropdown() {
    if (!this.modelManager) return
    
    // Use ModelManager's method which handles both value and visibility
    this.modelManager.updateQualityDropdown()
  }
  
  private getCurrentEffectsDropdownValue(): string {
    const dropdown = document.querySelector('#effects-main-dropdown') as HTMLSelectElement
    if (dropdown) {
      return dropdown.value
    }
    
    // Fallback: determine from effects chain if dropdown not available
    const effectsChain = this.effectsChainManager.getEffectsChain()
    if (effectsChain.length > 0 && effectsChain[0].enabled) {
      return effectsChain[0].type
    }
    return "none"
  }
  
  private updateEffectsDropdown() {
    const dropdown = document.querySelector('#effects-main-dropdown') as HTMLSelectElement
    if (!dropdown) return
    
    // Get the current effects chain
    const effectsChain = this.effectsChainManager.getEffectsChain()
    
    // If there are effects, show the first effect, otherwise show "none"
    if (effectsChain.length > 0 && effectsChain[0].enabled) {
      dropdown.value = effectsChain[0].type
    } else {
      dropdown.value = "none"
    }
  }
  
  private setDefaultPointSize() {
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    currentModel.defaultPointSize = this.pointSize
    this.saveModelsConfig()
    console.log('Default point size saved for', currentModel.displayName + ':', this.pointSize)
  }
  
  public updateDisplayNameField() {
    const displayNameInput = document.querySelector('#display-name') as HTMLInputElement
    if (displayNameInput) {
      displayNameInput.value = this.modelsConfig().models[this.modelsConfig().currentModel].displayName
    }
  }
  
  public loadDefaultPointSize() {
    const modelsConfig = this.modelsConfig()
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
    
    // Update mobile slider if it exists (point size or sphere radius depending on mode)
    const mobilePointSizeCard = document.getElementById('mobile-point-size-card') as HTMLElement
    const mobileSphereRadiusCard = document.getElementById('mobile-sphere-radius-card') as HTMLElement
    if (mobilePointSizeCard && (mobilePointSizeCard as any).updateValue) {
      (mobilePointSizeCard as any).updateValue(this.pointSize.toString())
    }
    if (mobileSphereRadiusCard && (mobileSphereRadiusCard as any).updateValue) {
      (mobileSphereRadiusCard as any).updateValue(this.pointSize.toString())
    }
    
    console.log('Loaded default point size for', currentModel.displayName + ':', this.pointSize)
  }
  
  public loadDefaultFocalLength() {
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    const defaultFocalLength = currentModel.defaultFocalLength
    
    // Update UI controls
    const focalLengthSlider = document.querySelector('#focal-length') as HTMLInputElement
    const focalLengthValue = document.querySelector('#focal-length-value') as HTMLSpanElement
    
    if (focalLengthSlider) {
      focalLengthSlider.value = defaultFocalLength.toString()
    }
    if (focalLengthValue) {
      focalLengthValue.textContent = defaultFocalLength.toString()
    }
    
    // Update the camera FOV
    this.updateFocalLength(defaultFocalLength)
    
    // Update mobile slider if it exists
    const mobileFocalLengthCard = document.getElementById('mobile-focal-length-card') as HTMLElement
    if (mobileFocalLengthCard && (mobileFocalLengthCard as any).updateValue) {
      (mobileFocalLengthCard as any).updateValue(defaultFocalLength.toString())
    }
    
    console.log('Loaded default focal length for', currentModel.displayName + ':', defaultFocalLength)
  }
  
  public loadDefaultAutoRotationSpeed() {
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    const defaultAutoRotationSpeed = currentModel.autoRotationSpeed || 0.0
    
    // Update the bidirectional rotation speed
    this.setBidirectionalRotationSpeed(defaultAutoRotationSpeed)
    
    // Update desktop UI controls
    const rotationSlider = document.querySelector('#auto-rotation-speed') as HTMLInputElement
    const rotationValue = document.querySelector('#auto-rotation-speed-value') as HTMLSpanElement
    
    if (rotationSlider) {
      rotationSlider.value = defaultAutoRotationSpeed.toString()
    }
    if (rotationValue) {
      rotationValue.textContent = defaultAutoRotationSpeed.toFixed(2)
    }
    
    // Update mobile slider if it exists
    const mobileSliderCard = document.getElementById('mobile-rotation-speed-card') as HTMLElement
    if (mobileSliderCard && (mobileSliderCard as any).updateValue) {
      (mobileSliderCard as any).updateValue(defaultAutoRotationSpeed.toString())
    }
    
    console.log('Loaded default auto rotation speed for', currentModel.displayName + ':', defaultAutoRotationSpeed)
  }
  
  
  public transitionToMode(mode: InterfaceMode) {
    if (this.currentInterfaceMode() === mode) return
    
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    if (mode === 'home') {
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
      this.setCurrentInterfaceMode(mode)
      
    } else {
      // Check if we're already in a subpage for immediate transition
      const isAlreadyInSubpage = this.currentInterfaceMode() !== 'home'
      
      if (isAlreadyInSubpage) {
        console.log('Direct subpage transition from', this.currentInterfaceMode(), 'to', mode)
        // Immediate transition - no camera animation needed
        this.enterFooterMode()
        this.showContentInterface(mode)
        this.setCurrentInterfaceMode(mode)
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
    const modelsConfig = this.modelsConfig()
    const currentModel = modelsConfig.models[modelsConfig.currentModel]
    if (!currentModel) return
    
    console.log('Starting footer transition to:', mode)
    this.setCurrentInterfaceMode(mode)
    
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
    // Show controls container, camera info, hide content area
    const controlsContainer = document.querySelector('.controls-container') as HTMLElement
    const cameraInfo = document.querySelector('.camera-info') as HTMLElement
    const contentArea = document.querySelector('#content-area') as HTMLElement
    const titleHeader = document.querySelector('.title-header') as HTMLElement
    const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
    const navigationHelp = document.querySelector('#navigation-help') as HTMLElement
    const topFadeOverlay = document.querySelector('.content-fade-overlay-top') as HTMLElement
    
    // Only show desktop controls on non-touch devices
    const isTouchDevice = document.body.classList.contains('touch-layout')
    if (controlsContainer && !isTouchDevice) controlsContainer.style.display = 'grid'
    if (cameraInfo && !isTouchDevice) cameraInfo.style.display = 'flex'
    if (contentArea) {
      contentArea.style.display = 'none'
      contentArea.classList.remove('fade-in', 'has-scroll', 'reel-mode')
    }
    if (titleHeader) titleHeader.classList.remove('subpage-mode')
    if (navigationHelp) navigationHelp.style.display = 'flex'
    
    // Show mobile UI elements
    const mobileBottomSheet = document.querySelector('#mobile-bottom-sheet') as HTMLElement
    const mobileCameraReset = document.querySelector('#mobile-camera-reset') as HTMLElement
    const mobileEffectsButton = document.querySelector('#mobile-effects-button') as HTMLElement
    
    if (mobileBottomSheet) mobileBottomSheet.style.display = 'block'
    if (mobileCameraReset) mobileCameraReset.style.display = 'flex'
    if (mobileEffectsButton) mobileEffectsButton.style.display = 'block'
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
    // Hide controls container, camera info, show content area
    const controlsContainer = document.querySelector('.controls-container') as HTMLElement
    const cameraInfo = document.querySelector('.camera-info') as HTMLElement
    const contentArea = document.querySelector('#content-area') as HTMLElement
    const titleHeader = document.querySelector('.title-header') as HTMLElement
    const homeNavigation = document.querySelector('#home-navigation') as HTMLElement
    const navigationHelp = document.querySelector('#navigation-help') as HTMLElement
    
    if (controlsContainer) controlsContainer.style.display = 'none'
    if (cameraInfo) cameraInfo.style.display = 'none'
    if (navigationHelp) navigationHelp.style.display = 'none'
    
    // Hide mobile UI elements
    const mobileBottomSheet = document.querySelector('#mobile-bottom-sheet') as HTMLElement
    const mobileCameraReset = document.querySelector('#mobile-camera-reset') as HTMLElement
    const mobileEffectsButton = document.querySelector('#mobile-effects-button') as HTMLElement
    const mobileHorizontalEffectsPanel = document.querySelector('#mobile-horizontal-effects-panel') as HTMLElement
    const mobileEffectParametersBox = document.querySelector('#mobile-effect-parameters-box') as HTMLElement
    
    if (mobileBottomSheet) mobileBottomSheet.style.display = 'none'
    if (mobileCameraReset) mobileCameraReset.style.display = 'none'
    if (mobileEffectsButton) mobileEffectsButton.style.display = 'none'
    if (mobileHorizontalEffectsPanel) mobileHorizontalEffectsPanel.style.display = 'none'
    if (mobileEffectParametersBox) mobileEffectParametersBox.style.display = 'none'
    if (contentArea) {
      contentArea.style.display = 'block'
      // Add reel-mode class for full-screen video
      if (mode === 'reel') {
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
      case 'reel':
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
        
      case 'projects':
        const projectsConfig = this.projectsConfig()
        if (projectsConfig) {
          // Use external content loader for projects
          const contentLoader = (window as any).contentLoader
          content = contentLoader ? contentLoader.generateProjectsListingContent() : '<p>Projects loading...</p>'
        } else {
          content = '<p>Projects loading...</p>'
        }
        break
        
      case 'project-detail':
        const projectsConfigDetail = this.projectsConfig()
        if (projectsConfigDetail) {
          // Use external content loader for project details
          const contentLoader = (window as any).contentLoader
          content = contentLoader ? contentLoader.generateProjectDetailContent(this.currentProjectId()) : '<p>Project loading...</p>'
        } else {
          content = '<p>Project loading...</p>'
        }
        break
        
      case 'about':
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
        
      case 'contact':
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
      if (mode === 'reel') {
        this.initializeVideoControls()
      }
    }, 10)
  }
  
  private generatePageNavigation(currentMode: InterfaceMode): string {
    const pageOrder = ['reel', 'projects', 'about', 'contact'] as const
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
      : `<div class="nav-indicator" data-mode="home">
           <span class="nav-key">&lt;</span>
           <span class="nav-label"><span class="green-text">$</span><span class="white-text">HOME</span></span>
         </div>`
      
    const nextLink = nextMode
      ? `<div class="nav-indicator" data-mode="${nextMode}">
           <span class="nav-label"><span class="green-text">../</span><span class="white-text">${nextMode}</span></span>
           <span class="nav-key">&gt;</span>
         </div>`
      : `<div class="nav-indicator" data-mode="home">
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
        
        console.log('Navigation click detected, mode:', mode, 'currentMode:', this.currentInterfaceMode())
        
        if (mode) {
          // Update navigation text immediately for subpages
          if (this.currentInterfaceMode() !== 'home') {
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
          this.setCurrentProjectId(projectId)
          this.transitionToMode('project-detail')
        }
      })
    })
    
    // Initialize Glide.js carousel if we're in projects mode
    if (this.currentInterfaceMode() === 'projects') {
      setTimeout(() => {
        this.initializeProjectCards()
      }, 50)
    }
  }
  
  private updateNavigationText(newMode: InterfaceMode) {
    const subpageNav = document.querySelector('.subpage-navigation')
    if (subpageNav && newMode !== 'home') {
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
    if (mode === 'home') return
    
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
          
          console.log('Dynamic navigation click detected, mode:', mode, 'currentMode:', this.currentInterfaceMode())
          
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
    
    if (mode === 'home') {
      currentSection.innerHTML = ''
    } else if (mode === 'project-detail' && this.currentProjectId()) {
      currentSection.innerHTML = `<span class="green-text">/</span><span id="projects-link" class="clickable-path projects-text">projects</span><span class="green-text">/</span><span class="project-name-text">${this.currentProjectId()}</span>`
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
        this.transitionToMode('projects')
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
      this.transitionToMode('reel')
      this.closeHamburgerMenu()
    })
    
    hamburgerProjects?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode('projects')
      this.closeHamburgerMenu()
    })
    
    hamburgerAbout?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode('about')
      this.closeHamburgerMenu()
    })
    
    hamburgerContact?.addEventListener('click', (e) => {
      e.preventDefault()
      this.hideControlsImmediately()
      this.transitionToMode('contact')
      this.closeHamburgerMenu()
    })
    
    // Make home path clickable to return home
    homePath?.addEventListener('click', () => {
      this.transitionToMode('home')
    })
    
    // Make current section clickable for navigation
    this.setupCurrentSectionClick()
    
    // Setup hamburger menu toggle
    this.setupHamburgerMenu()
    
    // Removed: Click outside green elements to return home
    // Users now navigate intentionally via navigation elements only
    
    // Escape key to return home, arrow keys for navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentInterfaceMode() !== 'home') {
        this.transitionToMode('home')
      }
      
      const pageOrder = ['reel', 'projects', 'about', 'contact'] as const
      
      // Arrow key navigation
      if (this.currentInterfaceMode() === 'home') {
        // From home page, go to reel (left) or projects (right)
        if (e.key === 'ArrowLeft') {
          this.hideControlsImmediately()
          this.showDestinationNavigation('reel')
          this.transitionToMode('reel')
        } else if (e.key === 'ArrowRight') {
          this.hideControlsImmediately()
          this.showDestinationNavigation('projects')
          this.transitionToMode('projects')
        }
      } else {
        // Navigation when in subpages
        const currentIndex = pageOrder.indexOf(this.currentInterfaceMode() as any)
        
        if (e.key === 'ArrowLeft') {
          if (currentIndex > 0) {
            const newMode = pageOrder[currentIndex - 1]
            this.updateNavigationText(newMode)
            this.transitionToMode(newMode)
          } else {
            this.transitionToMode('home')
          }
        } else if (e.key === 'ArrowRight') {
          if (currentIndex < pageOrder.length - 1) {
            const newMode = pageOrder[currentIndex + 1]
            this.updateNavigationText(newMode)
            this.transitionToMode(newMode)
          } else {
            this.transitionToMode('home')
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
    const controlsContainer = document.querySelector('.controls-container') as HTMLElement
    const cameraInfo = document.querySelector('.camera-info') as HTMLElement
    const navigationHelp = document.querySelector('#navigation-help') as HTMLElement
    
    if (controlsContainer) {
      controlsContainer.style.display = 'none'
    }
    if (cameraInfo) {
      cameraInfo.style.display = 'none'
    }
    if (navigationHelp) {
      navigationHelp.style.display = 'none'
    }
    
    // Hide mobile UI elements immediately
    const mobileBottomSheet = document.querySelector('#mobile-bottom-sheet') as HTMLElement
    const mobileCameraReset = document.querySelector('#mobile-camera-reset') as HTMLElement
    const mobileEffectsButton = document.querySelector('#mobile-effects-button') as HTMLElement
    const mobileHorizontalEffectsPanel = document.querySelector('#mobile-horizontal-effects-panel') as HTMLElement
    const mobileEffectParametersBox = document.querySelector('#mobile-effect-parameters-box') as HTMLElement
    
    if (mobileBottomSheet) mobileBottomSheet.style.display = 'none'
    if (mobileCameraReset) mobileCameraReset.style.display = 'none'
    if (mobileEffectsButton) mobileEffectsButton.style.display = 'none'
    if (mobileHorizontalEffectsPanel) mobileHorizontalEffectsPanel.style.display = 'none'
    if (mobileEffectParametersBox) mobileEffectParametersBox.style.display = 'none'
  }
  
  private showNavigationAnimation(mode: InterfaceMode) {
    // Hide controls container
    const controlsContainer = document.querySelector('.controls-container') as HTMLElement
    if (controlsContainer) {
      controlsContainer.style.display = 'none'
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
    
    // Insert into the controls container
    const animationContainer = document.querySelector('.controls-container')
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
  
  private mouseDownPosition: { x: number, y: number } | null = null
  private isDragging = false
  private dragThreshold = 5 // pixels

  private handleCanvasMouseDown(event: MouseEvent) {
    // Only handle mousedown when on home page and canvas is interactive
    if (this.currentInterfaceMode() !== 'home') return
    
    const rect = this.canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // Store initial mouse position
    this.mouseDownPosition = { x: mouseX, y: mouseY }
    this.isDragging = false
    
    // Start look-at animation immediately - it will blend with any drag rotation
    this.handlePointCloudClick(mouseX, mouseY)
  }

  private handleCanvasMouseMove(event: MouseEvent) {
    if (!this.mouseDownPosition) return
    
    const rect = this.canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    
    // Check if mouse has moved beyond drag threshold
    const deltaX = mouseX - this.mouseDownPosition.x
    const deltaY = mouseY - this.mouseDownPosition.y
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    
    if (distance > this.dragThreshold) {
      this.isDragging = true
    }
  }

  private handleCanvasMouseUp() {
    if (!this.mouseDownPosition) return
    
    // Reset tracking variables (animation already started on mousedown)
    this.mouseDownPosition = null
    this.isDragging = false
  }
  
  private handleCanvasTouch(touch: Touch) {
    // Only handle touches when on home page and canvas is interactive
    if (this.currentInterfaceMode() !== 'home') return
    
    const rect = this.canvas.getBoundingClientRect()
    const touchX = touch.clientX - rect.left
    const touchY = touch.clientY - rect.top
    
    this.handlePointCloudClick(touchX, touchY)
  }
  
  private lastClickTime = 0
  private doubleClickDelay = 300 // ms

  private handlePointCloudClick(x: number, y: number) {
    if (!this.currentPointCloud) return
    
    const currentTime = Date.now()
    const isDoubleClick = currentTime - this.lastClickTime < this.doubleClickDelay
    this.lastClickTime = currentTime
    
    // Only process double clicks/taps
    if (!isDoubleClick) return
    
    // Convert screen coordinates to normalized device coordinates (-1 to 1)
    const mouse = new THREE.Vector2()
    mouse.x = (x / this.canvas.clientWidth) * 2 - 1
    mouse.y = -(y / this.canvas.clientHeight) * 2 + 1
    
    // Create raycaster
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    
    // Find nearest point within click radius
    const nearestPoint = this.findNearestPointToRay(raycaster)
    
    if (nearestPoint) {
      console.log('Double-clicked near point at:', nearestPoint)
      
      // Animate camera to look at the clicked point over 1 second
      this.animateToPosition(this.camera.position.clone(), nearestPoint, 1000)
      
      console.log('Animating to rotation/look-at center:', nearestPoint)
    }
  }
  
  private findNearestPointToRay(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    const clickRadius = 0.5 // Maximum distance from ray to consider a point
    let nearestPoint: THREE.Vector3 | null = null
    let nearestDistance = Infinity
    
    // Check for different object types in the scene
    let foundRenderableObjects = false
    
    this.scene.children.forEach(child => {
      if (child instanceof THREE.Points && child.geometry) {
        // Handle point clouds (low quality mode)
        foundRenderableObjects = true
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
      } else if (child instanceof SplatMesh) {
        // Handle Gaussian splats (high quality mode) using raycasting
        foundRenderableObjects = true
        console.log('Detected SplatMesh, using raycaster intersection')
        
        const intersects = raycaster.intersectObject(child)
        if (intersects.length > 0) {
          // Use the first intersection point
          nearestPoint = intersects[0].point.clone()
          console.log('SplatMesh intersection found at:', nearestPoint)
        } else {
          // Fallback to plane intersection if no direct intersection
          const targetDistance = this.camera.position.distanceTo(this.controls.target)
          nearestPoint = raycaster.ray.origin.clone().add(
            raycaster.ray.direction.clone().multiplyScalar(targetDistance)
          )
          console.log('SplatMesh fallback to plane intersection at:', nearestPoint)
        }
      }
    })
    
    // If no renderable objects found, use plane intersection
    if (!foundRenderableObjects) {
      // Create a plane at the current target depth for intersection
      const targetDistance = this.camera.position.distanceTo(this.controls.target)
      const intersectionPoint = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(targetDistance)
      )
      nearestPoint = intersectionPoint
      console.log('No renderable objects found, using plane intersection at:', nearestPoint)
    }
    
    return nearestPoint
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
          this.setCurrentProjectId(projectId)
          this.transitionToMode('project-detail')
        }
      })
    })
    
    // Handle read more button clicks
    readMoreButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation() // Prevent card click from firing
        const projectId = (e.currentTarget as HTMLElement).getAttribute('data-project-id')
        if (projectId) {
          this.setCurrentProjectId(projectId)
          this.transitionToMode('project-detail')
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

  private setupEffectsPanel(): void {
    console.log('🎯 Setting up EffectsPanel...')
    
    // Check if DOM is ready - check for child elements since main panel might be restructured
    const effectsPanelElement = document.getElementById('effects-panel')
    const effectsChainElement = document.getElementById('effects-chain')
    
    if (!effectsChainElement) {
      console.warn('Effects DOM not ready, delaying setup...', Date.now())
      setTimeout(() => this.setupEffectsPanel(), 100)
      return
    }
    
    if (!effectsPanelElement) {
      console.warn('Effects panel element missing but children exist - DOM restructuring detected')
    }
    
    console.log('Effects DOM ready, proceeding with setup...', Date.now())
    
    try {
      this.effectsPanel = new EffectsPanel(this.effectsChainManager)
      console.log('🎯 EffectsPanel created successfully:', !!this.effectsPanel)
      console.log('🎯 EffectsPanel stored in orbitalCamera:', !!this.effectsPanel)
      
      // Set up effects chain updates to propagate to the PostProcessingPass
      this.effectsChainManager.onChainUpdated(() => {
        this.updatePostProcessingChain()
      })
      
      // Set up parameter updates to also trigger post-processing updates
      this.effectsChainManager.onParameterUpdated(() => {
        this.updatePostProcessingChain()
      })
      
      // Initial update to sync any effects that were loaded during initialization
      setTimeout(() => {
        this.updatePostProcessingChain()
      }, 50)
      
      // Effects toggle is now handled by the EffectsPanel dropdown
      
      
      console.log('Effects panel initialized successfully')
    } catch (error) {
      console.warn('Effects panel initialization failed:', error)
      // Graceful fallback - set up essential chain updates even without UI panel
      this.effectsChainManager.onChainUpdated(() => {
        this.updatePostProcessingChain()
      })
      
      this.effectsChainManager.onParameterUpdated(() => {
        this.updatePostProcessingChain()
      })
      
      console.log('Effects system initialized without UI panel - programmatic effects still available')
    }
  }

  private updatePostProcessingChain(): void {
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass && postProcessingPass.setEffectsChain) {
      const enabledEffects = this.effectsChainManager.getEnabledEffects()
      postProcessingPass.setEffectsChain(enabledEffects)
      console.log('Effects chain updated:', enabledEffects.length, 'effects')
    } else {
      console.warn('PostProcessingPass not available for effects chain update')
    }
  }


  // Public methods for external access to effects system
  public getEffectsChainManager(): EffectsChainManager {
    return this.effectsChainManager
  }

  public getEffectsPanel(): EffectsPanel | null {
    return this.effectsPanel
  }

  // Scene State Management for Comprehensive Scene Sharing
  
  /**
   * Captures the complete current scene state including model, camera position, effects, and settings
   */
  public captureCurrentSceneState(): SceneState {
    const modelsConfig = this.modelsConfig()
    
    // Get current fog density from scene
    let fogDensity = 0.003 // default
    if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
      fogDensity = this.scene.fog.density
    }
    
    // Get current auto-rotation state
    const autoRotateCheckbox = document.getElementById('auto-rotate-toggle') as HTMLInputElement
    const autoRotation = autoRotateCheckbox ? autoRotateCheckbox.checked : this.autoRotationEnabled
    
    // Get sphere mode state and radius
    const sphereToggle = document.getElementById('sphere-toggle') as HTMLInputElement
    const sphereRadiusSlider = document.getElementById('sphere-radius') as HTMLInputElement
    const sphereMode = sphereToggle ? sphereToggle.checked : false
    const sphereRadius = sphereRadiusSlider ? parseFloat(sphereRadiusSlider.value) : 0.01
    
    // Get current quality from model manager
    const currentQuality = this.modelManager ? this.modelManager.getCurrentQuality() : 'low'
    
    // Get current background color
    let backgroundColor = '#151515' // default
    const backgroundColorPicker = document.getElementById('background-color-picker') as HTMLInputElement
    if (backgroundColorPicker) {
      backgroundColor = backgroundColorPicker.value
    } else if (this.scene.background instanceof THREE.Color) {
      backgroundColor = `#${this.scene.background.getHexString()}`
    }
    
    const sceneState: SceneState = {
      // Core model and quality
      modelKey: modelsConfig.currentModel,
      quality: currentQuality,
      
      // Camera state
      cameraPosition: this.vector3ToState(this.camera.position),
      cameraTarget: this.vector3ToState(this.controls.target),
      focalLength: (() => {
        const focalLengthSlider = document.querySelector('#focal-length') as HTMLInputElement
        return focalLengthSlider ? parseFloat(focalLengthSlider.value) : this.camera.fov
      })(),
      
      // Effects chain and UI state
      effectsChain: this.effectsChainManager.getEffectsChain().map(effect => ({
        id: effect.id,
        type: effect.type,
        enabled: effect.enabled,
        parameters: { ...effect.parameters },
        blendMode: effect.blendMode
      })),
      effectsDropdownValue: this.getCurrentEffectsDropdownValue(),
      
      // Scene settings
      pointSize: this.pointSize,
      sphereMode: sphereMode,
      sphereRadius: sphereMode ? sphereRadius : undefined,
      fogDensity: fogDensity,
      autoRotation: autoRotation,
      autoRotationSpeed: this.autoRotationSpeed,
      autoRotationDirection: this.autoRotationDirection,
      backgroundColor: backgroundColor,
      
      // Metadata
      timestamp: Date.now(),
      version: '1.0'
    }
    
    return sceneState
  }

  /**
   * Applies a complete scene state to restore a shared scene
   */
  public async applySceneState(sceneState: SceneState): Promise<void> {
    console.log('Applying scene state:', sceneState)
    
    try {
      // 1. Apply model and quality
      if (this.modelManager && sceneState.modelKey) {
        const modelsConfig = this.modelsConfig()
        if (modelsConfig.models[sceneState.modelKey]) {
          // Check if we need to load the model (either different model or no model currently loaded)
          const needsModelLoad = modelsConfig.currentModel !== sceneState.modelKey || 
                                !this.hasLoadedModel()
          
          if (needsModelLoad) {
            console.log('Scene loading requires model load:', sceneState.modelKey, 
                       'hasLoadedModel:', this.hasLoadedModel())
            await this.modelManager.switchToModel(sceneState.modelKey)
          } else {
            console.log('Scene loading - model already loaded:', sceneState.modelKey)
          }
          
          // Switch quality if different
          if (this.modelManager.getCurrentQuality() !== sceneState.quality) {
            this.modelManager.switchToQuality(sceneState.quality)
          }
        }
      }
      
      // 2. Apply camera position and target
      this.camera.position.copy(this.stateToVector3(sceneState.cameraPosition))
      this.controls.target.copy(this.stateToVector3(sceneState.cameraTarget))
      this.updateFocalLength(sceneState.focalLength)
      this.controls.update()
      
      // Update focal length UI controls
      const focalLengthSlider = document.querySelector('#focal-length') as HTMLInputElement
      const focalLengthValue = document.querySelector('#focal-length-value') as HTMLSpanElement
      if (focalLengthSlider) {
        focalLengthSlider.value = sceneState.focalLength.toString()
      }
      if (focalLengthValue) {
        focalLengthValue.textContent = sceneState.focalLength.toString()
      }
      
      // Update mobile focal length slider if it exists
      const mobileFocalLengthCard = document.getElementById('mobile-focal-length-card') as HTMLElement
      if (mobileFocalLengthCard && (mobileFocalLengthCard as any).updateValue) {
        (mobileFocalLengthCard as any).updateValue(sceneState.focalLength.toString())
      }
      
      // 3. Apply effects chain
      this.effectsChainManager.clearEffects()
      this.effectsChainManager.setLoadingFromScene(true) // Prevent auto-expansion
      
      for (const effectState of sceneState.effectsChain) {
        const effect = this.effectsChainManager.addEffect(effectState.type as EffectType)
        if (effect) {
          effect.enabled = effectState.enabled
          // Apply parameters
          Object.entries(effectState.parameters).forEach(([key, value]) => {
            this.effectsChainManager.updateEffectParameter(effect.id, key, value)
          })
          // Apply blend mode if available
          if (effectState.blendMode) {
            this.effectsChainManager.updateEffectBlendMode(effect.id, effectState.blendMode)
          }
        }
      }
      
      this.effectsChainManager.setLoadingFromScene(false) // Re-enable auto-expansion
      
      // Clear expanded effects so scene-loaded effects start collapsed
      if (this.effectsPanel) {
        this.effectsPanel.clearExpandedEffects()
      }
      
      // Apply effects dropdown value if available
      if (sceneState.effectsDropdownValue) {
        const effectsDropdown = document.querySelector('#effects-main-dropdown') as HTMLSelectElement
        if (effectsDropdown) {
          effectsDropdown.value = sceneState.effectsDropdownValue
        }
        
        // Update mobile preset selector
        const mobilePresetName = document.getElementById('mobile-preset-name') as HTMLSpanElement
        if (mobilePresetName) {
          // Capitalize the preset name for display
          const displayName = sceneState.effectsDropdownValue === 'none' ? 'None' : 
                             sceneState.effectsDropdownValue.charAt(0).toUpperCase() + sceneState.effectsDropdownValue.slice(1)
          mobilePresetName.textContent = displayName
        }
      }
      
      // 4. Apply scene settings
      this.pointSize = sceneState.pointSize
      this.updatePointSize()
      
      // Apply sphere mode and radius
      const sphereToggle = document.getElementById('sphere-toggle') as HTMLInputElement
      if (sphereToggle) {
        sphereToggle.checked = sceneState.sphereMode
      }
      
      // Set sphere mode directly instead of dispatching events to avoid toggle bug
      if (this.modelManager) {
        // Force proper sphere state by toggling if needed for gallery scenes
        if (sceneState.sphereMode) {
          // Ensure we start from a clean state, then enable spheres
          this.modelManager.setSphereMode(false)  // Force disable first
          this.modelManager.setSphereMode(true)   // Then enable to trigger conversion
        } else {
          this.modelManager.setSphereMode(false)
        }
        
        // Ensure UI controls are properly synchronized after setting sphere mode
        this.toggleSizeControls(sceneState.sphereMode)
        
        // Update sphere detail controls visibility
        const detailControl = document.querySelector('.sphere-detail-control') as HTMLElement
        if (detailControl) {
          detailControl.style.display = sceneState.sphereMode ? 'flex' : 'none'
        }
        
        // Refresh mobile UI to reflect sphere mode change
        if (typeof refreshHorizontalSettingsOptions === 'function') {
          refreshHorizontalSettingsOptions()
        }
      }
      
      if (sceneState.sphereMode && sceneState.sphereRadius) {
        const sphereRadiusSlider = document.getElementById('sphere-radius') as HTMLInputElement
        if (sphereRadiusSlider) {
          sphereRadiusSlider.value = sceneState.sphereRadius.toString()
          sphereRadiusSlider.dispatchEvent(new Event('input'))
        }
      }
      
      // Apply fog density
      const fogDensitySlider = document.getElementById('fog-density') as HTMLInputElement
      if (fogDensitySlider) {
        fogDensitySlider.value = sceneState.fogDensity.toString()
        fogDensitySlider.dispatchEvent(new Event('input'))
      }
      
      // Apply auto-rotation
      const autoRotateCheckbox = document.getElementById('auto-rotate-toggle') as HTMLInputElement
      if (autoRotateCheckbox) {
        autoRotateCheckbox.checked = sceneState.autoRotation
        autoRotateCheckbox.dispatchEvent(new Event('change'))
      }
      
      // Update mobile auto-rotate toggle
      const mobileAutoRotateToggle = document.getElementById('mobile-auto-rotate-toggle') as HTMLInputElement
      if (mobileAutoRotateToggle) {
        mobileAutoRotateToggle.checked = sceneState.autoRotation
      }
      
      // Apply auto-rotation speed and direction (with fallback for older scene states)
      if (sceneState.autoRotationSpeed !== undefined && sceneState.autoRotationDirection !== undefined) {
        // Calculate bidirectional value from stored speed and direction
        const bidirectionalValue = sceneState.autoRotationSpeed * sceneState.autoRotationDirection
        console.log('Scene state restoration: speed =', sceneState.autoRotationSpeed, 'direction =', sceneState.autoRotationDirection, 'bidirectional =', bidirectionalValue)
        
        // Use the new bidirectional method to set everything consistently
        this.setBidirectionalRotationSpeed(bidirectionalValue)
      } else {
        // Fallback: if no rotation speed/direction in scene state, default to 0 (disabled)
        console.log('Scene state missing rotation speed/direction, defaulting to 0')
        this.setBidirectionalRotationSpeed(0)
      }
      
      // Apply background color if present
      if (sceneState.backgroundColor) {
        const backgroundColorPicker = document.getElementById('background-color-picker') as HTMLInputElement
        if (backgroundColorPicker) {
          backgroundColorPicker.value = sceneState.backgroundColor
          backgroundColorPicker.dispatchEvent(new Event('input'))
        }
      }
      
      // Always update UI controls with current bidirectional value
      const currentBidirectionalValue = this.getBidirectionalRotationSpeed()
      console.log('Updating UI controls with bidirectional value:', currentBidirectionalValue)
      
      // Update desktop controls
      const speedSlider = document.getElementById('auto-rotation-speed') as HTMLInputElement
      const speedValue = document.getElementById('auto-rotation-speed-value') as HTMLSpanElement
      if (speedSlider && speedValue) {
        speedSlider.value = currentBidirectionalValue.toString()
        speedValue.textContent = currentBidirectionalValue.toFixed(2)
      }
      
      // Update mobile controls
      const mobileSpeedSlider = document.getElementById('mobile-rotation-speed') as HTMLInputElement
      const mobileSpeedValue = document.getElementById('mobile-rotation-speed-value') as HTMLElement
      console.log('Mobile elements found:', { 
        slider: !!mobileSpeedSlider, 
        valueDisplay: !!mobileSpeedValue,
        sliderValue: mobileSpeedSlider?.value,
        valueText: mobileSpeedValue?.textContent
      })
      
      if (mobileSpeedSlider) {
        mobileSpeedSlider.value = currentBidirectionalValue.toString()
        console.log('Updated mobile slider to:', currentBidirectionalValue)
        
        // Update the value display
        if (mobileSpeedValue) {
          mobileSpeedValue.textContent = currentBidirectionalValue.toFixed(2)
          console.log('Updated mobile value display to:', currentBidirectionalValue.toFixed(2))
        }
        
        // Trigger updateMobileRotationFill if available
        if ((window as any).updateMobileRotationFill) {
          (window as any).updateMobileRotationFill()
          console.log('Triggered mobile rotation fill update')
        }
      }
      
      // Update mobile slider card if it exists (this is the dynamically created one)
      const mobileSliderCard = document.getElementById('mobile-rotation-speed-card') as HTMLElement
      console.log('Mobile slider card found:', !!mobileSliderCard, 'has updateValue:', !!(mobileSliderCard as any)?.updateValue)
      if (mobileSliderCard && (mobileSliderCard as any).updateValue) {
        (mobileSliderCard as any).updateValue(currentBidirectionalValue.toString())
        console.log('Updated mobile slider card to:', currentBidirectionalValue)
      }
      
      // Update UI elements
      this.updateDisplayNameField()
      this.updateModelDropdown()
      this.updateQualityDropdown()
      this.updateEffectsDropdown()
      
      // Refresh effects panel UI to sync with loaded effects
      this.effectsPanel?.refresh()
      
      // Refresh mobile horizontal effects chain
      if ((window as any).refreshHorizontalEffects) {
        (window as any).refreshHorizontalEffects()
      }
      
      console.log('Scene state applied successfully')
      
    } catch (error) {
      console.error('Failed to apply scene state:', error)
      throw error
    }
  }

  /**
   * Generates a shareable URL containing the complete scene state
   */
  public generateShareableLink(): string {
    const sceneState = this.captureCurrentSceneState()
    
    // Compress and encode the scene state
    const sceneData = JSON.stringify(sceneState)
    const encodedScene = btoa(sceneData) // Base64 encoding
    
    // Create URL with scene parameter
    const baseUrl = window.location.origin + window.location.pathname
    const shareUrl = `${baseUrl}?scene=${encodedScene}`
    
    return shareUrl
  }

  /**
   * Copies the current scene as a shareable link to clipboard
   */
  public async copySceneToClipboard(): Promise<boolean> {
    try {
      const shareUrl = this.generateShareableLink()
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        console.log('Scene link copied to clipboard (modern API):', shareUrl)
        return true
      }
      
      // Fallback to older document.execCommand method
      if (this.fallbackCopyToClipboard(shareUrl)) {
        console.log('Scene link copied to clipboard (fallback):', shareUrl)
        return true
      }
      
      // If both fail, return false but don't throw
      console.warn('Clipboard access not available, copy failed')
      return false
      
    } catch (error) {
      console.error('Failed to copy scene link to clipboard:', error)
      return false
    }
  }

  /**
   * Fallback clipboard copy method using document.execCommand
   */
  private fallbackCopyToClipboard(text: string): boolean {
    try {
      // Create a temporary textarea element
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      
      // Select and copy the text
      textArea.focus()
      textArea.select()
      
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      
      return successful
    } catch (error) {
      console.error('Fallback clipboard copy failed:', error)
      return false
    }
  }

  /**
   * Loads the default scene from the scenes configuration
   */
  public async loadDefaultScene(): Promise<boolean> {
    try {
      const scenesCollection = await this.loadScenesCollection()
      if (!scenesCollection || !scenesCollection.defaultScene) {
        console.log('No default scene specified')
        return false
      }

      const defaultSceneKey = scenesCollection.defaultScene
      const sceneDefinition = scenesCollection.scenes[defaultSceneKey]
      if (!sceneDefinition) {
        console.warn('Default scene not found:', defaultSceneKey)
        return false
      }

      console.log('Loading default scene:', sceneDefinition.name)
      
      // Apply the scene
      await this.applySceneState(sceneDefinition)
      
      return true
    } catch (error) {
      console.error('Failed to load default scene:', error)
      return false
    }
  }

  /**
   * Parses and applies scene state from URL parameters
   */
  public async loadSceneFromUrl(): Promise<boolean> {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const sceneParam = urlParams.get('scene')
      
      if (!sceneParam) {
        return false // No scene parameter found
      }
      
      // Decode and parse scene state
      const sceneData = atob(sceneParam) // Base64 decoding
      const sceneState: SceneState = JSON.parse(sceneData)
      
      // Validate scene state has required properties
      if (!sceneState.modelKey || !sceneState.cameraPosition || !sceneState.cameraTarget) {
        console.warn('Invalid scene state in URL:', sceneState)
        return false
      }
      
      // Apply the scene state
      await this.applySceneState(sceneState)
      
      // Remove scene parameter from URL to clean it up
      urlParams.delete('scene')
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '')
      window.history.replaceState({}, '', newUrl)
      
      console.log('Scene loaded from URL successfully')
      return true
      
    } catch (error) {
      console.error('Failed to load scene from URL:', error)
      return false
    }
  }

  /**
   * Helper method to convert THREE.Vector3 to serializable state
   */
  private vector3ToState(vector: THREE.Vector3): Vector3State {
    return {
      x: Math.round(vector.x * 1000) / 1000, // Round to 3 decimal places
      y: Math.round(vector.y * 1000) / 1000,
      z: Math.round(vector.z * 1000) / 1000
    }
  }

  /**
   * Helper method to convert serializable state to THREE.Vector3
   */
  private stateToVector3(state: Vector3State): THREE.Vector3 {
    return new THREE.Vector3(state.x, state.y, state.z)
  }

  /**
   * Loads scenes collection from config file
   */
  public async loadScenesCollection(): Promise<any> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}scenes-config.json`)
      if (!response.ok) {
        throw new Error(`Failed to fetch scenes config: ${response.status}`)
      }
      const scenesCollection = await response.json()
      console.log('Scenes collection loaded:', Object.keys(scenesCollection.scenes).length, 'scenes')
      return scenesCollection
    } catch (error) {
      console.warn('Failed to load scenes collection:', error)
      return null
    }
  }

  /**
   * Loads a random scene from the collection
   */
  public async loadRandomScene(): Promise<boolean> {
    try {
      const scenesCollection = await this.loadScenesCollection()
      if (!scenesCollection || !scenesCollection.randomScenes || scenesCollection.randomScenes.length === 0) {
        console.log('No random scenes available')
        return false
      }

      // Pick a random scene from the collection
      const randomSceneKey = scenesCollection.randomScenes[
        Math.floor(Math.random() * scenesCollection.randomScenes.length)
      ]
      
      const sceneDefinition = scenesCollection.scenes[randomSceneKey]
      if (!sceneDefinition) {
        console.warn('Random scene not found:', randomSceneKey)
        return false
      }

      console.log('Loading random scene:', sceneDefinition.name)
      
      // Apply the scene
      await this.applySceneState(sceneDefinition)
      
      // Update scene dropdown to show the selected scene
      const sceneDropdown = document.getElementById('scene-dropdown') as HTMLSelectElement
      if (sceneDropdown) {
        sceneDropdown.value = randomSceneKey
      }
      
      return true
    } catch (error) {
      console.error('Failed to load random scene:', error)
      return false
    }
  }

  /**
   * Loads a random scene from the gallery based on the manifest's randomCandidates
   */
  public async loadRandomGalleryScene(): Promise<boolean> {
    try {
      // Access the gallery manager from the global window object
      const galleryManager = (window as any).galleryManager
      if (!galleryManager) {
        console.warn('Gallery manager not available')
        return false
      }

      // Load the gallery manifest to get random candidates
      const manifestResponse = await fetch('/gallery/manifest.json')
      if (!manifestResponse.ok) {
        console.warn('Failed to load gallery manifest')
        return false
      }

      const manifest = await manifestResponse.json()
      if (!manifest.randomCandidates || manifest.randomCandidates.length === 0) {
        console.log('No random candidates available in gallery manifest')
        return false
      }

      // Get all gallery items, ensure gallery is loaded
      let galleryItems = galleryManager.getItems()
      
      // If no items are available, try to scan gallery files first
      if (!galleryItems || galleryItems.length === 0) {
        await galleryManager.scanGalleryFiles()
        galleryItems = galleryManager.getItems()
        
        if (!galleryItems || galleryItems.length === 0) {
          console.log('No gallery items available')
          return false
        }
      }

      // Filter gallery items to only include random candidates
      const candidateItems = galleryItems.filter((item: any) => 
        manifest.randomCandidates.includes(item.filename)
      )

      if (candidateItems.length === 0) {
        console.log('No gallery items match the random candidates list')
        return false
      }

      // Pick a random candidate
      const randomIndex = Math.floor(Math.random() * candidateItems.length)
      const selectedItem = candidateItems[randomIndex]

      console.log('Loading random gallery scene:', selectedItem.info.name)

      // Extract scene state from the gallery item's metadata
      const sceneState = selectedItem.metadata.sceneState
      if (!sceneState) {
        console.warn('Selected gallery item has no scene state metadata')
        return false
      }

      // Apply the scene state
      await this.applySceneState(sceneState)

      // No scene dropdown update needed since gallery scenes aren't in the dropdown
      
      return true
    } catch (error) {
      console.error('Failed to load random gallery scene:', error)
      return false
    }
  }

  /**
   * Loads a specific scene by key from the collection
   */
  public async loadSceneByKey(sceneKey: string): Promise<boolean> {
    try {
      const scenesCollection = await this.loadScenesCollection()
      if (!scenesCollection || !scenesCollection.scenes[sceneKey]) {
        console.warn('Scene not found:', sceneKey)
        return false
      }

      const sceneDefinition = scenesCollection.scenes[sceneKey]
      console.log('Loading scene:', sceneDefinition.name)
      
      await this.applySceneState(sceneDefinition)
      return true
    } catch (error) {
      console.error('Failed to load scene:', error)
      return false
    }
  }
  
}