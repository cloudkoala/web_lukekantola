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
  private combinedPointCloud: THREE.Points | null = null
  
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
    
    // Update all loaded chunks
    this.chunks.forEach(chunk => {
      if (chunk.loaded && chunk.pointCloud.material) {
        const material = chunk.pointCloud.material as THREE.PointsMaterial
        material.size = size
        material.needsUpdate = true
      }
    })
  }
  
  /**
   * Load a chunked PLY model progressively
   */
  public async loadChunkedModel(manifestPath: string): Promise<void> {
    console.log('🌟 ProgressiveLoader: Loading chunked model from manifest:', manifestPath)
    
    try {
      // Load manifest
      const response = await fetch(`${this.basePath}${manifestPath}`)
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
    
    // Load chunks one by one with small delays
    for (let i = 0; i < this.loadingQueue.length; i++) {
      const chunkInfo = this.loadingQueue[i]
      console.log(`📦 Loading chunk ${i + 1}/${this.loadingQueue.length}: ${chunkInfo.filename}`)
      
      try {
        await this.loadChunk(chunkInfo)
        console.log(`✅ Successfully loaded chunk ${i + 1}/${this.loadingQueue.length}`)
        
        // Notify progress
        if (this.onChunkLoaded) {
          this.onChunkLoaded(i + 1, this.loadingQueue.length)
        }
        
        // Small delay to prevent blocking the main thread
        if (i < this.loadingQueue.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
      } catch (error) {
        console.error(`❌ Failed to load chunk ${chunkInfo.filename}:`, error)
        // Continue loading other chunks even if one fails
      }
    }
    
    this.isLoading = false
    console.log('Progressive loading complete')
    
    // Compute bounding box and apply any necessary transformations
    this.finalizeCombinedPointCloud()
    
    if (this.onLoadComplete) {
      this.onLoadComplete()
    }
  }
  
  /**
   * Load a single chunk
   */
  private async loadChunk(chunkInfo: ChunkInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new PLYLoader()
      const chunkPath = `${this.basePath}models/chunks/${chunkInfo.filename}?t=${Date.now()}`
      
      console.log(`Loading chunk: ${chunkInfo.filename} (${chunkInfo.vertex_count} vertices)`)
      console.log(`Full chunk path: ${chunkPath}`)
      
      loader.load(
        chunkPath,
        (geometry) => {
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
    console.log(`Chunk ${chunkInfo.filename} loaded with attributes:`, Object.keys(geometry.attributes))
    console.log(`Vertex count: ${geometry.attributes.position.count}`)
    
    if (geometry.attributes.color) {
      console.log('✓ Color attribute found!')
    } else {
      console.log('✗ No color attribute found')
    }
    
    // Update chunk info
    const chunkIndex = this.chunks.findIndex(chunk => chunk.info.filename === chunkInfo.filename)
    if (chunkIndex !== -1) {
      this.chunks[chunkIndex].pointCloud = new THREE.Points(geometry) // Temporary, we'll combine later
      this.chunks[chunkIndex].loaded = true
    }
    
    // If this is the first chunk, create the combined point cloud
    if (!this.combinedPointCloud) {
      const material = new THREE.PointsMaterial({
        size: this.pointSize,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        map: this.createCircularTexture(),
        alphaTest: 0.1
      })
      
      this.combinedPointCloud = new THREE.Points(geometry.clone(), material)
      this.scene.add(this.combinedPointCloud)
      console.log(`Created combined point cloud with first chunk: ${chunkInfo.filename}`)
      console.log('  Scene children count:', this.scene.children.length)
      console.log('  Point cloud vertex count:', this.combinedPointCloud.geometry.attributes.position.count)
      console.log('  Point cloud visible:', this.combinedPointCloud.visible)
      console.log('  Point cloud position:', this.combinedPointCloud.position)
    } else {
      // Merge this geometry with the combined point cloud
      this.mergeGeometryIntoPointCloud(geometry)
      console.log(`Merged chunk into combined point cloud: ${chunkInfo.filename}`)
    }
  }
  
  /**
   * Merge a new geometry into the existing combined point cloud
   */
  private mergeGeometryIntoPointCloud(newGeometry: THREE.BufferGeometry) {
    if (!this.combinedPointCloud) return
    
    const existingGeometry = this.combinedPointCloud.geometry
    const existingPositions = existingGeometry.attributes.position.array
    const existingColors = existingGeometry.attributes.color?.array
    const newPositions = newGeometry.attributes.position.array
    const newColors = newGeometry.attributes.color?.array
    
    // Create new combined arrays
    const combinedPositions = new Float32Array(existingPositions.length + newPositions.length)
    const combinedColors = new Float32Array((existingColors?.length || 0) + (newColors?.length || 0))
    
    // Copy existing data
    combinedPositions.set(existingPositions, 0)
    if (existingColors && newColors) {
      combinedColors.set(existingColors, 0)
      combinedColors.set(newColors, existingColors.length)
    }
    
    // Copy new data
    combinedPositions.set(newPositions, existingPositions.length)
    
    // Update geometry attributes
    existingGeometry.setAttribute('position', new THREE.BufferAttribute(combinedPositions, 3))
    if (combinedColors.length > 0) {
      existingGeometry.setAttribute('color', new THREE.BufferAttribute(combinedColors, 3))
    }
    
    // Mark attributes as needing update
    existingGeometry.attributes.position.needsUpdate = true
    if (existingGeometry.attributes.color) {
      existingGeometry.attributes.color.needsUpdate = true
    }
  }
  
  /**
   * Finalize the combined point cloud after all chunks are loaded
   */
  private finalizeCombinedPointCloud() {
    if (!this.combinedPointCloud) return
    
    console.log('Finalizing combined point cloud...')
    
    // Compute bounding box
    this.combinedPointCloud.geometry.computeBoundingBox()
    
    if (this.combinedPointCloud.geometry.boundingBox) {
      const box = this.combinedPointCloud.geometry.boundingBox
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDimension = Math.max(size.x, size.y, size.z)
      
      console.log('Progressive loading - Combined point cloud bounding box:')
      console.log('  Min:', box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2))
      console.log('  Max:', box.max.x.toFixed(2), box.max.y.toFixed(2), box.max.z.toFixed(2))
      console.log('  Size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2))
      console.log('  Center:', center.x.toFixed(2), center.y.toFixed(2), center.z.toFixed(2))
      console.log('  Max dimension:', maxDimension.toFixed(2))
      console.log('  Total vertex count:', this.combinedPointCloud.geometry.attributes.position.count)
      
      // The chunks should already be pre-scaled, but log if something seems off
      if (maxDimension > 50) {
        console.log('  WARNING: Large combined model detected - chunks may not be properly pre-scaled')
      }
    }
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
    if (this.combinedPointCloud) {
      this.scene.remove(this.combinedPointCloud)
      this.combinedPointCloud = null
    }
    
    this.chunks = []
    this.loadingQueue = []
    this.manifest = null
    this.isLoading = false
  }
  
  /**
   * Get all loaded point clouds (for camera interaction)
   */
  public getLoadedPointClouds(): THREE.Points[] {
    return this.combinedPointCloud ? [this.combinedPointCloud] : []
  }
}