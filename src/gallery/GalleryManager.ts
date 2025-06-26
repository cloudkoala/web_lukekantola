import type { SceneState } from '../types'
import { extractSceneMetadata, validateScenePng, getSceneInfo } from './PngMetadata'
import type { PngMetadata } from './PngMetadata'
import { CameraCapture } from './CameraCapture'
import type { CaptureOptions, CaptureProgress } from './CameraCapture'

/**
 * Gallery Manager for Scene PNG System
 * 
 * This module manages the gallery of scene PNG files, including loading,
 * scanning, filtering, and organizing the gallery collection.
 */

export interface GalleryItem {
  id: string
  filename: string
  url: string
  metadata: PngMetadata
  info: {
    name: string
    model: string
    effects: number
    timestamp: Date
  }
  thumbnail?: string
}

export interface GalleryFilter {
  model?: string
  hasEffects?: boolean
  dateRange?: {
    start: Date
    end: Date
  }
  searchTerm?: string
}

export interface GalleryStats {
  totalScenes: number
  models: string[]
  dateRange: {
    earliest: Date
    latest: Date
  }
  averageEffects: number
}

export class GalleryManager {
  private items: GalleryItem[] = []
  private cameraCapture?: CameraCapture
  private loadingCallbacks: Set<(loading: boolean) => void> = new Set()
  private updateCallbacks: Set<() => void> = new Set()

  constructor() {
    // Auto-scan for gallery files on initialization
    this.scanGalleryFiles()
  }

  /**
   * Sets the camera capture instance for creating new gallery items
   */
  setCameraCapture(cameraCapture: CameraCapture) {
    this.cameraCapture = cameraCapture
  }

  /**
   * Registers a callback for loading state changes
   */
  onLoadingChange(callback: (loading: boolean) => void) {
    this.loadingCallbacks.add(callback)
    return () => this.loadingCallbacks.delete(callback)
  }

  /**
   * Registers a callback for gallery updates
   */
  onGalleryUpdate(callback: () => void) {
    this.updateCallbacks.add(callback)
    return () => this.updateCallbacks.delete(callback)
  }

  /**
   * Notifies loading state change
   */
  private notifyLoading(loading: boolean) {
    this.loadingCallbacks.forEach(callback => callback(loading))
  }

  /**
   * Notifies gallery update
   */
  private notifyUpdate() {
    this.updateCallbacks.forEach(callback => callback())
  }

  /**
   * Scans the gallery directory for PNG files with scene metadata
   */
  async scanGalleryFiles(): Promise<void> {
    this.notifyLoading(true)
    
    try {
      // In a web environment, we'll need to maintain a list of available files
      // This would typically be provided by a server endpoint or manifest file
      const manifestUrl = '/gallery/manifest.json'
      
      try {
        const response = await fetch(manifestUrl)
        if (response.ok) {
          const manifest = await response.json()
          await this.loadFromManifest(manifest.files || [])
        } else {
          console.log('No gallery manifest found, starting with empty gallery')
        }
      } catch (error) {
        console.log('Gallery manifest not available, starting with empty gallery')
      }
      
    } catch (error) {
      console.error('Error scanning gallery files:', error)
    } finally {
      this.notifyLoading(false)
    }
  }

  /**
   * Loads gallery items from a manifest file
   */
  private async loadFromManifest(filenames: string[]): Promise<void> {
    const items: GalleryItem[] = []
    
    for (const filename of filenames) {
      try {
        const url = `/gallery/${filename}`
        const response = await fetch(url)
        
        if (response.ok) {
          const buffer = await response.arrayBuffer()
          const metadata = extractSceneMetadata(buffer)
          
          if (metadata) {
            const item: GalleryItem = {
              id: filename,
              filename,
              url,
              metadata,
              info: getSceneInfo(metadata)
            }
            items.push(item)
          }
        }
      } catch (error) {
        console.warn(`Error loading gallery item ${filename}:`, error)
      }
    }
    
    this.items = items.sort((a, b) => b.info.timestamp.getTime() - a.info.timestamp.getTime())
    this.notifyUpdate()
  }

  /**
   * Adds a new PNG file to the gallery (typically from file upload or drag-and-drop)
   */
  async addPngFile(file: File): Promise<GalleryItem | null> {
    try {
      // Validate that it's a PNG with scene metadata
      const isValid = await validateScenePng(file)
      if (!isValid) {
        throw new Error('File is not a valid scene PNG')
      }

      // Extract metadata
      const buffer = await file.arrayBuffer()
      const metadata = extractSceneMetadata(buffer)
      
      if (!metadata) {
        throw new Error('No scene metadata found in PNG')
      }

      // Create gallery item
      const url = URL.createObjectURL(file)
      const item: GalleryItem = {
        id: `upload_${Date.now()}_${file.name}`,
        filename: file.name,
        url,
        metadata,
        info: getSceneInfo(metadata)
      }

      // Add to gallery
      this.items.unshift(item) // Add to beginning (most recent)
      this.notifyUpdate()

      return item
      
    } catch (error) {
      console.error('Error adding PNG file to gallery:', error)
      throw error
    }
  }

  /**
   * Captures the current scene and adds it to the gallery
   */
  async captureCurrentScene(
    sceneState: SceneState,
    options: CaptureOptions = {},
    progressCallback?: (progress: CaptureProgress) => void
  ): Promise<GalleryItem> {
    if (!this.cameraCapture) {
      throw new Error('Camera capture not initialized')
    }

    try {
      // Set progress callback on camera capture
      if (progressCallback) {
        this.cameraCapture.setProgressCallback(progressCallback)
      }

      // Capture scene with metadata
      const url = await this.cameraCapture.captureScene(sceneState, {
        ...options,
        downloadImmediately: true // Save to downloads folder
      })

      // Create gallery item
      const item: GalleryItem = {
        id: `capture_${Date.now()}`,
        filename: options.filename || `scene_${Date.now()}.png`,
        url,
        metadata: {
          sceneState,
          version: '1.0',
          timestamp: Date.now()
        },
        info: getSceneInfo({
          sceneState,
          version: '1.0',
          timestamp: Date.now()
        })
      }

      // Add to gallery
      this.items.unshift(item)
      this.notifyUpdate()

      return item
      
    } catch (error) {
      console.error('Error capturing scene for gallery:', error)
      throw error
    }
  }

  /**
   * Gets all gallery items with optional filtering
   */
  getItems(filter?: GalleryFilter): GalleryItem[] {
    let filtered = [...this.items]

    if (filter) {
      if (filter.model) {
        filtered = filtered.filter(item => item.info.model === filter.model)
      }

      if (filter.hasEffects !== undefined) {
        filtered = filtered.filter(item => 
          filter.hasEffects ? item.info.effects > 0 : item.info.effects === 0
        )
      }

      if (filter.dateRange) {
        filtered = filtered.filter(item => 
          item.info.timestamp >= filter.dateRange!.start &&
          item.info.timestamp <= filter.dateRange!.end
        )
      }

      if (filter.searchTerm) {
        const term = filter.searchTerm.toLowerCase()
        filtered = filtered.filter(item =>
          item.info.name.toLowerCase().includes(term) ||
          item.info.model.toLowerCase().includes(term) ||
          item.filename.toLowerCase().includes(term)
        )
      }
    }

    return filtered
  }

  /**
   * Gets a specific gallery item by ID
   */
  getItem(id: string): GalleryItem | null {
    return this.items.find(item => item.id === id) || null
  }

  /**
   * Removes an item from the gallery
   */
  removeItem(id: string): boolean {
    const index = this.items.findIndex(item => item.id === id)
    if (index === -1) return false

    const item = this.items[index]
    
    // Revoke object URL if it's a blob URL
    if (item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
    }
    
    if (item.thumbnail && item.thumbnail.startsWith('blob:')) {
      URL.revokeObjectURL(item.thumbnail)
    }

    this.items.splice(index, 1)
    this.notifyUpdate()
    
    return true
  }

  /**
   * Gets gallery statistics
   */
  getStats(): GalleryStats {
    if (this.items.length === 0) {
      return {
        totalScenes: 0,
        models: [],
        dateRange: {
          earliest: new Date(),
          latest: new Date()
        },
        averageEffects: 0
      }
    }

    const models = [...new Set(this.items.map(item => item.info.model))]
    const timestamps = this.items.map(item => item.info.timestamp.getTime())
    const effects = this.items.map(item => item.info.effects)

    return {
      totalScenes: this.items.length,
      models,
      dateRange: {
        earliest: new Date(Math.min(...timestamps)),
        latest: new Date(Math.max(...timestamps))
      },
      averageEffects: effects.reduce((sum, count) => sum + count, 0) / effects.length
    }
  }

  /**
   * Exports the current gallery as a manifest file
   */
  exportManifest(): string {
    const manifest = {
      version: '1.0',
      generated: new Date().toISOString(),
      files: this.items.map(item => item.filename)
    }
    
    return JSON.stringify(manifest, null, 2)
  }

  /**
   * Generates a thumbnail for a gallery item (if not already cached)
   */
  async generateThumbnail(item: GalleryItem, size: number = 256): Promise<string> {
    if (item.thumbnail) {
      return item.thumbnail
    }

    if (!this.cameraCapture) {
      throw new Error('Camera capture not initialized')
    }

    try {
      const thumbnailUrl = await this.cameraCapture.captureThumbnail(
        item.metadata.sceneState,
        size
      )
      
      item.thumbnail = thumbnailUrl
      return thumbnailUrl
      
    } catch (error) {
      console.error('Error generating thumbnail:', error)
      throw error
    }
  }

  /**
   * Searches for scenes with similar characteristics
   */
  findSimilarScenes(targetItem: GalleryItem, maxResults: number = 5): GalleryItem[] {
    const target = targetItem.metadata.sceneState
    
    const scored = this.items
      .filter(item => item.id !== targetItem.id)
      .map(item => {
        const scene = item.metadata.sceneState
        let score = 0
        
        // Same model
        if (scene.modelKey === target.modelKey) score += 3
        
        // Similar number of effects
        const effectsDiff = Math.abs(scene.effectsChain.length - target.effectsChain.length)
        score += Math.max(0, 2 - effectsDiff)
        
        // Similar point size
        const sizeDiff = Math.abs(scene.pointSize - target.pointSize)
        score += Math.max(0, 1 - sizeDiff * 10)
        
        // Same sphere mode
        if (scene.sphereMode === target.sphereMode) score += 1
        
        return { item, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(result => result.item)
    
    return scored
  }

  /**
   * Clears all gallery items and their cached URLs
   */
  clear(): void {
    // Clean up object URLs
    this.items.forEach(item => {
      if (item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url)
      }
      if (item.thumbnail && item.thumbnail.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnail)
      }
    })
    
    this.items = []
    this.notifyUpdate()
  }
}