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
      resetPositions: 0
    },
    parameterDefinitions: {
      movementSpeed: { min: 0, max: 0.02, step: 0.001, label: 'Movement Speed' },
      movementRange: { min: 0, max: 500, step: 1, label: 'Movement Range (%)' },
      bounceEffect: { min: 0, max: 1, step: 1, label: 'Bounce Effect' },
      showConnections: { min: 0, max: 1, step: 1, label: 'Show Connections' },
      connectionDistance: { min: 1, max: 50, step: 1, label: 'Connection Distance' },
      maxConnections: { min: 1, max: 20, step: 1, label: 'Max Connections' },
      lineOpacity: { min: 0, max: 100, step: 5, label: 'Line Opacity (%)' },
      enableAnimation: { min: 0, max: 1, step: 1, label: 'Enable Animation' },
      resetPositions: { min: 0, max: 1, step: 1, label: 'Reset Positions' }
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
      waveFrequency: 1,
      pulseEffect: 0,
      colorCycling: 0,
      deformationEnable: 0
    },
    parameterDefinitions: {
      transparency: { min: 0, max: 100, step: 5, label: 'Transparency (%)' },
      sizeMultiplier: { min: 10, max: 500, step: 10, label: 'Size Multiplier (%)' },
      useVertexColors: { min: 0, max: 1, step: 1, label: 'Use Vertex Colors' },
      waveDeformation: { min: 0, max: 2.0, step: 0.1, label: 'Wave Deformation' },
      twistEffect: { min: 0, max: 2.0, step: 0.1, label: 'Twist Effect' },
      animationSpeed: { min: 0, max: 2.0, step: 0.1, label: 'Animation Speed' },
      waveFrequency: { min: 0.1, max: 5.0, step: 0.1, label: 'Wave Frequency' },
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
    defaultParameters: { intensity: 0.5, blurAmount: 0.002 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      blurAmount: { min: 0.0005, max: 0.02, step: 0.0005, label: 'Blur Amount' }
    }
  },
  {
    type: 'bloom',
    name: 'Bloom',
    defaultParameters: { threshold: 0.8, intensity: 1.0, radius: 0.5 },
    parameterDefinitions: {
      threshold: { min: 0, max: 1, step: 0.01, label: 'Threshold' },
      intensity: { min: 0, max: 3, step: 0.1, label: 'Intensity' },
      radius: { min: 0.1, max: 2.0, step: 0.1, label: 'Radius' }
    }
  },
  {
    type: 'film',
    name: 'Film Grain',
    defaultParameters: { intensity: 0.5, noiseSeed: 0.35 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      noiseSeed: { min: 0.1, max: 1.0, step: 0.05, label: 'Noise Seed' }
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
      strength: { min: 0.001, max: 0.1, step: 0.001, label: 'Blur Strength' },
      samples: { min: 4, max: 16, step: 1, label: 'Sample Count' }
    }
  },
  {
    type: 'oilpainting',
    name: 'Oil Painting',
    defaultParameters: { intensity: 0.8, brushSize: 4.0, roughness: 0.6, brightness: 1.2 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      brushSize: { min: 1.0, max: 12.0, step: 0.5, label: 'Brush Size' },
      roughness: { min: 0.1, max: 1.0, step: 0.05, label: 'Roughness' },
      brightness: { min: 0.5, max: 2.0, step: 0.05, label: 'Brightness' }
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
    const definition = EFFECT_DEFINITIONS.find(def => def.type === effectType)
    if (!definition) {
      throw new Error(`Unknown effect type: ${effectType}`)
    }

    const newEffect: EffectInstance = {
      id: `effect_${this.nextEffectId++}`,
      type: effectType,
      enabled: true,
      parameters: parameters ? { ...definition.defaultParameters, ...parameters } : { ...definition.defaultParameters }
    }

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