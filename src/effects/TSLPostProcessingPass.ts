import * as THREE from 'three'
import { TSLEffect } from './TSLEffect'

export interface TSLEffectParameters {
  effectType: 'crt' | 'wave' | 'noise' | 'hologram'
  intensity: number
  speed: number
  scale: number
}

export class TSLPostProcessingPass {
  private renderTargets: THREE.WebGLRenderTarget[]
  private tslEffect: TSLEffect
  private material: THREE.ShaderMaterial | null = null
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private webGPUSupported: boolean = false
  private startTime: number = performance.now()
  
  constructor(width: number, height: number, renderer: THREE.WebGLRenderer) {
    this.webGPUSupported = this.checkWebGPUSupport()
    
    // Create render targets
    this.renderTargets = [
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      }),
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      })
    ]
    
    // Initialize TSL effect
    this.tslEffect = new TSLEffect(renderer)
    
    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    const tempMaterial = new THREE.MeshBasicMaterial() // Temporary material
    this.mesh = new THREE.Mesh(geometry, tempMaterial)
    
    // Create scene and camera for post-processing
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }
  
  private checkWebGPUSupport(): boolean {
    try {
      return typeof navigator !== 'undefined' && 'gpu' in navigator
    } catch (error) {
      return false
    }
  }

  render(
    renderer: THREE.WebGLRenderer, 
    inputTexture: THREE.Texture, 
    parameters: TSLEffectParameters,
    outputTarget?: THREE.WebGLRenderTarget | null
  ) {
    // Update material if parameters changed or not initialized
    if (!this.material || this.needsUpdate(parameters)) {
      this.updateMaterial(parameters)
    }
    
    // Update uniforms with current time
    const deltaTime = (performance.now() - this.startTime) / 1000
    this.tslEffect.updateUniforms({
      enabled: true,
      ...parameters
    }, deltaTime)
    
    // Set input texture
    if (this.material && this.material.uniforms.tDiffuse) {
      this.material.uniforms.tDiffuse.value = inputTexture
    }
    
    // Render to output
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }

  private needsUpdate(_parameters: TSLEffectParameters): boolean {
    // Check if we need to recreate the material due to effect type change
    if (!this.material) return true
    
    // For now, always update - in production you'd cache materials by effect type
    return true
  }

  private updateMaterial(parameters: TSLEffectParameters) {
    // Dispose old material
    if (this.material) {
      this.material.dispose()
    }
    
    // Create new TSL material
    this.material = this.tslEffect.createTSLMaterial({
      enabled: true,
      ...parameters
    })
    
    // Add input texture uniform if not present
    if (!this.material.uniforms.tDiffuse) {
      this.material.uniforms.tDiffuse = { value: null }
    }
    
    this.mesh.material = this.material
  }

  copyTexture(
    renderer: THREE.WebGLRenderer,
    inputTexture: THREE.Texture,
    outputTarget?: THREE.WebGLRenderTarget | null
  ) {
    // Simple pass-through when effects are disabled
    if (!this.material) {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: inputTexture }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          varying vec2 vUv;
          void main() {
            gl_FragColor = texture2D(tDiffuse, vUv);
          }
        `
      })
      this.mesh.material = this.material
    }
    
    this.material.uniforms.tDiffuse.value = inputTexture
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }

  setSize(width: number, height: number) {
    this.renderTargets.forEach(target => {
      target.setSize(width, height)
    })
    
    this.tslEffect.setSize(width, height)
  }

  isWebGPUSupported(): boolean {
    return this.webGPUSupported
  }

  getCapabilityInfo(): string {
    if (this.webGPUSupported) {
      return 'WebGPU + TSL supported'
    } else {
      return 'WebGL fallback (TSL features limited)'
    }
  }

  dispose() {
    this.renderTargets.forEach(target => target.dispose())
    
    if (this.material) {
      this.material.dispose()
    }
    
    this.tslEffect.dispose()
    
    this.mesh.geometry.dispose()
  }
}