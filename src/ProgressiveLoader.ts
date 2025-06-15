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
  private loadedPointClouds: THREE.Points[] = []
  private modelRotation: { x: number, y: number, z: number } | null = null
  private abortController: AbortController | null = null
  
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
   * Set point size for all loaded chunks
   */
  public setPointSize(size: number) {
    this.pointSize = size
    
    // Update all loaded point clouds
    this.loadedPointClouds.forEach(pointCloud => {
      if (pointCloud.material) {
        const material = pointCloud.material as THREE.PointsMaterial
        material.size = size
        material.needsUpdate = true
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
   * Cancel current loading and clean up resources
   */
  public cancelLoading() {
    console.log('🛑 ProgressiveLoader: Cancelling current loading operation')
    
    // Abort any ongoing requests
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    
    // Clear loading state
    this.isLoading = false
    this.loadingQueue = []
    
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
    
    console.log('✅ ProgressiveLoader: Cleanup complete')
  }
  
  /**
   * Load a chunked PLY model progressively
   */
  public async loadChunkedModel(manifestPath: string): Promise<void> {
    console.log('🌟 ProgressiveLoader: Loading chunked model from manifest:', manifestPath)
    
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
      console.log('Manifest loaded:', this.manifest)
      
      if (!this.manifest) {
        throw new Error('Failed to parse manifest file')
      }
      
      // Initialize chunks array
      this.chunks = this.manifest.chunks.map(chunkInfo => ({
        info: chunkInfo,
        pointCloud: new THREE.Points(),
        loaded: false
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
   * Start loading chunks progressively
   */
  private async startProgressiveLoading() {
    if (this.isLoading || this.loadingQueue.length === 0) {
      console.log('Progressive loading skipped:', { isLoading: this.isLoading, queueLength: this.loadingQueue.length })
      return
    }
    
    this.isLoading = true
    console.log(`🚀 Starting progressive loading of ${this.loadingQueue.length} chunks`)
    
    // Load chunks in small batches for better performance
    const batchSize = 3
    for (let i = 0; i < this.loadingQueue.length; i += batchSize) {
      const batch = this.loadingQueue.slice(i, i + batchSize)
      console.log(`📦 Loading batch ${Math.floor(i/batchSize) + 1}: chunks ${i + 1}-${Math.min(i + batchSize, this.loadingQueue.length)}`)
      
      // Load batch in parallel
      const batchPromises = batch.map(async (chunkInfo, batchIndex) => {
        try {
          await this.loadChunk(chunkInfo)
          console.log(`✅ Successfully loaded chunk: ${chunkInfo.filename}`)
          
          // Notify progress
          if (this.onChunkLoaded) {
            this.onChunkLoaded(i + batchIndex + 1, this.loadingQueue.length)
          }
        } catch (error) {
          console.error(`❌ Failed to load chunk ${chunkInfo.filename}:`, error)
        }
      })
      
      await Promise.all(batchPromises)
      
      // Check if loading was cancelled between batches
      if (this.abortController?.signal.aborted) {
        console.log('🛑 Progressive loading cancelled between batches')
        this.isLoading = false
        return
      }
      
      // Small delay between batches
      if (i + batchSize < this.loadingQueue.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    this.isLoading = false
    console.log(`🎉 Progressive loading complete! ${this.loadedPointClouds.length} chunks loaded`)
    
    // Only call completion callback if not cancelled
    if (!this.abortController?.signal.aborted && this.onLoadComplete) {
      this.onLoadComplete()
    }
  }
  
  /**
   * Load a single chunk
   */
  private async loadChunk(chunkInfo: ChunkInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if loading has been cancelled
      if (this.abortController?.signal.aborted) {
        console.log(`🛑 Chunk loading cancelled: ${chunkInfo.filename}`)
        reject(new Error('Loading cancelled'))
        return
      }

      const loader = new PLYLoader()
      // Extract model name from manifest path to build correct chunk path
      const manifestPathParts = this.manifest?.original_file.replace('.ply', '') || 'unknown'
      const chunkPath = `${this.basePath}models/chunks/${manifestPathParts}/${chunkInfo.filename}`
      
      console.log(`Loading chunk: ${chunkInfo.filename} (${chunkInfo.vertex_count} vertices)`)
      console.log(`Full chunk path: ${chunkPath}`)
      
      // Set up abort signal listener
      const abortListener = () => {
        console.log(`🛑 Aborting chunk load: ${chunkInfo.filename}`)
        reject(new Error('Loading cancelled'))
      }
      
      this.abortController?.signal.addEventListener('abort', abortListener)
      
      loader.load(
        chunkPath,
        (geometry) => {
          // Check if loading was cancelled before processing
          if (this.abortController?.signal.aborted) {
            console.log(`🛑 Chunk loaded but cancelled: ${chunkInfo.filename}`)
            reject(new Error('Loading cancelled'))
            return
          }
          
          this.onChunkGeometryLoaded(chunkInfo, geometry)
          resolve()
        },
        (_progress) => {
          // Progress callback - could be used for detailed progress tracking
        },
        (error) => {
          console.error(`Error loading chunk ${chunkInfo.filename}:`, error)
          reject(error)
        }
      )
    })
  }
  
  /**
   * Handle loaded chunk geometry
   */
  private onChunkGeometryLoaded(chunkInfo: ChunkInfo, geometry: THREE.BufferGeometry) {
    // Double-check if loading was cancelled before adding to scene
    if (this.abortController?.signal.aborted) {
      console.log(`🛑 Chunk processed but cancelled, not adding to scene: ${chunkInfo.filename}`)
      geometry.dispose()
      return
    }

    console.log(`✨ Chunk ${chunkInfo.filename} loaded with ${geometry.attributes.position.count} vertices`)
    
    // Create material for this chunk
    const material = new THREE.PointsMaterial({
      size: this.pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      map: this.createCircularTexture(),
      alphaTest: 0.1
    })
    
    // Create individual point cloud for this chunk
    const pointCloud = new THREE.Points(geometry, material)
    
    // Apply model rotation immediately if set
    if (this.modelRotation) {
      pointCloud.rotateX((this.modelRotation.x * Math.PI) / 180)
      pointCloud.rotateY((this.modelRotation.y * Math.PI) / 180)
      pointCloud.rotateZ((this.modelRotation.z * Math.PI) / 180)
    }
    
    // Add to scene immediately for streaming effect
    this.scene.add(pointCloud)
    this.loadedPointClouds.push(pointCloud)
    
    // Update chunk tracking
    const chunkIndex = this.chunks.findIndex(chunk => chunk.info.filename === chunkInfo.filename)
    if (chunkIndex !== -1) {
      this.chunks[chunkIndex].pointCloud = pointCloud
      this.chunks[chunkIndex].loaded = true
    }
    
    console.log(`🎯 Chunk ${chunkInfo.filename} added to scene (${this.loadedPointClouds.length} total chunks visible)`)
  }
  
  
  /**
   * Create circular texture for points
   */
  private createCircularTexture(): THREE.Texture {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.2, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    
    const texture = new THREE.Texture(canvas)
    texture.needsUpdate = true
    return texture
  }
  
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
}