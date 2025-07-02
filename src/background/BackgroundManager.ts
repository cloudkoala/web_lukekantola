import * as THREE from 'three'
import { BackgroundEffectPass } from '../effects/BackgroundEffectPass'

export class BackgroundManager {
  private backgroundPass: BackgroundEffectPass
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private renderTarget: THREE.WebGLRenderTarget

  // Background settings
  public enabled: boolean = true
  public pattern: 'gradient' | 'waves' | 'noise' | 'geometric' | 'solid' = 'solid'
  public intensity: number = 1.0
  public speed: number = 1.0
  public scale: number = 1.0
  public primaryColor: THREE.Color = new THREE.Color(0x151515)
  public secondaryColor: THREE.Color = new THREE.Color(0x333333)

  // Mouse tracking for interactive patterns
  private mouseX: number = 0.5
  private mouseY: number = 0.5

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer
    
    // Create dedicated background render target
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    })

    // Create background effect pass
    this.backgroundPass = new BackgroundEffectPass(width, height)

    // Create scene and camera for background rendering
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    // Initialize with default colors
    this.updateBackgroundPass()
  }

  // Update the background effect parameters
  private updateBackgroundPass() {
    this.backgroundPass.enabled = this.enabled
    this.backgroundPass.intensity = this.intensity
    this.backgroundPass.speed = this.speed
    this.backgroundPass.scale = this.scale
    this.backgroundPass.pattern = this.pattern as any // Exclude 'solid' pattern
    this.backgroundPass.setColorA(this.primaryColor)
    this.backgroundPass.setColorB(this.secondaryColor)
  }

  // Set primary background color
  setPrimaryColor(color: THREE.Color | string | number) {
    if (typeof color === 'string' || typeof color === 'number') {
      this.primaryColor.set(color)
    } else {
      this.primaryColor.copy(color)
    }
    this.updateBackgroundPass()
  }

  // Set secondary background color
  setSecondaryColor(color: THREE.Color | string | number) {
    if (typeof color === 'string' || typeof color === 'number') {
      this.secondaryColor.set(color)
    } else {
      this.secondaryColor.copy(color)
    }
    this.updateBackgroundPass()
  }

  // Set background pattern
  setPattern(pattern: 'gradient' | 'waves' | 'noise' | 'geometric' | 'solid') {
    this.pattern = pattern
    this.updateBackgroundPass()
  }

  // Set animation intensity
  setIntensity(intensity: number) {
    this.intensity = Math.max(0, Math.min(2, intensity))
    this.updateBackgroundPass()
  }

  // Set animation speed
  setSpeed(speed: number) {
    this.speed = Math.max(0, Math.min(3, speed))
    this.updateBackgroundPass()
  }

  // Set pattern scale
  setScale(scale: number) {
    this.scale = Math.max(0.1, Math.min(5, scale))
    this.updateBackgroundPass()
  }

  // Update mouse position for interactive patterns
  updateMousePosition(x: number, y: number) {
    // Normalize mouse coordinates to 0-1 range
    this.mouseX = Math.max(0, Math.min(1, x))
    this.mouseY = Math.max(0, Math.min(1, y))
  }

  // Update and render the background
  update(deltaTime: number): THREE.Texture {
    if (this.pattern === 'solid') {
      // For solid backgrounds, just return a simple color texture
      return this.renderSolidBackground()
    } else {
      // For animated patterns, use the background effect pass
      this.backgroundPass.update(deltaTime, this.mouseX, this.mouseY)
      
      // Render background to render target
      this.renderer.setRenderTarget(this.renderTarget)
      this.renderer.clear()
      this.backgroundPass.render(this.renderer, this.renderTarget)
      
      return this.renderTarget.texture
    }
  }

  // Render a solid background for non-animated patterns
  private renderSolidBackground(): THREE.Texture {
    // Create a simple solid color texture
    this.renderer.setRenderTarget(this.renderTarget)
    this.renderer.setClearColor(this.primaryColor)
    this.renderer.clear()
    
    return this.renderTarget.texture
  }

  // Apply background to scene
  applyToScene(targetScene: THREE.Scene, fog?: THREE.Fog | THREE.FogExp2) {
    const backgroundTexture = this.update(0.016) // Assume 60fps for static call
    targetScene.background = backgroundTexture

    // Update fog color to match primary background color if fog exists
    if (fog) {
      if (fog instanceof THREE.FogExp2) {
        fog.color.copy(this.primaryColor)
      } else if (fog instanceof THREE.Fog) {
        fog.color.copy(this.primaryColor)
      }
    }
  }

  // Performance scaling integration
  updateQuality(currentFPS: number) {
    if (this.pattern !== 'solid') {
      this.backgroundPass.updateQuality(currentFPS)
    }
  }

  // Resize handling
  resize(width: number, height: number) {
    this.renderTarget.setSize(width, height)
    this.backgroundPass.resize(width, height)
  }

  // Enable/disable background effects
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.updateBackgroundPass()
  }

  // Get current background texture for use by other systems
  getBackgroundTexture(): THREE.Texture {
    return this.renderTarget.texture
  }

  // Cleanup
  dispose() {
    this.backgroundPass.dispose()
    this.renderTarget.dispose()
  }
}