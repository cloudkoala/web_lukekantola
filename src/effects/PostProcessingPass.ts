import * as THREE from 'three'
import type { EffectInstance } from './EffectsChainManager'
import { ASCIIDitheringPass } from './ASCIIDitheringPass'
import { HalftoneDitheringPass } from './HalftoneDitheringPass'
import { FloydSteinbergDitheringPass } from './FloydSteinbergDitheringPass'
import { BrushEffect } from './BrushEffect'
import { TSLPostProcessingPass } from './TSLPostProcessingPass'

export type EffectType = 'none' | 'background' | 'drawrange' | 'pointnetwork' | 'material' | 'brush' | 'tsl' | 'gamma' | 'sepia' | 'vignette' | 'blur' | 'bloom' | 'film' | 'dotscreen' | 'bleachbypass' | 'colorify' | 'sobel' | 'sobelthreshold' | 'ascii' | 'halftone' | 'floydsteinberg' | 'motionblur' | 'oilpainting' | 'topographic'

export class PostProcessingPass {
  private renderTargets: THREE.WebGLRenderTarget[]
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private mainScene: THREE.Scene | null = null
  private pointClouds: THREE.Points[] = []
  private originalDrawRanges: Map<THREE.BufferGeometry, { start: number, count: number }> = new Map()
  private animationStartTime: number = 0
  
  // Point Network effect state
  private pointVelocities: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private originalPositions: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private originalColors: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private connectionLines: THREE.LineSegments | null = null
  private networkAnimationStartTime: number = 0
  
  // Material effect state
  private originalMaterials: Map<THREE.Points, THREE.Material | THREE.Material[]> = new Map()
  private customMaterials: Map<THREE.Points, THREE.ShaderMaterial> = new Map()
  private materialAnimationStartTime: number = 0
  
  // Topographic effect state
  private topographicAnimationStartTime: number = 0
  private topographicWires: THREE.LineSegments[] = []
  
  // Chain support
  public enabled: boolean = false
  private effectsChain: EffectInstance[] = []
  
  // Dithering passes
  private asciiDitheringPass: ASCIIDitheringPass
  private halftoneDitheringPass: HalftoneDitheringPass
  private floydSteinbergDitheringPass: FloydSteinbergDitheringPass
  
  // Brush effect
  private brushEffect: BrushEffect | null = null
  private currentMousePosition = { x: 0, y: 0 }
  
  // TSL effect
  private tslPass: TSLPostProcessingPass | null = null
  
  // Legacy single effect support (for backward compatibility)
  public effectType: EffectType = 'none'
  public intensity: number = 0.5
  public colorR: number = 1.0
  public colorG: number = 0.5
  public colorB: number = 0.0
  
  // Specific effect parameters
  public vignetteOffset: number = 1.2
  public vignetteDarkness: number = 0.8
  public vignetteFeather: number = 0.5
  public blurAmount: number = 0.002
  public filmNoiseSeed: number = 0.35
  public dotscreenCenterX: number = 0.0
  public dotscreenCenterY: number = 0.0
  public dotscreenScale: number = 0.8
  public motionBlurStrength: number = 0.02
  public motionBlurSamples: number = 8
  public oilBrushSize: number = 4.0
  public oilRoughness: number = 0.6
  public oilBrightness: number = 1.2
  
  // Camera matrices for velocity calculation
  private previousViewProjectionMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private currentViewProjectionMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private currentCamera: THREE.Camera | null = null
  public sobelThreshold: number = 0.1
  public bloomThreshold: number = 0.8
  public bloomIntensity: number = 1.0
  public bloomRadius: number = 0.5
  
  constructor(width: number, height: number, renderer?: THREE.WebGLRenderer) {
    // Create render targets for chaining (ping-pong buffers)
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
    
    // Create post-processing shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        effectType: { value: 0 }, // 0=none, 1=gamma, 2=sepia, 3=vignette, 4=blur, 5=bloom, 6=film, 7=dotscreen, 8=bleachbypass, 9=colorify, 10=sobel, 11=sobelthreshold, 12=motionblur, 13=oilpainting
        intensity: { value: this.intensity },
        colorTint: { value: new THREE.Vector3(this.colorR, this.colorG, this.colorB) },
        vignetteOffset: { value: this.vignetteOffset },
        vignetteDarkness: { value: this.vignetteDarkness },
        vignetteFeather: { value: this.vignetteFeather },
        blurAmount: { value: this.blurAmount },
        filmNoiseSeed: { value: this.filmNoiseSeed },
        dotscreenCenter: { value: new THREE.Vector2(this.dotscreenCenterX, this.dotscreenCenterY) },
        dotscreenScale: { value: this.dotscreenScale },
        motionBlurStrength: { value: this.motionBlurStrength },
        motionBlurSamples: { value: this.motionBlurSamples },
        previousViewProjectionMatrix: { value: this.previousViewProjectionMatrix },
        currentViewProjectionMatrix: { value: this.currentViewProjectionMatrix },
        sobelThreshold: { value: this.sobelThreshold },
        time: { value: 0.0 },
        gammaValue: { value: 2.2 },
        brightness: { value: 1.0 },
        contrast: { value: 1.0 },
        saturation: { value: 1.0 },
        bloomThreshold: { value: 0.8 },
        bloomIntensity: { value: 1.0 },
        bloomRadius: { value: 0.5 },
        oilBrushSize: { value: this.oilBrushSize },
        oilRoughness: { value: this.oilRoughness },
        oilBrightness: { value: this.oilBrightness }
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader()
    })
    
    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    
    // Create scene and camera for post-processing
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    
    // Initialize dithering passes
    this.asciiDitheringPass = new ASCIIDitheringPass(width, height)
    this.halftoneDitheringPass = new HalftoneDitheringPass(width, height)
    this.floydSteinbergDitheringPass = new FloydSteinbergDitheringPass(width, height)
    
    // Initialize brush effect if renderer is provided
    if (renderer) {
      this.brushEffect = new BrushEffect(renderer)
      
      // Initialize TSL pass for WebGPU/TSL effects
      this.tslPass = new TSLPostProcessingPass(width, height, renderer)
    }
  }
  
  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Update motion blur matrices every frame
    this.updateMotionBlurMatrices()
    
    if (!this.enabled) {
      // If disabled, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Check if we have effects in the chain
    const enabledEffects = this.effectsChain.filter(effect => effect.enabled)
    
    // Check if any drawrange effects are active
    const hasDrawRangeEffect = enabledEffects.some(effect => effect.type === 'drawrange')
    if (!hasDrawRangeEffect) {
      // Reset draw ranges if no drawrange effects are active
      this.resetDrawRanges()
    }
    
    // Check if any point network effects are active
    const hasPointNetworkEffect = enabledEffects.some(effect => effect.type === 'pointnetwork')
    if (!hasPointNetworkEffect) {
      // Reset point positions and remove connection lines if no point network effects are active
      this.resetPointNetwork()
    }
    
    // Check if any material effects are active
    const hasMaterialEffect = enabledEffects.some(effect => effect.type === 'material')
    if (!hasMaterialEffect) {
      // Reset materials if no material effects are active
      this.resetMaterials()
    }
    
    // Check if any topographic effects are active
    const hasTopographicEffect = enabledEffects.some(effect => effect.type === 'topographic')
    if (!hasTopographicEffect) {
      // Clear topographic wires and reset point colors if no topographic effects are active
      this.clearTopographicWires()
      this.resetPointColors()
    }
    
    // Use effect chain if available
    if (enabledEffects.length > 0) {
      this.renderEffectChain(renderer, inputTexture, enabledEffects, outputTarget)
    } else if (this.effectType !== 'none') {
      // Fall back to legacy single effect only if a legacy effect is actually set
      this.renderSingleEffect(renderer, inputTexture, outputTarget)
    } else {
      // No effects to apply - just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
    }
  }
  
  private renderEffectChain(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effects: EffectInstance[], outputTarget?: THREE.WebGLRenderTarget | null) {
    let currentInput = inputTexture
    let pingPongIndex = 0
    
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i]
      const isLastEffect = i === effects.length - 1
      const currentTarget = isLastEffect ? outputTarget : this.renderTargets[pingPongIndex]
      
      this.renderSingleEffectFromInstance(renderer, currentInput, effect, currentTarget)
      
      // For next iteration, use the output as input
      if (!isLastEffect) {
        currentInput = this.renderTargets[pingPongIndex].texture
        pingPongIndex = 1 - pingPongIndex // Switch between 0 and 1
      }
    }
  }
  
  private renderSingleEffect(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Legacy single effect rendering
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.effectType.value = this.getEffectTypeIndex()
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.colorTint.value.set(this.colorR, this.colorG, this.colorB)
    this.material.uniforms.vignetteOffset.value = this.vignetteOffset
    this.material.uniforms.vignetteDarkness.value = this.vignetteDarkness
    this.material.uniforms.vignetteFeather.value = this.vignetteFeather
    this.material.uniforms.blurAmount.value = this.blurAmount
    this.material.uniforms.filmNoiseSeed.value = this.filmNoiseSeed
    this.material.uniforms.dotscreenCenter.value.set(this.dotscreenCenterX, this.dotscreenCenterY)
    this.material.uniforms.dotscreenScale.value = this.dotscreenScale
    this.material.uniforms.motionBlurStrength.value = this.motionBlurStrength
    this.material.uniforms.motionBlurSamples.value = this.motionBlurSamples
    this.material.uniforms.previousViewProjectionMatrix.value.copy(this.previousViewProjectionMatrix)
    this.material.uniforms.currentViewProjectionMatrix.value.copy(this.currentViewProjectionMatrix)
    this.material.uniforms.sobelThreshold.value = this.sobelThreshold
    this.material.uniforms.time.value = performance.now() * 0.001
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  private renderSingleEffectFromInstance(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effect: EffectInstance, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Handle background effect separately
    if (effect.type === 'background') {
      this.applyBackgroundEffect(effect)
      // Background effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Handle drawrange effect separately
    if (effect.type === 'drawrange') {
      this.applyDrawRangeEffect(effect)
      // DrawRange effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Handle point network effect separately
    if (effect.type === 'pointnetwork') {
      this.applyPointNetworkEffect(effect)
      // Point network effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Handle material effect separately
    if (effect.type === 'material') {
      this.applyMaterialEffect(effect)
      // Material effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Handle topographic effect separately
    if (effect.type === 'topographic') {
      this.applyTopographicEffect(effect)
      // Topographic effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Handle brush effect separately
    if (effect.type === 'brush') {
      this.applyBrushEffect(effect)
      // Brush effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    // Handle TSL effect separately
    if (effect.type === 'tsl') {
      this.renderTSLEffect(renderer, inputTexture, effect, outputTarget)
      return
    }
    
    // Handle dithering effects separately
    if (effect.type === 'ascii' || effect.type === 'halftone' || effect.type === 'floydsteinberg') {
      this.renderDitheringEffect(renderer, inputTexture, effect, outputTarget)
      return
    }
    
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.effectType.value = this.getEffectTypeIndexFromType(effect.type)
    
    // Apply effect parameters
    this.material.uniforms.intensity.value = effect.parameters.intensity ?? 0.5
    
    // Set effect-specific parameters
    switch (effect.type) {
      case 'gamma':
        this.material.uniforms.gammaValue.value = effect.parameters.gamma ?? 2.2
        this.material.uniforms.brightness.value = effect.parameters.brightness ?? 1.0
        this.material.uniforms.contrast.value = effect.parameters.contrast ?? 1.0
        this.material.uniforms.saturation.value = effect.parameters.saturation ?? 1.0
        break
      case 'vignette':
        this.material.uniforms.vignetteOffset.value = effect.parameters.offset ?? 1.2
        this.material.uniforms.vignetteDarkness.value = 1.0 // Fixed darkness at 1.0
        this.material.uniforms.vignetteFeather.value = effect.parameters.feather ?? 0.5
        break
      case 'blur':
        this.material.uniforms.blurAmount.value = effect.parameters.blurAmount ?? 0.002
        break
      case 'bloom':
        this.material.uniforms.bloomThreshold.value = effect.parameters.threshold ?? 0.8
        this.material.uniforms.bloomIntensity.value = effect.parameters.intensity ?? 1.0
        this.material.uniforms.bloomRadius.value = effect.parameters.radius ?? 0.5
        break
      case 'film':
        this.material.uniforms.filmNoiseSeed.value = effect.parameters.noiseSeed ?? 0.35
        break
      case 'dotscreen':
        this.material.uniforms.dotscreenCenter.value.set(
          effect.parameters.centerX ?? 0.0,
          effect.parameters.centerY ?? 0.0
        )
        this.material.uniforms.dotscreenScale.value = effect.parameters.scale ?? 0.8
        break
      case 'colorify':
        this.material.uniforms.colorTint.value.set(
          effect.parameters.colorR ?? 1.0,
          effect.parameters.colorG ?? 0.5,
          effect.parameters.colorB ?? 0.0
        )
        break
      case 'sobelthreshold':
        this.material.uniforms.sobelThreshold.value = effect.parameters.threshold ?? 0.1
        break
      case 'motionblur':
        this.material.uniforms.motionBlurStrength.value = effect.parameters.strength ?? 0.02
        this.material.uniforms.motionBlurSamples.value = effect.parameters.samples ?? 8
        break
      case 'oilpainting':
        this.material.uniforms.oilBrushSize.value = effect.parameters.brushSize ?? 4.0
        this.material.uniforms.oilRoughness.value = effect.parameters.roughness ?? 0.6
        this.material.uniforms.oilBrightness.value = effect.parameters.brightness ?? 1.2
        break
    }
    
    this.material.uniforms.time.value = performance.now() * 0.001
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  private renderDitheringEffect(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effect: EffectInstance, outputTarget?: THREE.WebGLRenderTarget | null) {
    let ditheringPass: ASCIIDitheringPass | HalftoneDitheringPass | FloydSteinbergDitheringPass
    
    switch (effect.type) {
      case 'ascii':
        ditheringPass = this.asciiDitheringPass
        ditheringPass.intensity = effect.parameters.intensity ?? 0.5
        ditheringPass.characterSize = effect.parameters.characterSize ?? 8
        ditheringPass.contrast = effect.parameters.contrast ?? 1.2
        break
      case 'halftone':
        ditheringPass = this.halftoneDitheringPass
        ditheringPass.intensity = effect.parameters.intensity ?? 0.5
        ditheringPass.dotSize = effect.parameters.dotSize ?? 8
        ditheringPass.contrast = effect.parameters.contrast ?? 1.2
        ditheringPass.angle = 0 // Fixed at 0 degrees
        break
      case 'floydsteinberg':
        ditheringPass = this.floydSteinbergDitheringPass
        ditheringPass.intensity = effect.parameters.intensity ?? 0.5
        ditheringPass.colorLevels = effect.parameters.colorLevels ?? 4
        ditheringPass.contrast = effect.parameters.contrast ?? 1.2
        break
      default:
        return
    }
    
    ditheringPass.enabled = true
    ditheringPass.render(renderer, inputTexture, outputTarget)
  }
  
  private copyTexture(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Simple copy shader for when no effects are applied
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.effectType.value = 0 // none
    this.material.uniforms.intensity.value = 0
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  setSize(width: number, height: number) {
    this.renderTargets.forEach(target => target.setSize(width, height))
    this.material.uniforms.resolution.value.set(width, height)
    
    // Update dithering passes
    this.asciiDitheringPass.setSize(width, height)
    this.halftoneDitheringPass.setSize(width, height)
    this.floydSteinbergDitheringPass.setSize(width, height)
    
    if (this.tslPass) {
      this.tslPass.setSize(width, height)
    }
  }
  
  dispose() {
    this.renderTargets.forEach(target => target.dispose())
    this.material.dispose()
    this.mesh.geometry.dispose()
    
    // Dispose dithering passes
    this.asciiDitheringPass.dispose()
    this.halftoneDitheringPass.dispose()
    this.floydSteinbergDitheringPass.dispose()
    
    // Clean up point network resources
    this.resetPointNetwork()
    this.pointVelocities.clear()
    this.originalPositions.clear()
    this.originalDrawRanges.clear()
    
    // Clean up material resources
    this.resetMaterials()
    this.originalMaterials.clear()
  }
  
  private getEffectTypeIndex(): number {
    return this.getEffectTypeIndexFromType(this.effectType)
  }
  
  private getEffectTypeIndexFromType(effectType: EffectType): number {
    switch (effectType) {
      case 'none': return 0
      case 'gamma': return 1
      case 'sepia': return 2
      case 'vignette': return 3
      case 'blur': return 4
      case 'bloom': return 5
      case 'film': return 6
      case 'dotscreen': return 7
      case 'bleachbypass': return 8
      case 'colorify': return 9
      case 'sobel': return 10
      case 'sobelthreshold': return 11
      case 'motionblur': return 12
      case 'oilpainting': return 13
      // Background effects are handled separately in applyBackgroundEffect
      case 'background': return 0
      // Topographic effects are handled separately in applyTopographicEffect
      case 'topographic': return 0
      // DrawRange effects are handled separately in applyDrawRangeEffect  
      case 'drawrange': return 0
      // Point Network effects are handled separately in applyPointNetworkEffect
      case 'pointnetwork': return 0
      // Material effects are handled separately in applyMaterialEffect
      case 'material': return 0
      // Dithering effects are handled separately in renderDitheringEffect
      case 'ascii': return 0
      case 'halftone': return 0
      case 'floydsteinberg': return 0
      default: return 0
    }
  }
  
  // Chain management methods
  setEffectsChain(effects: EffectInstance[]): void {
    this.effectsChain = [...effects]
  }
  
  getEffectsChain(): EffectInstance[] {
    return [...this.effectsChain]
  }
  
  setMainScene(scene: THREE.Scene, camera?: THREE.Camera): void {
    this.mainScene = scene
    this.updatePointClouds()
    
    // Set up brush effect with scene and camera
    if (this.brushEffect && camera) {
      this.brushEffect.setScene(scene, camera)
    }
    
    // Initialize camera for motion blur
    if (camera) {
      this.currentCamera = camera
      this.updateMotionBlurMatrices()
    }
  }
  
  updateMotionBlurMatrices(): void {
    if (!this.currentCamera) return
    
    // Store previous frame's matrix
    this.previousViewProjectionMatrix.copy(this.currentViewProjectionMatrix)
    
    // Calculate current frame's view-projection matrix
    const viewMatrix = new THREE.Matrix4()
    viewMatrix.copy(this.currentCamera.matrixWorldInverse)
    
    const projectionMatrix = new THREE.Matrix4()
    projectionMatrix.copy(this.currentCamera.projectionMatrix)
    
    this.currentViewProjectionMatrix.multiplyMatrices(projectionMatrix, viewMatrix)
    
    // Update uniforms
    this.material.uniforms.previousViewProjectionMatrix.value.copy(this.previousViewProjectionMatrix)
    this.material.uniforms.currentViewProjectionMatrix.value.copy(this.currentViewProjectionMatrix)
  }
  
  updatePointClouds(): void {
    if (!this.mainScene) return
    
    // Find all point clouds in the scene
    this.pointClouds = []
    this.mainScene.traverse((child) => {
      if (child instanceof THREE.Points) {
        this.pointClouds.push(child)
        // Store original draw range if not already stored
        if (!this.originalDrawRanges.has(child.geometry)) {
          const drawRange = child.geometry.drawRange
          this.originalDrawRanges.set(child.geometry, {
            start: drawRange.start,
            count: drawRange.count === Infinity ? child.geometry.attributes.position.count : drawRange.count
          })
        }
        
        // Initialize velocities and original positions for point network effect
        if (!this.pointVelocities.has(child.geometry)) {
          const positionAttribute = child.geometry.attributes.position
          const count = positionAttribute.count
          
          // Store original positions
          const originalPositions = new Float32Array(positionAttribute.array)
          this.originalPositions.set(child.geometry, originalPositions)
          
          // Generate random velocities
          const velocities = new Float32Array(count * 3)
          for (let i = 0; i < count * 3; i++) {
            velocities[i] = (Math.random() - 0.5) * 0.02 // Random velocity between -0.01 and 0.01
          }
          this.pointVelocities.set(child.geometry, velocities)
        }
        
        // Store original material for material effects
        if (!this.originalMaterials.has(child)) {
          this.originalMaterials.set(child, child.material)
        }
      }
    })
  }
  
  // Reset all draw ranges to original values
  resetDrawRanges(): void {
    this.pointClouds.forEach(pointCloud => {
      const originalRange = this.originalDrawRanges.get(pointCloud.geometry)
      if (originalRange) {
        pointCloud.geometry.setDrawRange(originalRange.start, originalRange.count)
      }
    })
  }
  
  // Reset point positions and remove connection lines
  resetPointNetwork(): void {
    // Reset point positions to original
    this.pointClouds.forEach(pointCloud => {
      const originalPositions = this.originalPositions.get(pointCloud.geometry)
      if (originalPositions) {
        const positionAttribute = pointCloud.geometry.attributes.position
        positionAttribute.array.set(originalPositions)
        positionAttribute.needsUpdate = true
      }
    })
    
    // Remove connection lines from scene
    if (this.connectionLines && this.mainScene) {
      this.mainScene.remove(this.connectionLines)
      this.connectionLines.geometry.dispose()
      if (Array.isArray(this.connectionLines.material)) {
        this.connectionLines.material.forEach(material => material.dispose())
      } else {
        this.connectionLines.material.dispose()
      }
      this.connectionLines = null
    }
    
    this.networkAnimationStartTime = 0
  }
  
  // Reset point positions to original without removing lines
  private resetPointPositions(): void {
    this.pointClouds.forEach(pointCloud => {
      const originalPositions = this.originalPositions.get(pointCloud.geometry)
      if (originalPositions) {
        const positionAttribute = pointCloud.geometry.attributes.position
        positionAttribute.array.set(originalPositions)
        positionAttribute.needsUpdate = true
      }
    })
    
    // Reset animation time to start fresh
    this.networkAnimationStartTime = 0
  }
  
  // Reset point colors to original
  resetPointColors(): void {
    this.pointClouds.forEach(pointCloud => {
      const originalColors = this.originalColors.get(pointCloud.geometry)
      if (originalColors) {
        const colorAttribute = pointCloud.geometry.attributes.color
        if (colorAttribute) {
          colorAttribute.array.set(originalColors)
          colorAttribute.needsUpdate = true
        }
      }
    })
    
    // Clear any topographic wires
    this.clearTopographicWires()
    
    // Reset animation time to start fresh
    this.animationStartTime = 0
  }
  
  
  // Reset materials to original
  private resetMaterials(): void {
    this.pointClouds.forEach(pointCloud => {
      const originalMaterial = this.originalMaterials.get(pointCloud)
      if (originalMaterial) {
        pointCloud.material = originalMaterial
      }
    })
    
    // Dispose custom materials
    this.customMaterials.forEach(material => {
      material.dispose()
    })
    this.customMaterials.clear()
    
    this.materialAnimationStartTime = 0
  }
  
  private applyBackgroundEffect(effect: EffectInstance): void {
    if (!this.mainScene) return
    
    const hue = effect.parameters.hue ?? 0.75
    const saturation = (effect.parameters.saturation ?? 17) / 100 // Convert to 0-1
    let lightness = (effect.parameters.lightness ?? 9) / 100 // Convert to 0-1
    
    // Apply gamma correction to counteract tone mapping (same as original implementation)
    lightness = Math.pow(lightness, 2.2)
    
    // Use Three.js built-in HSL conversion
    const color = new THREE.Color()
    color.setHSL(hue, saturation, lightness)
    
    // Update the main scene background
    this.mainScene.background = color
    
    console.log(`Background color updated via effects: HSL(${hue.toFixed(2)}, ${(saturation*100).toFixed(0)}%, ${(lightness*100).toFixed(0)}%) - adjusted lightness: ${lightness.toFixed(3)}`)
  }
  
  private applyDrawRangeEffect(effect: EffectInstance): void {
    // Update point clouds list in case scene changed
    this.updatePointClouds()
    
    if (this.pointClouds.length === 0) return
    
    const progress = (effect.parameters.progress ?? 100) / 100 // Convert to 0-1
    const animationSpeed = effect.parameters.animationSpeed ?? 1.0
    const ringWidth = effect.parameters.ringWidth ?? 2.0
    const ringSeparation = effect.parameters.ringSeparation ?? 5.0
    
    // Handle animation
    let animationTime = 0
    if (animationSpeed > 0) {
      if (this.animationStartTime === 0) {
        this.animationStartTime = performance.now()
      }
      const elapsed = (performance.now() - this.animationStartTime) * 0.001 // Convert to seconds
      animationTime = elapsed * animationSpeed
    } else {
      this.animationStartTime = 0
    }
    
    // Apply concentric circles to all point clouds
    this.pointClouds.forEach(pointCloud => {
      this.applyConcentricCircles(pointCloud, progress, animationTime, ringWidth, ringSeparation)
    })
  }
  
  private applyConcentricCircles(pointCloud: THREE.Points, progress: number, animationTime: number, ringWidth: number, ringSeparation: number): void {
    const positionAttribute = pointCloud.geometry.attributes.position
    const colorAttribute = pointCloud.geometry.attributes.color
    
    if (!positionAttribute || !colorAttribute) return
    
    const positions = positionAttribute.array as Float32Array
    const colors = colorAttribute.array as Float32Array
    const pointCount = positions.length / 3
    
    // Calculate bounding box center for the point cloud
    const box = new THREE.Box3().setFromBufferAttribute(positionAttribute as THREE.BufferAttribute)
    const center = box.getCenter(new THREE.Vector3())
    
    // Calculate max distance from center to determine scale
    const size = box.getSize(new THREE.Vector3())
    const maxDistance = Math.max(size.x, size.y, size.z) * 0.5
    
    // Create array to track original colors if not already stored
    if (!this.originalColors.has(pointCloud.geometry)) {
      const originalColors = new Float32Array(colors.length)
      originalColors.set(colors)
      this.originalColors.set(pointCloud.geometry, originalColors)
    }
    
    const originalColors = this.originalColors.get(pointCloud.geometry)!
    if (!originalColors) return
    
    for (let i = 0; i < pointCount; i++) {
      const x = positions[i * 3] - center.x
      const y = positions[i * 3 + 1] - center.y
      const z = positions[i * 3 + 2] - center.z
      
      // Calculate distance from center (3D distance)
      const distance = Math.sqrt(x * x + y * y + z * z)
      const normalizedDistance = distance / maxDistance // 0 to 1
      
      // Calculate which ring this point belongs to
      const ringSpacing = ringSeparation / 100 // Convert to 0-1 scale
      
      // Calculate the wave front position (radiates outward)
      const wavePosition = (animationTime * 0.1) % (maxDistance * 2) // Wave cycles through entire space
      const waveNormalized = wavePosition / maxDistance
      
      // Determine if point should be visible based on ring pattern
      let visibility = 0
      
      if (progress > 0) {
        // Static progress-based visibility
        if (normalizedDistance <= progress) {
          // Check if point is in a ring
          const ringPosition = (normalizedDistance % ringSpacing) / ringSpacing
          const ringHalfWidth = (ringWidth / 100) * 0.5 // Convert to 0-1 scale
          
          if (ringPosition <= ringHalfWidth || ringPosition >= (1 - ringHalfWidth)) {
            visibility = 1
          }
        }
      }
      
      // Add animated wave effect
      if (animationTime > 0) {
        const distanceFromWave = Math.abs(normalizedDistance - waveNormalized)
        const waveWidth = (ringWidth / 100) * 2 // Wider for animation wave
        
        if (distanceFromWave <= waveWidth) {
          // Create smooth falloff for wave
          const waveIntensity = 1 - (distanceFromWave / waveWidth)
          visibility = Math.max(visibility, waveIntensity)
        }
      }
      
      // Apply transparency based on visibility
      const colorIndex = i * 3
      colors[colorIndex] = originalColors[colorIndex] * visibility      // R
      colors[colorIndex + 1] = originalColors[colorIndex + 1] * visibility  // G
      colors[colorIndex + 2] = originalColors[colorIndex + 2] * visibility  // B
      
      // For fully transparent points, we could also set alpha if the material supports it
      // but Points material uses vertex colors for RGB only
    }
    
    colorAttribute.needsUpdate = true
  }
  
  private applyTopographicEffect(effect: EffectInstance): void {
    // Update point clouds list in case scene changed
    this.updatePointClouds()
    
    if (this.pointClouds.length === 0) return
    
    const intensity = effect.parameters.intensity ?? 1.0
    const lineSpacing = effect.parameters.lineSpacing ?? 5.0
    const lineWidth = effect.parameters.lineWidth ?? 2.0
    const animationSpeed = effect.parameters.animationSpeed ?? 0.0
    const generateWires = (effect.parameters.generateWires ?? 0) > 0.5
    const minYThreshold = (effect.parameters.minY ?? 0) / 100 // Convert to 0-1
    const maxYThreshold = (effect.parameters.maxY ?? 100) / 100 // Convert to 0-1
    const wireOpacity = effect.parameters.wireOpacity ?? 0.8
    
    // Handle animation
    let animationTime = 0
    if (animationSpeed > 0) {
      if (this.topographicAnimationStartTime === 0) {
        this.topographicAnimationStartTime = performance.now()
      }
      const elapsed = (performance.now() - this.topographicAnimationStartTime) * 0.001 // Convert to seconds
      animationTime = elapsed * animationSpeed
    } else {
      this.topographicAnimationStartTime = 0
    }
    
    if (generateWires) {
      // Generate actual wire geometry
      this.generateTopographicWires(lineSpacing, animationTime, minYThreshold, maxYThreshold, wireOpacity)
      
      // Reset point colors to original when using wires (don't apply point-based effect)
      this.pointClouds.forEach(pointCloud => {
        const originalColors = this.originalColors.get(pointCloud.geometry)
        if (originalColors) {
          const colorAttribute = pointCloud.geometry.attributes.color
          if (colorAttribute) {
            colorAttribute.array.set(originalColors)
            colorAttribute.needsUpdate = true
          }
        }
      })
    } else {
      // Remove any existing wires when not using wire mode
      this.clearTopographicWires()
      
      // Apply topographic lines using point transparency
      this.pointClouds.forEach(pointCloud => {
        this.applyTopographicLines(pointCloud, intensity, lineSpacing, lineWidth, animationTime, minYThreshold, maxYThreshold)
      })
    }
  }
  
  private applyTopographicLines(pointCloud: THREE.Points, intensity: number, lineSpacing: number, lineWidth: number, animationTime: number, minYThreshold: number, maxYThreshold: number): void {
    const positionAttribute = pointCloud.geometry.attributes.position
    const colorAttribute = pointCloud.geometry.attributes.color
    
    if (!positionAttribute || !colorAttribute) return
    
    const positions = positionAttribute.array as Float32Array
    const colors = colorAttribute.array as Float32Array
    const pointCount = positions.length / 3
    
    // Calculate Y-axis bounds for the point cloud
    let minY = Infinity
    let maxY = -Infinity
    
    for (let i = 0; i < pointCount; i++) {
      const y = positions[i * 3 + 1]
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    
    const yRange = maxY - minY
    if (yRange === 0) return // No height variation
    
    // Apply Y thresholds
    const effectiveMinY = minY + (yRange * minYThreshold)
    const effectiveMaxY = minY + (yRange * maxYThreshold)
    const effectiveYRange = effectiveMaxY - effectiveMinY
    
    if (effectiveYRange <= 0) return // Invalid threshold range
    
    // Store original colors if not already stored
    if (!this.originalColors.has(pointCloud.geometry)) {
      const originalColors = new Float32Array(colors.length)
      originalColors.set(colors)
      this.originalColors.set(pointCloud.geometry, originalColors)
    }
    
    const originalColors = this.originalColors.get(pointCloud.geometry)!
    if (!originalColors) return
    
    // Calculate line spacing in world units
    const worldLineSpacing = (effectiveYRange * lineSpacing) / 100 // Convert percentage to world units
    const worldLineWidth = (effectiveYRange * lineWidth) / 100 // Convert percentage to world units
    
    for (let i = 0; i < pointCount; i++) {
      const y = positions[i * 3 + 1]
      
      // Check if point is within Y thresholds
      if (y < effectiveMinY || y > effectiveMaxY) {
        // Point outside thresholds - make it transparent
        const colorIndex = i * 3
        colors[colorIndex] = originalColors[colorIndex] * (1.0 - intensity)
        colors[colorIndex + 1] = originalColors[colorIndex + 1] * (1.0 - intensity)
        colors[colorIndex + 2] = originalColors[colorIndex + 2] * (1.0 - intensity)
        continue
      }
      
      // Normalize Y position within effective range (0 to 1)
      const normalizedY = (y - effectiveMinY) / effectiveYRange
      
      // Add animation offset to create moving lines
      const animationOffset = (animationTime * 0.05) % (worldLineSpacing / effectiveYRange)
      const animatedY = normalizedY + animationOffset
      
      // Calculate position within the line spacing pattern
      const linePattern = (animatedY * effectiveYRange) % worldLineSpacing
      
      // Calculate distance from nearest contour line (center of pattern)
      const distanceFromLine = Math.min(linePattern, worldLineSpacing - linePattern)
      
      // Determine visibility based on distance from line
      let visibility = 1.0
      
      if (worldLineWidth === 0) {
        // Zero line width - create sharp contour lines with no thickness
        // Only show points exactly on the contour lines
        const lineThreshold = worldLineSpacing * 0.02 // Very thin threshold
        if (distanceFromLine <= lineThreshold) {
          visibility = 1.0
        } else {
          visibility = 1.0 - intensity // Background transparency
        }
      } else if (distanceFromLine <= worldLineWidth * 0.5) {
        // Point is on a contour line - full visibility
        visibility = 1.0
      } else {
        // Point is between contour lines - fade to transparent
        const fadeDistance = worldLineSpacing * 0.4 // Fade zone around lines
        if (distanceFromLine > fadeDistance) {
          visibility = 1.0 - intensity // Make background points more transparent
        } else {
          // Smooth transition between line and background
          const fadeRatio = (distanceFromLine - worldLineWidth * 0.5) / (fadeDistance - worldLineWidth * 0.5)
          visibility = 1.0 - (fadeRatio * intensity)
        }
      }
      
      // Apply visibility to colors
      const colorIndex = i * 3
      colors[colorIndex] = originalColors[colorIndex] * visibility      // R
      colors[colorIndex + 1] = originalColors[colorIndex + 1] * visibility  // G
      colors[colorIndex + 2] = originalColors[colorIndex + 2] * visibility  // B
    }
    
    colorAttribute.needsUpdate = true
  }
  
  private generateTopographicWires(lineSpacing: number, animationTime: number, minYThreshold: number, maxYThreshold: number, wireOpacity: number): void {
    // Clear existing wires first
    this.clearTopographicWires()
    
    if (!this.mainScene || this.pointClouds.length === 0) return
    
    // Process each point cloud
    this.pointClouds.forEach(pointCloud => {
      const positionAttribute = pointCloud.geometry.attributes.position
      if (!positionAttribute) return
      
      const positions = positionAttribute.array as Float32Array
      const pointCount = positions.length / 3
      
      // Calculate Y-axis bounds
      let minY = Infinity
      let maxY = -Infinity
      
      for (let i = 0; i < pointCount; i++) {
        const y = positions[i * 3 + 1]
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      
      const yRange = maxY - minY
      if (yRange === 0) return
      
      // Apply Y thresholds
      const effectiveMinY = minY + (yRange * minYThreshold)
      const effectiveMaxY = minY + (yRange * maxYThreshold)
      const effectiveYRange = effectiveMaxY - effectiveMinY
      
      if (effectiveYRange <= 0) return // Invalid threshold range
      
      // Calculate line spacing in world units
      const worldLineSpacing = (effectiveYRange * lineSpacing) / 100
      
      // Generate contour lines within effective range
      const numLines = Math.floor(effectiveYRange / worldLineSpacing)
      
      for (let lineIndex = 0; lineIndex <= numLines; lineIndex++) {
        const lineY = effectiveMinY + (lineIndex * worldLineSpacing) + ((animationTime * 0.05 * worldLineSpacing) % worldLineSpacing)
        
        // Skip lines outside effective bounds
        if (lineY < effectiveMinY || lineY > effectiveMaxY) continue
        
        // Extract points at this elevation (within tolerance)
        const tolerance = worldLineSpacing * 0.02 // 2% tolerance
        const contourPoints: THREE.Vector3[] = []
        
        for (let i = 0; i < pointCount; i++) {
          const x = positions[i * 3]
          const y = positions[i * 3 + 1]
          const z = positions[i * 3 + 2]
          
          // Check if point is close to this elevation
          if (Math.abs(y - lineY) <= tolerance) {
            contourPoints.push(new THREE.Vector3(x, y, z))
          }
        }
        
        // Create line geometry from contour points with proper loop separation
        if (contourPoints.length >= 2) {
          this.createContourLineGeometryWithLoops(contourPoints, lineY, wireOpacity)
        }
      }
    })
  }
  
  private createContourLineGeometryWithLoops(points: THREE.Vector3[], _elevation: number, wireOpacity: number): void {
    if (points.length < 2) return
    
    // Separate points into distinct loops using clustering
    const loops = this.separateIntoLoops(points)
    
    // Create line geometry for each loop
    loops.forEach(loop => {
      if (loop.length >= 2) {
        this.createSingleLoop(loop, wireOpacity)
      }
    })
  }
  
  private separateIntoLoops(points: THREE.Vector3[]): THREE.Vector3[][] {
    if (points.length < 2) return []
    
    const loops: THREE.Vector3[][] = []
    const unprocessed = [...points]
    const maxDistance = this.calculateAverageDistance(points) * 2.5 // Distance threshold for same loop
    
    while (unprocessed.length > 0) {
      const loop: THREE.Vector3[] = []
      const currentPoint = unprocessed.shift()!
      loop.push(currentPoint)
      
      // Find all points within reasonable distance to form a loop
      let searching = true
      while (searching && unprocessed.length > 0) {
        searching = false
        const lastPoint = loop[loop.length - 1]
        
        // Find closest unprocessed point within threshold
        let closestIndex = -1
        let closestDistance = Infinity
        
        for (let i = 0; i < unprocessed.length; i++) {
          const distance = lastPoint.distanceTo(unprocessed[i])
          if (distance < maxDistance && distance < closestDistance) {
            closestDistance = distance
            closestIndex = i
          }
        }
        
        if (closestIndex !== -1) {
          loop.push(unprocessed.splice(closestIndex, 1)[0])
          searching = true
        }
      }
      
      if (loop.length >= 2) {
        loops.push(loop)
      }
    }
    
    return loops
  }
  
  private calculateAverageDistance(points: THREE.Vector3[]): number {
    if (points.length < 2) return 1.0
    
    let totalDistance = 0
    let count = 0
    
    for (let i = 0; i < Math.min(points.length, 50); i++) { // Sample max 50 points for performance
      for (let j = i + 1; j < Math.min(points.length, 50); j++) {
        totalDistance += points[i].distanceTo(points[j])
        count++
      }
    }
    
    return count > 0 ? totalDistance / count : 1.0
  }
  
  private createSingleLoop(loop: THREE.Vector3[], wireOpacity: number): void {
    if (loop.length < 2) return
    
    // Sort points by angle around the center to create a proper loop
    const center = new THREE.Vector3()
    loop.forEach(p => center.add(p))
    center.divideScalar(loop.length)
    
    // Sort points by angle around the center (in XZ plane)
    const sortedPoints = loop.sort((a, b) => {
      const angleA = Math.atan2(a.z - center.z, a.x - center.x)
      const angleB = Math.atan2(b.z - center.z, b.x - center.x)
      return angleA - angleB
    })
    
    // Create line segments connecting adjacent points in the loop
    const linePoints: THREE.Vector3[] = []
    for (let i = 0; i < sortedPoints.length; i++) {
      const current = sortedPoints[i]
      const next = sortedPoints[(i + 1) % sortedPoints.length] // Wrap around to close the loop
      
      linePoints.push(current.clone())
      linePoints.push(next.clone())
    }
    
    // Create line geometry
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(linePoints.length * 3)
    
    for (let i = 0; i < linePoints.length; i++) {
      positions[i * 3] = linePoints[i].x
      positions[i * 3 + 1] = linePoints[i].y
      positions[i * 3 + 2] = linePoints[i].z
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    
    // Create line material with green color and custom opacity
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00ff00,
      linewidth: 2,
      transparent: true,
      opacity: wireOpacity
    })
    
    // Create line mesh
    const wireframe = new THREE.LineSegments(geometry, material)
    
    // Add to scene and track it
    this.mainScene!.add(wireframe)
    this.topographicWires.push(wireframe)
  }

  
  private clearTopographicWires(): void {
    if (!this.mainScene) return
    
    // Remove all existing wire geometry from scene
    this.topographicWires.forEach(wire => {
      this.mainScene!.remove(wire)
      wire.geometry.dispose()
      if (wire.material instanceof THREE.Material) {
        wire.material.dispose()
      }
    })
    
    this.topographicWires = []
  }
  
  private applyPointNetworkEffect(effect: EffectInstance): void {
    // Update point clouds list in case scene changed
    this.updatePointClouds()
    
    if (this.pointClouds.length === 0 || !this.mainScene) return
    
    const movementSpeed = (effect.parameters.movementSpeed ?? 0) / 100 // Make 100x less sensitive
    const movementRange = (effect.parameters.movementRange ?? 0) / 100000 // Convert to 0-0.001 (1000x less sensitive total)
    const bounceEffect = effect.parameters.bounceEffect ?? 1
    const showConnections = effect.parameters.showConnections ?? 1
    const connectionDistance = effect.parameters.connectionDistance ?? 10
    const maxConnections = effect.parameters.maxConnections ?? 5
    const lineOpacity = (effect.parameters.lineOpacity ?? 50) / 100 // Convert to 0-1
    const enableAnimation = effect.parameters.enableAnimation ?? 1
    const resetPositions = effect.parameters.resetPositions ?? 0
    
    // Handle reset positions button
    if (resetPositions > 0.5) {
      this.resetPointPositions()
      // Reset the parameter to avoid repeated resets
      effect.parameters.resetPositions = 0
    }
    
    // Initialize animation time
    if (this.networkAnimationStartTime === 0) {
      this.networkAnimationStartTime = performance.now()
    }
    
    if (enableAnimation > 0.5 && movementSpeed > 0) {
      const deltaTime = (performance.now() - this.networkAnimationStartTime) * 0.001 * movementSpeed
      
      // Update point positions
      this.pointClouds.forEach(pointCloud => {
        const originalPositions = this.originalPositions.get(pointCloud.geometry)
        const velocities = this.pointVelocities.get(pointCloud.geometry)
        
        if (!originalPositions || !velocities) return
        
        const positionAttribute = pointCloud.geometry.attributes.position
        const positions = positionAttribute.array as Float32Array
        const count = positionAttribute.count
        
        for (let i = 0; i < count; i++) {
          const i3 = i * 3
          
          // Update positions based on velocity
          positions[i3] += velocities[i3] * deltaTime
          positions[i3 + 1] += velocities[i3 + 1] * deltaTime
          positions[i3 + 2] += velocities[i3 + 2] * deltaTime
          
          // Calculate movement bounds relative to original position
          const boundSize = movementRange * 10000 // Scale movement range (adjusted for new sensitivity)
          
          if (bounceEffect > 0.5) {
            // Bounce off boundaries
            if (positions[i3] > originalPositions[i3] + boundSize || positions[i3] < originalPositions[i3] - boundSize) {
              velocities[i3] *= -1
            }
            if (positions[i3 + 1] > originalPositions[i3 + 1] + boundSize || positions[i3 + 1] < originalPositions[i3 + 1] - boundSize) {
              velocities[i3 + 1] *= -1
            }
            if (positions[i3 + 2] > originalPositions[i3 + 2] + boundSize || positions[i3 + 2] < originalPositions[i3 + 2] - boundSize) {
              velocities[i3 + 2] *= -1
            }
            
            // Clamp to boundaries
            positions[i3] = Math.max(originalPositions[i3] - boundSize, Math.min(originalPositions[i3] + boundSize, positions[i3]))
            positions[i3 + 1] = Math.max(originalPositions[i3 + 1] - boundSize, Math.min(originalPositions[i3 + 1] + boundSize, positions[i3 + 1]))
            positions[i3 + 2] = Math.max(originalPositions[i3 + 2] - boundSize, Math.min(originalPositions[i3 + 2] + boundSize, positions[i3 + 2]))
          }
        }
        
        positionAttribute.needsUpdate = true
      })
    }
    
    // Generate connection lines
    if (showConnections > 0.5) {
      this.updateConnectionLines(connectionDistance, maxConnections, lineOpacity)
    } else if (this.connectionLines) {
      // Hide existing connection lines
      this.mainScene.remove(this.connectionLines)
      this.connectionLines.geometry.dispose()
      if (Array.isArray(this.connectionLines.material)) {
        this.connectionLines.material.forEach(material => material.dispose())
      } else {
        this.connectionLines.material.dispose()
      }
      this.connectionLines = null
    }
  }
  
  private updateConnectionLines(connectionDistance: number, maxConnections: number, lineOpacity: number): void {
    if (!this.mainScene || this.pointClouds.length === 0) return
    
    // Remove existing lines
    if (this.connectionLines) {
      this.mainScene.remove(this.connectionLines)
      this.connectionLines.geometry.dispose()
      if (Array.isArray(this.connectionLines.material)) {
        this.connectionLines.material.forEach(material => material.dispose())
      } else {
        this.connectionLines.material.dispose()
      }
    }
    
    // Collect all points from all point clouds (limit for performance)
    const allPoints: THREE.Vector3[] = []
    const pointCloudIndices: number[] = [] // Track which point cloud each point belongs to
    const maxPointsForConnections = 1000 // Limit connections to prevent performance issues
    
    this.pointClouds.forEach((pointCloud, cloudIndex) => {
      const positionAttribute = pointCloud.geometry.attributes.position
      const positions = positionAttribute.array as Float32Array
      const count = positionAttribute.count
      
      // For large point clouds, sample every nth point to maintain performance
      const step = count > maxPointsForConnections ? Math.ceil(count / maxPointsForConnections) : 1
      
      for (let i = 0; i < count && allPoints.length < maxPointsForConnections; i += step) {
        const i3 = i * 3
        allPoints.push(new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]))
        pointCloudIndices.push(cloudIndex)
      }
    })
    
    // Generate connections
    const linePositions: number[] = []
    const lineColors: number[] = []
    
    for (let i = 0; i < allPoints.length; i++) {
      let connections = 0
      const pointA = allPoints[i]
      
      for (let j = i + 1; j < allPoints.length && connections < maxConnections; j++) {
        const pointB = allPoints[j]
        const distance = pointA.distanceTo(pointB)
        
        if (distance <= connectionDistance) {
          // Add line
          linePositions.push(pointA.x, pointA.y, pointA.z)
          linePositions.push(pointB.x, pointB.y, pointB.z)
          
          // Calculate opacity based on distance (closer = more opaque)
          // Note: Line opacity is handled by the material's overall opacity setting
          
          // Add colors (white, opacity handled by material)
          lineColors.push(1, 1, 1)
          lineColors.push(1, 1, 1)
          
          connections++
        }
      }
    }
    
    if (linePositions.length > 0) {
      // Create line geometry
      const lineGeometry = new THREE.BufferGeometry()
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
      lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3))
      
      // Create line material
      const lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: lineOpacity
      })
      
      // Create line mesh
      this.connectionLines = new THREE.LineSegments(lineGeometry, lineMaterial)
      this.mainScene.add(this.connectionLines)
    }
  }
  
  private applyMaterialEffect(effect: EffectInstance): void {
    // Update point clouds list in case scene changed
    this.updatePointClouds()
    
    if (this.pointClouds.length === 0) return
    
    const transparency = (effect.parameters.transparency ?? 0) / 100 // Convert to 0-1
    const sizeMultiplier = (effect.parameters.sizeMultiplier ?? 100) / 100 // Convert to 0.1-5.0
    const useVertexColors = effect.parameters.useVertexColors ?? 1
    const waveDeformation = effect.parameters.waveDeformation ?? 0
    const twistEffect = effect.parameters.twistEffect ?? 0
    const animationSpeed = effect.parameters.animationSpeed ?? 1
    const waveFrequency = effect.parameters.waveFrequency ?? 1
    const pulseEffect = effect.parameters.pulseEffect ?? 0
    const colorCycling = effect.parameters.colorCycling ?? 0
    const deformationEnable = effect.parameters.deformationEnable ?? 0
    
    // Initialize animation time
    if (this.materialAnimationStartTime === 0) {
      this.materialAnimationStartTime = performance.now()
    }
    
    const time = (performance.now() - this.materialAnimationStartTime) * 0.001 * animationSpeed
    
    this.pointClouds.forEach(pointCloud => {
      const originalMaterial = this.originalMaterials.get(pointCloud)
      if (!originalMaterial) return
      
      // Create or update custom material
      let customMaterial = this.customMaterials.get(pointCloud)
      
      if (!customMaterial || this.shouldUpdateMaterial(effect)) {
        // Dispose old material if exists
        if (customMaterial) {
          customMaterial.dispose()
        }
        
        // Create new shader material
        customMaterial = this.createCustomMaterial(
          pointCloud,
          transparency,
          sizeMultiplier,
          useVertexColors,
          waveDeformation,
          twistEffect,
          waveFrequency,
          pulseEffect,
          colorCycling,
          deformationEnable
        )
        
        this.customMaterials.set(pointCloud, customMaterial)
        pointCloud.material = customMaterial
      }
      
      // Update time-based uniforms
      if (customMaterial && customMaterial.uniforms) {
        customMaterial.uniforms.time.value = time
        
        if (pulseEffect > 0.5 && customMaterial.uniforms.pulseTime) {
          customMaterial.uniforms.pulseTime.value = Math.sin(time * 3.0) * 0.5 + 1.0
        }
        
        if (colorCycling > 0.5 && customMaterial.uniforms.colorTime) {
          customMaterial.uniforms.colorTime.value = time
        }
      }
    })
  }
  
  private shouldUpdateMaterial(_effect: EffectInstance): boolean {
    // For now, always update - in a production system you'd compare parameters
    return false
  }
  
  private createCustomMaterial(
    _pointCloud: THREE.Points,
    transparency: number,
    sizeMultiplier: number,
    useVertexColors: number,
    waveDeformation: number,
    twistEffect: number,
    waveFrequency: number,
    _pulseEffect: number,
    colorCycling: number,
    deformationEnable: number
  ): THREE.ShaderMaterial {
    
    const vertexShader = `
      uniform float time;
      uniform float sizeMultiplier;
      uniform float waveDeformation;
      uniform float twistEffect;
      uniform float waveFrequency;
      uniform float pulseTime;
      uniform float deformationEnable;
      
      varying vec3 vColor;
      
      void main() {
        vec3 pos = position;
        
        if (deformationEnable > 0.5) {
          // Wave deformation
          if (waveDeformation > 0.0) {
            float wave = sin(time + pos.y * waveFrequency) * waveDeformation;
            pos.x += wave;
            pos.z += wave * 0.5;
          }
          
          // Twist effect (inspired by Three.js example)
          if (twistEffect > 0.0) {
            float theta = sin(time + pos.y) / twistEffect;
            float c = cos(theta);
            float s = sin(theta);
            mat3 m = mat3(c, 0, s, 0, 1, 0, -s, 0, c);
            pos = pos * m;
          }
        }
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Calculate point size
        float pointSize = sizeMultiplier * 2.0; // Base size
        if (deformationEnable > 0.5 && pulseTime > 0.0) {
          pointSize *= pulseTime;
        }
        
        gl_PointSize = pointSize;
        gl_Position = projectionMatrix * mvPosition;
        
        // Pass color to fragment shader
        ${useVertexColors > 0.5 ? 'vColor = color;' : 'vColor = vec3(1.0);'}
      }
    `
    
    const fragmentShader = `
      uniform float time;
      uniform float transparency;
      uniform float colorTime;
      uniform float colorCycling;
      
      varying vec3 vColor;
      
      void main() {
        vec3 finalColor = vColor;
        
        if (colorCycling > 0.5) {
          // Color cycling effect - proper HSV to RGB conversion
          float hue = mod(colorTime * 0.3, 6.28318); // 2*PI for full spectrum
          float sat = 1.0;
          float val = 1.0;
          
          float c = val * sat;
          float x = c * (1.0 - abs(mod(hue / 1.047, 2.0) - 1.0)); // 1.047 = PI/3
          float m = val - c;
          
          if (hue < 1.047) {
            finalColor = vec3(c, x, 0) + m;
          } else if (hue < 2.094) {
            finalColor = vec3(x, c, 0) + m;
          } else if (hue < 3.141) {
            finalColor = vec3(0, c, x) + m;
          } else if (hue < 4.188) {
            finalColor = vec3(0, x, c) + m;
          } else if (hue < 5.236) {
            finalColor = vec3(x, 0, c) + m;
          } else {
            finalColor = vec3(c, 0, x) + m;
          }
        }
        
        float alpha = 1.0 - transparency;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `
    
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        sizeMultiplier: { value: sizeMultiplier },
        transparency: { value: transparency },
        waveDeformation: { value: waveDeformation },
        twistEffect: { value: twistEffect },
        waveFrequency: { value: waveFrequency },
        pulseTime: { value: 1.0 },
        colorTime: { value: 0 },
        colorCycling: { value: colorCycling },
        deformationEnable: { value: deformationEnable }
      },
      transparent: transparency > 0,
      vertexColors: useVertexColors > 0.5
    })
    
    return material
  }
  
  private applyBrushEffect(effect: EffectInstance): void {
    if (!this.brushEffect) return
    
    const brushSize = effect.parameters.brushSize ?? 2.0
    const brushStrength = effect.parameters.brushStrength ?? 5.0
    const elasticity = effect.parameters.elasticity ?? 0.2
    const damping = effect.parameters.damping ?? 0.98
    
    // This method is called during effect chain processing
    // The continuous updates happen in updateBrushEffects()
    // Just ensure brush is properly initialized here
    this.brushEffect.updateBrush({
      enabled: effect.enabled,
      brushSize,
      brushStrength,
      elasticity,
      damping,
      pointerX: 0,
      pointerY: 0,
      pointerZ: 0,
      isActive: effect.enabled
    }, this.currentMousePosition.x, this.currentMousePosition.y)
  }
  
  setBrushPosition(mouseX: number, mouseY: number, _isActive: boolean): void {
    // Store current mouse position (ignore isActive parameter, always active when enabled)
    this.currentMousePosition.x = mouseX
    this.currentMousePosition.y = mouseY
  }
  
  resetBrushEffect(): void {
    if (this.brushEffect) {
      this.brushEffect.reset()
    }
  }
  
  private renderTSLEffect(
    renderer: THREE.WebGLRenderer, 
    inputTexture: THREE.Texture, 
    effect: EffectInstance, 
    outputTarget?: THREE.WebGLRenderTarget | null
  ): void {
    if (!this.tslPass) {
      // Fallback to copy if TSL not available
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    const tslEffectTypeNum = effect.parameters.tslEffectType ?? 0
    const effectTypes = ['crt', 'wave', 'noise', 'hologram'] as const
    const tslEffectType = effectTypes[Math.floor(tslEffectTypeNum)] || 'crt'
    const intensity = (effect.parameters.intensity ?? 50) / 100
    const speed = effect.parameters.speed ?? 1.0
    const scale = effect.parameters.scale ?? 1.0
    
    this.tslPass.render(renderer, inputTexture, {
      effectType: tslEffectType,
      intensity,
      speed,
      scale
    }, outputTarget)
  }
  
  getTSLCapabilityInfo(): string {
    return this.tslPass?.getCapabilityInfo() ?? 'TSL not available'
  }
  
  updateBrushEffects(): void {
    // Update brush effects continuously every frame
    const brushEffects = this.effectsChain.filter(effect => effect.type === 'brush' && effect.enabled)
    
    brushEffects.forEach(effect => {
      if (this.brushEffect) {
        const brushSize = effect.parameters.brushSize ?? 2.0
        const brushStrength = effect.parameters.brushStrength ?? 5.0
        const elasticity = effect.parameters.elasticity ?? 0.2
        const damping = effect.parameters.damping ?? 0.98
        
        // Update brush physics every frame using current mouse position
        // Brush is always active when the effect is enabled
        this.brushEffect.updateBrush({
          enabled: effect.enabled,
          brushSize,
          brushStrength,
          elasticity,
          damping,
          pointerX: 0, // Not used in current implementation
          pointerY: 0,
          pointerZ: 0,
          isActive: effect.enabled // Always active when effect is enabled
        }, this.currentMousePosition.x, this.currentMousePosition.y)
      }
    })
  }
  
  private getVertexShader(): string {
    return `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
  }
  
  private getFragmentShader(): string {
    return `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform int effectType;
      uniform float intensity;
      uniform vec3 colorTint;
      uniform float vignetteOffset;
      uniform float vignetteDarkness;
      uniform float vignetteFeather;
      uniform float blurAmount;
      uniform float filmNoiseSeed;
      uniform vec2 dotscreenCenter;
      uniform float dotscreenScale;
      uniform float motionBlurStrength;
      uniform int motionBlurSamples;
      uniform mat4 previousViewProjectionMatrix;
      uniform mat4 currentViewProjectionMatrix;
      uniform float sobelThreshold;
      uniform float time;
      uniform float gammaValue;
      uniform float brightness;
      uniform float contrast;
      uniform float saturation;
      uniform float bloomThreshold;
      uniform float bloomIntensity;
      uniform float bloomRadius;
      uniform float oilBrushSize;
      uniform float oilRoughness;
      uniform float oilBrightness;
      
      varying vec2 vUv;
      
      // Random function for noise
      float random(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      // Pre-blur function (Gaussian-style blur)
      vec3 preBlur(sampler2D tex, vec2 uv, vec2 resolution, float blurAmount) {
        if (blurAmount <= 0.0) {
          return texture2D(tex, uv).rgb;
        }
        
        vec3 color = vec3(0.0);
        vec2 texelSize = vec2(blurAmount);
        
        // 9-tap Gaussian blur
        color += texture2D(tex, uv + vec2(-texelSize.x, -texelSize.y)).rgb * 0.0625;
        color += texture2D(tex, uv + vec2(0.0, -texelSize.y)).rgb * 0.125;
        color += texture2D(tex, uv + vec2(texelSize.x, -texelSize.y)).rgb * 0.0625;
        color += texture2D(tex, uv + vec2(-texelSize.x, 0.0)).rgb * 0.125;
        color += texture2D(tex, uv).rgb * 0.25;
        color += texture2D(tex, uv + vec2(texelSize.x, 0.0)).rgb * 0.125;
        color += texture2D(tex, uv + vec2(-texelSize.x, texelSize.y)).rgb * 0.0625;
        color += texture2D(tex, uv + vec2(0.0, texelSize.y)).rgb * 0.125;
        color += texture2D(tex, uv + vec2(texelSize.x, texelSize.y)).rgb * 0.0625;
        
        return color;
      }
      
      // Gamma correction effect
      vec3 gamma(vec3 color, float gammaValue, float brightness, float contrast, float saturation) {
        // Apply gamma correction
        vec3 result = pow(color, vec3(1.0 / gammaValue));
        
        // Apply brightness
        result *= brightness;
        
        // Apply contrast (around midpoint 0.5)
        result = ((result - 0.5) * contrast) + 0.5;
        
        // Apply saturation
        float luminance = dot(result, vec3(0.299, 0.587, 0.114));
        result = mix(vec3(luminance), result, saturation);
        
        // Clamp to valid range
        return clamp(result, 0.0, 1.0);
      }
      
      // Sepia effect
      vec3 sepia(vec3 color) {
        vec3 sepiaColor;
        sepiaColor.r = dot(color, vec3(0.393, 0.769, 0.189));
        sepiaColor.g = dot(color, vec3(0.349, 0.686, 0.168));
        sepiaColor.b = dot(color, vec3(0.272, 0.534, 0.131));
        return sepiaColor;
      }
      
      // Vignette effect
      vec3 vignette(vec3 color, vec2 uv, float offset, float darkness, float feather) {
        vec2 center = vec2(0.5, 0.5);
        float dist = distance(uv, center);
        
        // Create vignette effect with adjustable feathering
        float innerRadius = offset * (1.0 - feather);
        float outerRadius = offset;
        float vignetteFactor = smoothstep(outerRadius, innerRadius, dist);
        
        // Apply darkness control: 0 = no effect, 1 = full vignette
        vignetteFactor = mix(1.0, vignetteFactor, darkness);
        
        return color * vignetteFactor;
      }
      
      // Blur effect (using preBlur implementation)
      vec3 blur(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
        return preBlur(tex, uv, resolution, amount);
      }
      
      // Film effect with noise and scanlines
      vec3 film(vec3 color, vec2 uv) {
        // Add noise
        float noise = random(uv + time) * filmNoiseSeed;
        
        // Add scanlines
        float scanline = sin(uv.y * resolution.y * 2.0) * 0.1;
        
        // Combine effects
        return color + vec3(noise) + vec3(scanline);
      }
      
      // Dot screen effect
      vec3 dotscreen(vec3 color, vec2 uv) {
        vec2 center = dotscreenCenter;
        vec2 scaledUv = (uv - center) * dotscreenScale * 100.0;
        
        // Create a grid pattern
        vec2 grid = abs(fract(scaledUv) - 0.5);
        float pattern = smoothstep(0.0, 0.3, max(grid.x, grid.y));
        
        // Alternative: circular dots
        vec2 gridPos = floor(scaledUv);
        vec2 dotCenter = gridPos + 0.5;
        float dotDist = distance(scaledUv, dotCenter);
        float dots = 1.0 - smoothstep(0.2, 0.4, dotDist);
        
        // Mix grid and dots
        float finalPattern = max(pattern, dots);
        
        return color * finalPattern;
      }
      
      // Bleach bypass effect
      vec3 bleachBypass(vec3 color) {
        vec3 lumCoeff = vec3(0.25, 0.65, 0.1);
        float lum = dot(lumCoeff, color);
        vec3 blend = vec3(lum);
        
        // Overlay blend mode
        vec3 result = vec3(0.0);
        result.r = (blend.r < 0.5) ? (2.0 * color.r * blend.r) : (1.0 - 2.0 * (1.0 - color.r) * (1.0 - blend.r));
        result.g = (blend.g < 0.5) ? (2.0 * color.g * blend.g) : (1.0 - 2.0 * (1.0 - color.g) * (1.0 - blend.g));
        result.b = (blend.b < 0.5) ? (2.0 * color.b * blend.b) : (1.0 - 2.0 * (1.0 - color.b) * (1.0 - blend.b));
        
        return result;
      }
      
      // Colorify effect
      vec3 colorify(vec3 color) {
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        return mix(color, colorTint * luminance, intensity);
      }
      
      // Sobel edge detection  
      vec3 sobelFromColor(vec3 inputColor, vec2 uv, vec2 resolution) {
        vec2 texelSize = 1.0 / resolution;
        
        // Sample the 3x3 neighborhood from the texture
        float tl = dot(texture2D(tDiffuse, uv + vec2(-texelSize.x, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114)); // top-left
        float tm = dot(texture2D(tDiffuse, uv + vec2(0.0, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));           // top-middle
        float tr = dot(texture2D(tDiffuse, uv + vec2(texelSize.x, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));   // top-right
        float ml = dot(texture2D(tDiffuse, uv + vec2(-texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));           // middle-left
        float mm = dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114));                                     // middle-middle
        float mr = dot(texture2D(tDiffuse, uv + vec2(texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));            // middle-right
        float bl = dot(texture2D(tDiffuse, uv + vec2(-texelSize.x, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));   // bottom-left
        float bm = dot(texture2D(tDiffuse, uv + vec2(0.0, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));            // bottom-middle
        float br = dot(texture2D(tDiffuse, uv + vec2(texelSize.x, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));    // bottom-right
        
        // Apply Sobel X kernel
        // -1  0  1
        // -2  0  2
        // -1  0  1
        float sobelX = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        
        // Apply Sobel Y kernel
        //  1  2  1
        //  0  0  0
        // -1 -2 -1
        float sobelY = (tl + 2.0 * tm + tr) - (bl + 2.0 * bm + br);
        
        // Calculate gradient magnitude
        float gradient = sqrt(sobelX * sobelX + sobelY * sobelY);
        
        // Return edge detection result (white edges on black background)
        return vec3(gradient);
      }
      
      // Sobel edge detection with threshold
      vec3 sobelWithThresholdFromColor(vec3 inputColor, vec2 uv, vec2 resolution, float threshold) {
        vec2 texelSize = 1.0 / resolution;
        
        // Sample the 3x3 neighborhood from the texture
        float tl = dot(texture2D(tDiffuse, uv + vec2(-texelSize.x, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
        float tm = dot(texture2D(tDiffuse, uv + vec2(0.0, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
        float tr = dot(texture2D(tDiffuse, uv + vec2(texelSize.x, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
        float ml = dot(texture2D(tDiffuse, uv + vec2(-texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float mm = dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114));
        float mr = dot(texture2D(tDiffuse, uv + vec2(texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float bl = dot(texture2D(tDiffuse, uv + vec2(-texelSize.x, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
        float bm = dot(texture2D(tDiffuse, uv + vec2(0.0, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
        float br = dot(texture2D(tDiffuse, uv + vec2(texelSize.x, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
        
        // Apply Sobel X kernel
        float sobelX = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        
        // Apply Sobel Y kernel
        float sobelY = (tl + 2.0 * tm + tr) - (bl + 2.0 * bm + br);
        
        // Calculate gradient magnitude
        float gradient = sqrt(sobelX * sobelX + sobelY * sobelY);
        
        // Apply threshold - only show edges above threshold
        gradient = step(threshold, gradient);
        
        // Return thresholded edge detection result
        return vec3(gradient);
      }
      
      // Bloom effect
      vec3 bloom(sampler2D tex, vec2 uv, vec2 resolution, float threshold, float intensity, float radius) {
        vec3 originalColor = texture2D(tex, uv).rgb;
        
        // Extract bright areas using threshold
        float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
        float bloomMask = smoothstep(threshold - 0.1, threshold + 0.1, luminance);
        vec3 brightColor = originalColor * bloomMask;
        
        // Apply Gaussian blur to bright areas for bloom effect
        vec3 bloomColor = vec3(0.0);
        vec2 texelSize = radius / resolution;
        
        // 9-tap Gaussian blur for bloom
        bloomColor += texture2D(tex, uv + vec2(-texelSize.x, -texelSize.y)).rgb * 0.0625;
        bloomColor += texture2D(tex, uv + vec2(0.0, -texelSize.y)).rgb * 0.125;
        bloomColor += texture2D(tex, uv + vec2(texelSize.x, -texelSize.y)).rgb * 0.0625;
        bloomColor += texture2D(tex, uv + vec2(-texelSize.x, 0.0)).rgb * 0.125;
        bloomColor += texture2D(tex, uv).rgb * 0.25;
        bloomColor += texture2D(tex, uv + vec2(texelSize.x, 0.0)).rgb * 0.125;
        bloomColor += texture2D(tex, uv + vec2(-texelSize.x, texelSize.y)).rgb * 0.0625;
        bloomColor += texture2D(tex, uv + vec2(0.0, texelSize.y)).rgb * 0.125;
        bloomColor += texture2D(tex, uv + vec2(texelSize.x, texelSize.y)).rgb * 0.0625;
        
        // Apply threshold mask to blurred color
        bloomColor = bloomColor * bloomMask;
        
        // Combine original with bloom
        return originalColor + bloomColor * intensity;
      }
      
      // Motion blur effect using velocity vectors
      vec3 motionBlur(sampler2D tex, vec2 uv, vec2 resolution, float strength, int samples) {
        vec3 color = vec3(0.0);
        
        // Reconstruct world position from depth (assume depth = 0.5 for post-process effects)
        vec4 currentPos = vec4(uv * 2.0 - 1.0, 0.5, 1.0);
        
        // Transform to previous frame's screen space
        vec4 prevPos = previousViewProjectionMatrix * inverse(currentViewProjectionMatrix) * currentPos;
        prevPos /= prevPos.w;
        
        // Calculate velocity vector in screen space
        vec2 velocity = (currentPos.xy - prevPos.xy) * strength;
        
        // If no significant motion, return original color
        if (length(velocity) < 0.001) {
          return texture2D(tex, uv).rgb;
        }
        
        float totalWeight = 0.0;
        
        // Sample along the velocity vector
        for (int i = 0; i < 16; i++) {
          if (i >= samples) break;
          
          float offset = (float(i) / float(samples - 1)) - 0.5;
          vec2 sampleUV = uv + velocity * offset;
          
          // Check bounds
          if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
            float weight = 1.0 - abs(offset);
            color += texture2D(tex, sampleUV).rgb * weight;
            totalWeight += weight;
          }
        }
        
        return totalWeight > 0.0 ? color / totalWeight : texture2D(tex, uv).rgb;
      }
      
      // Oil painting effect - creates painterly look with brush strokes
      vec3 oilPainting(sampler2D tex, vec2 uv, vec2 resolution, float brushSize, float roughness, float brightness) {
        vec2 texelSize = 1.0 / resolution;
        vec3 finalColor = vec3(0.0);
        
        // Calculate brush area radius based on brush size
        float radius = brushSize * 0.5;
        int samples = int(radius * 2.0 + 1.0);
        samples = min(samples, 15); // Limit for performance
        
        // Color buckets for quantization (oil painting effect)
        vec3 colorBuckets[8];
        float bucketWeights[8];
        
        // Initialize buckets
        for (int i = 0; i < 8; i++) {
          colorBuckets[i] = vec3(0.0);
          bucketWeights[i] = 0.0;
        }
        
        float totalWeight = 0.0;
        
        // Sample in a circular pattern around the current pixel
        for (int x = -samples; x <= samples; x++) {
          for (int y = -samples; y <= samples; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize * radius;
            vec2 sampleUV = uv + offset;
            
            // Check if sample is within circle and bounds
            float distance = length(vec2(float(x), float(y)));
            if (distance <= radius && 
                sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && 
                sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
              
              vec3 sampleColor = texture2D(tex, sampleUV).rgb;
              
              // Calculate sample weight (closer to center = higher weight)
              float weight = 1.0 - (distance / radius);
              weight = pow(weight, 1.0 + roughness); // Roughness affects falloff
              
              // Quantize color into buckets based on luminance
              float luminance = dot(sampleColor, vec3(0.299, 0.587, 0.114));
              int bucketIndex = int(luminance * 7.0); // 8 buckets (0-7)
              bucketIndex = clamp(bucketIndex, 0, 7);
              
              // Add to appropriate bucket
              colorBuckets[bucketIndex] += sampleColor * weight;
              bucketWeights[bucketIndex] += weight;
              totalWeight += weight;
            }
          }
        }
        
        // Find the dominant color bucket
        float maxWeight = 0.0;
        vec3 dominantColor = texture2D(tex, uv).rgb;
        
        for (int i = 0; i < 8; i++) {
          if (bucketWeights[i] > maxWeight) {
            maxWeight = bucketWeights[i];
            dominantColor = colorBuckets[i] / bucketWeights[i];
          }
        }
        
        // Apply brightness adjustment
        dominantColor *= brightness;
        
        // Add some texture by mixing with a slightly different sample
        vec2 textureOffset = vec2(sin(uv.x * 100.0) * texelSize.x, cos(uv.y * 100.0) * texelSize.y) * roughness * 0.5;
        vec3 textureColor = texture2D(tex, uv + textureOffset).rgb;
        
        // Blend the dominant color with texture for more painterly effect
        return mix(dominantColor, textureColor, roughness * 0.2);
      }
      
      void main() {
        vec4 originalColor = texture2D(tDiffuse, vUv);
        
        // Start with original color
        vec3 color = originalColor.rgb;
        
        // Apply selected effect
        if (effectType == 1) {
          // Gamma correction
          color = gamma(color, gammaValue, brightness, contrast, saturation);
        } else if (effectType == 2) {
          // Sepia
          color = mix(color, sepia(color), intensity);
        } else if (effectType == 3) {
          // Vignette
          color = mix(color, vignette(color, vUv, vignetteOffset, vignetteDarkness, vignetteFeather), intensity);
        } else if (effectType == 4) {
          // Blur
          color = mix(color, blur(tDiffuse, vUv, resolution, blurAmount), intensity);
        } else if (effectType == 5) {
          // Bloom
          color = bloom(tDiffuse, vUv, resolution, bloomThreshold, bloomIntensity, bloomRadius);
        } else if (effectType == 6) {
          // Film
          color = mix(color, film(color, vUv), intensity);
        } else if (effectType == 7) {
          // Dot screen
          color = mix(color, dotscreen(color, vUv), intensity);
        } else if (effectType == 8) {
          // Bleach bypass
          color = mix(color, bleachBypass(color), intensity);
        } else if (effectType == 9) {
          // Colorify
          color = colorify(color);
        } else if (effectType == 10) {
          // Sobel edge detection
          color = mix(color, sobelFromColor(color, vUv, resolution), intensity);
        } else if (effectType == 11) {
          // Sobel edge detection with threshold
          color = mix(color, sobelWithThresholdFromColor(color, vUv, resolution, sobelThreshold), intensity);
        } else if (effectType == 12) {
          // Motion blur
          color = mix(color, motionBlur(tDiffuse, vUv, resolution, motionBlurStrength, motionBlurSamples), intensity);
        } else if (effectType == 13) {
          // Oil painting
          color = mix(color, oilPainting(tDiffuse, vUv, resolution, oilBrushSize, oilRoughness, oilBrightness), intensity);
        }
        
        gl_FragColor = vec4(color, originalColor.a);
      }
    `
  }
}