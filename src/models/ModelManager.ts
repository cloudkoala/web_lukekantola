import * as THREE from 'three'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { Viewer as GaussianSplatViewer } from '@mkkellogg/gaussian-splats-3d'
import type { ModelsConfig } from '../types'

export class ModelManager {
  private modelsConfig: ModelsConfig | null = null
  private isModelSwitching: boolean = false
  private isQualitySwitching: boolean = false
  private currentRenderObject: THREE.Points | THREE.Object3D | null = null
  private currentQuality: 'low' | 'high' = 'low'
  
  // Injected dependencies
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: any // OrbitControls
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private progressEl: HTMLDivElement
  private progressFill: HTMLDivElement
  private progressiveLoader: any
  private orbitalCamera: any // OrbitalCameraSystem

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    controls: any, // OrbitControls
    canvas: HTMLCanvasElement,
    renderer: THREE.WebGLRenderer,
    progressEl: HTMLDivElement,
    progressFill: HTMLDivElement,
    progressiveLoader: any,
    orbitalCamera: any // OrbitalCameraSystem
  ) {
    this.scene = scene
    this.camera = camera
    this.controls = controls
    this.canvas = canvas
    this.renderer = renderer
    this.progressEl = progressEl
    this.progressFill = progressFill
    this.progressiveLoader = progressiveLoader
    this.orbitalCamera = orbitalCamera
  }

  async loadModelsConfig() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}models-config.json`)
      this.modelsConfig = await response.json()
      console.log('Models configuration loaded:', this.modelsConfig)
    } catch (error) {
      console.error('Failed to load models configuration:', error)
      // Fallback to localStorage
      const saved = localStorage.getItem('modelsConfig')
      if (saved) {
        this.modelsConfig = JSON.parse(saved)
        console.log('Models configuration loaded from localStorage')
      } else {
        console.error('No models configuration available')
      }
    }
  }

  getModelsConfig(): ModelsConfig | null {
    return this.modelsConfig
  }

  getCurrentQuality(): 'low' | 'high' {
    return this.currentQuality
  }

  setCurrentQuality(quality: 'low' | 'high') {
    this.currentQuality = quality
  }

  isCurrentlyModelSwitching(): boolean {
    return this.isModelSwitching
  }

  isCurrentlyQualitySwitching(): boolean {
    return this.isQualitySwitching
  }

  getCurrentRenderObject(): THREE.Points | THREE.Object3D | null {
    return this.currentRenderObject
  }

  setCurrentRenderObject(object: THREE.Points | THREE.Object3D | null) {
    this.currentRenderObject = object
  }

  setupModelDropdown() {
    const dropdown = document.querySelector('#model-dropdown') as HTMLSelectElement
    if (!dropdown || !this.modelsConfig) return
    
    // Populate dropdown options with display names from config
    Object.keys(this.modelsConfig.models).forEach(modelKey => {
      const option = dropdown.querySelector(`option[value="${modelKey}"]`) as HTMLOptionElement
      if (option) {
        option.textContent = this.modelsConfig!.models[modelKey].displayName
      }
    })
    
    dropdown.addEventListener('change', (e) => {
      const newModel = (e.target as HTMLSelectElement).value
      this.switchToModel(newModel)
      this.updateQualityDropdown()
    })
    
    // Set initial selection
    dropdown.value = this.modelsConfig.currentModel
  }

  setupQualityDropdown() {
    const dropdown = document.querySelector('#quality-dropdown') as HTMLSelectElement
    if (!dropdown) return
    
    dropdown.addEventListener('change', (e) => {
      const newQuality = (e.target as HTMLSelectElement).value as 'low' | 'high'
      this.switchToQuality(newQuality)
    })
    
    // Set initial selection
    dropdown.value = this.currentQuality
    
    // Update initial state
    this.updateQualityDropdown()
  }

  updateQualityDropdown() {
    const dropdown = document.querySelector('#quality-dropdown') as HTMLSelectElement
    const qualitySelector = document.querySelector('.quality-selector') as HTMLElement
    if (!dropdown || !qualitySelector || !this.modelsConfig) return
    
    const currentModel = this.modelsConfig.models[this.modelsConfig.currentModel]
    const hasGaussianSplat = currentModel && currentModel.gaussianSplatFile
    
    // Hide entire quality selector if no high quality available
    if (hasGaussianSplat) {
      qualitySelector.style.display = 'block'
      dropdown.disabled = false
    } else {
      qualitySelector.style.display = 'none'
      // Switch to low quality if we were on high
      if (this.currentQuality === 'high') {
        this.currentQuality = 'low'
        dropdown.value = 'low'
      }
    }
  }

  switchToQuality(quality: 'low' | 'high') {
    if (!this.modelsConfig) return
    
    const currentModel = this.modelsConfig.models[this.modelsConfig.currentModel]
    
    // Don't allow high quality if no Gaussian splat file available
    if (quality === 'high' && (!currentModel || !currentModel.gaussianSplatFile)) {
      console.log('High quality not available for this model')
      return
    }
    
    // If switching from high to low, revert the Z scaling on animation config
    if (this.currentQuality === 'high' && quality === 'low') {
      if (currentModel && currentModel.loadingAnimation) {
        const scaledEndZ = currentModel.loadingAnimation.endPosition.z
        const originalEndZ = scaledEndZ / 10
        currentModel.loadingAnimation.endPosition.z = originalEndZ
        console.log('Reverted loading animation end Z position from 10x scaling:', scaledEndZ, '->', originalEndZ)
      }
      
      // Also scale down current camera Z position
      const scaledCameraZ = this.camera.position.z
      const originalCameraZ = scaledCameraZ / 10
      this.camera.position.z = originalCameraZ
      this.controls.update()
      console.log('Reverted camera Z position from 10x scaling:', scaledCameraZ, '->', originalCameraZ)
      
      // Restore solid background for point clouds
      this.scene.background = new THREE.Color(0x151515)
      console.log('Restored solid background for low quality mode')
    }
    
    // If switching to high quality, set transparent background for Gaussian splats
    if (this.currentQuality === 'low' && quality === 'high') {
      this.scene.background = null
      console.log('Set transparent background for high quality mode')
    }
    
    this.currentQuality = quality
    this.isQualitySwitching = true
    
    // Reload the current model with new quality
    this.switchToModel(this.modelsConfig.currentModel)
    
    // Update point size control visibility
    this.updatePointSizeControlVisibility()
  }

  updatePointSizeControlVisibility() {
    const pointSizeControl = document.querySelector('.point-size-control') as HTMLElement
    if (pointSizeControl) {
      pointSizeControl.style.display = this.currentQuality === 'high' ? 'none' : 'flex'
    }
  }

  async switchToModel(modelKey: string) {
    if (!this.modelsConfig || !this.modelsConfig.models[modelKey]) {
      console.error('Model not found:', modelKey)
      return
    }
    
    // Check if this is a model switch (not just a quality switch)
    const isActualModelSwitch = this.modelsConfig.currentModel !== modelKey
    
    this.modelsConfig.currentModel = modelKey
    const model = this.modelsConfig.models[modelKey]
    this.isModelSwitching = true
    
    // Default to low quality when switching between different models
    if (isActualModelSwitch && !this.isQualitySwitching) {
      this.currentQuality = 'low'
      // Update quality dropdown to reflect the change
      const qualityDropdown = document.querySelector('#quality-dropdown') as HTMLSelectElement
      if (qualityDropdown) {
        qualityDropdown.value = 'low'
      }
      // Update point size control visibility
      this.updatePointSizeControlVisibility()
      console.log('Defaulting to low quality for new model:', model.displayName)
    }
    
    // Cancel any ongoing progressive loading from previous model
    this.progressiveLoader.cancelLoading()
    
    console.log('Switching to model:', model.displayName)
    
    // Update display name field and load defaults
    this.orbitalCamera.updateDisplayNameField()
    this.orbitalCamera.loadDefaultPointSize()
    this.orbitalCamera.loadDefaultFocalLength()
    
    // Clear current scene - but preserve point cloud when upgrading to high quality
    const isUpgradingToHighQuality = this.isQualitySwitching && this.currentQuality === 'high' && 
                                     this.currentRenderObject instanceof THREE.Points
    
    if (this.currentRenderObject && !isUpgradingToHighQuality) {
      // Check if it's a Gaussian splat viewer
      if ((this.currentRenderObject as any).dispose && typeof (this.currentRenderObject as any).dispose === 'function') {
        console.log('Disposing Gaussian splat viewer')
        ;(this.currentRenderObject as any).dispose()
        
        // Remove splat canvas
        const splatCanvas = document.getElementById('splat-canvas')
        if (splatCanvas) {
          splatCanvas.remove()
        }
        
        // Restore main Three.js canvas
        this.canvas.style.display = 'block'
        
        // Restore UI elements that were hidden for splat mode
        const elementsToRestore = [
          '.point-size-control',
          '.camera-info', 
          '#home-navigation',
          '.navigation-help'
        ]
        elementsToRestore.forEach(selector => {
          const element = document.querySelector(selector) as HTMLElement
          if (element) {
            if (selector === '#home-navigation') {
              // Home navigation needs explicit flex display and visibility
              element.style.display = 'flex'
              element.style.visibility = 'visible'
            } else {
              element.style.display = ''
            }
          }
        })
      } else {
        // Regular Three.js object
        this.scene.remove(this.currentRenderObject)
      }
      this.currentRenderObject = null
    }
    
    // Clear any existing point clouds or other objects (except when upgrading to high quality)
    if (!isUpgradingToHighQuality) {
      const existingObjects = this.scene.children.filter(child => 
        child instanceof THREE.Points || 
        (child.type === 'Mesh' && child.userData?.isSplatMesh)
      )
      existingObjects.forEach(obj => this.scene.remove(obj))
    }
    
    // Clear camera system references
    this.orbitalCamera.setCurrentRenderObject(new THREE.Object3D()) // Clear reference
    
    // Only show loading screen for high quality Gaussian splats
    const willLoadGaussianSplat = this.currentQuality === 'high' && model.gaussianSplatFile
    if (willLoadGaussianSplat) {
      this.progressEl.style.display = 'flex'
      this.progressFill.style.width = '0%'
      this.progressEl.querySelector('p')!.textContent = `Loading ${model.displayName}...`
    } else {
      // Ensure loading screen is hidden for point clouds
      this.progressEl.style.display = 'none'
    }
    
    // Load new model
    await this.loadModelByFileName(model.fileName)
  }

  async loadModelByFileName(fileName: string) {
    if (!this.modelsConfig) return
    
    const currentModel = this.modelsConfig.models[this.modelsConfig.currentModel]
    if (!currentModel) {
      console.error('Current model not found in configuration')
      return
    }
    
    if (currentModel.renderType === 'gaussian-splat') {
      // Load with Gaussian splat viewer
      await this.loadGaussianSplat(fileName)
    } else if (this.currentQuality === 'high' && currentModel.gaussianSplatFile) {
      // Load dedicated Gaussian splat file for high quality
      await this.loadGaussianSplat(currentModel.gaussianSplatFile)
    } else {
      // Load point cloud version
      await this.loadPointCloudByFileName(fileName)
    }
  }

  async loadPointCloudByFileName(fileName: string) {
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
        this.progressEl.style.display = 'none'
        
        // Clear any existing point clouds
        const existingPointClouds = this.scene.children.filter(child => child instanceof THREE.Points)
        existingPointClouds.forEach(obj => this.scene.remove(obj))
        
        // Set model rotation before loading chunks
        const currentModel = this.modelsConfig!.models[this.modelsConfig!.currentModel]
        if (currentModel && currentModel.rotation) {
          this.progressiveLoader.setModelRotation(currentModel.rotation)
        } else {
          this.progressiveLoader.setModelRotation(null)
        }
        
        // Start loading animation immediately before chunks appear
        if (this.isModelSwitching && !this.isQualitySwitching) {
          this.orbitalCamera.startLoadingAnimation()
        }
        
        // Setup progressive loader callbacks
        this.progressiveLoader.setOnChunkLoaded((loaded: number, total: number) => {
          console.log(`Progressive loading: ${loaded}/${total} chunks loaded`)
          // Update point size for all loaded chunks to match orbital camera setting
          this.progressiveLoader.setPointSize(this.orbitalCamera.pointSize)
        })
        
        this.progressiveLoader.setOnLoadComplete(() => {
          console.log('Progressive loading complete!')
          
          // Register the first chunk with orbital camera system for interactions
          const loadedPointClouds = this.progressiveLoader.getLoadedPointClouds()
          if (loadedPointClouds.length > 0) {
            this.orbitalCamera.setCurrentPointCloud(loadedPointClouds[0])
          }
          
          // Reset switching flags
          if (this.isModelSwitching) {
            this.isModelSwitching = false
          }
          if (this.isQualitySwitching) {
            this.isQualitySwitching = false
          }
        })
        
        // Start progressive loading
        await this.progressiveLoader.loadChunkedModel(manifestPath)
        
      } else {
        // No chunked version found, fall back to regular loading
        console.log('No chunked version found, loading single file...')
        // Cancel any ongoing progressive loading
        this.progressiveLoader.cancelLoading()
        this.loadSinglePointCloud(fileName)
      }
      
    } catch (error) {
      console.log('Error checking for chunked version, falling back to single file loading:', error)
      // Cancel any ongoing progressive loading
      this.progressiveLoader.cancelLoading()
      this.loadSinglePointCloud(fileName)
    }
  }

  loadSinglePointCloud(fileName: string) {
    const loader = new PLYLoader()
    
    console.log('Loading single point cloud file:', fileName)
    
    try {
      const fullPath = this.getModelPath(fileName)
      loader.load(
        `${import.meta.env.BASE_URL}${fullPath}`,
        (geometry: THREE.BufferGeometry) => this.onLoad(geometry),
        (progress: ProgressEvent) => this.onStreamingProgress(progress),
        (error: any) => this.onError(error)
      )
    } catch (error) {
      console.error('Failed to load point cloud:', error)
      // Show error briefly, then hide
      this.progressEl.style.display = 'flex'
      this.progressEl.querySelector('p')!.textContent = 'Failed to load point cloud'
      setTimeout(() => {
        this.progressEl.style.display = 'none'
      }, 2000)
    }
  }

  async loadGaussianSplat(fileName: string) {
    try {
      console.log('Loading real Gaussian splat:', fileName)
      
      // Set transparent background for Gaussian splat rendering
      this.scene.background = null
      console.log('Set scene background to transparent for Gaussian splat')
      
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
      this.canvas.style.display = 'block'
      this.canvas.style.zIndex = '1'
      
      const viewer = new GaussianSplatViewer({
        'canvas': this.canvas,
        'renderer': this.renderer,
        'camera': this.camera,
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
      if (this.isQualitySwitching && this.currentQuality === 'high') {
        const existingPointClouds = this.scene.children.filter(child => child instanceof THREE.Points)
        existingPointClouds.forEach(obj => {
          console.log('Removing point cloud before starting Gaussian splat viewer')
          this.scene.remove(obj)
        })
      }
      
      // Start the viewer first
      await viewer.start()
      
      // Add the splat scene
      const fullPath = this.getModelPath(fileName, true)
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
      const originalZ = this.camera.position.z
      this.camera.position.z = this.camera.position.z * 10
      this.controls.update()
      
      console.log('Scaled camera Z position for Gaussian splat by 10x')
      console.log('Original Z:', originalZ, '-> Scaled Z:', this.camera.position.z)
      console.log('Our camera position:', this.camera.position)
      console.log('Our camera target:', this.controls.target)
      
      console.log('Real Gaussian splat loaded successfully!')
      console.log('Canvas controls - try click and drag to orbit, scroll to zoom')
      
      // Store viewer reference globally for cleanup
      this.currentRenderObject = viewer as any
      
      // Hide loading screen
      this.progressEl.style.display = 'none'
      
      // Trigger loading animation if switching models (but not quality)
      if (this.isModelSwitching && !this.isQualitySwitching) {
        // For high quality models, scale the landing Z position by 10
        if (this.currentQuality === 'high') {
          const currentModel = this.modelsConfig!.models[this.modelsConfig!.currentModel]
          if (currentModel && currentModel.loadingAnimation) {
            const originalEndZ = currentModel.loadingAnimation.endPosition.z
            currentModel.loadingAnimation.endPosition.z = originalEndZ * 10
            console.log('Scaled loading animation end Z position by 10x:', originalEndZ, '->', currentModel.loadingAnimation.endPosition.z)
          }
        }
        this.orbitalCamera.startLoadingAnimation()
      }
      if (this.isModelSwitching) {
        this.isModelSwitching = false
      }
      if (this.isQualitySwitching) {
        this.isQualitySwitching = false
      }
      
    } catch (error) {
      console.error('Failed to load real Gaussian splat:', error)
      console.error('Gaussian Splat loading failed - no fallback enabled')
      
      // Restore solid background on error
      this.scene.background = new THREE.Color(0x151515)
      console.log('Restored solid background after Gaussian splat error')
      
      // Restore main canvas
      this.canvas.style.display = 'block'
      
      // Remove splat canvas if it exists
      const splatCanvas = document.getElementById('splat-canvas')
      if (splatCanvas) {
        splatCanvas.remove()
      }
      
      // Show error message instead of fallback
      this.progressEl.style.display = 'flex'
      this.progressEl.querySelector('p')!.textContent = 'Gaussian Splat loading failed'
    }
  }

  async loadPointCloud() {
    console.log('loadPointCloud() called')
    
    if (!this.modelsConfig) {
      console.error('Models configuration not loaded')
      return
    }
    
    console.log('Models config loaded:', this.modelsConfig)
    
    const currentModel = this.modelsConfig.models[this.modelsConfig.currentModel]
    if (!currentModel) {
      console.error('Current model not found in configuration')
      return
    }
    
    console.log('Current model:', currentModel)
    
    // Load the normal model first
    await this.loadModelByFileName(currentModel.fileName)
  }

  private onLoad(geometry: THREE.BufferGeometry) {
    console.log('PLY file loaded successfully!')
    console.log('Geometry attributes:', Object.keys(geometry.attributes))
    
    // Create material for the point cloud
    const material = new THREE.PointsMaterial({
      size: this.orbitalCamera.pointSize,
      vertexColors: true,
      transparent: true,
      map: this.createSquareTexture(),
      blending: THREE.NormalBlending,
      depthWrite: true,
      alphaTest: 0.1
    })
    
    const pointCloud = new THREE.Points(geometry, material)
    
    // Apply per-model rotation from configuration
    const currentModel = this.modelsConfig!.models[this.modelsConfig!.currentModel]
    if (currentModel && currentModel.rotation) {
      // Convert degrees to radians and apply rotation
      pointCloud.rotateX((currentModel.rotation.x * Math.PI) / 180)
      pointCloud.rotateY((currentModel.rotation.y * Math.PI) / 180)
      pointCloud.rotateZ((currentModel.rotation.z * Math.PI) / 180)
    }
    
    this.scene.add(pointCloud)
    
    // Register with orbital camera system
    this.orbitalCamera.setCurrentPointCloud(pointCloud)
    
    // Update point size to current setting (important for model switching)
    this.orbitalCamera.updatePointSize()
    
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
    if (this.isModelSwitching && !this.isQualitySwitching) {
      this.orbitalCamera.startLoadingAnimation()
    }
    if (this.isModelSwitching) {
      this.isModelSwitching = false
    }
    if (this.isQualitySwitching) {
      this.isQualitySwitching = false
    }
    
    console.log('PLY file loaded successfully:', geometry.attributes.position.count, 'points')
  }

  private onStreamingProgress(progress: ProgressEvent) {
    // For streaming mode, just log progress without showing loading bar
    if (progress.lengthComputable) {
      const percentComplete = (progress.loaded / progress.total) * 100
      console.log('Streaming progress:', Math.round(percentComplete) + '%')
    }
  }

  private onError(error: any) {
    console.error('Error loading PLY file:', error)
    this.progressEl.querySelector('p')!.textContent = 'Failed to load PLY file'
    
    console.log('Failed to load point cloud - no fallback demo available')
    this.progressEl.style.display = 'none'
  }


  private getModelPath(fileName: string, isGaussianSplat: boolean = false): string {
    if (!this.modelsConfig?.basePaths) {
      // Fallback to old behavior if basePaths not available
      return fileName
    }
    
    const basePath = isGaussianSplat ? this.modelsConfig.basePaths.gsplat : this.modelsConfig.basePaths.pointcloud
    return basePath + fileName
  }

  private createSquareTexture() {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const size = 64
    
    canvas.width = size
    canvas.height = size
    
    // Clear canvas to transparent
    context.clearRect(0, 0, size, size)
    
    // Disable antialiasing for sharp edges
    context.imageSmoothingEnabled = false
    
    // Create solid white square with transparent background
    const squareSize = size - 2 // Slightly smaller to avoid edge artifacts
    const offset = 1 // Center the square
    
    context.fillStyle = 'rgba(255, 255, 255, 1)'
    context.fillRect(offset, offset, squareSize, squareSize)
    
    const texture = new THREE.CanvasTexture(canvas)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.needsUpdate = true
    
    return texture
  }
}