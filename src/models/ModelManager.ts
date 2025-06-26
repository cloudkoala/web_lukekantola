import * as THREE from 'three'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { SplatMesh } from '@sparkjsdev/spark'
import * as Spark from '@sparkjsdev/spark'
import type { ModelsConfig } from '../types'
import { SphereInstancer } from './SphereInstancer'

export class ModelManager {
  private modelsConfig: ModelsConfig | null = null
  private isModelSwitching: boolean = false
  private isQualitySwitching: boolean = false
  private currentRenderObject: THREE.Points | SplatMesh | null = null
  private currentQuality: 'low' | 'high' = 'low'
  private gaussianSplattingLoader: any
  private sphereInstancer: SphereInstancer
  
  // Injected dependencies
  private scene: THREE.Scene
  private progressEl: HTMLDivElement
  private progressFill: HTMLDivElement
  private progressiveLoader: any
  private orbitalCamera: any // OrbitalCameraSystem

  constructor(
    scene: THREE.Scene,
    progressEl: HTMLDivElement,
    progressFill: HTMLDivElement,
    progressiveLoader: any,
    orbitalCamera: any // OrbitalCameraSystem
  ) {
    this.scene = scene
    this.progressEl = progressEl
    this.progressFill = progressFill
    this.progressiveLoader = progressiveLoader
    this.orbitalCamera = orbitalCamera
    this.sphereInstancer = new SphereInstancer(scene)
    
    // Configure progressive loader for optimized performance
    this.progressiveLoader.setSequentialMode(false) // Enable concurrent loading
    
    // Connect progressive loader with sphere instancer for random scale propagation
    this.progressiveLoader.setSphereInstancer(this.sphereInstancer)
    
    console.log('ModelManager initialized')
    
    // Initialize Gaussian Splatting Loader - try different possible names
    if ((Spark as any).GaussianSplattingLoader) {
      this.gaussianSplattingLoader = new (Spark as any).GaussianSplattingLoader()
      console.log('Initialized GaussianSplattingLoader')
    } else if ((Spark as any).SplatLoader) {
      this.gaussianSplattingLoader = new (Spark as any).SplatLoader()
      console.log('Initialized SplatLoader')
    } else {
      console.warn('No Gaussian Splatting Loader found in Spark exports')
      this.gaussianSplattingLoader = null
    }
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

  /**
   * Set up progressive sphere conversion callback
   */
  setupProgressiveSphereConversion() {
    this.progressiveLoader.setOnChunkAddedToScene(async (pointCloud: THREE.Points) => {
      // Convert this chunk to spheres if sphere mode is enabled
      await this.sphereInstancer.convertSinglePointCloudToSpheresProgressive(pointCloud)
    })
    console.log('Progressive sphere conversion callback set up')
  }

  getModelsConfig(): ModelsConfig | null {
    return this.modelsConfig
  }

  getSphereInstancer(): SphereInstancer {
    return this.sphereInstancer
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

  getCurrentRenderObject(): THREE.Points | SplatMesh | null {
    return this.currentRenderObject
  }

  setCurrentRenderObject(object: THREE.Points | SplatMesh | null) {
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
    
    // Cancel any ongoing progressive loading only for actual model switches
    if (isActualModelSwitch) {
      console.log('Model switch: cancelling progressive loading')
      this.progressiveLoader.cancelLoading()
    } else {
      console.log('Quality switch: keeping progressive loading intact')
    }
    
    console.log('Switching to model:', model.displayName)
    
    // Update display name field and load defaults
    this.orbitalCamera.updateDisplayNameField()
    this.orbitalCamera.loadDefaultPointSize()
    this.orbitalCamera.loadDefaultFocalLength()
    
    // Clear scene differently based on whether this is a model switch or quality switch
    if (isActualModelSwitch) {
      // Full clear for model switches
      console.log('Model switch: clearing all objects from scene')
      if (this.currentRenderObject) {
        if (this.currentRenderObject instanceof SplatMesh) {
          console.log('Removing previous SplatMesh')
          this.scene.remove(this.currentRenderObject)
        } else if (this.currentRenderObject instanceof THREE.Points) {
          console.log('Removing previous point cloud')
          this.scene.remove(this.currentRenderObject)
        }
        this.currentRenderObject = null
      }
      
      // Clear any remaining objects in scene for model switches
      const existingObjects = this.scene.children.filter(child => 
        child instanceof THREE.Points || 
        child instanceof SplatMesh ||
        (child.type === 'Mesh' && child.userData?.isSplatMesh)
      )
      existingObjects.forEach(obj => this.scene.remove(obj))
    } else if (this.isQualitySwitching) {
      // For quality switches, only remove splats (keep point clouds for comparison)
      console.log('Quality switch: keeping point clouds, only clearing splats')
      if (this.currentRenderObject instanceof SplatMesh) {
        console.log('Removing previous SplatMesh for quality switch')
        this.scene.remove(this.currentRenderObject)
        this.currentRenderObject = null
      }
      
      // Only remove SplatMesh objects, keep point clouds
      const existingSplats = this.scene.children.filter(child => 
        child instanceof SplatMesh ||
        (child.type === 'Mesh' && child.userData?.isSplatMesh)
      )
      existingSplats.forEach(obj => this.scene.remove(obj))
    }
    
    // Clear camera system references
    this.orbitalCamera.setCurrentRenderObject(new THREE.Object3D()) // Clear reference
    
    // Hide loading screen for all model switches (splats load quickly)
    this.progressEl.style.display = 'none'
    
    // Load new model
    await this.loadModelByFileName(model.fileName, isActualModelSwitch)
  }

  async loadModelByFileName(fileName: string, isActualModelSwitch: boolean = true) {
    if (!this.modelsConfig) return
    
    const currentModel = this.modelsConfig.models[this.modelsConfig.currentModel]
    if (!currentModel) {
      console.error('Current model not found in configuration')
      return
    }
    
    // Use quality setting to determine which file to load
    if (this.currentQuality === 'high' && currentModel.gaussianSplatFile) {
      // Load Gaussian splat for high quality
      await this.loadSplatMesh(currentModel.gaussianSplatFile)
      
      // Check if we already have point clouds in scene (from quality switching)
      const existingPointClouds = this.scene.children.filter(child => child instanceof THREE.Points)
      if (existingPointClouds.length === 0 || isActualModelSwitch) {
        // ALSO load the point cloud for comparison
        console.log('Loading point cloud alongside Gaussian splat for comparison')
        await this.loadPointCloudByFileName(fileName, true) // Pass flag to indicate it's a comparison load
      } else {
        console.log('Point clouds already present, keeping them for comparison with Gaussian splat')
      }
    } else {
      // For low quality, check if we already have point clouds
      const existingPointClouds = this.scene.children.filter(child => child instanceof THREE.Points)
      if (existingPointClouds.length === 0 || isActualModelSwitch) {
        // Load point cloud for low quality or when no splat file available
        await this.loadPointCloudByFileName(fileName)
      } else {
        console.log('Point clouds already present, keeping them for low quality view')
        // Update point size and register with camera system
        this.orbitalCamera.updatePointSize()
        if (existingPointClouds.length > 0) {
          this.orbitalCamera.setCurrentPointCloud(existingPointClouds[0] as THREE.Points)
        }
      }
    }
  }

  async loadPointCloudByFileName(fileName: string, isComparisonLoad: boolean = false) {
    console.log('=== LOAD POINT CLOUD START ===')
    console.log('Loading point cloud:', fileName)
    if (isComparisonLoad) {
      console.log('Loading as comparison alongside Gaussian splat')
    }
    
    // Check if chunked version exists by looking for manifest file in model subfolder
    const baseFileName = fileName.replace('.ply', '')
    const manifestPath = `models/chunks/${baseFileName}/${baseFileName}_manifest.json`
    
    console.log('Checking for chunked version at:', manifestPath)
    
    try {
      // Try to load the manifest file first
      const manifestResponse = await fetch(`${import.meta.env.BASE_URL}${manifestPath}`)
      
      if (manifestResponse.ok) {
        console.log('Found chunked version, loading progressively...')
        const manifestData = await manifestResponse.json()
        console.log('Manifest data loaded:', manifestData.chunk_count, 'chunks')
        
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
          await this.orbitalCamera.startLoadingAnimation(true) // Skip random scene for manual switches
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
          
          // Resume material effects after loading is complete
          const postProcessingPass = (window as any).postProcessingPass
          if (postProcessingPass && postProcessingPass.resumeMaterialEffects) {
            postProcessingPass.resumeMaterialEffects()
          }
          
          // Reset switching flags
          if (this.isModelSwitching) {
            this.isModelSwitching = false
          }
          if (this.isQualitySwitching) {
            this.isQualitySwitching = false
          }
        })
        
        // Pause material effects to prevent flashing during chunk loading
        const postProcessingPass = (window as any).postProcessingPass
        if (postProcessingPass && postProcessingPass.pauseMaterialEffects) {
          postProcessingPass.pauseMaterialEffects()
        }
        
        // Start progressive loading
        await this.progressiveLoader.loadChunkedModel(manifestPath)
        
      } else {
        // No chunked version found, fall back to regular loading
        console.log('No chunked version found (status:', manifestResponse.status, '), loading single file...')
        
        // Resume material effects if they were paused
        const postProcessingPass = (window as any).postProcessingPass
        if (postProcessingPass && postProcessingPass.resumeMaterialEffects) {
          postProcessingPass.resumeMaterialEffects()
        }
        
        // Cancel any ongoing progressive loading
        this.progressiveLoader.cancelLoading()
        this.loadSinglePointCloud(fileName, isComparisonLoad)
      }
      
    } catch (error) {
      console.log('Error checking for chunked version, falling back to single file loading:', error)
      
      // Resume material effects if they were paused
      const postProcessingPass = (window as any).postProcessingPass
      if (postProcessingPass && postProcessingPass.resumeMaterialEffects) {
        postProcessingPass.resumeMaterialEffects()
      }
      
      // Cancel any ongoing progressive loading
      this.progressiveLoader.cancelLoading()
      this.loadSinglePointCloud(fileName, isComparisonLoad)
    }
  }

  loadSinglePointCloud(fileName: string, isComparisonLoad: boolean = false) {
    const loader = new PLYLoader()
    
    console.log('Loading single point cloud file:', fileName)
    
    try {
      const fullPath = this.getModelPath(fileName)
      loader.load(
        `${import.meta.env.BASE_URL}${fullPath}`,
        (geometry: THREE.BufferGeometry) => this.onLoad(geometry, isComparisonLoad),
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

  async addGaussian(url: string): Promise<SplatMesh> {
    try {
      console.log('Loading Gaussian splat with progress tracking:', url)
      
      if (!this.gaussianSplattingLoader) {
        console.log('No loader available, falling back to direct URL loading')
        return new SplatMesh({ url })
      }
      
      // Step 1: Load packedSplats with progress tracking
      const packedSplats = await this.gaussianSplattingLoader.loadAsync(url, (event: any) => {
        if (event.type === 'progress') {
          const progress = event.lengthComputable
            ? `${((event.loaded / event.total) * 100).toFixed(2)}%`
            : `${event.loaded} bytes`
          console.log(`Gaussian splat download progress: ${progress}`)
          
          // Update progress bar if visible
          if (this.progressEl.style.display !== 'none' && event.lengthComputable) {
            const percentage = (event.loaded / event.total) * 100
            this.progressFill.style.width = `${percentage}%`
          }
        }
      })
      
      console.log('Gaussian splat data loaded, creating SplatMesh...')
      
      // Step 2: Create SplatMesh from loaded data
      const splatMesh = new SplatMesh({ packedSplats })
      
      // Enable viewToWorld matrix updates for fast rotation handling
      if ((splatMesh as any).enableViewToWorld !== undefined) {
        (splatMesh as any).enableViewToWorld = true
        console.log('Enabled viewToWorld matrix updates for fast rotation')
      }
      
      // Try to prevent culling artifacts by adjusting properties after creation
      if ((splatMesh as any).frustumCulled !== undefined) {
        (splatMesh as any).frustumCulled = false
        console.log('Disabled frustum culling on SplatMesh')
      }
      
      // Try to access and modify any internal culling settings
      if ((splatMesh as any).material) {
        const material = (splatMesh as any).material
        if (material.side !== undefined) {
          material.side = THREE.DoubleSide
          console.log('Set SplatMesh material to DoubleSide')
        }
      }
      
      return splatMesh
    } catch (error) {
      console.warn('Failed to load Gaussian splat:', error)
      throw error
    }
  }

  async loadSplatMesh(fileName: string) {
    try {
      console.log('Loading Gaussian splat with two-step loading:', fileName)
      
      
      // Use the new addGaussian method for better loading
      const fullPath = this.getModelPath(fileName, true)
      const url = `${import.meta.env.BASE_URL}${fullPath}`
      const splatMesh = await this.addGaussian(url)
      
      console.log('SplatMesh created, adding to scene')
      
      // Add SplatMesh to scene (camera-child approach breaks loading)
      this.scene.add(splatMesh)
      this.currentRenderObject = splatMesh
      
      // Register with orbital camera system  
      this.orbitalCamera.setCurrentRenderObject(splatMesh)
      
      // Trigger loading animation if switching models (but not quality)
      if (this.isModelSwitching && !this.isQualitySwitching) {
        await this.orbitalCamera.startLoadingAnimation(true) // Skip random scene for manual switches
      }
      
      // Reset switching flags
      if (this.isModelSwitching) {
        this.isModelSwitching = false
      }
      if (this.isQualitySwitching) {
        this.isQualitySwitching = false
      }
      
      console.log('SplatMesh loaded with two-step process - should eliminate culling artifacts!')
      
    } catch (error) {
      console.error('Failed to load SplatMesh:', error)
      
      // Show error message
      this.progressEl.style.display = 'flex'
      this.progressEl.querySelector('p')!.textContent = 'Gaussian Splat loading failed'
      
      // Try fallback to point cloud
      console.log('Falling back to point cloud rendering')
      const currentModel = this.modelsConfig!.models[this.modelsConfig!.currentModel]
      if (currentModel) {
        await this.loadPointCloudByFileName(currentModel.fileName)
      }
    }
  }

  async loadPointCloud() {
    console.log('Loading point cloud - currentModel:', this.modelsConfig?.currentModel)
    
    if (!this.modelsConfig) {
      console.error('Models configuration not loaded')
      return
    }
    
    const currentModel = this.modelsConfig.models[this.modelsConfig.currentModel]
    if (!currentModel) {
      console.error('Current model not found in configuration:', this.modelsConfig.currentModel)
      return
    }
    
    console.log('Loading model:', currentModel.displayName, 'fileName:', currentModel.fileName)
    
    // Load the normal model first
    await this.loadModelByFileName(currentModel.fileName)
    console.log('Model loading completed for:', currentModel.fileName)
  }

  private onLoad(geometry: THREE.BufferGeometry, isComparisonLoad: boolean = false) {
    console.log('PLY file loaded successfully!')
    console.log('Geometry attributes:', Object.keys(geometry.attributes))
    if (isComparisonLoad) {
      console.log('Processing as comparison point cloud alongside Gaussian splat')
    }
    
    // Create material for the point cloud using custom shader to match sphere brightness
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointSize: { value: this.orbitalCamera.pointSize },
        opacity: { value: isComparisonLoad ? 0.6 : 1.0 }
      },
      vertexShader: `
        uniform float pointSize;
        varying vec3 vColor;
        ${!isComparisonLoad ? 'attribute vec3 color;' : ''}
        void main() {
          vColor = ${!isComparisonLoad ? 'color' : 'vec3(0.0, 1.0, 0.0)'};
          gl_PointSize = pointSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying vec3 vColor;
        void main() {
          vec3 brightColor = vColor * 1.8; // Increase brightness
          gl_FragColor = vec4(brightColor, opacity);
        }
      `,
      vertexColors: !isComparisonLoad,
      transparent: true,
      depthWrite: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide
    })
    
    const pointCloud = new THREE.Points(geometry, material)
    
    // Disable frustum culling to prevent disappearing during fast rotation
    pointCloud.frustumCulled = false
    
    // Apply per-model rotation from configuration
    const currentModel = this.modelsConfig!.models[this.modelsConfig!.currentModel]
    if (currentModel && currentModel.rotation) {
      // Convert degrees to radians and apply rotation
      pointCloud.rotateX((currentModel.rotation.x * Math.PI) / 180)
      pointCloud.rotateY((currentModel.rotation.y * Math.PI) / 180)
      pointCloud.rotateZ((currentModel.rotation.z * Math.PI) / 180)
    }
    
    
    this.scene.add(pointCloud)
    
    // Update post-processing point clouds list
    const updateFn = (window as any).updatePostProcessingPointClouds
    if (updateFn) updateFn()
    
    // Register with orbital camera system (only if not comparison)
    if (!isComparisonLoad) {
      this.orbitalCamera.setCurrentPointCloud(pointCloud)
      // Update point size to current setting (important for model switching)
      this.orbitalCamera.updatePointSize()
    } else {
      console.log('Skipping camera registration for comparison point cloud')
    }
    
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
      this.orbitalCamera.startLoadingAnimation(true).catch((error: any) => { // Skip random scene for manual switches
        console.warn('Loading animation failed:', error)
      })
    }
    
    // Reset switching flags
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


  // Temporarily disabled to avoid GL_INVALID_OPERATION errors
  /*
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
  */

  // Sphere instancing methods
  toggleSpheres(): void {
    this.sphereInstancer.toggleSpheres()
  }

  setSphereMode(enabled: boolean): void {
    this.sphereInstancer.setSphereMode(enabled)
  }

  setSphereRadius(radius: number): void {
    this.sphereInstancer.setSphereRadius(radius)
  }

  setSphereDetail(detail: number): void {
    this.sphereInstancer.setSphereDetail(detail)
  }

  isSphereMode(): boolean {
    return this.sphereInstancer.isEnabled()
  }

  getSphereStats(): { totalSpheres: number, meshCount: number } {
    return this.sphereInstancer.getStats()
  }
  
  /**
   * Configure progressive loading mode (for debugging geometry issues)
   */
  public setProgressiveLoadingMode(sequential: boolean = true) {
    this.progressiveLoader.setSequentialMode(sequential)
    console.log(`ModelManager: Progressive loading mode set to ${sequential ? 'sequential' : 'concurrent'}`)
  }

  /**
   * Get the progressive loader instance for external access
   */
  public getProgressiveLoader() {
    return this.progressiveLoader
  }
}