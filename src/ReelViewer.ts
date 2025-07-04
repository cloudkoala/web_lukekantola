import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'
import { CSSLoadingSpinner } from './CSSLoadingSpinner'

export class ReelViewer {
  private canvas: HTMLCanvasElement
  private viewer: GaussianSplats3D.Viewer | null = null
  private isLoading = false
  private pendingModelLoad = false
  private loadingSpinner: CSSLoadingSpinner | null = null

  // Castleton model configuration from sandbox (using Gaussian splat)
  private readonly CASTLETON_CONFIG = {
    displayName: "Castleton Tower",
    fileName: "Castelton_003_orient.ply", // Gaussian splat file
    defaultFocalLength: 35,
    cameraPosition: { x: 0.13, y: 2.24, z: 2.0 },
    target: { x: -0.13, y: 1.23, z: 0.04 }
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.initViewer()
  }

  private initViewer() {
    try {
      // Ensure canvas has proper size
      if (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0) {
        this.canvas.style.width = '300px'
        this.canvas.style.height = '400px'
        this.canvas.width = 300
        this.canvas.height = 400
      }
      
      const containerDiv = this.canvas.parentElement!
      
      // Remove our manual canvas since viewer will create its own
      if (this.canvas.parentElement) {
        this.canvas.parentElement.removeChild(this.canvas)
      }
      
      // Initialize CSS-based loading spinner
      this.loadingSpinner = new CSSLoadingSpinner(containerDiv)
      
      // Hide default GaussianSplats3D loading UI with CSS
      this.hideDefaultLoader(containerDiv)
      
      this.viewer = new GaussianSplats3D.Viewer({
        rootElement: containerDiv,
        backgroundColor: [0.2, 0.2, 0.2, 1.0]
      })
      
      if (this.viewer) {
        this.viewer.start()
        
        // Model loading will be triggered after Fisher completes
        
        // Handle pending model load
        if (this.pendingModelLoad) {
          this.loadCastletonModel()
          this.pendingModelLoad = false
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize GaussianSplats3D viewer:', error)
      this.viewer = null
    }
  }

  private hideDefaultLoader(container: HTMLElement) {
    // Add CSS to hide default GaussianSplats3D loading elements
    const style = document.createElement('style')
    style.textContent = `
      .loading-container,
      .loading-spinner,
      .loading-progress,
      [class*="loading"],
      [id*="loading"],
      .splat-viewer-loading,
      .gsplat-loading {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `
    document.head.appendChild(style)
    
    // Also try to hide by scanning for loading elements
    const observer = new MutationObserver(() => {
      const loadingElements = container.querySelectorAll('*')
      loadingElements.forEach(el => {
        const element = el as HTMLElement
        if (element.textContent?.includes('Loading') || 
            element.textContent?.includes('Processing') ||
            element.className?.includes('loading') ||
            element.id?.includes('loading')) {
          element.style.display = 'none'
        }
      })
    })
    
    observer.observe(container, { childList: true, subtree: true })
    
    // Stop observing after 5 seconds
    setTimeout(() => observer.disconnect(), 5000)
  }

  // Public method to trigger model loading after Fisher is complete
  loadModelAfterFisher() {
    if (this.viewer) {
      this.loadCastletonModel()
    } else {
      this.pendingModelLoad = true
    }
  }

  private async loadCastletonModel() {
    if (this.isLoading) return
    
    this.isLoading = true
    
    // Show loading spinner
    if (this.loadingSpinner) {
      this.loadingSpinner.show()
    }

    try {
      if (!this.viewer) {
        throw new Error('Viewer not initialized')
      }
      
      // Load Corona model using default camera position for high quality
      const filePath = `models/base/gsplat/Corona_001_rdnc_07.ply`
      await this.viewer.addSplatScene(filePath, {
        showLoadingUI: false // Try to disable loading UI at scene level
      })
      
      this.viewer.start()
      
    } catch (error) {
      console.error('Error loading Corona model:', error)
    } finally {
      this.isLoading = false
      
      // Hide loading spinner after a short delay to see the model appear
      setTimeout(() => {
        if (this.loadingSpinner) {
          this.loadingSpinner.hide()
        }
      }, 500)
    }
  }

  // Handle window resize
  resize() {
    // GaussianSplats3D viewer handles resize automatically
  }

  // Force refresh when viewer becomes visible
  refresh() {
    this.resize()
  }

  // Cleanup method
  dispose() {
    if (this.loadingSpinner) {
      this.loadingSpinner.destroy()
    }
    if (this.viewer) {
      this.viewer.dispose()
    }
  }
}