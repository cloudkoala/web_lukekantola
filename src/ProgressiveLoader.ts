/**
 * Progressive PLY Loader
 * Loads chunked PLY files progressively for seamless user experience
 */

import * as THREE from 'three'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'

interface ChunkManifest {
  original_file: string
  total_vertices: number
  chunk_count: number
  overall_bounding_box: {
    min: { x: number, y: number, z: number }
    max: { x: number, y: number, z: number }
  }
  target_chunk_size_mb: number
  chunks: ChunkInfo[]
}

interface ChunkInfo {
  filename: string
  vertex_count: number
  bounding_box: {
    min: { x: number, y: number, z: number }
    max: { x: number, y: number, z: number }
  }
  priority: number
  file_size_bytes: number
}

interface LoadedChunk {
  info: ChunkInfo
  pointCloud: THREE.Points
  loaded: boolean
  downloadProgress: number
}

export class ProgressiveLoader {
  private scene: THREE.Scene
  private basePath: string
  private manifest: ChunkManifest | null = null
  private chunks: LoadedChunk[] = []
  private loadingQueue: ChunkInfo[] = []
  private isLoading: boolean = false
  private pointSize: number = 0.001
  private onChunkLoaded?: (chunkIndex: number, totalChunks: number) => void
  private onLoadComplete?: () => void
  private onChunkAddedToScene?: (pointCloud: THREE.Points) => Promise<void> | void
  private loadedPointClouds: THREE.Points[] = []
  private modelRotation: { x: number, y: number, z: number } | null = null
  
  // Random scale parameters
  private randomScaleIntensity: number = 0
  private randomScaleSeed: number = 42
  private sphereInstancer: any = null
  private abortController: AbortController | null = null
  
  // Concurrent loading properties
  private downloadingChunks: Map<string, Promise<THREE.BufferGeometry>> = new Map()
  private readyBuffer: Map<string, THREE.BufferGeometry> = new Map()
  private maxConcurrentDownloads: number = 2 // Optimized for better performance
  private maxBufferSize: number = 8 // Increased buffer to handle concurrent downloads better
  private overlapThreshold: number = 0.5 // Start next download at 50% progress
  
  constructor(scene: THREE.Scene, basePath: string = '') {
    this.scene = scene
    this.basePath = basePath
  }
  
  /**
   * Set callback for when a chunk is loaded
   */
  public setOnChunkLoaded(callback: (chunkIndex: number, totalChunks: number) => void) {
    this.onChunkLoaded = callback
  }
  
  /**
   * Set callback for when all chunks are loaded
   */
  public setOnLoadComplete(callback: () => void) {
    this.onLoadComplete = callback
  }
  
  /**
   * Set callback for when a chunk is added to the scene (for progressive sphere conversion)
   */
  public setOnChunkAddedToScene(callback: (pointCloud: THREE.Points) => Promise<void> | void) {
    this.onChunkAddedToScene = callback
  }
  
  /**
   * Set point size for all loaded chunks
   */
  public setPointSize(size: number) {
    this.pointSize = size
    
    // Update all loaded point clouds
    this.loadedPointClouds.forEach(pointCloud => {
      if (pointCloud.material && pointCloud.geometry) {
        // Update size attribute for shader material
        const sizeAttribute = pointCloud.geometry.getAttribute('size') as THREE.BufferAttribute
        if (sizeAttribute) {
          const adjustedSize = this.calculateDensityAwarePointSize(pointCloud.geometry, size)
          for (let i = 0; i < sizeAttribute.count; i++) {
            sizeAttribute.setX(i, adjustedSize)
          }
          sizeAttribute.needsUpdate = true
        }
      }
    })
  }
  
  /**
   * Set model rotation to apply to each chunk as it loads
   */
  public setModelRotation(rotation: { x: number, y: number, z: number } | null) {
    this.modelRotation = rotation
  }

  /**
   * Set random scale parameters for point clouds
   */
  public setRandomScale(intensity: number, seed: number = 42, luminanceInfluence: number = 0, thresholdLow: number = 0, thresholdHigh: number = 1) {
    this.randomScaleIntensity = intensity
    this.randomScaleSeed = seed
    
    // Update existing point clouds if any are loaded
    this.loadedPointClouds.forEach(pointCloud => {
      const material = pointCloud.material as THREE.ShaderMaterial
      if (material && material.uniforms) {
        if (material.uniforms.randomIntensity) {
          material.uniforms.randomIntensity.value = intensity
        }
        if (material.uniforms.randomSeed) {
          material.uniforms.randomSeed.value = seed
        }
        if (material.uniforms.luminanceInfluence) {
          material.uniforms.luminanceInfluence.value = luminanceInfluence
        }
        if (material.uniforms.thresholdLow) {
          material.uniforms.thresholdLow.value = thresholdLow
        }
        if (material.uniforms.thresholdHigh) {
          material.uniforms.thresholdHigh.value = thresholdHigh
        }
      }
    })

    // Update sphere instancer if available
    if (this.sphereInstancer && this.sphereInstancer.setRandomScale) {
      this.sphereInstancer.setRandomScale(intensity, seed, luminanceInfluence, thresholdLow, thresholdHigh)
    }
  }

  /**
   * Set sphere instancer for random scale propagation
   */
  public setSphereInstancer(sphereInstancer: any) {
    this.sphereInstancer = sphereInstancer
  }
  
  /**
   * Configure concurrent loading settings
   */
  public setConcurrentLoadingSettings(maxConcurrent: number = 1, maxBuffer: number = 1) {
    this.maxConcurrentDownloads = Math.max(1, maxConcurrent)
    this.maxBufferSize = Math.max(1, maxBuffer)
  }
  
  /**
   * Enable/disable concurrent loading (convenience method)
   */
  public setSequentialMode(sequential: boolean = true) {
    if (sequential) {
      this.setConcurrentLoadingSettings(1, 1)
    } else {
      this.setConcurrentLoadingSettings(2, 2)
    }
  }

  /**
   * Cancel current loading and clean up resources
   */
  public cancelLoading() {
    
    // Abort any ongoing requests
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    
    // Clear loading state
    this.isLoading = false
    this.loadingQueue = []
    
    // Clear concurrent loading state
    this.downloadingChunks.clear()
    this.readyBuffer.forEach(geometry => geometry.dispose())
    this.readyBuffer.clear()
    
    // Remove all loaded point clouds from scene
    this.loadedPointClouds.forEach(pointCloud => {
      this.scene.remove(pointCloud)
      if (pointCloud.material) {
        if (Array.isArray(pointCloud.material)) {
          pointCloud.material.forEach(material => material.dispose())
        } else {
          pointCloud.material.dispose()
        }
      }
      if (pointCloud.geometry) {
        pointCloud.geometry.dispose()
      }
    })
    
    // Clear arrays
    this.loadedPointClouds = []
    this.chunks = []
    this.manifest = null
    
    // Resume material effects if they were paused during loading
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass && postProcessingPass.resumeMaterialEffects) {
      postProcessingPass.resumeMaterialEffects()
    }
    
  }
  
  /**
   * Load a chunked PLY model progressively
   */
  public async loadChunkedModel(manifestPath: string): Promise<void> {
    
    // Cancel any existing loading operation
    this.cancelLoading()
    
    // Set up new abort controller for this loading operation
    this.abortController = new AbortController()
    
    try {
      // Load manifest
      const response = await fetch(`${this.basePath}${manifestPath}`, {
        signal: this.abortController.signal
      })
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.statusText}`)
      }
      
      this.manifest = await response.json()
      
      if (!this.manifest) {
        throw new Error('Failed to parse manifest file')
      }
      
      // Dynamically adjust buffer size based on chunk count
      const chunkCount = this.manifest.chunk_count
      this.maxBufferSize = Math.max(8, Math.min(chunkCount, 15)) // Buffer 8-15 chunks based on model size
      
      // Initialize chunks array
      this.chunks = this.manifest.chunks.map(chunkInfo => ({
        info: chunkInfo,
        pointCloud: new THREE.Points(),
        loaded: false,
        downloadProgress: 0
      }))
      
      // Sort chunks by priority for loading order
      this.loadingQueue = [...this.manifest.chunks].sort((a, b) => a.priority - b.priority)
      
      // Start progressive loading
      this.startProgressiveLoading()
      
    } catch (error) {
      console.error('Error loading chunked model:', error)
      throw error
    }
  }
  
  /**
   * Start loading chunks progressively with concurrent downloads
   */
  private async startProgressiveLoading() {
    if (this.isLoading || this.loadingQueue.length === 0) {
      return
    }
    
    this.isLoading = true
    
    let processedCount = 0
    
    // Start initial downloads
    this.startNextDownloads(0)
    
    // Process chunks as they become ready
    while (processedCount < this.loadingQueue.length) {
      // Check if loading was cancelled
      if (this.abortController?.signal.aborted) {
        this.isLoading = false
        return
      }
      
      // Look for ready chunks in priority order
      const nextChunk = this.loadingQueue[processedCount]
      const readyGeometry = this.readyBuffer.get(nextChunk.filename)
      
      if (readyGeometry) {
        // Process the ready chunk
        
        this.onChunkGeometryLoaded(nextChunk, readyGeometry)
        this.readyBuffer.delete(nextChunk.filename)
        
        processedCount++
        
        // Notify progress
        if (this.onChunkLoaded) {
          this.onChunkLoaded(processedCount, this.loadingQueue.length)
        }
        
        // Start more downloads if needed, but limit buffer size
        if (this.readyBuffer.size < this.maxBufferSize) {
          // Look for next undownloaded chunk starting from current position
          this.startNextDownloads(processedCount)
        }
        
        // Reduced delay for better performance
        await new Promise(resolve => setTimeout(resolve, 25))
        
      } else {
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    
    this.isLoading = false
    
    // Only call completion callback if not cancelled
    if (!this.abortController?.signal.aborted && this.onLoadComplete) {
      this.onLoadComplete()
    }
  }
  
  /**
   * Start downloads for next available chunks
   */
  private startNextDownloads(fromIndex: number = 0) {
    const currentDownloads = this.downloadingChunks.size
    const currentBuffered = this.readyBuffer.size
    
    
    // Don't start more downloads if buffer is at capacity
    if (currentBuffered >= this.maxBufferSize) {
      return
    }
    
    const slotsAvailable = this.maxConcurrentDownloads - currentDownloads
    
    let started = 0
    
    // Find next chunks to download starting from fromIndex
    for (let i = fromIndex; i < this.loadingQueue.length && started < slotsAvailable; i++) {
      const chunkInfo = this.loadingQueue[i]
      
      // Skip if already downloading or ready
      if (this.downloadingChunks.has(chunkInfo.filename) || this.readyBuffer.has(chunkInfo.filename)) {
        continue
      }
      
      // Start download
      const downloadPromise = this.loadChunkGeometry(chunkInfo)
      this.downloadingChunks.set(chunkInfo.filename, downloadPromise)
      started++
      
      
      // Handle completion
      downloadPromise.then(geometry => {
        // Check if we can buffer this chunk
        if (this.readyBuffer.size < this.maxBufferSize) {
          this.readyBuffer.set(chunkInfo.filename, geometry)
        } else {
          // Buffer is full - check if this chunk will be needed soon
          const chunkIndex = this.loadingQueue.findIndex(chunk => chunk.filename === chunkInfo.filename)
          const processedCount = this.chunks.filter(chunk => chunk.loaded).length
          const distanceFromCurrent = chunkIndex - processedCount
          
          
          if (distanceFromCurrent <= 5) {
            // Chunk is needed soon - make room by removing oldest chunk that's further away
            const oldestFarChunk = this.findOldestFarChunk(processedCount)
            if (oldestFarChunk) {
              this.readyBuffer.get(oldestFarChunk)?.dispose()
              this.readyBuffer.delete(oldestFarChunk)
              this.readyBuffer.set(chunkInfo.filename, geometry)
            } else {
              geometry.dispose()
            }
          } else {
            // Only dispose if this chunk is really far away (>10 positions)
            if (distanceFromCurrent > 10) {
              geometry.dispose()
            } else {
              // Force make room even for moderately far chunks by removing the furthest one
              const furthestChunk = this.findFurthestChunk(processedCount)
              if (furthestChunk) {
                this.readyBuffer.get(furthestChunk)?.dispose()
                this.readyBuffer.delete(furthestChunk)
                this.readyBuffer.set(chunkInfo.filename, geometry)
              } else {
                geometry.dispose()
              }
            }
          }
        }
        this.downloadingChunks.delete(chunkInfo.filename)
      }).catch(error => {
        this.downloadingChunks.delete(chunkInfo.filename)
        console.error(`❌ Download failed: ${chunkInfo.filename}`, error)
      })
    }
    
    if (started === 0) {
    }
  }
  
  /**
   * Load chunk geometry only (for concurrent loading)
   */
  private async loadChunkGeometry(chunkInfo: ChunkInfo): Promise<THREE.BufferGeometry> {
    return new Promise((resolve, reject) => {
      // Check if loading has been cancelled
      if (this.abortController?.signal.aborted) {
        reject(new Error('Loading cancelled'))
        return
      }

      const loader = new PLYLoader()
      // Extract model name from manifest path to build correct chunk path
      const manifestPathParts = this.manifest?.original_file.replace('.ply', '') || 'unknown'
      const chunkPath = `${this.basePath}models/chunks/${manifestPathParts}/${chunkInfo.filename}`
      
      
      // Set up abort signal listener
      const abortListener = () => {
        reject(new Error('Loading cancelled'))
      }
      
      this.abortController?.signal.addEventListener('abort', abortListener)
      
      loader.load(
        chunkPath,
        (geometry) => {
          // Check if loading was cancelled before resolving
          if (this.abortController?.signal.aborted) {
            geometry.dispose()
            reject(new Error('Loading cancelled'))
            return
          }
          
          resolve(geometry)
        },
        (progress) => {
          // Track download progress for potential overlap triggering
          if (progress.lengthComputable) {
            const percentComplete = progress.loaded / progress.total
            this.updateChunkProgress(chunkInfo.filename, percentComplete)
          }
        },
        (error) => {
          console.error(`❌ Error downloading chunk ${chunkInfo.filename}:`, error)
          reject(error)
        }
      )
    })
  }
  
  /**
   * Update chunk download progress
   */
  private updateChunkProgress(filename: string, progress: number) {
    const chunkIndex = this.chunks.findIndex(chunk => chunk.info.filename === filename)
    if (chunkIndex !== -1) {
      this.chunks[chunkIndex].downloadProgress = progress
    }
  }
  
  /**
   * Handle loaded chunk geometry
   */
  private async onChunkGeometryLoaded(chunkInfo: ChunkInfo, geometry: THREE.BufferGeometry) {
    // Double-check if loading was cancelled before adding to scene
    if (this.abortController?.signal.aborted) {
      geometry.dispose()
      return
    }

    
    // Calculate density-aware point size for this chunk
    const adjustedSize = this.calculateDensityAwarePointSize(geometry, this.pointSize)
    
    // Create custom shader material to match sphere darkness
    const hasColors = !!geometry.attributes.color
    
    const material = hasColors ? 
      new THREE.ShaderMaterial({
        fog: true,
        vertexShader: `
          attribute float size;
          attribute float randomScale;
          attribute vec3 color;
          uniform float randomIntensity;
          uniform float randomSeed;
          uniform float luminanceInfluence;
          uniform float thresholdLow;
          uniform float thresholdHigh;
          varying vec3 vColor;
          varying float vFogDepth;
          
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vFogDepth = -mvPosition.z;
            
            // Calculate scaling factor
            float scaleFactor = randomScale;
            
            // Apply luminance influence
            if (abs(luminanceInfluence) > 0.001) {
              float luminance = dot(color, vec3(0.299, 0.587, 0.114));
              
              // Remap luminance using thresholds
              float remappedLuminance = clamp((luminance - thresholdLow) / (thresholdHigh - thresholdLow), 0.0, 1.0);
              
              // Direct luminance scaling approach
              if (luminanceInfluence > 0.0) {
                // Positive: interpolate from random toward remapped luminance (bright = bigger)
                scaleFactor = mix(randomScale, remappedLuminance, luminanceInfluence);
              } else {
                // Negative: interpolate from random toward inverted remapped luminance (dark = bigger)
                scaleFactor = mix(randomScale, (1.0 - remappedLuminance), -luminanceInfluence);
              }
            }
            
            // Apply scaling
            float finalScale = randomIntensity > 0.0 ? 
              (1.0 + scaleFactor * randomIntensity) : 1.0;
            
            gl_PointSize = size * finalScale * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 fogColor;
          uniform float fogDensity;
          varying vec3 vColor;
          varying float vFogDepth;
          
          void main() {
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            fogFactor = clamp(fogFactor, 0.0, 1.0);
            vec3 brightColor = vColor * 1.8; // Increase brightness
            gl_FragColor = vec4(mix(brightColor, fogColor, fogFactor), 1.0);
          }
        `,
        uniforms: {
          fogColor: { value: new THREE.Color(0x151515) },
          fogDensity: { value: 0.003 },
          randomIntensity: { value: this.randomScaleIntensity },
          randomSeed: { value: this.randomScaleSeed },
          luminanceInfluence: { value: 0.0 },
          thresholdLow: { value: 0.0 },
          thresholdHigh: { value: 1.0 }
        }
      }) :
      new THREE.ShaderMaterial({
        fog: true,
        vertexShader: `
          attribute float size;
          attribute float randomScale;
          uniform float randomIntensity;
          uniform float randomSeed;
          uniform float luminanceInfluence;
          uniform float thresholdLow;
          uniform float thresholdHigh;
          varying vec3 vColor;
          varying float vFogDepth;
          
          void main() {
            vColor = vec3(1.0); // White color fallback
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vFogDepth = -mvPosition.z;
            
            // Calculate scaling factor
            float scaleFactor = randomScale;
            
            // Apply luminance influence
            if (abs(luminanceInfluence) > 0.001) {
              float luminance = 1.0; // White has full luminance
              
              // Remap luminance using thresholds
              float remappedLuminance = clamp((luminance - thresholdLow) / (thresholdHigh - thresholdLow), 0.0, 1.0);
              
              // Direct luminance scaling approach
              if (luminanceInfluence > 0.0) {
                // Positive: interpolate from random toward remapped luminance (bright = bigger)
                scaleFactor = mix(randomScale, remappedLuminance, luminanceInfluence);
              } else {
                // Negative: interpolate from random toward inverted remapped luminance (dark = bigger)
                scaleFactor = mix(randomScale, (1.0 - remappedLuminance), -luminanceInfluence);
              }
            }
            
            // Apply scaling
            float finalScale = randomIntensity > 0.0 ? 
              (1.0 + scaleFactor * randomIntensity) : 1.0;
            
            gl_PointSize = size * finalScale * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 fogColor;
          uniform float fogDensity;
          varying vec3 vColor;
          varying float vFogDepth;
          
          void main() {
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            fogFactor = clamp(fogFactor, 0.0, 1.0);
            vec3 brightColor = vColor * 1.8; // Increase brightness
            gl_FragColor = vec4(mix(brightColor, fogColor, fogFactor), 1.0);
          }
        `,
        uniforms: {
          fogColor: { value: new THREE.Color(0x151515) },
          fogDensity: { value: 0.003 },
          randomIntensity: { value: this.randomScaleIntensity },
          randomSeed: { value: this.randomScaleSeed },
          luminanceInfluence: { value: 0.0 },
          thresholdLow: { value: 0.0 },
          thresholdHigh: { value: 1.0 }
        }
      })
    
    // Add size attribute for the shader
    const sizeAttribute = new Float32Array(geometry.attributes.position.count)
    for (let i = 0; i < sizeAttribute.length; i++) {
      sizeAttribute[i] = adjustedSize
    }
    geometry.setAttribute('size', new THREE.BufferAttribute(sizeAttribute, 1))
    
    // Add random scale attribute based on vertex index
    const randomScaleAttribute = new Float32Array(geometry.attributes.position.count)
    for (let i = 0; i < randomScaleAttribute.length; i++) {
      // Create deterministic random value from vertex index
      const randomValue = ((Math.sin(i * 12.9898 + this.randomScaleSeed) * 43758.5453) % 1 + 1) % 1
      randomScaleAttribute[i] = randomValue
    }
    geometry.setAttribute('randomScale', new THREE.BufferAttribute(randomScaleAttribute, 1))
    
    // Create individual point cloud for this chunk
    const pointCloud = new THREE.Points(geometry, material)
    
    // Disable frustum culling to prevent disappearing during fast rotation
    pointCloud.frustumCulled = false
    
    // Apply model rotation immediately if set
    if (this.modelRotation) {
      pointCloud.rotateX((this.modelRotation.x * Math.PI) / 180)
      pointCloud.rotateY((this.modelRotation.y * Math.PI) / 180)
      pointCloud.rotateZ((this.modelRotation.z * Math.PI) / 180)
    }
    
    // Add to scene immediately for better performance
    this.scene.add(pointCloud)
    pointCloud.updateMatrixWorld(true)
    
    // Process sphere conversion asynchronously without blocking display
    if (this.onChunkAddedToScene) {
      
      // Process spheres asynchronously in the background
      setTimeout(async () => {
        try {
          const result = this.onChunkAddedToScene!(pointCloud)
          if (result && typeof result.then === 'function') {
            await result
          }
        } catch (error) {
          console.error(`❌ Async sphere processing failed for ${chunkInfo.filename}:`, error)
        }
      }, 10) // Very small delay to allow GPU to process the scene addition
    }
    
    this.loadedPointClouds.push(pointCloud)
    
    // Update chunk tracking
    const chunkIndex = this.chunks.findIndex(chunk => chunk.info.filename === chunkInfo.filename)
    if (chunkIndex !== -1) {
      this.chunks[chunkIndex].pointCloud = pointCloud
      this.chunks[chunkIndex].loaded = true
    }
    
  }
  
  
  /**
   * Calculate density-aware point size based on geometry
   */
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

  // Temporarily disabled to avoid GL_INVALID_OPERATION errors
  /*
  private createSquareTexture(): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    
    const context = canvas.getContext('2d')!
    // Clear canvas to transparent background
    context.clearRect(0, 0, 64, 64)
    
    // Disable antialiasing for sharp edges
    context.imageSmoothingEnabled = false
    
    // Create solid white square with transparent background
    const squareSize = 62 // Slightly smaller to avoid edge artifacts
    const offset = 1 // Center the square
    
    context.fillStyle = 'rgba(255, 255, 255, 1)'
    context.fillRect(offset, offset, squareSize, squareSize)
    
    const texture = new THREE.Texture(canvas)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.needsUpdate = true
    return texture
  }
  */
  
  /**
   * Get overall bounding box of the model
   */
  public getBoundingBox(): THREE.Box3 | null {
    if (!this.manifest) return null
    
    const bbox = this.manifest.overall_bounding_box
    return new THREE.Box3(
      new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
      new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z)
    )
  }
  
  /**
   * Get total vertex count
   */
  public getTotalVertices(): number {
    return this.manifest?.total_vertices || 0
  }
  
  /**
   * Get loaded vertex count
   */
  public getLoadedVertices(): number {
    return this.chunks
      .filter(chunk => chunk.loaded)
      .reduce((total, chunk) => total + chunk.info.vertex_count, 0)
  }
  
  /**
   * Get loading progress (0-1)
   */
  public getLoadingProgress(): number {
    if (!this.manifest) return 0
    return this.getLoadedVertices() / this.getTotalVertices()
  }
  
  /**
   * Clear all loaded chunks from scene
   */
  public clear() {
    // Clear concurrent loading state
    this.downloadingChunks.clear()
    this.readyBuffer.forEach(geometry => geometry.dispose())
    this.readyBuffer.clear()
    
    // Remove all individual point clouds from scene
    this.loadedPointClouds.forEach(pointCloud => {
      this.scene.remove(pointCloud)
    })
    
    this.loadedPointClouds = []
    this.chunks = []
    this.loadingQueue = []
    this.manifest = null
    this.isLoading = false
  }
  
  /**
   * Get all loaded point clouds (for camera interaction)
   */
  public getLoadedPointClouds(): THREE.Points[] {
    return this.loadedPointClouds
  }
  
  /**
   * Find the oldest chunk in buffer that's far from current processing position
   */
  private findOldestFarChunk(processedCount: number): string | null {
    let oldestFarChunk: string | null = null
    let maxDistance = 0
    
    for (const [filename] of this.readyBuffer) {
      const chunkIndex = this.loadingQueue.findIndex(chunk => chunk.filename === filename)
      const distance = chunkIndex - processedCount
      
      // Only consider chunks that are far enough away (more than 5 positions ahead)
      if (distance > 5 && distance > maxDistance) {
        maxDistance = distance
        oldestFarChunk = filename
      }
    }
    
    return oldestFarChunk
  }
  
  /**
   * Find the furthest chunk in buffer from current processing position
   */
  private findFurthestChunk(processedCount: number): string | null {
    let furthestChunk: string | null = null
    let maxDistance = 0
    
    for (const [filename] of this.readyBuffer) {
      const chunkIndex = this.loadingQueue.findIndex(chunk => chunk.filename === filename)
      const distance = chunkIndex - processedCount
      
      // Find any chunk that's further than current max
      if (distance > maxDistance) {
        maxDistance = distance
        furthestChunk = filename
      }
    }
    
    return furthestChunk
  }
}