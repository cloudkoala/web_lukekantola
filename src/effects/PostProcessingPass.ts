import * as THREE from 'three'
import type { EffectInstance } from './EffectsChainManager'
import { ASCIIDitheringPass } from './ASCIIDitheringPass'
import { HalftoneDitheringPass } from './HalftoneDitheringPass'
import { FloydSteinbergDitheringPass } from './FloydSteinbergDitheringPass'
import { BrushEffect } from './BrushEffect'
import { TSLPostProcessingPass } from './TSLPostProcessingPass'

export type EffectType = 'none' | 'background' | 'drawrange' | 'pointnetwork' | 'material' | 'brush' | 'tsl' | 'gamma' | 'sepia' | 'vignette' | 'blur' | 'bloom' | 'crtgrain' | 'film35mm' | 'dotscreen' | 'bleachbypass' | 'invert' | 'afterimage' | 'dof' | 'colorify' | 'sobel' | 'sobelthreshold' | 'ascii' | 'halftone' | 'floydsteinberg' | 'motionblur' | 'oilpainting' | 'topographic' | 'datamosh' | 'pixelsort' | 'glow' | 'pixelate' | 'fog' | 'threshold' | 'colorgradient'

export class PostProcessingPass {
  private renderTargets: THREE.WebGLRenderTarget[]
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private mainScene: THREE.Scene | null = null
  private pointClouds: THREE.Points[] = []
  private sphereMeshes: THREE.InstancedMesh[] = []
  private originalDrawRanges: Map<THREE.BufferGeometry, { start: number, count: number }> = new Map()
  private animationStartTime: number = 0
  
  // Point Network effect state
  private pointVelocities: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private originalPositions: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private originalColors: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private connectionLines: THREE.LineSegments | null = null
  private networkAnimationStartTime: number = 0
  
  // Afterimage effect state
  private afterimageRenderTarget: THREE.WebGLRenderTarget | null = null
  private afterimageMaterial: THREE.ShaderMaterial | null = null
  
  // DOF effect state
  private dofRenderTarget: THREE.WebGLRenderTarget | null = null
  private dofBlurRenderTarget: THREE.WebGLRenderTarget | null = null
  private dofMaterial: THREE.ShaderMaterial | null = null
  private dofBlurMaterial: THREE.ShaderMaterial | null = null
  
  // Material effect state
  private originalMaterials: Map<THREE.Points, THREE.Material | THREE.Material[]> = new Map()
  private customMaterials: Map<THREE.Points, THREE.ShaderMaterial> = new Map()
  private originalSphereMaterials: Map<THREE.InstancedMesh, THREE.Material | THREE.Material[]> = new Map()
  private customSphereMaterials: Map<THREE.InstancedMesh, THREE.ShaderMaterial> = new Map()
  private materialAnimationStartTime: number = 0
  
  // Topographic effect state
  private topographicAnimationStartTime: number = 0
  private topographicWires: THREE.LineSegments[] = []
  
  // Sphere motion tracking for motion blur
  private spherePreviousPositions: Map<THREE.InstancedMesh, Float32Array> = new Map()
  private sphereCurrentPositions: Map<THREE.InstancedMesh, Float32Array> = new Map()
  
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
  public oilTexture: number = 0.5
  public datamoshIntensity: number = 0.5
  public datamoshDisplacement: number = 10.0
  public datamoshCorruption: number = 0.3
  public datamoshBlockSize: number = 8.0
  public datamoshGlitchFreq: number = 0.2
  public datamoshFrameBlend: number = 0.7
  public pixelsortIntensity: number = 0.5
  public pixelsortLength: number = 50
  public pixelsortThreshold: number = 0.5
  public pixelsortDirection: number = 0
  public pixelsortMode: number = 0
  public glowIntensity: number = 0.5
  public glowThreshold: number = 0.8
  public glowRadius: number = 1.0
  public glowStrength: number = 2.0
  public glowSamples: number = 8
  public glowSoftness: number = 0.5
  public pixelateIntensity: number = 1.0
  public pixelateSize: number = 6
  public pixelateNormalEdge: number = 0.3
  public pixelateDepthEdge: number = 0.4
  public pixelateEdgeMode: number = 0
  public pixelateSmoothing: number = 0.5
  public fogIntensity: number = 0.5
  public fogNear: number = 5.0
  public fogFar: number = 50.0
  public fogColorR: number = 0.8
  public fogColorG: number = 0.9
  public fogColorB: number = 1.0
  public fogMode: number = 0
  public fogYMax: number = 10.0
  public thresholdIntensity: number = 1.0
  public thresholdThreshold: number = 0.5
  public thresholdHardness: number = 1.0
  
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
        effectType: { value: 0 }, // 0=none, 1=gamma, 2=sepia, 3=vignette, 4=blur, 5=bloom, 6=crtgrain, 7=film35mm, 8=dotscreen, 9=bleachbypass, 10=invert, 11=colorify, 12=sobel, 13=sobelthreshold, 14=motionblur, 15=oilpainting, 16=datamosh, 17=pixelsort, 18=glow, 19=pixelate, 20=fog
        intensity: { value: this.intensity },
        colorTint: { value: new THREE.Vector3(this.colorR, this.colorG, this.colorB) },
        vignetteOffset: { value: this.vignetteOffset },
        vignetteDarkness: { value: this.vignetteDarkness },
        vignetteFeather: { value: this.vignetteFeather },
        blurAmount: { value: this.blurAmount },
        blurThreshold: { value: 0.0 },
        blurType: { value: 0 },
        filmNoiseSeed: { value: this.filmNoiseSeed },
        crtScale: { value: 1.0 },
        film35mmGrainSize: { value: 0.8 },
        film35mmContrast: { value: 1.2 },
        film35mmScale: { value: 1.0 },
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
        bloomQuality: { value: 2 },
        oilBrushSize: { value: this.oilBrushSize },
        oilRoughness: { value: this.oilRoughness },
        oilBrightness: { value: this.oilBrightness },
        oilTexture: { value: this.oilTexture },
        datamoshIntensity: { value: this.datamoshIntensity },
        datamoshDisplacement: { value: this.datamoshDisplacement },
        datamoshCorruption: { value: this.datamoshCorruption },
        datamoshBlockSize: { value: this.datamoshBlockSize },
        datamoshGlitchFreq: { value: this.datamoshGlitchFreq },
        datamoshFrameBlend: { value: this.datamoshFrameBlend },
        pixelsortIntensity: { value: this.pixelsortIntensity },
        pixelsortLength: { value: this.pixelsortLength },
        pixelsortThreshold: { value: this.pixelsortThreshold },
        pixelsortDirection: { value: this.pixelsortDirection },
        pixelsortMode: { value: this.pixelsortMode },
        glowIntensity: { value: this.glowIntensity },
        glowThreshold: { value: this.glowThreshold },
        glowRadius: { value: this.glowRadius },
        glowStrength: { value: this.glowStrength },
        glowSamples: { value: this.glowSamples },
        glowSoftness: { value: this.glowSoftness },
        pixelateIntensity: { value: this.pixelateIntensity },
        pixelateSize: { value: this.pixelateSize },
        pixelateNormalEdge: { value: this.pixelateNormalEdge },
        pixelateDepthEdge: { value: this.pixelateDepthEdge },
        pixelateEdgeMode: { value: this.pixelateEdgeMode },
        pixelateSmoothing: { value: this.pixelateSmoothing },
        fogIntensity: { value: this.fogIntensity },
        fogNear: { value: this.fogNear },
        fogFar: { value: this.fogFar },
        fogColor: { value: new THREE.Vector3(this.fogColorR, this.fogColorG, this.fogColorB) },
        fogMode: { value: this.fogMode },
        fogYMax: { value: this.fogYMax },
        thresholdIntensity: { value: this.thresholdIntensity },
        thresholdThreshold: { value: this.thresholdThreshold },
        thresholdHardness: { value: this.thresholdHardness },
        gradientColor1: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
        gradientColor2: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        gradientSmoothness: { value: 1.0 },
        gradientContrast: { value: 1.0 },
        gradientMidpoint: { value: 0.5 }
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
    
    // Initialize afterimage effect
    this.initializeAfterimage(width, height)
    
    // Initialize DOF effect
    this.initializeDOF(width, height)
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
    
    // Handle afterimage effect separately
    if (effect.type === 'afterimage') {
      this.renderAfterimageEffect(renderer, inputTexture, effect, outputTarget)
      return
    }
    
    // Handle DOF effect separately
    if (effect.type === 'dof') {
      console.log('🔵 DOF effect detected in rendering pipeline!')
      this.renderDOFEffect(renderer, inputTexture, effect, outputTarget)
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
        this.material.uniforms.blurThreshold.value = effect.parameters.threshold ?? 0.0
        this.material.uniforms.blurType.value = effect.parameters.blurType ?? 0
        break
      case 'bloom':
        this.material.uniforms.bloomThreshold.value = effect.parameters.threshold ?? 0.8
        this.material.uniforms.bloomIntensity.value = effect.parameters.intensity ?? 1.0
        this.material.uniforms.bloomRadius.value = effect.parameters.radius ?? 0.5
        this.material.uniforms.bloomQuality.value = effect.parameters.quality ?? 2
        break
      case 'crtgrain':
        this.material.uniforms.filmNoiseSeed.value = effect.parameters.noiseSeed ?? 0.35
        this.material.uniforms.crtScale.value = effect.parameters.scale ?? 1.0
        break
      case 'film35mm':
        this.material.uniforms.film35mmGrainSize.value = effect.parameters.grainSize ?? 0.8
        this.material.uniforms.film35mmContrast.value = effect.parameters.contrast ?? 1.2
        this.material.uniforms.film35mmScale.value = effect.parameters.scale ?? 1.0
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
        this.material.uniforms.oilTexture.value = effect.parameters.texture ?? 0.5
        break
      case 'datamosh':
        this.material.uniforms.datamoshIntensity.value = effect.parameters.intensity ?? 0.5
        this.material.uniforms.datamoshDisplacement.value = effect.parameters.displacement ?? 10.0
        this.material.uniforms.datamoshCorruption.value = effect.parameters.corruption ?? 0.3
        this.material.uniforms.datamoshBlockSize.value = effect.parameters.blockSize ?? 8.0
        this.material.uniforms.datamoshGlitchFreq.value = effect.parameters.glitchFreq ?? 0.2
        this.material.uniforms.datamoshFrameBlend.value = effect.parameters.frameBlend ?? 0.7
        break
      
      case 'pixelsort':
        this.material.uniforms.pixelsortIntensity.value = effect.parameters.intensity ?? 0.5
        this.material.uniforms.pixelsortLength.value = effect.parameters.sortLength ?? 50
        this.material.uniforms.pixelsortThreshold.value = effect.parameters.threshold ?? 0.5
        this.material.uniforms.pixelsortDirection.value = effect.parameters.direction ?? 0
        this.material.uniforms.pixelsortMode.value = effect.parameters.sortMode ?? 0
        break
      
      case 'glow':
        this.material.uniforms.glowIntensity.value = effect.parameters.intensity ?? 0.5
        this.material.uniforms.glowThreshold.value = effect.parameters.threshold ?? 0.8
        this.material.uniforms.glowRadius.value = effect.parameters.radius ?? 1.0
        this.material.uniforms.glowStrength.value = effect.parameters.strength ?? 2.0
        this.material.uniforms.glowSamples.value = effect.parameters.samples ?? 8
        this.material.uniforms.glowSoftness.value = effect.parameters.softness ?? 0.5
        break
      
      case 'pixelate':
        this.material.uniforms.pixelateIntensity.value = effect.parameters.intensity ?? 1.0
        this.material.uniforms.pixelateSize.value = effect.parameters.pixelSize ?? 6
        this.material.uniforms.pixelateNormalEdge.value = effect.parameters.normalEdge ?? 0.3
        this.material.uniforms.pixelateDepthEdge.value = effect.parameters.depthEdge ?? 0.4
        this.material.uniforms.pixelateEdgeMode.value = effect.parameters.edgeMode ?? 0
        this.material.uniforms.pixelateSmoothing.value = effect.parameters.smoothing ?? 0.5
        break
      
      case 'fog':
        this.material.uniforms.fogIntensity.value = effect.parameters.intensity ?? 0.5
        this.material.uniforms.fogNear.value = effect.parameters.near ?? 5.0
        this.material.uniforms.fogFar.value = effect.parameters.far ?? 50.0
        this.material.uniforms.fogColor.value.set(
          effect.parameters.fogColorR ?? 0.8,
          effect.parameters.fogColorG ?? 0.9,
          effect.parameters.fogColorB ?? 1.0
        )
        this.material.uniforms.fogMode.value = effect.parameters.fogMode ?? 0
        this.material.uniforms.fogYMax.value = effect.parameters.yMax ?? 10.0
        
        // Fog parameters updated above
        break
      
      case 'threshold':
        this.material.uniforms.thresholdIntensity.value = effect.parameters.intensity ?? 1.0
        this.material.uniforms.thresholdThreshold.value = effect.parameters.threshold ?? 0.5
        this.material.uniforms.thresholdHardness.value = effect.parameters.hardness ?? 1.0
        break
      
      case 'colorgradient':
        // Convert hex colors to RGB (0-1 range)
        const color1 = effect.parameters.color1 ?? 0x000000
        const color2 = effect.parameters.color2 ?? 0xFFFFFF
        
        this.material.uniforms.gradientColor1.value.set(
          ((color1 >> 16) & 255) / 255.0,  // Red
          ((color1 >> 8) & 255) / 255.0,   // Green
          (color1 & 255) / 255.0           // Blue
        )
        this.material.uniforms.gradientColor2.value.set(
          ((color2 >> 16) & 255) / 255.0,  // Red
          ((color2 >> 8) & 255) / 255.0,   // Green
          (color2 & 255) / 255.0           // Blue
        )
        this.material.uniforms.gradientSmoothness.value = effect.parameters.smoothness ?? 1.0
        this.material.uniforms.gradientContrast.value = effect.parameters.contrast ?? 1.0
        this.material.uniforms.gradientMidpoint.value = effect.parameters.midpoint ?? 0.5
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
    
    // Update afterimage render target
    if (this.afterimageRenderTarget) {
      this.afterimageRenderTarget.setSize(width, height)
    }
    
    // Update DOF render targets
    if (this.dofRenderTarget) {
      this.dofRenderTarget.setSize(width, height)
    }
    if (this.dofBlurRenderTarget) {
      this.dofBlurRenderTarget.setSize(width, height)
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
    
    // Clean up afterimage resources
    if (this.afterimageRenderTarget) {
      this.afterimageRenderTarget.dispose()
    }
    if (this.afterimageMaterial) {
      this.afterimageMaterial.dispose()
    }
    
    // Clean up DOF resources
    if (this.dofRenderTarget) {
      this.dofRenderTarget.dispose()
    }
    if (this.dofBlurRenderTarget) {
      this.dofBlurRenderTarget.dispose()
    }
    if (this.dofMaterial) {
      this.dofMaterial.dispose()
    }
    if (this.dofBlurMaterial) {
      this.dofBlurMaterial.dispose()
    }
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
      case 'crtgrain': return 6
      case 'film35mm': return 7
      case 'dotscreen': return 8
      case 'bleachbypass': return 9
      case 'invert': return 10
      case 'colorify': return 11
      case 'sobel': return 12
      case 'sobelthreshold': return 13
      case 'motionblur': return 14
      case 'oilpainting': return 15
      case 'datamosh': return 16
      case 'pixelsort': return 17
      case 'glow': return 18
      case 'pixelate': return 19
      case 'fog': return 20
      case 'threshold': return 21
      case 'colorgradient': return 22
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
    
    // Find all point clouds and sphere meshes in the scene
    this.pointClouds = []
    this.sphereMeshes = []
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
      } else if (child instanceof THREE.InstancedMesh && child.userData?.isSphereInstanced) {
        // Track instanced sphere meshes created by SphereInstancer
        this.sphereMeshes.push(child)
        
        // Store original material for material effects
        if (!this.originalSphereMaterials.has(child)) {
          this.originalSphereMaterials.set(child, child.material)
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
    // Reset point cloud materials
    this.pointClouds.forEach(pointCloud => {
      const originalMaterial = this.originalMaterials.get(pointCloud)
      if (originalMaterial) {
        pointCloud.material = originalMaterial
      }
    })
    
    // Reset sphere mesh materials
    this.sphereMeshes.forEach(sphereMesh => {
      const originalMaterial = this.originalSphereMaterials.get(sphereMesh)
      if (originalMaterial) {
        sphereMesh.material = originalMaterial
      }
    })
    
    // Dispose custom materials
    this.customMaterials.forEach(material => {
      material.dispose()
    })
    this.customMaterials.clear()
    
    this.customSphereMaterials.forEach(material => {
      material.dispose()
    })
    this.customSphereMaterials.clear()
    
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
    
    // Update fog color to match background
    if (this.mainScene.fog && this.mainScene.fog instanceof THREE.FogExp2) {
      this.mainScene.fog.color.copy(color)
      
      // Also update sphere materials if they exist
      const modelManager = (window as any).modelManager
      if (modelManager && modelManager.sphereInstancer) {
        modelManager.sphereInstancer.updateFogSettings(color, this.mainScene.fog.density)
      }
    }
    
    // Background color updated silently
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
    const randomSeed = effect.parameters.randomSeed ?? 0
    
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
      
      // Update sphere mesh positions (instanced mesh animation)
      this.sphereMeshes.forEach(sphereMesh => {
        // Initialize position tracking for this mesh if not exists
        if (!this.spherePreviousPositions.has(sphereMesh)) {
          this.spherePreviousPositions.set(sphereMesh, new Float32Array(sphereMesh.count * 3))
          this.sphereCurrentPositions.set(sphereMesh, new Float32Array(sphereMesh.count * 3))
        }
        
        const previousPositions = this.spherePreviousPositions.get(sphereMesh)!
        const currentPositions = this.sphereCurrentPositions.get(sphereMesh)!
        
        // For sphere meshes, we need to animate the instance matrices
        const matrix = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const scale = new THREE.Vector3()
        const quaternion = new THREE.Quaternion()
        
        // We need to track original sphere positions and velocities
        // For now, create simple oscillation animation
        for (let i = 0; i < sphereMesh.count; i++) {
          sphereMesh.getMatrixAt(i, matrix)
          matrix.decompose(position, quaternion, scale)
          
          // Store previous position before updating
          const i3 = i * 3
          previousPositions[i3] = currentPositions[i3]
          previousPositions[i3 + 1] = currentPositions[i3 + 1] 
          previousPositions[i3 + 2] = currentPositions[i3 + 2]
          
          // Simple sine wave animation for spheres
          const time = (performance.now() - this.networkAnimationStartTime) * 0.001
          const waveOffset = (i * 0.1) % (Math.PI * 2) // Different phase for each sphere
          
          // Add wave motion if movement range > 0
          if (movementRange > 0) {
            const waveAmplitude = movementRange * 10000 * 0.01 // Scale similar to points
            position.y += Math.sin(time * 2 + waveOffset) * waveAmplitude * deltaTime
            position.x += Math.cos(time * 1.5 + waveOffset) * waveAmplitude * deltaTime * 0.5
          }
          
          // Store current position after updating
          currentPositions[i3] = position.x
          currentPositions[i3 + 1] = position.y
          currentPositions[i3 + 2] = position.z
          
          // Rebuild matrix with updated position
          matrix.compose(position, quaternion, scale)
          sphereMesh.setMatrixAt(i, matrix)
        }
        
        sphereMesh.instanceMatrix.needsUpdate = true
      })
    }
    
    // Generate connection lines
    if (showConnections > 0.5) {
      this.updateConnectionLines(connectionDistance, maxConnections, lineOpacity, randomSeed)
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
  
  private updateConnectionLines(connectionDistance: number, maxConnections: number, lineOpacity: number, randomSeed: number = 0): void {
    if (!this.mainScene || (this.pointClouds.length === 0 && this.sphereMeshes.length === 0)) return
    
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
    
    // Simple seeded random function (Linear Congruential Generator)
    const seededRandom = (seed: number) => {
      let state = seed
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296
      }
    }
    
    const random = seededRandom(randomSeed)
    
    // Collect all points - prioritize sphere meshes if available (they replace point clouds when sphere mode is on)
    const allPoints: THREE.Vector3[] = []
    const pointCloudIndices: number[] = [] // Track which point cloud each point belongs to
    const maxPointsForConnections = 1000 // Limit connections to prevent performance issues
    
    if (this.sphereMeshes.length > 0) {
      // Use sphere mesh positions (animated positions)
      this.sphereMeshes.forEach((sphereMesh, meshIndex) => {
        const count = sphereMesh.count
        
        // Calculate how many points to sample from this mesh
        const remainingSlots = maxPointsForConnections - allPoints.length
        const pointsToSample = Math.min(count, remainingSlots, Math.floor(maxPointsForConnections / this.sphereMeshes.length))
        
        // Use seeded random selection
        const selectedIndices = new Set<number>()
        const matrix = new THREE.Matrix4()
        const position = new THREE.Vector3()
        
        // Generate random indices for sphere selection
        for (let sampleCount = 0; sampleCount < pointsToSample && selectedIndices.size < pointsToSample; sampleCount++) {
          let randomIndex = Math.floor(random() * count)
          
          // Ensure we don't pick the same sphere twice
          while (selectedIndices.has(randomIndex) && selectedIndices.size < count) {
            randomIndex = Math.floor(random() * count)
          }
          
          selectedIndices.add(randomIndex)
          
          // Get current animated position from instance matrix
          sphereMesh.getMatrixAt(randomIndex, matrix)
          position.setFromMatrixPosition(matrix)
          
          allPoints.push(position.clone())
          pointCloudIndices.push(meshIndex)
        }
      })
    } else {
      // Fallback to point clouds when no sphere meshes
      this.pointClouds.forEach((pointCloud, cloudIndex) => {
        const positionAttribute = pointCloud.geometry.attributes.position
        const positions = positionAttribute.array as Float32Array
        const count = positionAttribute.count
        
        // Calculate how many points to sample from this cloud
        const remainingSlots = maxPointsForConnections - allPoints.length
        const pointsToSample = Math.min(count, remainingSlots, Math.floor(maxPointsForConnections / this.pointClouds.length))
        
        // Use seeded random selection instead of regular stepping
        const selectedIndices = new Set<number>()
        
        // Generate random indices for point selection
        for (let sampleCount = 0; sampleCount < pointsToSample && selectedIndices.size < pointsToSample; sampleCount++) {
          let randomIndex = Math.floor(random() * count)
          
          // Ensure we don't pick the same point twice
          while (selectedIndices.has(randomIndex) && selectedIndices.size < count) {
            randomIndex = Math.floor(random() * count)
          }
          
          selectedIndices.add(randomIndex)
          
          const i3 = randomIndex * 3
          allPoints.push(new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]))
          pointCloudIndices.push(cloudIndex)
        }
      })
    }
    
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
    // Update point clouds and sphere meshes in case scene changed
    this.updatePointClouds()
    
    if (this.pointClouds.length === 0 && this.sphereMeshes.length === 0) return
    
    const transparency = (effect.parameters.transparency ?? 0) / 100 // Convert to 0-1
    const sizeMultiplier = effect.parameters.sizeMultiplier ?? 100 // Keep as percentage for shader
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
    
    // Apply material effects to sphere meshes
    this.sphereMeshes.forEach(sphereMesh => {
      const originalMaterial = this.originalSphereMaterials.get(sphereMesh)
      if (!originalMaterial) return
      
      // Create or update custom material for spheres
      let customMaterial = this.customSphereMaterials.get(sphereMesh)
      
      if (!customMaterial || this.shouldUpdateMaterial(effect)) {
        // Dispose old material if exists
        if (customMaterial) {
          customMaterial.dispose()
        }
        
        // Create new shader material for spheres
        customMaterial = this.createCustomSphereMaterial(
          sphereMesh,
          transparency,
          useVertexColors,
          waveDeformation,
          twistEffect,
          waveFrequency,
          pulseEffect,
          colorCycling,
          deformationEnable
        )
        
        this.customSphereMaterials.set(sphereMesh, customMaterial)
        sphereMesh.material = customMaterial
      }
      
      // Update time-based uniforms for spheres
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
        
        // Apply deformations in object space before transformation
        if (deformationEnable > 0.5) {
          // Wave deformation - apply to object space coordinates
          if (waveDeformation > 0.0) {
            float wave = sin(time + pos.y * waveFrequency) * waveDeformation;
            pos.x += wave;
            pos.z += wave * 0.5;
          }
          
          // Twist effect - apply rotation in object space
          if (twistEffect > 0.0) {
            float theta = sin(time + pos.y) / twistEffect;
            float c = cos(theta);
            float s = sin(theta);
            mat3 m = mat3(c, 0, s, 0, 1, 0, -s, 0, c);
            pos = pos * m;
          }
        }
        
        // Transform to view space
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        
        // Calculate point size - sizeMultiplier comes as percentage (100 = normal size)
        float pointSize = (sizeMultiplier / 100.0) * 2.0; // Convert percentage to multiplier
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
      vertexColors: useVertexColors > 0.5,
      // Essential rendering properties
      depthTest: true,
      depthWrite: !transparency
    })
    
    return material
  }
  
  private createCustomSphereMaterial(
    sphereMesh: THREE.InstancedMesh,
    transparency: number,
    useVertexColors: number,
    waveDeformation: number,
    twistEffect: number,
    waveFrequency: number,
    _pulseEffect: number,
    colorCycling: number,
    deformationEnable: number
  ): THREE.ShaderMaterial {
    
    // Initialize sphere position tracking if not already done
    if (!this.spherePreviousPositions.has(sphereMesh)) {
      const positionCount = sphereMesh.count * 3 // x, y, z for each instance
      this.spherePreviousPositions.set(sphereMesh, new Float32Array(positionCount))
      this.sphereCurrentPositions.set(sphereMesh, new Float32Array(positionCount))
      
      // Initialize with current positions
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const currentPositions = this.sphereCurrentPositions.get(sphereMesh)!
      
      for (let i = 0; i < sphereMesh.count; i++) {
        sphereMesh.getMatrixAt(i, matrix)
        matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3())
        
        currentPositions[i * 3] = position.x
        currentPositions[i * 3 + 1] = position.y
        currentPositions[i * 3 + 2] = position.z
      }
      
      // Copy current to previous for initial frame
      this.spherePreviousPositions.get(sphereMesh)!.set(currentPositions)
    }
    
    const vertexShader = `
      uniform float time;
      uniform float waveDeformation;
      uniform float twistEffect;
      uniform float waveFrequency;
      uniform float pulseTime;
      uniform float deformationEnable;
      uniform float sphereCount;
      
      varying vec3 vColor;
      
      void main() {
        vec3 pos = position;
        
        // Get instance matrix and apply it to position
        vec4 instancePos = instanceMatrix * vec4(pos, 1.0);
        
        
        if (deformationEnable > 0.5) {
          // Wave deformation
          if (waveDeformation > 0.0) {
            float wave = sin(time + instancePos.y * waveFrequency) * waveDeformation;
            instancePos.x += wave;
            instancePos.z += wave * 0.5;
          }
          
          // Twist effect
          if (twistEffect > 0.0) {
            float theta = sin(time + instancePos.y) / twistEffect;
            float c = cos(theta);
            float s = sin(theta);
            mat3 m = mat3(c, 0, s, 0, 1, 0, -s, 0, c);
            instancePos.xyz = instancePos.xyz * m;
          }
        }
        
        vec4 mvPosition = modelViewMatrix * instancePos;
        vec4 screenPos = projectionMatrix * mvPosition;
        gl_Position = screenPos;
        
        // Pass color to fragment shader (use instance color if available)
        if (${useVertexColors > 0.5 ? 'true' : 'false'}) {
          vColor = instanceColor;
        } else {
          vColor = vec3(1.0);
        }
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
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `
    
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        transparency: { value: transparency },
        waveDeformation: { value: waveDeformation },
        twistEffect: { value: twistEffect },
        waveFrequency: { value: waveFrequency },
        pulseTime: { value: 1.0 },
        colorTime: { value: 0 },
        colorCycling: { value: colorCycling },
        deformationEnable: { value: deformationEnable },
        sphereCount: { value: sphereMesh.count }
      },
      transparent: transparency > 0,
      // Essential rendering properties
      depthTest: true,
      depthWrite: !transparency
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
      uniform float blurThreshold;
      uniform float blurType;
      uniform float filmNoiseSeed;
      uniform float crtScale;
      uniform float film35mmGrainSize;
      uniform float film35mmContrast;
      uniform float film35mmScale;
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
      uniform float bloomQuality;
      uniform float oilBrushSize;
      uniform float oilRoughness;
      uniform float oilBrightness;
      uniform float oilTexture;
      uniform float datamoshIntensity;
      uniform float datamoshDisplacement;
      uniform float datamoshCorruption;
      uniform float datamoshBlockSize;
      uniform float datamoshGlitchFreq;
      uniform float datamoshFrameBlend;
      uniform float pixelsortIntensity;
      uniform float pixelsortLength;
      uniform float pixelsortThreshold;
      uniform float pixelsortDirection;
      uniform float pixelsortMode;
      uniform float glowIntensity;
      uniform float glowThreshold;
      uniform float glowRadius;
      uniform float glowStrength;
      uniform float glowSamples;
      uniform float glowSoftness;
      uniform float pixelateIntensity;
      uniform float pixelateSize;
      uniform float pixelateNormalEdge;
      uniform float pixelateDepthEdge;
      uniform float pixelateEdgeMode;
      uniform float pixelateSmoothing;
      uniform float fogIntensity;
      uniform float fogNear;
      uniform float fogFar;
      uniform vec3 fogColor;
      uniform float fogMode;
      uniform float fogYMax;
      uniform float thresholdIntensity;
      uniform float thresholdThreshold;
      uniform float thresholdHardness;
      uniform vec3 gradientColor1;
      uniform vec3 gradientColor2;
      uniform float gradientSmoothness;
      uniform float gradientContrast;
      uniform float gradientMidpoint;
      
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
      
      // Box blur - simple averaging
      vec3 boxBlur(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
        vec3 color = vec3(0.0);
        vec2 texelSize = amount / resolution;
        float samples = 0.0;
        
        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            color += texture2D(tex, uv + vec2(float(x), float(y)) * texelSize).rgb;
            samples += 1.0;
          }
        }
        
        return color / samples;
      }
      
      // Motion blur for blur effect - directional blur
      vec3 motionBlurEffect(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
        vec3 color = vec3(0.0);
        vec2 direction = vec2(cos(time), sin(time)) * amount / resolution;
        
        for (int i = -4; i <= 4; i++) {
          float weight = 1.0 - abs(float(i)) / 4.0;
          color += texture2D(tex, uv + direction * float(i)).rgb * weight;
        }
        
        return color / 5.0; // Normalize
      }
      
      // Radial blur - blur from center outward
      vec3 radialBlur(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
        vec3 color = vec3(0.0);
        vec2 center = vec2(0.5, 0.5);
        vec2 direction = normalize(uv - center);
        float distance = length(uv - center);
        
        float samples = 8.0;
        for (float i = 0.0; i < samples; i++) {
          float offset = (i / samples - 0.5) * amount * distance;
          color += texture2D(tex, uv + direction * offset / resolution).rgb;
        }
        
        return color / samples;
      }
      
      // Zoom blur - blur toward/away from center
      vec3 zoomBlur(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
        vec3 color = vec3(0.0);
        vec2 center = vec2(0.5, 0.5);
        vec2 direction = uv - center;
        
        float samples = 8.0;
        for (float i = 0.0; i < samples; i++) {
          float scale = 1.0 + (i / samples - 0.5) * amount;
          vec2 sampleUV = center + direction * scale;
          color += texture2D(tex, sampleUV).rgb;
        }
        
        return color / samples;
      }
      
      // Bokeh blur - circular blur with nice falloff
      vec3 bokehBlur(sampler2D tex, vec2 uv, vec2 resolution, float amount) {
        vec3 color = vec3(0.0);
        vec2 texelSize = amount / resolution;
        float totalWeight = 0.0;
        
        // Sample in a circle pattern
        for (float angle = 0.0; angle < 6.28318; angle += 0.39269) { // 16 samples
          for (float radius = 0.0; radius <= 1.0; radius += 0.25) {
            vec2 offset = vec2(cos(angle), sin(angle)) * radius * texelSize;
            float weight = 1.0 - radius; // Weight decreases with distance
            color += texture2D(tex, uv + offset).rgb * weight;
            totalWeight += weight;
          }
        }
        
        return color / totalWeight;
      }
      
      // Main blur function with type selection and threshold
      vec3 blur(sampler2D tex, vec2 uv, vec2 resolution, float amount, float threshold, float blurType) {
        vec3 originalColor = texture2D(tex, uv).rgb;
        vec3 blurredColor;
        
        // Select blur type
        if (blurType <= 0.5) {
          // Gaussian blur (existing preBlur)
          blurredColor = preBlur(tex, uv, resolution, amount);
        } else if (blurType <= 1.5) {
          // Box blur
          blurredColor = boxBlur(tex, uv, resolution, amount);
        } else if (blurType <= 2.5) {
          // Motion blur
          blurredColor = motionBlurEffect(tex, uv, resolution, amount);
        } else if (blurType <= 3.5) {
          // Radial blur
          blurredColor = radialBlur(tex, uv, resolution, amount);
        } else if (blurType <= 4.5) {
          // Zoom blur
          blurredColor = zoomBlur(tex, uv, resolution, amount);
        } else {
          // Bokeh blur
          blurredColor = bokehBlur(tex, uv, resolution, amount);
        }
        
        if (threshold <= 0.0) {
          // No threshold - use blur result
          return blurredColor;
        }
        
        // Apply threshold - only blur bright areas
        float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
        
        if (luminance > threshold) {
          // Bright area - blend between original and blurred
          float blurStrength = smoothstep(threshold, threshold + 0.1, luminance);
          return mix(originalColor, blurredColor, blurStrength);
        } else {
          // Dark area - keep original
          return originalColor;
        }
      }
      
      // CRT grain effect (retro TV-style)
      vec3 crtgrain(vec3 color, vec2 uv) {
        vec2 scaledUv = uv * crtScale;
        
        // Update at 24 fps for film-like grain animation
        float filmTime = floor(time * 24.0) / 24.0;
        
        // Add noise that updates at 24 fps
        float noise = random(scaledUv + filmTime) * filmNoiseSeed;
        
        // Add scanlines
        float scanline = sin(scaledUv.y * resolution.y * 2.0) * 0.1;
        
        // Combine effects
        return color + vec3(noise) + vec3(scanline);
      }
      
      // 35mm film grain effect (organic film grain)
      vec3 film35mm(vec3 color, vec2 uv) {
        vec2 scaledUv = uv * film35mmScale;
        
        // Update at 24 fps for authentic film grain animation
        float filmTime = floor(time * 24.0) / 24.0;
        
        // Multi-octave noise for more organic grain, animated at 24 fps
        float grain = 0.0;
        grain += random(scaledUv * film35mmGrainSize + filmTime) * 0.6;
        grain += random(scaledUv * film35mmGrainSize * 2.0 + filmTime * 1.3) * 0.3;
        grain += random(scaledUv * film35mmGrainSize * 4.0 + filmTime * 0.7) * 0.1;
        
        // Modulate grain by luminance (darker areas get more grain)
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        grain *= (1.0 - luma * 0.5);
        
        // Apply grain with contrast control
        vec3 grainColor = color + (grain - 0.5) * film35mmContrast * 0.1;
        
        return grainColor;
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
      
      // Color Gradient effect - maps luminance (black-white) to color gradient
      vec3 colorGradient(vec3 color, vec2 uv) {
        // Calculate luminance using standard formula
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        
        // Apply contrast to luminance
        luminance = pow(luminance, gradientContrast);
        
        // Adjust luminance based on midpoint
        // This allows shifting where the gradient center appears
        float adjustedLuminance = luminance;
        if (luminance < gradientMidpoint) {
          adjustedLuminance = (luminance / gradientMidpoint) * 0.5;
        } else {
          adjustedLuminance = 0.5 + ((luminance - gradientMidpoint) / (1.0 - gradientMidpoint)) * 0.5;
        }
        
        // Apply smoothness to the gradient transition
        if (gradientSmoothness != 1.0) {
          adjustedLuminance = pow(adjustedLuminance, 1.0 / gradientSmoothness);
        }
        
        // Clamp to valid range
        adjustedLuminance = clamp(adjustedLuminance, 0.0, 1.0);
        
        // Map luminance to gradient: black pixels (0) -> gradientColor1, white pixels (1) -> gradientColor2
        vec3 gradientColor = mix(gradientColor1, gradientColor2, adjustedLuminance);
        
        // Blend with original color based on intensity
        return mix(color, gradientColor, intensity);
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
      
      // Bloom effect that creates misty glow extending beyond geometry
      vec3 bloom(sampler2D tex, vec2 uv, vec2 resolution, float threshold, float intensity, float radius, float quality) {
        vec3 currentColor = texture2D(tex, uv).rgb;
        
        // Create expanding glow that extends beyond geometry
        vec3 glowColor = vec3(0.0);
        float totalWeight = 0.0;
        
        // Multiple glow passes with increasing radius for misty effect
        vec2 texelSize = radius / resolution;
        
        // Quality-based sampling density
        float angleStep1, angleStep2, angleStep3;
        int distSamples1, distSamples2, distSamples3;
        
        if (quality <= 1.0) {
          // Fast: Minimal samples
          angleStep1 = 1.5708; // 4 samples
          angleStep2 = 3.1416; // 2 samples  
          angleStep3 = 6.2832; // 1 sample
          distSamples1 = 2;
          distSamples2 = 1;
          distSamples3 = 1;
        } else if (quality <= 2.0) {
          // Medium: Balanced quality
          angleStep1 = 0.78539; // 8 samples
          angleStep2 = 1.5708;  // 4 samples
          angleStep3 = 3.1416;  // 2 samples
          distSamples1 = 3;
          distSamples2 = 2;
          distSamples3 = 2;
        } else if (quality <= 3.0) {
          // High: Good quality
          angleStep1 = 0.39269; // 16 samples
          angleStep2 = 0.78539; // 8 samples
          angleStep3 = 1.5708;  // 4 samples
          distSamples1 = 3;
          distSamples2 = 3;
          distSamples3 = 3;
        } else {
          // Ultra: Maximum quality
          angleStep1 = 0.19635; // 32 samples
          angleStep2 = 0.39269; // 16 samples
          angleStep3 = 0.78539; // 8 samples
          distSamples1 = 4;
          distSamples2 = 4;
          distSamples3 = 4;
        }
        
        // Pass 1: Close glow (2x radius)
        for (float angle = 0.0; angle < 6.28318; angle += angleStep1) {
          for (int d = 1; d <= distSamples1; d++) {
            float dist = float(d);
            vec2 offset = vec2(cos(angle), sin(angle)) * texelSize * dist * 2.0;
            vec3 sampleColor = texture2D(tex, uv + offset).rgb;
            float luminance = dot(sampleColor, vec3(0.299, 0.587, 0.114));
            
            if (luminance > threshold) {
              float weight = 1.0 / (dist * dist); // Falloff
              glowColor += sampleColor * weight;
              totalWeight += weight;
            }
          }
        }
        
        // Pass 2: Medium glow (4x radius) 
        for (float angle = 0.0; angle < 6.28318; angle += angleStep2) {
          for (int d = 1; d <= distSamples2; d++) {
            float dist = float(d) * 2.0;
            vec2 offset = vec2(cos(angle), sin(angle)) * texelSize * dist * 4.0;
            vec3 sampleColor = texture2D(tex, uv + offset).rgb;
            float luminance = dot(sampleColor, vec3(0.299, 0.587, 0.114));
            
            if (luminance > threshold * 0.8) {
              float weight = 0.5 / (dist * dist);
              glowColor += sampleColor * weight;
              totalWeight += weight;
            }
          }
        }
        
        // Pass 3: Far glow (8x radius) - creates the misty halo
        for (float angle = 0.0; angle < 6.28318; angle += angleStep3) {
          for (int d = 1; d <= distSamples3; d++) {
            float dist = float(d) * 4.0;
            vec2 offset = vec2(cos(angle), sin(angle)) * texelSize * dist * 8.0;
            vec3 sampleColor = texture2D(tex, uv + offset).rgb;
            float luminance = dot(sampleColor, vec3(0.299, 0.587, 0.114));
            
            if (luminance > threshold * 0.6) {
              float weight = 0.25 / (dist * dist);
              glowColor += sampleColor * weight * 2.0; // Extra boost for far glow
              totalWeight += weight;
            }
          }
        }
        
        // Normalize and apply glow
        if (totalWeight > 0.0) {
          glowColor = glowColor / totalWeight;
          
          // Create atmospheric scattering effect
          float currentLum = dot(currentColor, vec3(0.299, 0.587, 0.114));
          
          // Boost glow in dark areas (where there's no current geometry)
          float darkBoost = 1.0 - smoothstep(0.0, 0.3, currentLum);
          glowColor *= (1.0 + darkBoost * 2.0);
          
          // Screen blend for natural light expansion
          vec3 screenBlend = vec3(1.0) - (vec3(1.0) - currentColor) * (vec3(1.0) - glowColor * intensity);
          
          // Add glow more aggressively in empty areas
          float emptyAreaBoost = smoothstep(0.1, 0.0, currentLum);
          vec3 additiveGlow = currentColor + glowColor * intensity * (1.0 + emptyAreaBoost * 3.0);
          
          // Combine screen and additive based on content
          return mix(screenBlend, additiveGlow, emptyAreaBoost * 0.7);
        }
        
        return currentColor;
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
      vec3 oilPainting(sampler2D tex, vec2 uv, vec2 resolution, float brushSize, float roughness, float brightness, float canvasTexture) {
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
        
        // Add canvas texture using multiple offset samples
        vec3 textureColor = dominantColor;
        if (canvasTexture > 0.0) {
          // Create canvas-like texture with multiple directional samples
          vec2 textureOffset1 = vec2(sin(uv.x * 150.0 + time * 0.1), cos(uv.y * 150.0 + time * 0.1)) * texelSize * canvasTexture * 0.5;
          vec2 textureOffset2 = vec2(cos(uv.x * 200.0 - time * 0.05), sin(uv.y * 200.0 - time * 0.05)) * texelSize * canvasTexture * 0.3;
          
          vec3 sample1 = texture2D(tex, uv + textureOffset1).rgb;
          vec3 sample2 = texture2D(tex, uv + textureOffset2).rgb;
          
          // Combine samples to create canvas texture effect
          textureColor = mix(dominantColor, mix(sample1, sample2, 0.5), canvasTexture * 0.4);
        }
        
        // Blend the dominant color with texture for more painterly effect
        return mix(dominantColor, textureColor, min(canvasTexture, 1.0));
      }
      
      // Data moshing effect with corruption and displacement
      vec3 datamosh(sampler2D tex, vec2 uv, vec2 resolution) {
        vec3 originalColor = texture2D(tex, uv).rgb;
        
        // Create block-based distortion
        vec2 blockUV = floor(uv * resolution / datamoshBlockSize) * datamoshBlockSize / resolution;
        
        // Generate noise for this block
        float blockNoise = random(blockUV + time * datamoshGlitchFreq);
        
        // Only apply effect to some blocks based on corruption level
        if (blockNoise > datamoshCorruption) {
          return originalColor;
        }
        
        // Calculate displacement for corrupted blocks
        vec2 displacement = vec2(
          random(blockUV + vec2(1.0, 0.0)) - 0.5,
          random(blockUV + vec2(0.0, 1.0)) - 0.5
        ) * datamoshDisplacement / resolution;
        
        // Sample displaced color
        vec3 displacedColor = texture2D(tex, uv + displacement).rgb;
        
        // Frame blending - mix current with "previous frame" (simulated with offset)
        vec2 frameOffset = vec2(sin(time * 0.1) * 0.001, cos(time * 0.1) * 0.001);
        vec3 frameColor = texture2D(tex, uv + frameOffset).rgb;
        vec3 blendedColor = mix(displacedColor, frameColor, datamoshFrameBlend);
        
        // Mix with original based on intensity
        return mix(originalColor, blendedColor, datamoshIntensity);
      }
      
      vec3 pixelsort(sampler2D tex, vec2 uv, vec2 resolution, vec3 currentColor) {
        // Use the current processed color for brightness calculation
        float brightness = dot(currentColor, vec3(0.299, 0.587, 0.114));
        
        // Only apply sorting to pixels above threshold
        if (brightness < pixelsortThreshold) {
          return currentColor;
        }
        
        // Determine sort direction
        vec2 sortDirection;
        if (pixelsortDirection == 0.0) {
          sortDirection = vec2(1.0, 0.0); // Horizontal right
        } else if (pixelsortDirection == 1.0) {
          sortDirection = vec2(0.0, 1.0); // Vertical up
        } else if (pixelsortDirection == 2.0) {
          sortDirection = vec2(-1.0, 0.0); // Horizontal left
        } else {
          sortDirection = vec2(0.0, -1.0); // Vertical down
        }
        
        // Enhanced sampling - more samples for better edge repetition
        vec2 step = sortDirection / resolution * pixelsortLength;
        vec3 samples[16]; // Doubled sample count
        float brightnesses[16];
        int sampleCount = 16;
        
        // Sample in both directions for better edge detection
        for (int i = 0; i < 16; i++) {
          // Spread samples further apart for more dramatic effect
          float offset = float(i - 8) * 1.5;
          vec2 sampleUV = uv + step * offset / float(sampleCount - 1);
          sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
          samples[i] = texture2D(tex, sampleUV).rgb;
          brightnesses[i] = dot(samples[i], vec3(0.299, 0.587, 0.114));
        }
        
        // Enhanced sorting with multiple passes for more dramatic effect
        vec3 sortedColor = currentColor;
        
        if (pixelsortMode == 0.0) {
          // Multi-pass brightest sampling for streak effect
          float maxBrightness = 0.0;
          vec3 brightestColor = currentColor;
          
          // First pass - find absolute brightest
          for (int i = 0; i < 16; i++) {
            if (brightnesses[i] > maxBrightness) {
              maxBrightness = brightnesses[i];
              brightestColor = samples[i];
            }
          }
          
          // Second pass - enhance edges by finding streaks
          float edgeThreshold = maxBrightness * 0.8;
          vec3 streakColor = brightestColor;
          int streakCount = 0;
          
          for (int i = 0; i < 16; i++) {
            if (brightnesses[i] > edgeThreshold) {
              streakColor = mix(streakColor, samples[i], 0.3);
              streakCount++;
            }
          }
          
          sortedColor = streakCount > 2 ? streakColor : brightestColor;
          
        } else if (pixelsortMode == 1.0) {
          // Multi-pass darkest sampling for shadow streaks
          float minBrightness = 1.0;
          vec3 darkestColor = currentColor;
          
          // First pass - find absolute darkest
          for (int i = 0; i < 16; i++) {
            if (brightnesses[i] < minBrightness) {
              minBrightness = brightnesses[i];
              darkestColor = samples[i];
            }
          }
          
          // Second pass - enhance dark edges
          float darkThreshold = minBrightness + 0.2;
          vec3 darkStreakColor = darkestColor;
          int darkStreakCount = 0;
          
          for (int i = 0; i < 16; i++) {
            if (brightnesses[i] < darkThreshold) {
              darkStreakColor = mix(darkStreakColor, samples[i], 0.3);
              darkStreakCount++;
            }
          }
          
          sortedColor = darkStreakCount > 2 ? darkStreakColor : darkestColor;
          
        } else {
          // Enhanced edge detection mode
          // Find the most contrasting neighbor for dramatic edge repetition
          float maxContrast = 0.0;
          vec3 contrastColor = currentColor;
          
          for (int i = 0; i < 15; i++) {
            float contrast = abs(brightnesses[i] - brightnesses[i + 1]);
            if (contrast > maxContrast) {
              maxContrast = contrast;
              // Choose the more extreme value for dramatic effect
              contrastColor = brightnesses[i] > brightnesses[i + 1] ? samples[i] : samples[i + 1];
            }
          }
          
          sortedColor = contrastColor;
        }
        
        // Apply multiple passes for more dramatic streaking
        vec3 finalColor = mix(currentColor, sortedColor, pixelsortIntensity);
        
        // Second pass - amplify the effect by sampling from the sorted result
        if (pixelsortIntensity > 0.5) {
          vec2 secondPassStep = step * 0.5;
          vec3 secondPassColor = texture2D(tex, uv + secondPassStep).rgb;
          float secondPassBrightness = dot(secondPassColor, vec3(0.299, 0.587, 0.114));
          
          if (abs(brightness - secondPassBrightness) > 0.1) {
            finalColor = mix(finalColor, secondPassColor, (pixelsortIntensity - 0.5) * 2.0);
          }
        }
        
        return finalColor;
      }
      
      vec3 glow(sampler2D tex, vec2 uv, vec2 resolution, vec3 currentColor) {
        // Calculate brightness of current pixel
        float brightness = dot(currentColor, vec3(0.299, 0.587, 0.114));
        
        // Only apply glow to pixels above threshold
        if (brightness < glowThreshold) {
          return currentColor;
        }
        
        // Calculate the glow effect using radial sampling
        vec3 glowColor = vec3(0.0);
        float totalWeight = 0.0;
        
        // Use dynamic sample count for quality control
        int sampleCount = int(glowSamples);
        float radiusStep = glowRadius / float(sampleCount);
        
        // Multi-ring sampling for smooth glow
        for (int ring = 1; ring <= 4; ring++) {
          float ringRadius = radiusStep * float(ring);
          int ringSamples = 8 * ring; // More samples for outer rings
          
          for (int i = 0; i < 32; i++) { // Max samples for WebGL compatibility
            if (i >= ringSamples) break;
            
            // Calculate angle for this sample
            float angle = float(i) * 6.28318 / float(ringSamples);
            
            // Calculate sample position
            vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius / resolution;
            vec2 sampleUV = uv + offset;
            
            // Skip samples outside texture bounds
            if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
              continue;
            }
            
            // Sample color and calculate brightness
            vec3 sampleColor = texture2D(tex, sampleUV).rgb;
            float sampleBrightness = dot(sampleColor, vec3(0.299, 0.587, 0.114));
            
            // Only contribute if sample is bright enough
            if (sampleBrightness > glowThreshold) {
              // Calculate falloff based on distance and softness
              float distance = length(offset * resolution);
              float falloff = 1.0 - pow(distance / (glowRadius * glowSoftness), 2.0);
              falloff = max(0.0, falloff);
              
              // Weight by brightness above threshold
              float weight = (sampleBrightness - glowThreshold) * falloff;
              
              glowColor += sampleColor * weight;
              totalWeight += weight;
            }
          }
        }
        
        // Normalize the accumulated glow
        if (totalWeight > 0.0) {
          glowColor /= totalWeight;
          glowColor *= glowStrength;
        }
        
        // Blend original with glow using screen blend mode for additive effect
        vec3 screenBlend = currentColor + glowColor - (currentColor * glowColor);
        
        return mix(currentColor, screenBlend, glowIntensity);
      }
      
      vec3 pixelate(sampler2D tex, vec2 uv, vec2 resolution, vec3 currentColor) {
        // Calculate pixelated coordinates
        vec2 pixelatedRes = resolution / pixelateSize;
        vec2 pixelatedUV = floor(uv * pixelatedRes) / pixelatedRes;
        
        // Sample the pixelated color
        vec3 pixelatedColor = texture2D(tex, pixelatedUV).rgb;
        
        // Edge detection based on brightness differences
        vec2 texelSize = 1.0 / resolution;
        
        // Sample neighboring pixels for edge detection
        vec3 colorRight = texture2D(tex, pixelatedUV + vec2(texelSize.x, 0.0)).rgb;
        vec3 colorUp = texture2D(tex, pixelatedUV + vec2(0.0, texelSize.y)).rgb;
        vec3 colorLeft = texture2D(tex, pixelatedUV - vec2(texelSize.x, 0.0)).rgb;
        vec3 colorDown = texture2D(tex, pixelatedUV - vec2(0.0, texelSize.y)).rgb;
        
        // Calculate brightness for edge detection
        float centerBrightness = dot(pixelatedColor, vec3(0.299, 0.587, 0.114));
        float rightBrightness = dot(colorRight, vec3(0.299, 0.587, 0.114));
        float upBrightness = dot(colorUp, vec3(0.299, 0.587, 0.114));
        float leftBrightness = dot(colorLeft, vec3(0.299, 0.587, 0.114));
        float downBrightness = dot(colorDown, vec3(0.299, 0.587, 0.114));
        
        // Calculate edge strength
        float edgeX = abs(rightBrightness - leftBrightness);
        float edgeY = abs(upBrightness - downBrightness);
        float edgeStrength = sqrt(edgeX * edgeX + edgeY * edgeY);
        
        // Apply edge detection modes
        vec3 finalColor = pixelatedColor;
        
        if (pixelateEdgeMode == 0.0) {
          // Standard pixelation - no edge enhancement
          finalColor = pixelatedColor;
        } else if (pixelateEdgeMode == 1.0) {
          // Edge enhancement - brighten edges
          float edgeMultiplier = 1.0 + edgeStrength * pixelateNormalEdge;
          finalColor = pixelatedColor * edgeMultiplier;
        } else {
          // Edge outline - darken edges
          float edgeMultiplier = 1.0 - edgeStrength * pixelateNormalEdge;
          finalColor = pixelatedColor * edgeMultiplier;
        }
        
        // Apply depth-based edge detection (simulated using color variance)
        vec3 colorVariance = abs(pixelatedColor - currentColor);
        float depthEdgeIndicator = dot(colorVariance, vec3(0.333));
        
        if (depthEdgeIndicator > pixelateDepthEdge) {
          // Enhance edges based on depth differences
          finalColor = mix(finalColor, finalColor * 0.5, pixelateSmoothing);
        }
        
        // Smooth the pixelation effect
        finalColor = mix(finalColor, pixelatedColor, pixelateSmoothing);
        
        return mix(currentColor, finalColor, pixelateIntensity);
      }
      
      vec3 fog(sampler2D tex, vec2 uv, vec2 resolution, vec3 currentColor) {
        // Simple but effective distance-based fog using screen coordinates
        vec2 screenPos = uv * 2.0 - 1.0; // Convert to NDC (-1 to 1)
        
        // Multi-factor distance estimation
        float brightness = dot(currentColor, vec3(0.299, 0.587, 0.114));
        float screenDistance = length(screenPos);
        float yPosition = uv.y; // 0 = bottom, 1 = top
        
        // Combine factors for distance estimation
        float estimatedDistance = 
          (1.0 - brightness) * 0.5 +        // Darker = further
          screenDistance * 0.3 +             // Screen edge = further  
          yPosition * 0.2;                   // Top = further (typical for point clouds)
        
        // Scale to fog distance range
        float fogDistance = fogNear + estimatedDistance * (fogFar - fogNear);
        
        // Calculate fog factor based on mode
        float fogFactor = 0.0;
        
        if (fogMode == 0.0) {
          // Linear fog
          fogFactor = clamp((fogDistance - fogNear) / (fogFar - fogNear), 0.0, 1.0);
        } else if (fogMode == 1.0) {
          // Exponential fog
          float density = 2.0 / (fogFar - fogNear);
          fogFactor = 1.0 - exp(-density * max(0.0, fogDistance - fogNear));
        } else {
          // Exponential squared fog
          float density = 1.0 / (fogFar - fogNear);
          float factor = density * max(0.0, fogDistance - fogNear);
          fogFactor = 1.0 - exp(-factor * factor);
        }
        
        // Apply Y-height cutoff based on screen Y position
        float screenYWorld = (1.0 - uv.y) * fogYMax * 2.0; // Approximate world Y
        if (screenYWorld > fogYMax) {
          float heightFade = 1.0 - smoothstep(fogYMax, fogYMax + 5.0, screenYWorld);
          fogFactor *= heightFade;
        }
        
        // Add subtle time-based variation
        float timeVariation = 1.0 + sin(time * 0.3 + screenPos.x + screenPos.y) * 0.05;
        fogFactor *= timeVariation;
        
        // Clamp fog factor
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        
        // Apply atmospheric perspective
        vec3 atmosphericColor = fogColor;
        if (fogDistance > fogNear) {
          float temperatureShift = min((fogDistance - fogNear) / (fogFar - fogNear), 1.0);
          atmosphericColor = mix(
            fogColor, 
            fogColor * vec3(0.92, 0.96, 1.08), 
            temperatureShift * 0.15
          );
        }
        
        return mix(currentColor, atmosphericColor, fogFactor * fogIntensity);
      }
      
      vec3 thresholdEffect(sampler2D tex, vec2 uv, vec2 resolution, vec3 currentColor) {
        // Calculate luminance using standard weights
        float luminance = dot(currentColor, vec3(0.299, 0.587, 0.114));
        
        // Apply threshold with adjustable hardness
        float thresholdValue = thresholdThreshold;
        float hardness = thresholdHardness;
        
        // Create smooth or hard threshold based on hardness parameter
        float thresholdFactor;
        if (hardness >= 1.0) {
          // Hard threshold (step function)
          thresholdFactor = step(thresholdValue, luminance);
        } else {
          // Soft threshold (smoothstep)
          float edge = hardness * 0.1; // Scale hardness to smoothstep range
          thresholdFactor = smoothstep(thresholdValue - edge, thresholdValue + edge, luminance);
        }
        
        // Create black and white result
        vec3 blackAndWhite = vec3(thresholdFactor);
        
        // Mix with original color based on intensity
        return mix(currentColor, blackAndWhite, thresholdIntensity);
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
          color = mix(color, blur(tDiffuse, vUv, resolution, blurAmount, blurThreshold, blurType), intensity);
        } else if (effectType == 5) {
          // Bloom
          vec3 bloomResult = bloom(tDiffuse, vUv, resolution, bloomThreshold, bloomIntensity, bloomRadius, bloomQuality);
          color = mix(color, bloomResult, intensity);
        } else if (effectType == 6) {
          // CRT Grain
          color = mix(color, crtgrain(color, vUv), intensity);
        } else if (effectType == 7) {
          // 35mm Film Grain
          color = mix(color, film35mm(color, vUv), intensity);
        } else if (effectType == 8) {
          // Dot screen
          color = mix(color, dotscreen(color, vUv), intensity);
        } else if (effectType == 9) {
          // Bleach bypass
          color = mix(color, bleachBypass(color), intensity);
        } else if (effectType == 10) {
          // Color invert
          color = mix(color, vec3(1.0) - color, intensity);
        } else if (effectType == 11) {
          // Colorify
          color = colorify(color);
        } else if (effectType == 12) {
          // Sobel edge detection
          color = mix(color, sobelFromColor(color, vUv, resolution), intensity);
        } else if (effectType == 13) {
          // Sobel edge detection with threshold
          color = mix(color, sobelWithThresholdFromColor(color, vUv, resolution, sobelThreshold), intensity);
        } else if (effectType == 14) {
          // Motion blur
          color = mix(color, motionBlur(tDiffuse, vUv, resolution, motionBlurStrength, motionBlurSamples), intensity);
        } else if (effectType == 15) {
          // Oil painting
          color = mix(color, oilPainting(tDiffuse, vUv, resolution, oilBrushSize, oilRoughness, oilBrightness, oilTexture), intensity);
        } else if (effectType == 16) {
          // Data moshing
          color = mix(color, datamosh(tDiffuse, vUv, resolution), intensity);
        } else if (effectType == 17) {
          // Pixel sorting
          color = pixelsort(tDiffuse, vUv, resolution, color);
        } else if (effectType == 18) {
          // Glow
          color = glow(tDiffuse, vUv, resolution, color);
        } else if (effectType == 19) {
          // Pixelation
          color = pixelate(tDiffuse, vUv, resolution, color);
        } else if (effectType == 20) {
          // Distance Fog
          color = fog(tDiffuse, vUv, resolution, color);
        } else if (effectType == 21) {
          // Threshold Effect
          color = thresholdEffect(tDiffuse, vUv, resolution, color);
        } else if (effectType == 22) {
          // Color Gradient Effect
          color = colorGradient(color, vUv);
        }
        
        gl_FragColor = vec4(color, originalColor.a);
      }
    `
  }
  
  // Afterimage effect methods
  private initializeAfterimage(width: number, height: number): void {
    this.afterimageRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    this.afterimageMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tAfterimage: { value: null },
        damping: { value: 0.96 }
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
        uniform sampler2D tAfterimage;
        uniform float damping;
        varying vec2 vUv;
        
        void main() {
          vec4 current = texture2D(tDiffuse, vUv);
          vec4 afterimage = texture2D(tAfterimage, vUv);
          
          // Blend current frame with damped previous frame
          vec4 result = max(current, afterimage * damping);
          
          gl_FragColor = result;
        }
      `
    })
  }
  
  private renderAfterimageEffect(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effect: EffectInstance, outputTarget?: THREE.WebGLRenderTarget | null): void {
    if (!this.afterimageRenderTarget || !this.afterimageMaterial) return
    
    const damping = effect.parameters.damping ?? 0.96
    
    // Set up materials
    this.afterimageMaterial.uniforms.tDiffuse.value = inputTexture
    this.afterimageMaterial.uniforms.tAfterimage.value = this.afterimageRenderTarget.texture
    this.afterimageMaterial.uniforms.damping.value = damping
    
    // Create temporary mesh for rendering
    const tempMaterial = this.material
    this.material = this.afterimageMaterial
    
    // Render to output
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    
    // Copy result to afterimage buffer for next frame
    renderer.setRenderTarget(this.afterimageRenderTarget)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    
    // Restore original material
    this.material = tempMaterial
  }
  
  // DOF effect methods
  private initializeDOF(_width: number, _height: number): void {
    // For the simplified DOF approach, we don't need complex initialization
    // The effect creates materials dynamically during rendering
    this.dofMaterial = new THREE.ShaderMaterial({
      // Placeholder material - actual DOF material is created during render
      uniforms: {},
      vertexShader: 'void main() { gl_Position = vec4(0.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }'
    })
  }
  
  private renderDOFEffect(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effect: EffectInstance, outputTarget?: THREE.WebGLRenderTarget | null): void {
    if (!this.dofMaterial) {
      console.warn('DOF material not initialized')
      return
    }
    
    const focusDistance = effect.parameters.focusDistance ?? 5.0
    const aperture = effect.parameters.aperture ?? 0.1
    const maxBlur = effect.parameters.maxBlur ?? 0.5
    
    // Create depth buffer render target if it doesn't exist
    if (!this.dofRenderTarget) {
      this.dofRenderTarget = new THREE.WebGLRenderTarget(
        this.renderTargets[0].width,
        this.renderTargets[0].height,
        {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType
        }
      )
    }
    
    // First pass: Render depth buffer
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    })
    
    // Store original materials and apply depth material
    const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>()
    
    if (this.mainScene) {
      this.mainScene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
          originalMaterials.set(object, object.material)
          object.material = depthMaterial
        }
      })
      
      // Render depth to buffer
      renderer.setRenderTarget(this.dofRenderTarget)
      renderer.render(this.mainScene, this.camera!)
      
      // Restore original materials
      originalMaterials.forEach((material, object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
          object.material = material
        }
      })
    }
    
    // Second pass: Apply DOF based on depth
    const dofMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: inputTexture },
        tDepth: { value: this.dofRenderTarget.texture },
        focusDistance: { value: focusDistance },
        aperture: { value: aperture },
        maxBlur: { value: maxBlur },
        cameraNear: { value: this.camera?.near || 0.01 },
        cameraFar: { value: this.camera?.far || 500 }
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
        uniform sampler2D tDepth;
        uniform float focusDistance;
        uniform float aperture;
        uniform float maxBlur;
        uniform float cameraNear;
        uniform float cameraFar;
        varying vec2 vUv;
        
        float readDepth(sampler2D depthSampler, vec2 coord) {
          vec4 rgbaDepth = texture2D(depthSampler, coord);
          const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));
          return dot(rgbaDepth, bitShift);
        }
        
        float perspectiveDepthToViewZ(float invClipZ, float near, float far) {
          return (near * far) / ((far - near) * invClipZ - far);
        }
        
        float getViewZ(float depth) {
          return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
        }
        
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          
          // Read depth and convert to view space Z
          float depth = readDepth(tDepth, vUv);
          float viewZ = abs(getViewZ(depth));
          
          // Debug: visualize depth
          if (vUv.x < 0.2) {
            gl_FragColor = vec4(viewZ / 50.0, 0.0, 0.0, 1.0);
            return;
          }
          
          // Calculate blur amount based on distance from focus
          float depthDiff = abs(viewZ - focusDistance);
          float blurAmount = depthDiff * aperture * 0.1; // Scale down aperture effect
          blurAmount = clamp(blurAmount, 0.0, maxBlur);
          
          // Apply blur
          if (blurAmount > 0.001) {
            vec4 blurredColor = vec4(0.0);
            float totalWeight = 0.0;
            
            // Circular blur sampling
            int samples = 12;
            float step = blurAmount * 0.01;
            
            for (int i = 0; i < samples; i++) {
              float angle = float(i) * 6.28318 / float(samples);
              vec2 offset = vec2(cos(angle), sin(angle)) * step;
              vec2 sampleUv = vUv + offset;
              
              if (sampleUv.x >= 0.0 && sampleUv.x <= 1.0 && 
                  sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {
                blurredColor += texture2D(tDiffuse, sampleUv);
                totalWeight += 1.0;
              }
            }
            
            if (totalWeight > 0.0) {
              blurredColor /= totalWeight;
              
              // Blend based on blur amount
              float blendFactor = clamp(blurAmount / maxBlur, 0.0, 1.0);
              color = mix(color, blurredColor, blendFactor);
            }
          }
          
          gl_FragColor = color;
        }
      `
    })
    
    // Apply DOF material to mesh
    this.mesh.material = dofMaterial
    
    // Render DOF effect to output
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
    
    // Clean up temporary material
    dofMaterial.dispose()
  }
}