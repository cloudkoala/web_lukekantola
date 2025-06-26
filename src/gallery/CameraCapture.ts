import * as THREE from 'three'
import type { SceneState } from '../types'
import { embedSceneMetadata, generateSceneFilename } from './PngMetadata'

/**
 * Camera Capture System for Scene Gallery
 * 
 * This module provides high-quality PNG rendering and export functionality
 * with embedded scene metadata for the gallery system.
 */

export interface CaptureOptions {
  width?: number
  height?: number
  quality?: number
  filename?: string
  downloadImmediately?: boolean
}

export interface CaptureProgress {
  stage: 'rendering' | 'processing' | 'embedding' | 'saving' | 'complete'
  progress: number // 0-100
  message: string
}

export class CameraCapture {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.Camera
  private progressCallback?: (progress: CaptureProgress) => void
  private postProcessingPass?: any // PostProcessingPass

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    
    // Get post-processing pass from global scope
    this.postProcessingPass = (window as any).postProcessingPass
    
  }

  /**
   * Sets the progress callback for capture operations
   */
  setProgressCallback(callback: (progress: CaptureProgress) => void) {
    this.progressCallback = callback
  }

  /**
   * Captures the current scene as a high-quality PNG with embedded metadata
   */
  async captureScene(
    sceneState: SceneState,
    options: CaptureOptions = {}
  ): Promise<string> {
    const {
      width = 1920,
      height = 1080,
      quality = 0.95,
      filename,
      downloadImmediately = true
    } = options

    try {
      // Stage 1: Rendering
      this.updateProgress('rendering', 10, 'Capturing from canvas...')
      
      // Try canvas capture first (simpler and guaranteed to have effects)
      let imageDataUrl: string
      try {
        imageDataUrl = await this.captureFromCanvas(width, height, quality)
      } catch (canvasError) {
        console.warn('Canvas capture failed, falling back to high-quality render:', canvasError)
        this.updateProgress('rendering', 15, 'Falling back to off-screen render...')
        imageDataUrl = await this.renderHighQuality(width, height, quality)
      }
      
      // Stage 2: Processing
      this.updateProgress('processing', 40, 'Converting image data...')
      
      const imageBlob = await this.dataUrlToBlob(imageDataUrl)
      const imageBuffer = await imageBlob.arrayBuffer()
      
      // Stage 3: Embedding metadata
      this.updateProgress('embedding', 70, 'Embedding scene metadata...')
      
      const pngWithMetadata = embedSceneMetadata(imageBuffer, sceneState)
      
      // Stage 4: Saving
      this.updateProgress('saving', 90, 'Preparing download...')
      
      const finalBlob = new Blob([pngWithMetadata], { type: 'image/png' })
      const finalFilename = filename || generateSceneFilename(sceneState, sceneState.name)
      
      if (downloadImmediately) {
        this.downloadBlob(finalBlob, finalFilename)
      }
      
      // Stage 5: Complete
      this.updateProgress('complete', 100, 'Scene captured successfully!')
      
      // Return data URL for preview purposes
      return URL.createObjectURL(finalBlob)
      
    } catch (error) {
      console.error('Error capturing scene:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to capture scene: ${message}`)
    }
  }

  /**
   * Captures from the existing canvas (with effects) and scales it
   */
  private async captureFromCanvas(
    width: number,
    height: number,
    quality: number
  ): Promise<string> {
    // Force a render frame to ensure canvas is up to date
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    // Get the main canvas that already has effects applied
    const mainCanvas = document.querySelector('#canvas') as HTMLCanvasElement
    if (!mainCanvas) {
      throw new Error('Main canvas not found')
    }
    
    // Try to read directly from WebGL canvas first
    try {
      // For WebGL canvases, we need to use toDataURL directly
      const directDataUrl = mainCanvas.toDataURL('image/png', quality)
      
      if (directDataUrl === 'data:,') {
        throw new Error('Canvas returned empty data URL - likely due to WebGL context issues')
      }
      
      // Always create a square center-cropped image
      const captureCanvas = document.createElement('canvas')
      captureCanvas.width = width
      captureCanvas.height = height
      const ctx = captureCanvas.getContext('2d')!
      
      // Create an image from the direct capture and center crop it
      const img = new Image()
      return new Promise((resolve, reject) => {
        img.onload = () => {
          // Calculate center crop dimensions for square output
          const sourceAspect = img.width / img.height
          const targetAspect = width / height
          
          let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height
          
          if (sourceAspect > targetAspect) {
            // Source is wider - crop horizontally (center crop)
            sourceWidth = img.height * targetAspect
            sourceX = (img.width - sourceWidth) / 2
          } else if (sourceAspect < targetAspect) {
            // Source is taller - crop vertically (center crop)
            sourceHeight = img.width / targetAspect
            sourceY = (img.height - sourceHeight) / 2
          }
          
          // Draw the center-cropped image
          ctx.drawImage(
            img,
            sourceX, sourceY, sourceWidth, sourceHeight,  // Source rectangle (cropped)
            0, 0, width, height                           // Destination rectangle (full canvas)
          )
          
          resolve(captureCanvas.toDataURL('image/png', quality))
        }
        img.onerror = reject
        img.src = directDataUrl
      })
      
    } catch (directError) {
      console.warn('Direct canvas capture failed:', directError)
      throw new Error(`Canvas capture failed: ${directError.message}`)
    }
  }

  /**
   * Renders the scene at high quality using off-screen rendering
   */
  private async renderHighQuality(
    width: number,
    height: number,
    quality: number
  ): Promise<string> {
    // Store original renderer state
    const originalSize = this.renderer.getSize(new THREE.Vector2())
    const originalPixelRatio = this.renderer.getPixelRatio()
    const originalRenderTarget = this.renderer.getRenderTarget()

    // Create render targets outside try block for proper cleanup
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      generateMipmaps: false,
      samples: 4 // MSAA for better quality
    })

    const sceneRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      generateMipmaps: false,
      samples: 4
    })

    try {
      // Set high pixel ratio for crisp rendering
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      this.renderer.setSize(width, height)
      this.renderer.setRenderTarget(renderTarget)

      // Enable high-quality settings temporarily
      const originalShadowMapEnabled = this.renderer.shadowMap.enabled
      const originalToneMapping = this.renderer.toneMapping
      const originalOutputEncoding = this.renderer.outputColorSpace

      this.renderer.shadowMap.enabled = true
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.outputColorSpace = THREE.SRGBColorSpace

      // Render the scene with post-processing effects
      if (this.postProcessingPass) {
        // Check if effects are actually active (same logic as main app)
        const effectsChain = this.postProcessingPass.getEffectsChain()
        const hasActiveEffects = this.postProcessingPass.enabled && (
          effectsChain.some((effect: any) => effect.enabled && (
            effect.type === 'background' || // Background effects are always active when enabled
            effect.type === 'drawrange' ||  // DrawRange effects are always active when enabled
            effect.type === 'pointnetwork' || // Point network effects are always active when enabled
            effect.type === 'material' ||   // Material effects are always active when enabled
            effect.type === 'topographic' || // Topographic effects are always active when enabled
            (effect.parameters.intensity || 0) > 0 // Other effects need intensity > 0
          )) || 
          ((this.postProcessingPass as any).effectType !== 'none' && this.postProcessingPass.intensity > 0)
        )
        
        console.log('Camera capture - Effects status:', {
          postProcessingEnabled: this.postProcessingPass.enabled,
          effectsChainLength: effectsChain.length,
          hasActiveEffects,
          effectsChain: effectsChain.map((e: any) => ({ 
            type: e.type, 
            enabled: e.enabled, 
            intensity: e.parameters?.intensity 
          }))
        })
        
        if (hasActiveEffects) {
          // Store original post-processing size  
          const originalPostSize = { width: window.innerWidth, height: window.innerHeight }
          
          // Update post-processing pass size for high-quality capture
          this.postProcessingPass.setSize(width, height)
          
          // First render scene to intermediate target
          this.renderer.setRenderTarget(sceneRenderTarget)
          this.renderer.clear()
          this.renderer.render(this.scene, this.camera)
          
          // Then apply post-processing effects to final target
          this.postProcessingPass.render(this.renderer, sceneRenderTarget.texture, renderTarget)
          
          // Restore original post-processing size
          this.postProcessingPass.setSize(originalPostSize.width, originalPostSize.height)
        } else {
          console.log('Camera capture - No active effects, rendering without post-processing')
          // No active effects, render directly
          this.renderer.setRenderTarget(renderTarget)
          this.renderer.clear()
          this.renderer.render(this.scene, this.camera)
        }
      } else {
        console.log('Camera capture - No post-processing pass available')
        // Fallback: render without effects directly to final target
        this.renderer.setRenderTarget(renderTarget)
        this.renderer.clear()
        this.renderer.render(this.scene, this.camera)
      }
      
      // Set final target for pixel reading
      this.renderer.setRenderTarget(renderTarget)

      // Read pixels from render target
      const buffer = new Uint8Array(width * height * 4)
      this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer)

      // Create canvas and draw pixels
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      
      const imageData = ctx.createImageData(width, height)
      
      // Flip Y coordinate (WebGL uses bottom-left origin, canvas uses top-left)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIndex = ((height - 1 - y) * width + x) * 4
          const dstIndex = (y * width + x) * 4
          
          imageData.data[dstIndex] = buffer[srcIndex]
          imageData.data[dstIndex + 1] = buffer[srcIndex + 1]
          imageData.data[dstIndex + 2] = buffer[srcIndex + 2]
          imageData.data[dstIndex + 3] = buffer[srcIndex + 3]
        }
      }
      
      ctx.putImageData(imageData, 0, 0)

      // Convert to high-quality PNG
      const dataUrl = canvas.toDataURL('image/png', quality)

      // Restore original renderer settings
      this.renderer.shadowMap.enabled = originalShadowMapEnabled
      this.renderer.toneMapping = originalToneMapping
      this.renderer.outputColorSpace = originalOutputEncoding

      return dataUrl

    } finally {
      // Always restore original renderer state
      this.renderer.setSize(originalSize.x, originalSize.y)
      this.renderer.setPixelRatio(originalPixelRatio)
      this.renderer.setRenderTarget(originalRenderTarget)
      
      // Always cleanup render targets
      renderTarget.dispose()
      sceneRenderTarget.dispose()
    }
  }

  /**
   * Converts a data URL to a Blob
   */
  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl)
    return response.blob()
  }

  /**
   * Downloads a blob as a file
   */
  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Clean up the object URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  /**
   * Updates progress callback
   */
  private updateProgress(
    stage: CaptureProgress['stage'],
    progress: number,
    message: string
  ) {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, message })
    }
  }

  /**
   * Captures a thumbnail version of the scene (lower quality, smaller size)
   */
  async captureThumbnail(
    sceneState: SceneState,
    size: number = 512
  ): Promise<string> {
    try {
      const imageDataUrl = await this.renderHighQuality(size, size, 0.8)
      const imageBlob = await this.dataUrlToBlob(imageDataUrl)
      const imageBuffer = await imageBlob.arrayBuffer()
      
      const pngWithMetadata = embedSceneMetadata(imageBuffer, sceneState)
      const finalBlob = new Blob([pngWithMetadata], { type: 'image/png' })
      
      return URL.createObjectURL(finalBlob)
    } catch (error) {
      console.error('Error capturing thumbnail:', error)
      throw error
    }
  }

  /**
   * Validates that the current scene can be captured
   */
  canCapture(): { canCapture: boolean; reason?: string } {
    if (!this.renderer) {
      return { canCapture: false, reason: 'Renderer not available' }
    }
    
    if (!this.scene) {
      return { canCapture: false, reason: 'Scene not available' }
    }
    
    if (!this.camera) {
      return { canCapture: false, reason: 'Camera not available' }
    }

    // Check if WebGL is supported
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) {
      return { canCapture: false, reason: 'WebGL not supported' }
    }

    return { canCapture: true }
  }

  /**
   * Gets recommended capture settings based on device capabilities
   */
  getRecommendedSettings(): CaptureOptions {
    const canvas = this.renderer.domElement
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // Check available memory and performance
    const isHighEnd = devicePixelRatio >= 2 && canvas.width * canvas.height > 1920 * 1080
    const isMobile = /Mobi|Android/i.test(navigator.userAgent)
    
    // Use square dimensions for all gallery captures
    if (isMobile) {
      return {
        width: 1080,
        height: 1080,
        quality: 0.85
      }
    } else if (isHighEnd) {
      return {
        width: 1440,  // Changed from 2560x1440 to 1440x1440 (square)
        height: 1440,
        quality: 0.95
      }
    } else {
      return {
        width: 1080,  // Changed from 1920x1080 to 1080x1080 (square)
        height: 1080,
        quality: 0.9
      }
    }
  }
}