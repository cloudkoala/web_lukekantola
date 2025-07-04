/**
 * Simple Progressive PLY Loader
 * Streamlined version for homepage - no effects dependencies
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

export class SimpleProgressiveLoader {
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
  private abortController: AbortController | null = null
  
  // Concurrent loading properties
  private downloadingChunks: Map<string, Promise<THREE.BufferGeometry>> = new Map()
  private readyBuffer: Map<string, THREE.BufferGeometry> = new Map()
  private maxConcurrentDownloads: number = 2
  private maxBufferSize: number = 8
  
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
      if (pointCloud.material && 'size' in pointCloud.material) {
        (pointCloud.material as THREE.PointsMaterial).size = size
      }
    })
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
  }
  
  /**
   * Load a chunked PLY model progressively
   */
  public async loadChunkedModel(modelNameOrPath: string): Promise<void> {
    // Cancel any existing loading operation
    this.cancelLoading()
    
    // Set up new abort controller for this loading operation
    this.abortController = new AbortController()
    
    try {
      // Auto-construct manifest path if just model name is provided
      let manifestPath = modelNameOrPath
      if (!manifestPath.includes('/') && !manifestPath.endsWith('.json')) {
        manifestPath = `models/chunks/${modelNameOrPath}/${modelNameOrPath}_manifest.json`
      }
      
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
        
        // Start more downloads if needed
        if (this.readyBuffer.size < this.maxBufferSize) {
          this.startNextDownloads(processedCount)
        }
        
        // Small delay for smooth loading
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
        if (this.readyBuffer.size < this.maxBufferSize) {
          this.readyBuffer.set(chunkInfo.filename, geometry)
        } else {
          geometry.dispose()
        }
        this.downloadingChunks.delete(chunkInfo.filename)
      }).catch(error => {
        this.downloadingChunks.delete(chunkInfo.filename)
        console.error(`Download failed: ${chunkInfo.filename}`, error)
      })
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
          // Track download progress
          if (progress.lengthComputable) {
            const percentComplete = progress.loaded / progress.total
            this.updateChunkProgress(chunkInfo.filename, percentComplete)
          }
        },
        (error) => {
          console.error(`Error downloading chunk ${chunkInfo.filename}:`, error)
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
  private onChunkGeometryLoaded(chunkInfo: ChunkInfo, geometry: THREE.BufferGeometry) {
    // Double-check if loading was cancelled before adding to scene
    if (this.abortController?.signal.aborted) {
      geometry.dispose()
      return
    }

    // Enhance vertex colors for better appearance
    if (geometry.attributes.color) {
      const colors = geometry.attributes.color.array as Float32Array
      for (let i = 0; i < colors.length; i += 3) {
        let r = colors[i] * 2.2
        let g = colors[i + 1] * 2.2
        let b = colors[i + 2] * 2.2
        
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        const saturationBoost = 0.8
        r = gray + saturationBoost * (r - gray)
        g = gray + saturationBoost * (g - gray)
        b = gray + saturationBoost * (b - gray)
        
        colors[i] = Math.min(1.0, r)
        colors[i + 1] = Math.min(1.0, g)
        colors[i + 2] = Math.min(1.0, b)
      }
      geometry.attributes.color.needsUpdate = true
    }
    
    // Create simple point material (no shaders)
    const material = new THREE.PointsMaterial({
      size: this.pointSize,
      vertexColors: true,
      sizeAttenuation: true
    })
    
    // Create individual point cloud for this chunk
    const pointCloud = new THREE.Points(geometry, material)
    
    // Disable frustum culling to prevent disappearing during fast rotation
    pointCloud.frustumCulled = false
    
    // Add to scene immediately
    this.scene.add(pointCloud)
    pointCloud.updateMatrixWorld(true)
    
    this.loadedPointClouds.push(pointCloud)
    
    // Update chunk tracking
    const chunkIndex = this.chunks.findIndex(chunk => chunk.info.filename === chunkInfo.filename)
    if (chunkIndex !== -1) {
      this.chunks[chunkIndex].pointCloud = pointCloud
      this.chunks[chunkIndex].loaded = true
    }
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
}