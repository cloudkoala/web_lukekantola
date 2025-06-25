import * as THREE from 'three'
import type { EffectInstance } from './EffectsChainManager'
import { ASCIIDitheringPass } from './ASCIIDitheringPass'
import { HalftoneDitheringPass } from './HalftoneDitheringPass'
import { EngravingPass } from './EngravingPass'
import { CirclePackingPass } from './CirclePackingPass'
import { GaussianBlurPass } from './GaussianBlurPass'

export type EffectType = 'none' | 'drawrange' | 'pointnetwork' | 'material' | 'randomscale' | 'gamma' | 'sepia' | 'vignette' | 'blur' | 'bloom' | 'crtgrain' | 'film35mm' | 'dotscreen' | 'bleachbypass' | 'invert' | 'afterimage' | 'dof' | 'colorify' | 'sobel' | 'sobelthreshold' | 'ascii' | 'halftone' | 'circlepacking' | 'motionblur' | 'oilpainting' | 'topographic' | 'datamosh' | 'pixelsort' | 'glow' | 'pixelate' | 'fog' | 'threshold' | 'colorgradient' | 'splittone' | 'gradient' | 'posterize' | 'noise2d' | 'skysphere' | 'sinradius' | 'engraving' | 'gaussianblur'

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
  
  // Debouncing for material effects during chunk loading
  private lastUpdateTime: number = 0
  private updateDebounceDelay: number = 50 // Reduced to 50ms for better performance
  private isUpdatingPointClouds: boolean = false
  private materialEffectsPaused: boolean = false
  
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
  
  // Sky sphere effect state
  private skySphereMesh: THREE.Mesh | null = null
  private skySphereMaterial: THREE.ShaderMaterial | null = null
  
  // Topographic effect state
  private topographicAnimationStartTime: number = 0
  private topographicWires: THREE.LineSegments[] = []
  
  // Sphere motion tracking for motion blur
  private spherePreviousPositions: Map<THREE.InstancedMesh, Float32Array> = new Map()
  private sphereCurrentPositions: Map<THREE.InstancedMesh, Float32Array> = new Map()
  
  // Random scale effect caching
  private randomScaleCache: Map<string, { intensity: number, seed: number, applied: boolean }> = new Map()
  
  // Chain support
  public enabled: boolean = false
  private effectsChain: EffectInstance[] = []
  
  // Dithering passes
  private asciiDitheringPass: ASCIIDitheringPass
  private halftoneDitheringPass: HalftoneDitheringPass
  private engravingPass: EngravingPass
  private circlePackingPass: CirclePackingPass
  private gaussianBlurPass: GaussianBlurPass
  
  // Blending support
  private blendMaterial: THREE.ShaderMaterial | null = null
  private blendScene: THREE.Scene | null = null
  private blendMesh: THREE.Mesh | null = null
  
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
  
  // Enhanced motion blur state for screen space pixel comparison
  private depthRenderTarget: THREE.WebGLRenderTarget | null = null
  private previousFrameRenderTarget: THREE.WebGLRenderTarget | null = null
  private depthMaterial: THREE.MeshDepthMaterial | null = null
  public sobelThreshold: number = 0.1
  public bloomThreshold: number = 0.8
  public bloomIntensity: number = 1.0
  public bloomRadius: number = 0.5
  
  constructor(width: number, height: number, _renderer?: THREE.WebGLRenderer) {
    // Create render targets for chaining (ping-pong buffers + temp for blending)
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
        effectType: { value: 0 }, // 0=none, 1=gamma, 2=sepia, 3=vignette, 4=blur, 5=bloom, 6=crtgrain, 7=film35mm, 8=dotscreen, 9=bleachbypass, 10=invert, 11=colorify, 12=sobel, 13=sobelthreshold, 14=motionblur, 15=oilpainting, 16=datamosh, 17=pixelsort, 18=glow, 19=pixelate, 20=fog, 21=threshold, 22=colorgradient, 23=noise2d, 24=skysphere
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
        tDepth: { value: null },
        tPreviousFrame: { value: null },
        sobelThreshold: { value: this.sobelThreshold },
        time: { value: 0.0 },
        gammaValue: { value: 2.2 },
        brightness: { value: 1.0 },
        contrast: { value: 1.0 },
        saturation: { value: 1.0 },
        exposure: { value: 0.0 },
        hue: { value: 0.0 },
        lightness: { value: 0.0 },
        shadows: { value: 0.0 },
        highlights: { value: 0.0 },
        blackLevel: { value: 0.0 },
        whiteLevel: { value: 1.0 },
        temperature: { value: 0.0 },
        tint: { value: 0.0 },
        colorTintR: { value: 1.0 },
        colorTintG: { value: 1.0 },
        colorTintB: { value: 1.0 },
        colorTintIntensity: { value: 0.0 },
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
        gradientMidpoint: { value: 0.5 },
        // Split Tone uniforms
        splitToneColor1: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
        splitToneColor2: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        splitToneSmoothness: { value: 1.0 },
        splitToneContrast: { value: 1.0 },
        splitToneMidpoint: { value: 0.5 },
        // Noise2D uniforms
        noiseScale: { value: 10.0 },
        noiseTimeSpeed: { value: 1.0 },
        noiseType: { value: 0 },
        noiseOctaves: { value: 3 },
        noisePersistence: { value: 0.5 },
        noiseLacunarity: { value: 2.0 },
        noiseColorR: { value: 1.0 },
        noiseColorG: { value: 1.0 },
        noiseColorB: { value: 1.0 },
        noiseContrast: { value: 1.0 },
        noiseBrightness: { value: 0.0 },
        noiseAnimated: { value: 1.0 },
        noiseAngle: { value: 0.0 },
        noiseEvolution: { value: 1.0 },
        // Sky Sphere uniforms
        skyScale: { value: 100.0 },
        skyNoiseScale: { value: 10.0 },
        skyTimeSpeed: { value: 1.0 },
        skyNoiseType: { value: 0 },
        skyOctaves: { value: 3 },
        skyPersistence: { value: 0.5 },
        skyLacunarity: { value: 2.0 },
        skyColorR: { value: 0.5 },
        skyColorG: { value: 0.7 },
        skyColorB: { value: 1.0 },
        skyContrast: { value: 1.0 },
        skyBrightness: { value: 0.0 },
        skyAnimated: { value: 1.0 },
        skyOpacity: { value: 1.0 },
        skyRenderBehind: { value: 1.0 },
        skyAngle: { value: 0.0 },
        skyEvolution: { value: 1.0 },
        // Posterize uniforms
        posterizeIntensity: { value: 1.0 },
        posterizeLevels: { value: 8.0 },
        posterizeBlackAndWhite: { value: 0.0 },
        posterizeGamma: { value: 1.0 },
        posterizeSmoothness: { value: 0.0 }
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
    this.engravingPass = new EngravingPass(width, height)
    this.circlePackingPass = new CirclePackingPass(width, height)
    this.gaussianBlurPass = new GaussianBlurPass(width, height)
    
    // Initialize afterimage effect
    this.initializeAfterimage(width, height)
    
    // Initialize DOF effect
    this.initializeDOF(width, height)
    
    // Initialize enhanced motion blur buffers
    this.initializeMotionBlurBuffers(width, height)
  }
  
  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Update motion blur matrices every frame
    this.updateMotionBlurMatrices()
    
    // Render depth and update previous frame for enhanced motion blur
    this.updateMotionBlurFrameData(renderer, inputTexture)
    
    if (!this.enabled) {
      // If disabled, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      this.storePreviousFrame(renderer, inputTexture)
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
      this.storePreviousFrame(renderer, inputTexture)
    } else if (this.effectType !== 'none') {
      // Fall back to legacy single effect only if a legacy effect is actually set
      this.renderSingleEffect(renderer, inputTexture, outputTarget)
      this.storePreviousFrame(renderer, inputTexture)
    } else {
      // No effects to apply - just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      this.storePreviousFrame(renderer, inputTexture)
    }
  }
  
  private renderEffectChain(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effects: EffectInstance[], outputTarget?: THREE.WebGLRenderTarget | null) {
    let currentInput = inputTexture
    let pingPongIndex = 0
    
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i]
      const isLastEffect = i === effects.length - 1
      const currentTarget = isLastEffect ? outputTarget : this.renderTargets[pingPongIndex]
      
      // Handle different blend modes
      if (effect.blendMode === 'add' || effect.blendMode === 'multiply') {
        this.renderEffectWithBlending(renderer, currentInput, effect, currentTarget)
      } else {
        // Normal blend mode (default)
        this.renderSingleEffectFromInstance(renderer, currentInput, effect, currentTarget)
      }
      
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
    
    // Handle random scale effect separately
    if (effect.type === 'randomscale') {
      this.applyRandomScaleEffect(effect)
      // Random scale effects don't modify the rendered image, just copy input to output
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
    
    // Handle sky sphere effect separately
    if (effect.type === 'skysphere') {
      this.applySkySpherEffect(effect)
      // Sky sphere effects don't modify the rendered image, just copy input to output
      this.copyTexture(renderer, inputTexture, outputTarget)
      return
    }
    
    
    // Handle afterimage effect separately
    if (effect.type === 'afterimage') {
      this.renderAfterimageEffect(renderer, inputTexture, effect, outputTarget)
      return
    }
    
    // Handle DOF effect separately
    if (effect.type === 'dof') {
      this.renderDOFEffect(renderer, inputTexture, effect, outputTarget)
      return
    }
    
    // Handle dithering effects separately
    if (effect.type === 'ascii' || effect.type === 'halftone' || effect.type === 'engraving' || effect.type === 'circlepacking' || effect.type === 'gaussianblur') {
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
        this.material.uniforms.exposure.value = effect.parameters.exposure ?? 0.0
        this.material.uniforms.hue.value = effect.parameters.hue ?? 0.0
        this.material.uniforms.lightness.value = effect.parameters.lightness ?? 0.0
        this.material.uniforms.shadows.value = effect.parameters.shadows ?? 0.0
        this.material.uniforms.highlights.value = effect.parameters.highlights ?? 0.0
        this.material.uniforms.blackLevel.value = effect.parameters.blackLevel ?? 0.0
        this.material.uniforms.whiteLevel.value = effect.parameters.whiteLevel ?? 1.0
        this.material.uniforms.temperature.value = effect.parameters.temperature ?? 0.0
        this.material.uniforms.tint.value = effect.parameters.tint ?? 0.0
        this.material.uniforms.colorTintR.value = effect.parameters.colorTintR ?? 1.0
        this.material.uniforms.colorTintG.value = effect.parameters.colorTintG ?? 1.0
        this.material.uniforms.colorTintB.value = effect.parameters.colorTintB ?? 1.0
        this.material.uniforms.colorTintIntensity.value = effect.parameters.colorTintIntensity ?? 0.0
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
      
      case 'splittone':
        
        // Convert hex colors to RGB (0-1 range) 
        const splitColor1 = effect.parameters.color1 ?? 0x000000
        const splitColor2 = effect.parameters.color2 ?? 0xFFFFFF
        
        const color1RGB = [
          ((splitColor1 >> 16) & 255) / 255.0,  // Red
          ((splitColor1 >> 8) & 255) / 255.0,   // Green
          (splitColor1 & 255) / 255.0           // Blue
        ]
        const color2RGB = [
          ((splitColor2 >> 16) & 255) / 255.0,  // Red
          ((splitColor2 >> 8) & 255) / 255.0,   // Green
          (splitColor2 & 255) / 255.0           // Blue
        ]
        
        
        this.material.uniforms.splitToneColor1.value.set(...color1RGB)
        this.material.uniforms.splitToneColor2.value.set(...color2RGB)
        this.material.uniforms.splitToneSmoothness.value = effect.parameters.smoothness ?? 1.0
        this.material.uniforms.splitToneContrast.value = effect.parameters.contrast ?? 1.0
        this.material.uniforms.splitToneMidpoint.value = effect.parameters.midpoint ?? 0.5
        
        break
      
      case 'posterize':
        this.material.uniforms.posterizeIntensity.value = effect.parameters.intensity ?? 1.0
        this.material.uniforms.posterizeLevels.value = effect.parameters.levels ?? 8.0
        this.material.uniforms.posterizeBlackAndWhite.value = effect.parameters.blackAndWhite ?? 0.0
        this.material.uniforms.posterizeGamma.value = effect.parameters.gamma ?? 1.0
        this.material.uniforms.posterizeSmoothness.value = effect.parameters.smoothness ?? 0.0
        break
      
      case 'noise2d':
        this.material.uniforms.noiseScale.value = effect.parameters.scale ?? 10.0
        this.material.uniforms.noiseTimeSpeed.value = effect.parameters.timeSpeed ?? 1.0
        this.material.uniforms.noiseType.value = effect.parameters.noiseType ?? 0
        this.material.uniforms.noiseOctaves.value = effect.parameters.octaves ?? 3
        this.material.uniforms.noisePersistence.value = effect.parameters.persistence ?? 0.5
        this.material.uniforms.noiseLacunarity.value = effect.parameters.lacunarity ?? 2.0
        this.material.uniforms.noiseColorR.value = effect.parameters.colorR ?? 1.0
        this.material.uniforms.noiseColorG.value = effect.parameters.colorG ?? 1.0
        this.material.uniforms.noiseColorB.value = effect.parameters.colorB ?? 1.0
        this.material.uniforms.noiseContrast.value = effect.parameters.contrast ?? 1.0
        this.material.uniforms.noiseBrightness.value = effect.parameters.brightness ?? 0.0
        this.material.uniforms.noiseAnimated.value = effect.parameters.animated ?? 1.0
        this.material.uniforms.noiseAngle.value = (effect.parameters.angle ?? 0.0) * (Math.PI / 180.0) // Convert degrees to radians
        this.material.uniforms.noiseEvolution.value = effect.parameters.evolution ?? 1.0
        break
      
    }
    
    
    this.material.uniforms.time.value = performance.now() * 0.001
    
    // Update sky sphere uniforms if active
    this.updateSkySpherUniforms()
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  private renderDitheringEffect(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effect: EffectInstance, outputTarget?: THREE.WebGLRenderTarget | null) {
    let ditheringPass: ASCIIDitheringPass | HalftoneDitheringPass
    
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
      case 'circlepacking':
        this.circlePackingPass.enabled = effect.enabled
        this.circlePackingPass.intensity = effect.parameters.intensity ?? 0.8
        this.circlePackingPass.packingDensity = effect.parameters.packingDensity ?? 18
        this.circlePackingPass.colorLevels = effect.parameters.colorLevels ?? 8
        this.circlePackingPass.minCircleSize = effect.parameters.minCircleSize ?? 0.3
        this.circlePackingPass.maxCircleSize = effect.parameters.maxCircleSize ?? 8.0
        this.circlePackingPass.circleSpacing = effect.parameters.circleSpacing ?? 1.2
        this.circlePackingPass.colorTolerance = effect.parameters.colorTolerance ?? 0.15
        this.circlePackingPass.randomSeed = effect.parameters.randomSeed ?? 42
        this.circlePackingPass.blackBackground = effect.parameters.blackBackground ?? 1
        this.circlePackingPass.backgroundColorR = effect.parameters.backgroundColorR ?? 0.0
        this.circlePackingPass.backgroundColorG = effect.parameters.backgroundColorG ?? 0.0
        this.circlePackingPass.backgroundColorB = effect.parameters.backgroundColorB ?? 0.0
        this.circlePackingPass.pixelateSize = effect.parameters.pixelateSize ?? 8
        this.circlePackingPass.posterizeLevels = effect.parameters.posterizeLevels ?? 8
        this.circlePackingPass.render(renderer, inputTexture, outputTarget || undefined)
        return
        break
      case 'engraving':
        this.engravingPass.setIntensity(effect.parameters.intensity ?? 1.0)
        this.engravingPass.setAngle(effect.parameters.angle ?? 90.0)
        this.engravingPass.setMinWidth(effect.parameters.minWidth ?? 0.0)
        this.engravingPass.setMaxWidth(effect.parameters.maxWidth ?? 1.0)
        this.engravingPass.setDetail(effect.parameters.detail ?? 45.0)
        this.engravingPass.setLineSpacing(effect.parameters.lineSpacing ?? 13.0)
        this.engravingPass.setInterpolationMode(effect.parameters.interpolationMode ?? 3.0)
        this.engravingPass.render(renderer, inputTexture, outputTarget || undefined)
        return
        break
      case 'gaussianblur':
        this.gaussianBlurPass.setBlurAmount(typeof effect.parameters.blurAmount === 'number' ? effect.parameters.blurAmount : 1.0)
        this.gaussianBlurPass.setRadius(typeof effect.parameters.radius === 'number' ? effect.parameters.radius : 5)
        this.gaussianBlurPass.setIterations(typeof effect.parameters.iterations === 'number' ? effect.parameters.iterations : 1)
        this.gaussianBlurPass.render(renderer, inputTexture, outputTarget || undefined)
        return
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

  private renderEffectWithBlending(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, effect: EffectInstance, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Render the effect to a temporary render target first
    const tempTarget = this.renderTargets[2]
    
    // Render the effect
    this.renderSingleEffectFromInstance(renderer, inputTexture, effect, tempTarget)
    
    // Now blend the effect result with the input using the specified blend mode
    this.blendTextures(renderer, inputTexture, tempTarget.texture, effect.blendMode || 'normal', outputTarget)
  }

  private blendTextures(renderer: THREE.WebGLRenderer, baseTexture: THREE.Texture, blendTexture: THREE.Texture, blendMode: 'normal' | 'add' | 'multiply', outputTarget?: THREE.WebGLRenderTarget | null) {
    // Create a blend material if it doesn't exist
    if (!this.blendMaterial) {
      this.blendMaterial = new THREE.ShaderMaterial({
        uniforms: {
          tBase: { value: null },
          tBlend: { value: null },
          blendMode: { value: 0 } // 0=normal, 1=add, 2=multiply
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tBase;
          uniform sampler2D tBlend;
          uniform int blendMode;
          varying vec2 vUv;

          void main() {
            vec4 base = texture2D(tBase, vUv);
            vec4 blend = texture2D(tBlend, vUv);
            
            vec4 result;
            if (blendMode == 1) {
              // Add blend mode - corrected
              // Effect outputs: black = no effect, white = full effect
              // For add: black blend = no change, white blend = brighten
              // So black (0.0) + base = base, white (1.0) + base = base + 1.0
              result = vec4(clamp(base.rgb + blend.rgb, 0.0, 1.0), base.a);
            } else if (blendMode == 2) {
              // Multiply blend mode - corrected
              // Effect outputs: black = no effect, white = full effect
              // For multiply: white blend = no change, black blend = darken
              // White (1.0) * base = base (no change), Black (0.0) * base = black (darken)
              result = vec4(base.rgb * blend.rgb, base.a);
            } else {
              // Normal blend mode (default)
              result = blend;
            }
            
            gl_FragColor = result;
          }
        `
      })
    }

    // Set uniforms
    this.blendMaterial.uniforms.tBase.value = baseTexture
    this.blendMaterial.uniforms.tBlend.value = blendTexture
    this.blendMaterial.uniforms.blendMode.value = blendMode === 'add' ? 1 : blendMode === 'multiply' ? 2 : 0

    // Create a blend scene if it doesn't exist
    if (!this.blendScene) {
      this.blendScene = new THREE.Scene()
      const blendGeometry = new THREE.PlaneGeometry(2, 2)
      this.blendMesh = new THREE.Mesh(blendGeometry, this.blendMaterial)
      this.blendScene.add(this.blendMesh)
    } else if (this.blendMesh) {
      this.blendMesh.material = this.blendMaterial
    }

    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.blendScene, this.camera)
  }
  
  setSize(width: number, height: number) {
    this.renderTargets.forEach(target => target.setSize(width, height))
    this.material.uniforms.resolution.value.set(width, height)
    
    // Update dithering passes
    this.asciiDitheringPass.setSize(width, height)
    this.halftoneDitheringPass.setSize(width, height)
    this.engravingPass.setSize(width, height)
    this.circlePackingPass.setSize(width, height)
    this.gaussianBlurPass.setSize(width, height)
    
    
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
    this.engravingPass.dispose()
    this.circlePackingPass.dispose()
    this.gaussianBlurPass.dispose()
    
    // Clean up point network resources
    this.resetPointNetwork()
    this.pointVelocities.clear()
    this.originalPositions.clear()
    this.originalDrawRanges.clear()
    
    // Clean up material resources
    this.resetMaterials()
    this.originalMaterials.clear()
    
    // Clean up blending resources
    if (this.blendMaterial) {
      this.blendMaterial.dispose()
    }
    if (this.blendScene) {
      this.blendScene.clear()
    }
    
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
    
    // Clean up sky sphere
    this.cleanupSkySphere()
  }
  
  private applySkySpherEffect(effect: EffectInstance): void {
    if (!this.mainScene) return
    
    
    // Clean up existing sky sphere
    this.cleanupSkySphere()
    
    // Get parameters
    const scale = effect.parameters.scale ?? 500.0
    const noiseScale = effect.parameters.noiseScale ?? 10.0
    const timeSpeed = effect.parameters.timeSpeed ?? 1.0
    const noiseType = effect.parameters.noiseType ?? 0
    const octaves = effect.parameters.octaves ?? 3
    const persistence = effect.parameters.persistence ?? 0.5
    const lacunarity = effect.parameters.lacunarity ?? 2.0
    const colorR = effect.parameters.colorR ?? 0.5
    const colorG = effect.parameters.colorG ?? 0.7
    const colorB = effect.parameters.colorB ?? 1.0
    const contrast = effect.parameters.contrast ?? 1.0
    const brightness = effect.parameters.brightness ?? 0.0
    const animated = effect.parameters.animated ?? 1.0
    const opacity = effect.parameters.opacity ?? 1.0
    const angle = (effect.parameters.angle ?? 0.0) * (Math.PI / 180.0)
    const evolution = effect.parameters.evolution ?? 1.0
    
    // Create sphere geometry
    const geometry = new THREE.SphereGeometry(scale, 32, 16)
    
    // Create shader material with 3D Perlin noise
    this.skySphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        noiseScale: { value: noiseScale },
        timeSpeed: { value: timeSpeed },
        noiseType: { value: noiseType },
        octaves: { value: octaves },
        persistence: { value: persistence },
        lacunarity: { value: lacunarity },
        skyColor: { value: new THREE.Vector3(colorR, colorG, colorB) },
        contrast: { value: contrast },
        brightness: { value: brightness },
        animated: { value: animated },
        opacity: { value: opacity },
        angle: { value: angle },
        evolution: { value: evolution }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: this.getSkySpherFragmentShader(),
      side: THREE.DoubleSide, // Render both sides for maximum visibility
      transparent: true
    })
    
    // Create mesh
    this.skySphereMesh = new THREE.Mesh(geometry, this.skySphereMaterial)
    this.skySphereMesh.renderOrder = -1000 // Ensure it renders behind everything
    this.skySphereMesh.userData.isSkySphereMesh = true // Mark for SphereInstancer detection
    this.mainScene.add(this.skySphereMesh)
    
    
    // Update uniforms with current time
    this.updateSkySpherUniforms()
  }
  
  private cleanupSkySphere(): void {
    if (this.skySphereMesh && this.mainScene) {
      this.mainScene.remove(this.skySphereMesh)
      this.skySphereMesh.geometry.dispose()
      this.skySphereMesh = null
    }
    
    if (this.skySphereMaterial) {
      this.skySphereMaterial.dispose()
      this.skySphereMaterial = null
    }
  }
  
  private getSkySpherFragmentShader(): string {
    return `
      uniform float time;
      uniform float noiseScale;
      uniform float timeSpeed;
      uniform int noiseType;
      uniform int octaves;
      uniform float persistence;
      uniform float lacunarity;
      uniform vec3 skyColor;
      uniform float contrast;
      uniform float brightness;
      uniform float animated;
      uniform float opacity;
      uniform float angle;
      uniform float evolution;
      
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      // 3D gradient function
      vec3 grad3d(vec3 p) {
        float h = fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        float a = h * 6.283185307179586;
        float b = h * 12.566370614359172;
        return normalize(vec3(cos(a) * sin(b), sin(a) * sin(b), cos(b)));
      }
      
      // 3D Perlin noise
      float perlin3d(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        
        vec3 g000 = grad3d(i + vec3(0.0, 0.0, 0.0));
        vec3 g100 = grad3d(i + vec3(1.0, 0.0, 0.0));
        vec3 g010 = grad3d(i + vec3(0.0, 1.0, 0.0));
        vec3 g110 = grad3d(i + vec3(1.0, 1.0, 0.0));
        vec3 g001 = grad3d(i + vec3(0.0, 0.0, 1.0));
        vec3 g101 = grad3d(i + vec3(1.0, 0.0, 1.0));
        vec3 g011 = grad3d(i + vec3(0.0, 1.0, 1.0));
        vec3 g111 = grad3d(i + vec3(1.0, 1.0, 1.0));
        
        float v000 = dot(g000, f - vec3(0.0, 0.0, 0.0));
        float v100 = dot(g100, f - vec3(1.0, 0.0, 0.0));
        float v010 = dot(g010, f - vec3(0.0, 1.0, 0.0));
        float v110 = dot(g110, f - vec3(1.0, 1.0, 0.0));
        float v001 = dot(g001, f - vec3(0.0, 0.0, 1.0));
        float v101 = dot(g101, f - vec3(1.0, 0.0, 1.0));
        float v011 = dot(g011, f - vec3(0.0, 1.0, 1.0));
        float v111 = dot(g111, f - vec3(1.0, 1.0, 1.0));
        
        float x00 = mix(v000, v100, u.x);
        float x10 = mix(v010, v110, u.x);
        float x01 = mix(v001, v101, u.x);
        float x11 = mix(v011, v111, u.x);
        
        float y0 = mix(x00, x10, u.y);
        float y1 = mix(x01, x11, u.y);
        
        return mix(y0, y1, u.z);
      }
      
      void main() {
        // Use world position for 3D noise sampling
        vec3 noisePos = normalize(vWorldPosition) * noiseScale;
        
        // Animation and evolution
        vec3 directionalOffset = vec3(0.0);
        float evolutionZ = 0.0;
        
        if (animated > 0.5) {
          float timeOffset = time * timeSpeed;
          vec2 direction2D = vec2(cos(angle), sin(angle)) * timeOffset * 0.1;
          directionalOffset = vec3(direction2D, 0.0);
        }
        
        evolutionZ = time * evolution * 0.1;
        
        // Fractal noise
        float noiseValue = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        float maxValue = 0.0;
        
        for (int i = 0; i < 8; i++) {
          if (i >= octaves) break;
          
          vec3 samplePos = noisePos * frequency + directionalOffset * frequency;
          samplePos.z += evolutionZ * frequency;
          
          float n = perlin3d(samplePos);
          
          if (noiseType == 0) {
            noiseValue += n * amplitude;
          } else if (noiseType == 1) {
            noiseValue += n * amplitude;
          } else if (noiseType == 2) {
            n = 1.0 - abs(n);
            n = n * n;
            noiseValue += n * amplitude;
          }
          
          maxValue += amplitude;
          amplitude *= persistence;
          frequency *= lacunarity;
        }
        
        if (maxValue > 0.0) {
          noiseValue = (noiseValue / maxValue) * 0.5 + 0.5;
        }
        
        noiseValue = (noiseValue - 0.5) * contrast + 0.5 + brightness;
        noiseValue = clamp(noiseValue, 0.0, 1.0);
        
        vec3 finalColor = skyColor * noiseValue;
        gl_FragColor = vec4(finalColor, opacity);
      }
    `
  }
  
  private updateSkySpherUniforms(): void {
    if (this.skySphereMaterial) {
      this.skySphereMaterial.uniforms.time.value = performance.now() * 0.001
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
      case 'noise2d': return 23
      case 'skysphere': return 24
      case 'splittone': return 25
      case 'posterize': return 26
      // Topographic effects are handled separately in applyTopographicEffect
      case 'topographic': return 0
      // DrawRange effects are handled separately in applyDrawRangeEffect  
      case 'drawrange': return 0
      // Point Network effects are handled separately in applyPointNetworkEffect
      case 'pointnetwork': return 0
      // Material effects are handled separately in applyMaterialEffect
      case 'material': return 0
      // Random scale effects are handled separately in applyRandomScaleEffect
      case 'randomscale': return 0
      // Dithering effects are handled separately in renderDitheringEffect
      case 'ascii': return 0
      case 'halftone': return 0
      case 'circlepacking': return 0
      case 'engraving': return 0
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
    
    // Debounce updates during chunk loading to prevent flashing
    const now = performance.now()
    if (this.isUpdatingPointClouds || (now - this.lastUpdateTime) < this.updateDebounceDelay) {
      return
    }
    
    this.isUpdatingPointClouds = true
    this.lastUpdateTime = now
    
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
    
    // Reset the updating flag after processing
    this.isUpdatingPointClouds = false
  }
  
  /**
   * Pause material effects to prevent flashing during chunk loading
   */
  pauseMaterialEffects(): void {
    // Only pause if effects are actually enabled and active
    if (this.enabled && this.effectsChain.some(effect => effect.type === 'material')) {
      this.materialEffectsPaused = true
    } else {
    }
  }
  
  /**
   * Resume material effects after chunk loading is complete
   */
  resumeMaterialEffects(): void {
    if (this.materialEffectsPaused) {
      this.materialEffectsPaused = false
      // Force update when resuming
      this.lastUpdateTime = 0
      this.isUpdatingPointClouds = false
    } else {
    }
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
    // Skip material effects if paused during chunk loading
    if (this.materialEffectsPaused) {
      return
    }
    
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
  
  private applyRandomScaleEffect(effect: EffectInstance): void {
    if (!effect.enabled) {
      return
    }
    
    const intensity = effect.parameters.intensity ?? 0
    const randomSeed = effect.parameters.randomSeed ?? 42
    const luminanceInfluence = effect.parameters.luminanceInfluence ?? 0
    const thresholdLow = effect.parameters.thresholdLow ?? 0
    const thresholdHigh = effect.parameters.thresholdHigh ?? 1
    
    console.log(`🎲 Random Scale: intensity=${intensity}, seed=${randomSeed}, luminanceInfluence=${luminanceInfluence}, thresholds=[${thresholdLow}, ${thresholdHigh}]`)
    
    // Use ProgressiveLoader to apply random scaling at the model level
    const modelManager = (window as any).modelManager
    if (modelManager && modelManager.progressiveLoader) {
      console.log(`✨ Applying random scale via ProgressiveLoader`)
      modelManager.progressiveLoader.setRandomScale(intensity, randomSeed, luminanceInfluence, thresholdLow, thresholdHigh)
    } else {
      console.warn(`⚠️ ModelManager or ProgressiveLoader not available for random scale`)
    }
    
    // Apply to spheres through ModelManager
    if (modelManager && modelManager.getSphereInstancer && modelManager.getSphereInstancer()) {
      console.log(`✨ Applying random scale to spheres via SphereInstancer`)
      modelManager.getSphereInstancer().setRandomScale(intensity, randomSeed, luminanceInfluence, thresholdLow, thresholdHigh)
    }
  }
  
  private applyRandomScaleToPointCloud(pointCloud: THREE.Points, intensity: number, seed: number): void {
    console.log(`🎯 applyRandomScaleToPointCloud: intensity=${intensity}, seed=${seed}`)
    const geometry = pointCloud.geometry
    const vertexCount = geometry.attributes.position.count
    console.log(`   Vertex count: ${vertexCount}`)
    
    // Check if we already have a random scale shader material
    const currentMaterial = pointCloud.material as THREE.ShaderMaterial
    console.log(`   Current material: ${currentMaterial?.constructor.name}`)
    console.log(`   Has randomIntensity: ${!!(currentMaterial?.uniforms?.randomIntensity)}`)
    
    if (currentMaterial instanceof THREE.ShaderMaterial && 
        currentMaterial.uniforms.randomIntensity && 
        currentMaterial.uniforms.randomSeed) {
      // Update existing shader uniforms instead of recreating
      console.log(`   🔄 Updating existing uniforms`)
      currentMaterial.uniforms.randomIntensity.value = intensity
      currentMaterial.uniforms.randomSeed.value = seed
      return
    }
    
    // Create vertex index attribute for random generation (only once)
    console.log(`   🔧 Creating vertex index attribute`)
    if (!geometry.attributes.vertexIndex) {
      const indexArray = new Float32Array(vertexCount)
      for (let i = 0; i < vertexCount; i++) {
        indexArray[i] = i
      }
      geometry.setAttribute('vertexIndex', new THREE.BufferAttribute(indexArray, 1))
      console.log(`   ✅ Created vertexIndex attribute with ${vertexCount} indices`)
    } else {
      console.log(`   ⏭️ vertexIndex attribute already exists`)
    }
    
    // Create random scale shader material
    const hasColors = !!geometry.attributes.color
    console.log(`   🆕 Creating new shader material (hasColors: ${hasColors})`)
    const customMaterial = new THREE.ShaderMaterial({
      uniforms: {
        randomIntensity: { value: intensity },
        randomSeed: { value: seed },
        fogColor: { value: new THREE.Color(0x151515) },
        fogDensity: { value: 0.003 }
      },
      vertexShader: `
        attribute float vertexIndex;
        ${hasColors ? 'attribute vec3 color;' : ''}
        uniform float randomIntensity;
        uniform float randomSeed;
        varying vec3 vColor;
        varying float vFogDepth;
        
        // Simple hash function for deterministic random
        float random(float n) {
          return fract(sin(n + randomSeed) * 43758.5453123);
        }
        
        void main() {
          // Generate random value 0-1 based on vertex index
          float randomValue = random(vertexIndex);
          
          // Base size with random scaling
          float baseSize = 0.001;
          float scaledSize = baseSize * (1.0 + randomValue * randomIntensity);
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          gl_PointSize = scaledSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          
          // Pass color to fragment shader
          ${hasColors ? 'vColor = color * 1.8;' : 'vColor = vec3(1.8);'} // Brighten like ProgressiveLoader
        }
      `,
      fragmentShader: `
        uniform vec3 fogColor;
        uniform float fogDensity;
        varying vec3 vColor;
        varying float vFogDepth;
        
        void main() {
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          fogFactor = clamp(fogFactor, 0.0, 1.0);
          gl_FragColor = vec4(mix(vColor, fogColor, fogFactor), 1.0);
        }
      `,
      fog: true,
      transparent: false,
      vertexColors: hasColors
    })
    
    pointCloud.material = customMaterial
  }
  
  private applyRandomScaleToSpheres(_sphereMesh: THREE.InstancedMesh, _intensity: number, _seed: number): void {
    // Skip sphere processing for now to avoid crashes
    // TODO: Implement sphere random scaling properly
    return
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
      uniform sampler2D tDepth;
      uniform sampler2D tPreviousFrame;
      uniform float sobelThreshold;
      uniform float time;
      uniform float gammaValue;
      uniform float brightness;
      uniform float contrast;
      uniform float saturation;
      uniform float exposure;
      uniform float hue;
      uniform float lightness;
      uniform float shadows;
      uniform float highlights;
      uniform float blackLevel;
      uniform float whiteLevel;
      uniform float temperature;
      uniform float tint;
      uniform float colorTintR;
      uniform float colorTintG;
      uniform float colorTintB;
      uniform float colorTintIntensity;
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
      uniform vec3 splitToneColor1;
      uniform vec3 splitToneColor2;
      uniform float splitToneSmoothness;
      uniform float splitToneContrast;
      uniform float splitToneMidpoint;
      uniform float posterizeIntensity;
      uniform float posterizeLevels;
      uniform float posterizeBlackAndWhite;
      uniform float posterizeGamma;
      uniform float posterizeSmoothness;
      uniform float noiseScale;
      uniform float noiseTimeSpeed;
      uniform int noiseType;
      uniform int noiseOctaves;
      uniform float noisePersistence;
      uniform float noiseLacunarity;
      uniform float noiseColorR;
      uniform float noiseColorG;
      uniform float noiseColorB;
      uniform float noiseContrast;
      uniform float noiseBrightness;
      uniform float noiseAnimated;
      uniform float noiseAngle;
      uniform float noiseEvolution;
      uniform float skyScale;
      uniform float skyNoiseScale;
      uniform float skyTimeSpeed;
      uniform int skyNoiseType;
      uniform int skyOctaves;
      uniform float skyPersistence;
      uniform float skyLacunarity;
      uniform float skyColorR;
      uniform float skyColorG;
      uniform float skyColorB;
      uniform float skyContrast;
      uniform float skyBrightness;
      uniform float skyAnimated;
      uniform float skyOpacity;
      uniform float skyRenderBehind;
      uniform float skyAngle;
      uniform float skyEvolution;
      
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
      
      // HSL conversion functions
      vec3 rgb2hsl(vec3 color) {
        float maxCol = max(color.r, max(color.g, color.b));
        float minCol = min(color.r, min(color.g, color.b));
        float l = (maxCol + minCol) * 0.5;
        float s = 0.0;
        float h = 0.0;
        
        if (maxCol != minCol) {
          float d = maxCol - minCol;
          s = l > 0.5 ? d / (2.0 - maxCol - minCol) : d / (maxCol + minCol);
          
          if (maxCol == color.r) {
            h = (color.g - color.b) / d + (color.g < color.b ? 6.0 : 0.0);
          } else if (maxCol == color.g) {
            h = (color.b - color.r) / d + 2.0;
          } else {
            h = (color.r - color.g) / d + 4.0;
          }
          h /= 6.0;
        }
        
        return vec3(h, s, l);
      }
      
      float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
        if (t < 1.0/2.0) return q;
        if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
        return p;
      }
      
      vec3 hsl2rgb(vec3 hsl) {
        float h = hsl.x;
        float s = hsl.y;
        float l = hsl.z;
        
        if (s == 0.0) {
          return vec3(l);
        }
        
        float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
        
        return vec3(
          hue2rgb(p, q, h + 1.0/3.0),
          hue2rgb(p, q, h),
          hue2rgb(p, q, h - 1.0/3.0)
        );
      }
      
      // Temperature and tint adjustment
      vec3 adjustTemperatureTint(vec3 color, float temp, float tintVal) {
        // Temperature: -100 = cooler (blue), +100 = warmer (orange)
        // Tint: -100 = magenta, +100 = green
        float tempNorm = temp / 100.0;
        float tintNorm = tintVal / 100.0;
        
        // Temperature adjustment
        vec3 tempColor = color;
        if (tempNorm > 0.0) {
          // Warmer - add orange/red
          tempColor.r = mix(color.r, min(color.r * (1.0 + tempNorm * 0.3), 1.0), tempNorm);
          tempColor.g = mix(color.g, min(color.g * (1.0 + tempNorm * 0.15), 1.0), tempNorm);
        } else if (tempNorm < 0.0) {
          // Cooler - add blue
          tempColor.b = mix(color.b, min(color.b * (1.0 - tempNorm * 0.3), 1.0), -tempNorm);
        }
        
        // Tint adjustment
        if (tintNorm > 0.0) {
          // More green
          tempColor.g = mix(tempColor.g, min(tempColor.g * (1.0 + tintNorm * 0.2), 1.0), tintNorm);
        } else if (tintNorm < 0.0) {
          // More magenta
          tempColor.r = mix(tempColor.r, min(tempColor.r * (1.0 - tintNorm * 0.15), 1.0), -tintNorm);
          tempColor.b = mix(tempColor.b, min(tempColor.b * (1.0 - tintNorm * 0.15), 1.0), -tintNorm);
        }
        
        return tempColor;
      }
      
      // Comprehensive color correction effect
      vec3 colorCorrection(vec3 color) {
        vec3 result = color;
        
        // 1. Apply exposure (multiplicative brightness in linear space)
        result *= pow(2.0, exposure);
        
        // 2. Apply black and white levels (input range mapping)
        result = (result - blackLevel) / (whiteLevel - blackLevel);
        result = clamp(result, 0.0, 1.0);
        
        // 3. Apply gamma correction
        result = pow(result, vec3(1.0 / gammaValue));
        
        // 4. Apply brightness (additive)
        result *= brightness;
        
        // 5. Apply contrast (around midpoint 0.5)
        result = ((result - 0.5) * contrast) + 0.5;
        
        // 6. Apply shadows and highlights
        float lum = dot(result, vec3(0.299, 0.587, 0.114));
        
        // Shadows adjustment (affects darker areas more)
        float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
        result += shadowMask * (shadows / 100.0) * 0.5;
        
        // Highlights adjustment (affects brighter areas more)
        float highlightMask = smoothstep(0.5, 1.0, lum);
        result += highlightMask * (highlights / 100.0) * 0.5;
        
        // 7. Convert to HSL for hue/saturation/lightness adjustments
        vec3 hsl = rgb2hsl(result);
        
        // Apply hue shift
        hsl.x += hue / 360.0;
        if (hsl.x > 1.0) hsl.x -= 1.0;
        if (hsl.x < 0.0) hsl.x += 1.0;
        
        // Apply saturation
        hsl.y *= saturation;
        hsl.y = clamp(hsl.y, 0.0, 1.0);
        
        // Apply lightness
        hsl.z += lightness / 100.0;
        hsl.z = clamp(hsl.z, 0.0, 1.0);
        
        // Convert back to RGB
        result = hsl2rgb(hsl);
        
        // 8. Apply temperature and tint
        result = adjustTemperatureTint(result, temperature, tint);
        
        // 9. Apply color tint
        vec3 colorTintVec = vec3(colorTintR, colorTintG, colorTintB);
        float colorLuminance = dot(result, vec3(0.299, 0.587, 0.114));
        result = mix(result, colorTintVec * colorLuminance, colorTintIntensity);
        
        // Final clamp to valid range
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
      
      // Split Tone Effect - Maps luminance to custom color gradient
      vec3 splitTone(vec3 color, vec2 uv) {
        // Calculate luminance using standard formula
        float luminance = dot(color, vec3(0.299, 0.587, 0.114));
        
        // Apply contrast to luminance
        luminance = pow(luminance, splitToneContrast);
        
        // Adjust luminance based on midpoint
        // This allows shifting where the gradient center appears
        float adjustedLuminance = luminance;
        if (luminance < splitToneMidpoint) {
          adjustedLuminance = (luminance / splitToneMidpoint) * 0.5;
        } else {
          adjustedLuminance = 0.5 + ((luminance - splitToneMidpoint) / (1.0 - splitToneMidpoint)) * 0.5;
        }
        
        // Apply smoothness to the gradient transition
        if (splitToneSmoothness != 1.0) {
          adjustedLuminance = pow(adjustedLuminance, 1.0 / splitToneSmoothness);
        }
        
        // Clamp to valid range
        adjustedLuminance = clamp(adjustedLuminance, 0.0, 1.0);
        
        // Map luminance to split tone: black pixels (0) -> splitToneColor1, white pixels (1) -> splitToneColor2
        vec3 splitToneColor = mix(splitToneColor1, splitToneColor2, adjustedLuminance);
        
        // Blend with original color based on intensity
        return mix(color, splitToneColor, intensity);
      }
      
      // Posterize Effect - Quantizes color levels for poster-like appearance
      vec3 posterize(vec3 color, vec2 uv) {
        // Apply gamma correction before posterization if specified
        vec3 processedColor = color;
        if (posterizeGamma != 1.0) {
          processedColor = pow(processedColor, vec3(1.0 / posterizeGamma));
        }
        
        // Convert to black and white if specified
        if (posterizeBlackAndWhite > 0.0) {
          float luminance = dot(processedColor, vec3(0.299, 0.587, 0.114));
          processedColor = mix(processedColor, vec3(luminance), posterizeBlackAndWhite);
        }
        
        // Quantize color levels
        vec3 quantizedColor;
        if (posterizeSmoothness > 0.0) {
          // Smooth posterization using smoothstep
          float levels = posterizeLevels;
          quantizedColor.r = smoothstep(0.0, 1.0, floor(processedColor.r * levels + 0.5) / levels);
          quantizedColor.g = smoothstep(0.0, 1.0, floor(processedColor.g * levels + 0.5) / levels);
          quantizedColor.b = smoothstep(0.0, 1.0, floor(processedColor.b * levels + 0.5) / levels);
          
          // Blend between hard and smooth quantization
          vec3 hardQuantized;
          hardQuantized.r = floor(processedColor.r * levels + 0.5) / levels;
          hardQuantized.g = floor(processedColor.g * levels + 0.5) / levels;
          hardQuantized.b = floor(processedColor.b * levels + 0.5) / levels;
          
          quantizedColor = mix(hardQuantized, quantizedColor, posterizeSmoothness);
        } else {
          // Hard posterization
          float levels = posterizeLevels;
          quantizedColor.r = floor(processedColor.r * levels + 0.5) / levels;
          quantizedColor.g = floor(processedColor.g * levels + 0.5) / levels;
          quantizedColor.b = floor(processedColor.b * levels + 0.5) / levels;
        }
        
        // Apply gamma correction back if it was applied
        if (posterizeGamma != 1.0) {
          quantizedColor = pow(quantizedColor, vec3(posterizeGamma));
        }
        
        // Blend with original color based on intensity
        return mix(color, quantizedColor, posterizeIntensity);
      }
      
      // 3D gradient function for proper evolution
      vec3 grad3d(vec3 p) {
        float h = fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        float a = h * 6.283185307179586; // 2 * PI
        float b = h * 12.566370614359172; // 4 * PI
        return normalize(vec3(cos(a) * sin(b), sin(a) * sin(b), cos(b)));
      }
      
      // 3D Perlin noise function for evolution
      float perlin3d(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        
        // Smooth interpolation (quintic)
        vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        
        // 8 corner gradients
        vec3 g000 = grad3d(i + vec3(0.0, 0.0, 0.0));
        vec3 g100 = grad3d(i + vec3(1.0, 0.0, 0.0));
        vec3 g010 = grad3d(i + vec3(0.0, 1.0, 0.0));
        vec3 g110 = grad3d(i + vec3(1.0, 1.0, 0.0));
        vec3 g001 = grad3d(i + vec3(0.0, 0.0, 1.0));
        vec3 g101 = grad3d(i + vec3(1.0, 0.0, 1.0));
        vec3 g011 = grad3d(i + vec3(0.0, 1.0, 1.0));
        vec3 g111 = grad3d(i + vec3(1.0, 1.0, 1.0));
        
        // Dot products with distance vectors
        float v000 = dot(g000, f - vec3(0.0, 0.0, 0.0));
        float v100 = dot(g100, f - vec3(1.0, 0.0, 0.0));
        float v010 = dot(g010, f - vec3(0.0, 1.0, 0.0));
        float v110 = dot(g110, f - vec3(1.0, 1.0, 0.0));
        float v001 = dot(g001, f - vec3(0.0, 0.0, 1.0));
        float v101 = dot(g101, f - vec3(1.0, 0.0, 1.0));
        float v011 = dot(g011, f - vec3(0.0, 1.0, 1.0));
        float v111 = dot(g111, f - vec3(1.0, 1.0, 1.0));
        
        // Trilinear interpolation
        float x00 = mix(v000, v100, u.x);
        float x10 = mix(v010, v110, u.x);
        float x01 = mix(v001, v101, u.x);
        float x11 = mix(v011, v111, u.x);
        
        float y0 = mix(x00, x10, u.y);
        float y1 = mix(x01, x11, u.y);
        
        return mix(y0, y1, u.z);
      }
      
      // 2D Perlin Noise with fractal and ridged variants, angle, and evolution
      vec3 noise2d(vec3 color, vec2 uv) {
        vec2 pos = uv * noiseScale;
        float noiseValue = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        float maxValue = 0.0;
        
        // Calculate time-based evolution and directional offset
        vec2 directionalOffset = vec2(0.0);
        float evolutionZ = 0.0;
        
        // Directional animation (only when animated)
        if (noiseAnimated > 0.5) {
          float timeOffset = time * noiseTimeSpeed;
          directionalOffset = vec2(cos(noiseAngle), sin(noiseAngle)) * timeOffset * 0.1;
        }
        
        // Evolution through 3D noise space (independent of directional animation)
        evolutionZ = time * noiseEvolution * 0.1;
        
        // Fractal noise generation
        for (int i = 0; i < 8; i++) {
          if (i >= noiseOctaves) break;
          
          vec2 samplePos = pos * frequency + directionalOffset * frequency;
          vec3 samplePos3D = vec3(samplePos, evolutionZ * frequency);
          
          // Sample 3D Perlin noise for true evolution
          float n = perlin3d(samplePos3D);
          
          if (noiseType == 0) {
            // Regular Perlin noise
            noiseValue += n * amplitude;
          } else if (noiseType == 1) {
            // Fractal Brownian Motion (fBm) - same as regular for 3D
            noiseValue += n * amplitude;
          } else if (noiseType == 2) {
            // Ridged noise (inverted and absolute)
            n = 1.0 - abs(n);
            n = n * n; // Square for sharper ridges
            noiseValue += n * amplitude;
          }
          
          maxValue += amplitude;
          amplitude *= noisePersistence;
          frequency *= noiseLacunarity;
        }
        
        // Normalize noise to [0, 1] range
        if (maxValue > 0.0) {
          noiseValue = (noiseValue / maxValue) * 0.5 + 0.5;
        }
        
        // Apply contrast and brightness
        noiseValue = (noiseValue - 0.5) * noiseContrast + 0.5 + noiseBrightness;
        noiseValue = clamp(noiseValue, 0.0, 1.0);
        
        // Apply noise color
        vec3 noiseColor = vec3(noiseColorR, noiseColorG, noiseColorB) * noiseValue;
        
        // Blend with original color based on intensity
        return mix(color, noiseColor, intensity);
      }
      
      // Sky Sphere effect with 3D Perlin noise, angle, and evolution
      vec3 skysphere(vec3 color, vec2 uv) {
        // Create a simple pattern based on UV coordinates
        vec3 testColor = vec3(skyColorR, skyColorG, skyColorB);
        
        // Create a gradient pattern for testing
        float pattern = sin(uv.x * 10.0) * cos(uv.y * 10.0) * 0.5 + 0.5;
        testColor *= pattern;
        
        // Blend with original color using intensity
        return mix(color, testColor, intensity);
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
      
      // Enhanced motion blur with screen space pixel comparison
      vec3 motionBlur(sampler2D tex, vec2 uv, vec2 resolution, float strength, int samples) {
        vec3 color = vec3(0.0);
        
        // Sample depth from depth buffer
        float currentDepth = texture2D(tDepth, uv).r;
        
        // Reconstruct world position using actual depth
        vec4 currentPos = vec4(uv * 2.0 - 1.0, currentDepth * 2.0 - 1.0, 1.0);
        
        // Transform to previous frame's screen space
        vec4 prevPos = previousViewProjectionMatrix * inverse(currentViewProjectionMatrix) * currentPos;
        prevPos /= prevPos.w;
        
        // Calculate screen space velocity vector
        vec2 velocity = (currentPos.xy - prevPos.xy) * strength;
        
        // Sample current and previous frame colors for comparison
        vec3 currentColor = texture2D(tex, uv).rgb;
        vec3 previousColor = texture2D(tPreviousFrame, uv).rgb;
        
        // Calculate pixel difference magnitude for adaptive blur strength
        float pixelDifference = length(currentColor - previousColor);
        float adaptiveStrength = pixelDifference * strength;
        
        // Adjust velocity based on pixel difference
        velocity *= (1.0 + adaptiveStrength);
        
        // If no significant motion or difference, return current color
        if (length(velocity) < 0.001 && pixelDifference < 0.05) {
          return currentColor;
        }
        
        float totalWeight = 0.0;
        
        // Sample along the velocity vector with adaptive sampling
        for (int i = 0; i < 16; i++) {
          if (i >= samples) break;
          
          float offset = (float(i) / float(samples - 1)) - 0.5;
          vec2 sampleUV = uv + velocity * offset;
          
          // Check bounds
          if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
            // Sample depth at offset position for depth-aware weighting
            float sampleDepth = texture2D(tDepth, sampleUV).r;
            
            // Weight based on distance from center and depth similarity
            float distanceWeight = 1.0 - abs(offset);
            float depthWeight = 1.0 - abs(currentDepth - sampleDepth) * 10.0;
            depthWeight = max(depthWeight, 0.1); // Minimum weight
            
            float weight = distanceWeight * depthWeight;
            
            vec3 sampleColor = texture2D(tex, sampleUV).rgb;
            color += sampleColor * weight;
            totalWeight += weight;
          }
        }
        
        // Blend result with original based on motion strength
        vec3 blurredColor = totalWeight > 0.0 ? color / totalWeight : currentColor;
        float blendFactor = clamp(length(velocity) * 2.0, 0.0, 1.0);
        
        return mix(currentColor, blurredColor, blendFactor);
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
          // Color correction
          color = mix(color, colorCorrection(color), intensity);
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
        } else if (effectType == 23) {
          // Noise 2D Effect
          color = noise2d(color, vUv);
        } else if (effectType == 25) {
          // Split Tone Effect
          color = splitTone(color, vUv);
        } else if (effectType == 26) {
          // Posterize Effect
          color = posterize(color, vUv);
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

  // Enhanced motion blur effect methods
  private initializeMotionBlurBuffers(width: number, height: number): void {
    // Create depth render target
    this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    })
    
    // Create previous frame render target
    this.previousFrameRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    })
    
    // Create depth material for depth rendering
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    })
  }

  private updateMotionBlurFrameData(renderer: THREE.WebGLRenderer, _inputTexture: THREE.Texture): void {
    if (!this.depthRenderTarget || !this.previousFrameRenderTarget || !this.mainScene || !this.currentCamera) {
      return
    }

    // Render depth buffer
    if (this.depthMaterial) {
      // Store original materials
      const originalMaterials = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>()
      
      this.mainScene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          originalMaterials.set(object, object.material)
          object.material = this.depthMaterial!
        }
      })

      // Render depth to depth render target
      renderer.setRenderTarget(this.depthRenderTarget)
      renderer.clear()
      renderer.render(this.mainScene, this.currentCamera)

      // Restore original materials
      originalMaterials.forEach((material, object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.material = material
        }
      })
    }

    // Update depth and previous frame textures in shader uniforms
    this.material.uniforms.tDepth.value = this.depthRenderTarget.texture
    this.material.uniforms.tPreviousFrame.value = this.previousFrameRenderTarget.texture

    // Copy current frame to previous frame buffer (after processing)
    // This will be done after the main render pass
  }

  private storePreviousFrame(renderer: THREE.WebGLRenderer, currentFrameTexture: THREE.Texture): void {
    if (!this.previousFrameRenderTarget) return

    // Copy current frame to previous frame buffer
    const originalRenderTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.previousFrameRenderTarget)
    renderer.clear()
    
    // Use a simple copy shader to transfer the texture
    const copyMaterial = new THREE.MeshBasicMaterial({ map: currentFrameTexture })
    const tempMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial)
    const tempScene = new THREE.Scene()
    const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    
    tempScene.add(tempMesh)
    renderer.render(tempScene, tempCamera)
    
    // Cleanup
    copyMaterial.dispose()
    tempMesh.geometry.dispose()
    renderer.setRenderTarget(originalRenderTarget)
  }
}