import type { EffectType } from './PostProcessingPass'

export interface EffectInstance {
  id: string
  type: EffectType
  enabled: boolean
  parameters: { [key: string]: number }
}

export interface EffectDefinition {
  type: EffectType
  name: string
  defaultParameters: { [key: string]: number }
  parameterDefinitions: {
    [key: string]: {
      min: number
      max: number
      step: number
      label: string
    }
  }
}

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    type: 'background',
    name: 'Background Color',
    defaultParameters: { hue: 0.75, saturation: 17, lightness: 9 },
    parameterDefinitions: {
      hue: { min: 0, max: 1, step: 0.01, label: 'Hue' },
      saturation: { min: 0, max: 100, step: 1, label: 'Saturation (%)' },
      lightness: { min: 0, max: 100, step: 1, label: 'Lightness (%)' }
    }
  },
  {
    type: 'drawrange',
    name: 'Concentric Circles',
    defaultParameters: { progress: 100, animationSpeed: 1.0, ringWidth: 2.0, ringSeparation: 5.0 },
    parameterDefinitions: {
      progress: { min: 0, max: 100, step: 1, label: 'Progress (%)' },
      animationSpeed: { min: 0, max: 3.0, step: 0.1, label: 'Animation Speed' },
      ringWidth: { min: 0.5, max: 10.0, step: 0.5, label: 'Ring Width' },
      ringSeparation: { min: 1.0, max: 20.0, step: 0.5, label: 'Ring Separation' }
    }
  },
  {
    type: 'pointnetwork',
    name: 'Point Network',
    defaultParameters: { 
      movementSpeed: 0, 
      movementRange: 0, 
      bounceEffect: 1, 
      showConnections: 1, 
      connectionDistance: 10, 
      maxConnections: 5, 
      lineOpacity: 50,
      enableAnimation: 1,
      resetPositions: 0,
      randomSeed: 0
    },
    parameterDefinitions: {
      movementSpeed: { min: 0, max: 0.2, step: 0.001, label: 'Movement Speed' },
      movementRange: { min: 0, max: 500, step: 1, label: 'Movement Range (%)' },
      bounceEffect: { min: 0, max: 1, step: 1, label: 'Bounce Effect' },
      showConnections: { min: 0, max: 1, step: 1, label: 'Show Connections' },
      connectionDistance: { min: 1, max: 50, step: 1, label: 'Connection Distance' },
      maxConnections: { min: 1, max: 20, step: 1, label: 'Max Connections' },
      lineOpacity: { min: 0, max: 100, step: 5, label: 'Line Opacity (%)' },
      enableAnimation: { min: 0, max: 1, step: 1, label: 'Enable Animation' },
      resetPositions: { min: 0, max: 1, step: 1, label: 'Reset Positions' },
      randomSeed: { min: 0, max: 1000, step: 1, label: 'Random Seed' }
    }
  },
  {
    type: 'material',
    name: 'Material Effects',
    defaultParameters: { 
      transparency: 0, 
      sizeMultiplier: 100, 
      useVertexColors: 1, 
      waveDeformation: 0, 
      twistEffect: 0, 
      animationSpeed: 1, 
      waveFrequency: 2,
      pulseEffect: 0,
      colorCycling: 0,
      deformationEnable: 0
    },
    parameterDefinitions: {
      transparency: { min: 0, max: 100, step: 5, label: 'Transparency (%)' },
      sizeMultiplier: { min: 10, max: 500, step: 10, label: 'Size Multiplier (%)' },
      useVertexColors: { min: 0, max: 1, step: 1, label: 'Use Vertex Colors' },
      waveDeformation: { min: 0, max: 2.0, step: 0.01, label: 'Wave Deformation' },
      twistEffect: { min: 0, max: 2.0, step: 0.1, label: 'Twist Effect' },
      animationSpeed: { min: 0, max: 2.0, step: 0.1, label: 'Animation Speed' },
      waveFrequency: { min: 0.1, max: 20.0, step: 0.1, label: 'Wave Frequency' },
      pulseEffect: { min: 0, max: 1, step: 1, label: 'Pulse Effect' },
      colorCycling: { min: 0, max: 1, step: 1, label: 'Color Cycling' },
      deformationEnable: { min: 0, max: 1, step: 1, label: 'Enable Deformation' }
    }
  },
  {
    type: 'brush',
    name: 'Brush Effect',
    defaultParameters: { 
      brushSize: 2.0, 
      brushStrength: 5.0, 
      elasticity: 0.2, 
      damping: 0.98
    },
    parameterDefinitions: {
      brushSize: { min: 0.5, max: 10.0, step: 0.1, label: 'Brush Size' },
      brushStrength: { min: 0.1, max: 20.0, step: 0.1, label: 'Brush Strength' },
      elasticity: { min: 0.01, max: 1.0, step: 0.01, label: 'Elasticity' },
      damping: { min: 0.8, max: 0.99, step: 0.01, label: 'Damping' }
    }
  },
  {
    type: 'tsl',
    name: 'TSL Effects (WebGPU)',
    defaultParameters: { 
      tslEffectType: 0, // 0=crt, 1=wave, 2=noise, 3=hologram
      intensity: 50, 
      speed: 1.0, 
      scale: 1.0 
    },
    parameterDefinitions: {
      tslEffectType: { min: 0, max: 3, step: 1, label: 'Effect Type (0=CRT, 1=Wave, 2=Noise, 3=Hologram)' },
      intensity: { min: 0, max: 100, step: 1, label: 'Intensity (%)' },
      speed: { min: 0.1, max: 5.0, step: 0.1, label: 'Animation Speed' },
      scale: { min: 0.1, max: 10.0, step: 0.1, label: 'Scale' }
    }
  },
  {
    type: 'gamma',
    name: 'Gamma Correction',
    defaultParameters: { 
      gamma: 2.2,
      brightness: 1.0,
      contrast: 1.0,
      saturation: 1.0
    },
    parameterDefinitions: {
      gamma: { min: 0.1, max: 5.0, step: 0.1, label: 'Gamma' },
      brightness: { min: 0.0, max: 3.0, step: 0.1, label: 'Brightness' },
      contrast: { min: 0.0, max: 3.0, step: 0.1, label: 'Contrast' },
      saturation: { min: 0.0, max: 3.0, step: 0.1, label: 'Saturation' }
    }
  },
  {
    type: 'sepia',
    name: 'Sepia',
    defaultParameters: { intensity: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' }
    }
  },
  {
    type: 'vignette',
    name: 'Vignette',
    defaultParameters: { intensity: 0.5, offset: 1.2, feather: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      offset: { min: 0.3, max: 2.0, step: 0.05, label: 'Size' },
      feather: { min: 0.01, max: 2.0, step: 0.01, label: 'Feather' }
    }
  },
  {
    type: 'blur',
    name: 'Blur',
    defaultParameters: { intensity: 0.5, blurAmount: 0.002, threshold: 0.0, blurType: 0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      blurAmount: { min: 0.0005, max: 0.02, step: 0.0005, label: 'Amount' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Brightness Threshold' },
      blurType: { min: 0, max: 5, step: 1, label: 'Type' }
    }
  },
  {
    type: 'bloom',
    name: 'Bloom',
    defaultParameters: { threshold: 0.8, intensity: 1.0, radius: 0.5, quality: 2 },
    parameterDefinitions: {
      threshold: { min: 0, max: 1, step: 0.01, label: 'Threshold' },
      intensity: { min: 0, max: 3, step: 0.1, label: 'Intensity' },
      radius: { min: 0.1, max: 2.0, step: 0.1, label: 'Radius' },
      quality: { min: 1, max: 4, step: 1, label: 'Quality' }
    }
  },
  {
    type: 'crtgrain',
    name: 'CRT Grain',
    defaultParameters: { intensity: 0.5, noiseSeed: 0.35, scale: 1.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      noiseSeed: { min: 0.1, max: 1.0, step: 0.05, label: 'Noise Seed' },
      scale: { min: 0.1, max: 5.0, step: 0.1, label: 'Scale' }
    }
  },
  {
    type: 'film35mm',
    name: '35mm Film Grain',
    defaultParameters: { intensity: 0.3, grainSize: 0.8, contrast: 1.2, scale: 1.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      grainSize: { min: 0.1, max: 2.0, step: 0.1, label: 'Grain Size' },
      contrast: { min: 0.5, max: 3.0, step: 0.1, label: 'Contrast' },
      scale: { min: 0.1, max: 5.0, step: 0.1, label: 'Scale' }
    }
  },
  {
    type: 'dotscreen',
    name: 'Dot Screen',
    defaultParameters: { intensity: 0.7, centerX: 0.5, centerY: 0.5, scale: 1.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      centerX: { min: -1, max: 1, step: 0.05, label: 'Center X' },
      centerY: { min: -1, max: 1, step: 0.05, label: 'Center Y' },
      scale: { min: 0.1, max: 2.0, step: 0.05, label: 'Scale' }
    }
  },
  {
    type: 'bleachbypass',
    name: 'Bleach Bypass',
    defaultParameters: { intensity: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' }
    }
  },
  {
    type: 'invert',
    name: 'Color Invert',
    defaultParameters: { intensity: 1.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' }
    }
  },
  {
    type: 'afterimage',
    name: 'Afterimage',
    defaultParameters: { damping: 0.96 },
    parameterDefinitions: {
      damping: { min: 0.8, max: 0.99, step: 0.01, label: 'Damping' }
    }
  },
  {
    type: 'colorify',
    name: 'Colorify',
    defaultParameters: { intensity: 0.5, colorR: 1.0, colorG: 0.5, colorB: 0.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      colorR: { min: 0, max: 1, step: 0.01, label: 'Red' },
      colorG: { min: 0, max: 1, step: 0.01, label: 'Green' },
      colorB: { min: 0, max: 1, step: 0.01, label: 'Blue' }
    }
  },
  {
    type: 'sobel',
    name: 'Sobel Edge Detection',
    defaultParameters: { intensity: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' }
    }
  },
  {
    type: 'sobelthreshold',
    name: 'Sobel with Threshold',
    defaultParameters: { intensity: 0.5, threshold: 0.1 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Threshold' }
    }
  },
  {
    type: 'ascii',
    name: 'ASCII Dithering',
    defaultParameters: { intensity: 0.5, characterSize: 8, contrast: 1.2 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      characterSize: { min: 4, max: 32, step: 1, label: 'Character Size' },
      contrast: { min: 0.5, max: 2.0, step: 0.05, label: 'Contrast' }
    }
  },
  {
    type: 'halftone',
    name: 'Halftone Dithering',
    defaultParameters: { intensity: 0.5, dotSize: 8, contrast: 1.2 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      dotSize: { min: 2, max: 32, step: 1, label: 'Dot Size' },
      contrast: { min: 0.5, max: 2.0, step: 0.05, label: 'Contrast' }
    }
  },
  {
    type: 'floydsteinberg',
    name: 'Floyd-Steinberg Dithering',
    defaultParameters: { intensity: 0.5, colorLevels: 4, contrast: 1.2 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      colorLevels: { min: 2, max: 16, step: 1, label: 'Color Levels' },
      contrast: { min: 0.5, max: 2.0, step: 0.05, label: 'Contrast' }
    }
  },
  {
    type: 'motionblur',
    name: 'Motion Blur',
    defaultParameters: { intensity: 0.5, strength: 0.02, samples: 8 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      strength: { min: 0.001, max: 1.0, step: 0.001, label: 'Blur Strength' },
      samples: { min: 4, max: 16, step: 1, label: 'Sample Count' }
    }
  },
  {
    type: 'oilpainting',
    name: 'Oil Painting',
    defaultParameters: { intensity: 0.8, brushSize: 4.0, roughness: 0.6, brightness: 1.2, texture: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      brushSize: { min: 1.0, max: 12.0, step: 0.5, label: 'Brush Size' },
      roughness: { min: 0.1, max: 1.0, step: 0.05, label: 'Roughness' },
      brightness: { min: 0.5, max: 2.0, step: 0.05, label: 'Brightness' },
      texture: { min: 0.0, max: 2.0, step: 0.05, label: 'Canvas Texture' }
    }
  },
  {
    type: 'topographic',
    name: 'Topographic Lines',
    defaultParameters: { intensity: 1.0, lineSpacing: 5.0, lineWidth: 2.0, animationSpeed: 0.0, generateWires: 0, minY: 0, maxY: 100, wireOpacity: 0.8 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      lineSpacing: { min: 1.0, max: 20.0, step: 0.5, label: 'Line Spacing' },
      lineWidth: { min: 0.0, max: 8.0, step: 0.1, label: 'Line Width' },
      animationSpeed: { min: 0, max: 2.0, step: 0.1, label: 'Animation Speed' },
      generateWires: { min: 0, max: 1, step: 1, label: 'Generate Wire Geometry' },
      minY: { min: 0, max: 100, step: 1, label: 'Min Y Threshold (%)' },
      maxY: { min: 0, max: 100, step: 1, label: 'Max Y Threshold (%)' },
      wireOpacity: { min: 0.1, max: 1.0, step: 0.05, label: 'Wire Opacity' }
    }
  },
  {
    type: 'datamosh',
    name: 'Data Moshing',
    defaultParameters: { 
      intensity: 0.5, 
      displacement: 10.0, 
      corruption: 0.3, 
      blockSize: 8.0,
      glitchFreq: 0.2,
      frameBlend: 0.7 
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      displacement: { min: 0, max: 100.0, step: 1.0, label: 'Displacement' },
      corruption: { min: 0, max: 1, step: 0.01, label: 'Corruption Level' },
      blockSize: { min: 1.0, max: 32.0, step: 1.0, label: 'Block Size' },
      glitchFreq: { min: 0, max: 1, step: 0.01, label: 'Glitch Frequency' },
      frameBlend: { min: 0, max: 1, step: 0.01, label: 'Frame Blending' }
    }
  },
  {
    type: 'pixelsort',
    name: 'Pixel Sorting',
    defaultParameters: { 
      intensity: 0.5, 
      sortLength: 50, 
      threshold: 0.5, 
      direction: 0,
      sortMode: 0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      sortLength: { min: 1, max: 500, step: 1, label: 'Sort Length' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Brightness Threshold' },
      direction: { min: 0, max: 3, step: 1, label: 'Direction' },
      sortMode: { min: 0, max: 2, step: 1, label: 'Sort Mode' }
    }
  },
  {
    type: 'glow',
    name: 'Glow',
    defaultParameters: { 
      intensity: 0.5, 
      threshold: 0.8, 
      radius: 1.0, 
      strength: 2.0,
      samples: 8,
      softness: 0.5
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Brightness Threshold' },
      radius: { min: 0.1, max: 3.0, step: 0.1, label: 'Glow Radius' },
      strength: { min: 0.5, max: 5.0, step: 0.1, label: 'Glow Strength' },
      samples: { min: 4, max: 16, step: 1, label: 'Quality (Samples)' },
      softness: { min: 0.1, max: 2.0, step: 0.1, label: 'Edge Softness' }
    }
  },
  {
    type: 'pixelate',
    name: 'Pixelation',
    defaultParameters: { 
      intensity: 1.0, 
      pixelSize: 6, 
      normalEdge: 0.3, 
      depthEdge: 0.4,
      edgeMode: 0,
      smoothing: 0.5
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      pixelSize: { min: 1, max: 32, step: 1, label: 'Pixel Size' },
      normalEdge: { min: 0, max: 2, step: 0.1, label: 'Normal Edge Strength' },
      depthEdge: { min: 0, max: 1, step: 0.1, label: 'Depth Edge Strength' },
      edgeMode: { min: 0, max: 2, step: 1, label: 'Edge Mode' },
      smoothing: { min: 0, max: 1, step: 0.1, label: 'Edge Smoothing' }
    }
  },
  {
    type: 'fog',
    name: 'Distance Fog',
    defaultParameters: { 
      intensity: 0.5, 
      near: 5.0, 
      far: 50.0, 
      fogColorR: 0.8,
      fogColorG: 0.9,
      fogColorB: 1.0,
      fogMode: 0,
      yMax: 10.0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      near: { min: 0.1, max: 20.0, step: 0.1, label: 'Near Distance' },
      far: { min: 5.0, max: 200.0, step: 1.0, label: 'Far Distance' },
      fogColorR: { min: 0, max: 1, step: 0.01, label: 'Fog Red' },
      fogColorG: { min: 0, max: 1, step: 0.01, label: 'Fog Green' },
      fogColorB: { min: 0, max: 1, step: 0.01, label: 'Fog Blue' },
      fogMode: { min: 0, max: 2, step: 1, label: 'Fog Mode' },
      yMax: { min: -10.0, max: 50.0, step: 0.5, label: 'Y Max Height' }
    }
  },
  {
    type: 'dof',
    name: 'Depth of Field',
    defaultParameters: { 
      intensity: 1.0,
      focusDistance: 5.0,
      aperture: 0.1,
      maxBlur: 0.5
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      focusDistance: { min: 0.1, max: 50.0, step: 0.1, label: 'Focus Distance' },
      aperture: { min: 0.001, max: 1.0, step: 0.001, label: 'Aperture (Blur Size)' },
      maxBlur: { min: 0.0, max: 10.0, step: 0.01, label: 'Max Blur Amount' }
    }
  },
  {
    type: 'threshold',
    name: 'Threshold',
    defaultParameters: { 
      intensity: 1.0,
      threshold: 0.5,
      hardness: 1.0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Threshold' },
      hardness: { min: 0, max: 2, step: 0.1, label: 'Edge Hardness' }
    }
  }
]

export class EffectsChainManager {
  private effectsChain: EffectInstance[] = []
  private onChainUpdatedCallbacks: (() => void)[] = []
  private onEffectSelectedCallbacks: ((effectId: string | null) => void)[] = []
  private selectedEffectId: string | null = null
  private nextEffectId: number = 1

  constructor() {
    // Initialize with empty chain
  }

  // Chain management
  addEffect(effectType: EffectType, parameters?: Record<string, number>): EffectInstance {
    console.log('Adding effect:', effectType)
    const definition = EFFECT_DEFINITIONS.find(def => def.type === effectType)
    if (!definition) {
      console.error(`Unknown effect type: ${effectType}`)
      throw new Error(`Unknown effect type: ${effectType}`)
    }

    const newEffect: EffectInstance = {
      id: `effect_${this.nextEffectId++}`,
      type: effectType,
      enabled: true,
      parameters: parameters ? { ...definition.defaultParameters, ...parameters } : { ...definition.defaultParameters }
    }

    console.log('Created effect instance:', newEffect)
    this.effectsChain.push(newEffect)
    this.notifyChainUpdated()
    return newEffect
  }

  removeEffect(effectId: string): void {
    const index = this.effectsChain.findIndex(effect => effect.id === effectId)
    if (index !== -1) {
      this.effectsChain.splice(index, 1)
      if (this.selectedEffectId === effectId) {
        this.selectedEffectId = null
        this.notifyEffectSelected(null)
      }
      this.notifyChainUpdated()
    }
  }

  moveEffect(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.effectsChain.length || 
        toIndex < 0 || toIndex >= this.effectsChain.length) {
      return
    }

    const effect = this.effectsChain.splice(fromIndex, 1)[0]
    this.effectsChain.splice(toIndex, 0, effect)
    this.notifyChainUpdated()
  }

  toggleEffect(effectId: string): void {
    const effect = this.effectsChain.find(e => e.id === effectId)
    if (effect) {
      effect.enabled = !effect.enabled
      this.notifyChainUpdated()
    }
  }

  updateEffectParameter(effectId: string, parameterName: string, value: number): void {
    const effect = this.effectsChain.find(e => e.id === effectId)
    if (effect) {
      effect.parameters[parameterName] = value
      this.notifyChainUpdated()
    }
  }

  // Selection management
  selectEffect(effectId: string | null): void {
    this.selectedEffectId = effectId
    this.notifyEffectSelected(effectId)
  }

  getSelectedEffect(): EffectInstance | null {
    if (!this.selectedEffectId) return null
    return this.effectsChain.find(e => e.id === this.selectedEffectId) || null
  }

  // Getters
  getEffectsChain(): EffectInstance[] {
    return [...this.effectsChain]
  }

  clearEffects(): void {
    this.effectsChain = []
    this.notifyChainUpdated()
  }

  getEnabledEffects(): EffectInstance[] {
    return this.effectsChain.filter(effect => effect.enabled)
  }

  getEffectDefinition(effectType: EffectType): EffectDefinition | undefined {
    return EFFECT_DEFINITIONS.find(def => def.type === effectType)
  }

  getAvailableEffectTypes(): EffectType[] {
    return EFFECT_DEFINITIONS.map(def => def.type)
  }

  // Event handlers
  onChainUpdated(callback: () => void): void {
    this.onChainUpdatedCallbacks.push(callback)
  }

  onEffectSelected(callback: (effectId: string | null) => void): void {
    this.onEffectSelectedCallbacks.push(callback)
  }

  // Notification methods
  private notifyChainUpdated(): void {
    this.onChainUpdatedCallbacks.forEach(callback => callback())
  }

  private notifyEffectSelected(effectId: string | null): void {
    this.onEffectSelectedCallbacks.forEach(callback => callback(effectId))
  }

  // Utility methods
  clearChain(): void {
    this.effectsChain = []
    this.selectedEffectId = null
    this.notifyEffectSelected(null)
    this.notifyChainUpdated()
  }

  hasEffects(): boolean {
    return this.effectsChain.length > 0
  }

  hasEnabledEffects(): boolean {
    return this.effectsChain.some(effect => effect.enabled)
  }

  // Serialization for persistence
  serialize(): string {
    return JSON.stringify({
      effectsChain: this.effectsChain,
      selectedEffectId: this.selectedEffectId
    })
  }

  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data)
      this.effectsChain = parsed.effectsChain || []
      this.selectedEffectId = parsed.selectedEffectId || null
      
      // Update next ID to avoid conflicts
      const maxId = Math.max(0, ...this.effectsChain.map(e => 
        parseInt(e.id.replace('effect_', '')) || 0
      ))
      this.nextEffectId = maxId + 1
      
      this.notifyChainUpdated()
      this.notifyEffectSelected(this.selectedEffectId)
    } catch (error) {
      console.warn('Failed to deserialize effects chain:', error)
    }
  }
}