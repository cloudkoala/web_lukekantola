import type { EffectType } from './PostProcessingPass'

export interface EffectInstance {
  id: string
  type: EffectType
  enabled: boolean
  parameters: { [key: string]: number | boolean }
  blendMode?: 'normal' | 'add' | 'multiply'
}

export interface EffectDefinition {
  type: EffectType
  name: string
  defaultParameters: { [key: string]: number | boolean }
  defaultBlendMode?: 'normal' | 'add' | 'multiply'
  supportsBlending?: boolean
  parameterDefinitions: {
    [key: string]: {
      min?: number
      max?: number
      step?: number
      label: string
      type?: 'color' | 'range' | 'boolean'
    }
  }
}

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
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
      movementRange: { min: 0, max: 10, step: .001, label: 'Movement Range (%)' },
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
      transparency: { min: 0, max: 100, step: 1, label: 'Transparency (%)' },
      sizeMultiplier: { min: 10, max: 500, step: 10, label: 'Size Multiplier (%)' },
      useVertexColors: { min: 0, max: 1, step: 1, label: 'Use Vertex Colors' },
      waveDeformation: { min: 0, max: 2.0, step: 0.01, label: 'Wave Deformation' },
      twistEffect: { min: 0, max: 2.0, step: 0.01, label: 'Twist Effect' },
      animationSpeed: { min: 0, max: 2.0, step: 0.01, label: 'Animation Speed' },
      waveFrequency: { min: 0.1, max: 20.0, step: 0.01, label: 'Wave Frequency' },
      pulseEffect: { min: 0, max: 1, step: 1, label: 'Pulse Effect' },
      colorCycling: { min: 0, max: 1, step: 1, label: 'Color Cycling' },
      deformationEnable: { min: 0, max: 1, step: 1, label: 'Enable Deformation' }
    }
  },
  {
    type: 'randomscale',
    name: 'Random Scale',
    defaultParameters: { 
      intensity: 0,
      randomSeed: 42,
      luminanceInfluence: 0,
      thresholdLow: 0,
      thresholdHigh: 1
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 10, step: 0.1, label: 'Scale Variation (0-10x)' },
      randomSeed: { min: 0, max: 1000, step: 1, label: 'Random Seed' },
      luminanceInfluence: { min: -1, max: 1, step: 0.1, label: 'Luminance Influence (+bright, -dark)' },
      thresholdLow: { min: 0, max: 1, step: 0.01, label: 'Dark Threshold (0 scale)' },
      thresholdHigh: { min: 0, max: 1, step: 0.01, label: 'Bright Threshold (1 scale)' }
    }
  },
  {
    type: 'gamma',
    name: 'Color Correction',
    supportsBlending: false,
    defaultParameters: { 
      intensity: 1.0,
      gamma: 1.0,
      brightness: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      exposure: 0.0,
      hue: 0.0,
      lightness: 0.0,
      shadows: 0.0,
      highlights: 0.0,
      blackLevel: 0.0,
      whiteLevel: 1.0,
      temperature: 0.0,
      tint: 0.0
    },
    parameterDefinitions: {
      intensity: { min: 0.0, max: 1.0, step: 0.01, label: 'Intensity' },
      gamma: { min: 0.1, max: 5.0, step: 0.1, label: 'Gamma' },
      brightness: { min: 0.0, max: 3.0, step: 0.1, label: 'Brightness' },
      contrast: { min: 0.0, max: 3.0, step: 0.1, label: 'Contrast' },
      saturation: { min: 0.0, max: 3.0, step: 0.1, label: 'Saturation' },
      exposure: { min: -3.0, max: 3.0, step: 0.1, label: 'Exposure' },
      hue: { min: -180, max: 180, step: 1, label: 'Hue' },
      lightness: { min: -100, max: 100, step: 1, label: 'Lightness' },
      shadows: { min: -100, max: 100, step: 1, label: 'Shadows' },
      highlights: { min: -100, max: 100, step: 1, label: 'Highlights' },
      blackLevel: { min: 0.0, max: 1.0, step: 0.01, label: 'Black Level' },
      whiteLevel: { min: 0.0, max: 1.0, step: 0.01, label: 'White Level' },
      temperature: { min: -100, max: 100, step: 1, label: 'Temperature' },
      tint: { min: -100, max: 100, step: 1, label: 'Tint' }
    }
  },
  {
    type: 'sepia',
    name: 'Sepia',
    supportsBlending: true,
    defaultParameters: { intensity: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' }
    }
  },
  {
    type: 'vignette',
    name: 'Vignette',
    supportsBlending: true,
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
    supportsBlending: true,
    defaultParameters: { intensity: 0.5, blurAmount: 0.002, threshold: 0.0, blurType: 0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      blurAmount: { min: 0.0005, max: 0.5, step: 0.0005, label: 'Amount' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Brightness Threshold' },
      blurType: { min: 0, max: 5, step: 1, label: 'Type' }
    }
  },
  {
    type: 'bloom',
    name: 'Bloom',
    supportsBlending: true,
    defaultBlendMode: 'add',
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
    supportsBlending: true,
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
    supportsBlending: true,
    defaultParameters: { intensity: 0.5, colorR: 1.0, colorG: 0.5, colorB: 0.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      colorR: { min: 0, max: 1, step: 0.01, label: 'Red' },
      colorG: { min: 0, max: 1, step: 0.01, label: 'Green' },
      colorB: { min: 0, max: 1, step: 0.01, label: 'Blue' }
    }
  },
  {
    type: 'splittone',
    name: 'Split Tone',
    defaultParameters: { 
      intensity: 1.0,
      color1: 0x000000, // Shadows
      color2: 0xFFFFFF, // Highlights
      smoothness: 1.0,
      contrast: 1.0,
      midpoint: 0.5
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      color1: { min: 0, max: 16777215, step: 1, label: 'Shadow Color', type: 'color' },
      color2: { min: 0, max: 16777215, step: 1, label: 'Highlight Color', type: 'color' },
      smoothness: { min: 0.1, max: 3.0, step: 0.1, label: 'Transition Smoothness' },
      contrast: { min: 0.1, max: 3.0, step: 0.1, label: 'Luminance Contrast' },
      midpoint: { min: 0.0, max: 1.0, step: 0.01, label: 'Gradient Midpoint' }
    }
  },
  {
    type: 'gradient',
    name: 'Gradient',
    supportsBlending: true,
    defaultParameters: { 
      intensity: 1.0,
      gradientColor: 0x000000, // Black by default
      useBackgroundColor: 0, // 0 = use gradientColor, 1 = use background color
      backgroundMode: 0, // 0 = overlay, 1 = behind geometry
      angle: 0.0, // Angle in degrees (0-360)
      startDistance: 0.0,
      endDistance: 1.0,
      feather: 0.1
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      gradientColor: { min: 0, max: 16777215, step: 1, label: 'Gradient Color', type: 'color' },
      useBackgroundColor: { min: 0, max: 1, step: 1, label: 'Use Background Color' },
      backgroundMode: { min: 0, max: 1, step: 1, label: 'Background Mode (0=Overlay, 1=Behind)' },
      angle: { min: 0, max: 360, step: 1, label: 'Angle (degrees)' },
      startDistance: { min: 0.0, max: 1.0, step: 0.01, label: 'Start Distance' },
      endDistance: { min: 0.0, max: 2.0, step: 0.01, label: 'End Distance' },
      feather: { min: 0.01, max: 5.0, step: 0.01, label: 'Feather Amount' }
    }
  },
  {
    type: 'posterize',
    name: 'Posterize',
    defaultParameters: { 
      intensity: 1.0,
      levels: 8, // Number of color levels per channel
      blackAndWhite: 0, // 0 = color posterize, 1 = black and white posterize
      gamma: 1.0, // Gamma correction before posterization
      smoothness: 0.0 // Smoothness of level transitions (0 = hard, 1 = smooth)
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      levels: { min: 2, max: 32, step: 1, label: 'Color Levels' },
      blackAndWhite: { min: 0, max: 1, step: 1, label: 'Black & White Mode' },
      gamma: { min: 0.1, max: 3.0, step: 0.1, label: 'Gamma Correction' },
      smoothness: { min: 0.0, max: 1.0, step: 0.01, label: 'Edge Smoothness' }
    }
  },
  {
    type: 'noise2d',
    name: '2D Noise',
    supportsBlending: true,
    defaultParameters: { 
      intensity: 0.5,
      scale: 10.0, // Noise scale/frequency
      timeSpeed: 1.0, // Time evolution speed
      noiseType: 0, // 0 = regular noise, 1 = fractal noise, 2 = ridged noise
      octaves: 3, // Number of octaves for fractal noise
      persistence: 0.5, // Amplitude falloff for each octave
      lacunarity: 2.0, // Frequency multiplier for each octave
      backgroundMode: 0, // 0 = overlay, 1 = behind geometry
      colorR: 1.0, // Noise color red component
      colorG: 1.0, // Noise color green component
      colorB: 1.0, // Noise color blue component
      contrast: 1.0, // Noise contrast
      brightness: 0.0, // Noise brightness offset
      animated: 1, // 0 = static, 1 = animated
      angle: 0.0, // Animation direction angle in degrees
      evolution: 1.0 // Evolution speed through 3D noise space
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      scale: { min: 1.0, max: 100.0, step: 0.5, label: 'Noise Scale' },
      timeSpeed: { min: 0.0, max: 5.0, step: 0.1, label: 'Animation Speed' },
      noiseType: { min: 0, max: 2, step: 1, label: 'Noise Type (0=Regular, 1=Fractal, 2=Ridged)' },
      octaves: { min: 1, max: 8, step: 1, label: 'Fractal Octaves' },
      persistence: { min: 0.1, max: 1.0, step: 0.1, label: 'Fractal Persistence' },
      lacunarity: { min: 1.0, max: 4.0, step: 0.1, label: 'Fractal Lacunarity' },
      backgroundMode: { min: 0, max: 1, step: 1, label: 'Background Mode (0=Overlay, 1=Behind)' },
      colorR: { min: 0, max: 1, step: 0.01, label: 'Red Component' },
      colorG: { min: 0, max: 1, step: 0.01, label: 'Green Component' },
      colorB: { min: 0, max: 1, step: 0.01, label: 'Blue Component' },
      contrast: { min: 0.1, max: 3.0, step: 0.1, label: 'Contrast' },
      brightness: { min: -1.0, max: 1.0, step: 0.01, label: 'Brightness' },
      animated: { min: 0, max: 1, step: 1, label: 'Animated' },
      angle: { min: 0, max: 360, step: 1, label: 'Animation Angle (degrees)' },
      evolution: { min: 0.0, max: 5.0, step: 0.1, label: 'Evolution Speed' }
    }
  },
  {
    type: 'skysphere',
    name: 'Sky Sphere',
    defaultParameters: { 
      intensity: 1.0,
      scale: 500.0, // Sphere scale/radius
      noiseScale: 10.0, // Noise frequency on sphere
      timeSpeed: 1.0, // Time evolution speed
      noiseType: 0, // 0 = regular, 1 = fractal, 2 = ridged
      octaves: 3, // Fractal octaves
      persistence: 0.5, // Fractal persistence
      lacunarity: 2.0, // Fractal lacunarity
      colorR: 0.5, // Sphere color red
      colorG: 0.7, // Sphere color green
      colorB: 1.0, // Sphere color blue
      contrast: 1.0, // Noise contrast
      brightness: 0.0, // Noise brightness
      animated: 1, // Enable time animation
      opacity: 1.0, // Sphere opacity
      renderBehind: 1, // Render behind geometry
      angle: 0.0, // Animation direction angle in degrees
      evolution: 1.0 // Evolution speed through 3D noise space
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      scale: { min: 5.0, max: 200.0, step: 1.0, label: 'Sphere Scale' },
      noiseScale: { min: 0.1, max: 50.0, step: 0.1, label: 'Noise Scale' },
      timeSpeed: { min: 0.0, max: 5.0, step: 0.1, label: 'Animation Speed' },
      noiseType: { min: 0, max: 2, step: 1, label: 'Noise Type (0=Regular, 1=Fractal, 2=Ridged)' },
      octaves: { min: 1, max: 8, step: 1, label: 'Fractal Octaves' },
      persistence: { min: 0.1, max: 1.0, step: 0.1, label: 'Fractal Persistence' },
      lacunarity: { min: 1.0, max: 4.0, step: 0.1, label: 'Fractal Lacunarity' },
      colorR: { min: 0, max: 1, step: 0.01, label: 'Red Component' },
      colorG: { min: 0, max: 1, step: 0.01, label: 'Green Component' },
      colorB: { min: 0, max: 1, step: 0.01, label: 'Blue Component' },
      contrast: { min: 0.1, max: 3.0, step: 0.1, label: 'Contrast' },
      brightness: { min: -1.0, max: 1.0, step: 0.01, label: 'Brightness' },
      animated: { min: 0, max: 1, step: 1, label: 'Animated' },
      opacity: { min: 0.0, max: 1.0, step: 0.01, label: 'Opacity' },
      renderBehind: { min: 0, max: 1, step: 1, label: 'Render Behind Geometry' },
      angle: { min: 0, max: 360, step: 1, label: 'Animation Angle (degrees)' },
      evolution: { min: 0.0, max: 5.0, step: 0.1, label: 'Evolution Speed' }
    }
  },
  {
    type: 'sinradius',
    name: 'Sin Wave Radius',
    defaultParameters: { 
      intensity: 1.0,
      minRadius: 0.5, // Minimum radius multiplier
      maxRadius: 2.0, // Maximum radius multiplier
      period: 2.0, // Period in seconds for one complete cycle
      frequency: 1.0, // Frequency multiplier (higher = faster oscillation)
      phase: 0.0, // Phase offset in radians (0 to 2π)
      waveType: 0, // 0 = sin, 1 = cos, 2 = triangle, 3 = square
      affectSpheres: 1, // Affect sphere instances
      affectPoints: 1, // Affect point clouds
      smoothing: 0.1, // Smoothing factor for non-sin waves
      animated: 1, // Enable time animation
      syncToTime: 1 // Sync to global time vs independent timer
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      minRadius: { min: 0.1, max: 2.0, step: 0.1, label: 'Min Radius Multiplier' },
      maxRadius: { min: 0.5, max: 5.0, step: 0.1, label: 'Max Radius Multiplier' },
      period: { min: 0.1, max: 10.0, step: 0.1, label: 'Period (seconds)' },
      frequency: { min: 0.1, max: 5.0, step: 0.1, label: 'Frequency Multiplier' },
      phase: { min: 0.0, max: 6.28, step: 0.1, label: 'Phase Offset (radians)' },
      waveType: { min: 0, max: 3, step: 1, label: 'Wave Type (0=Sin, 1=Cos, 2=Triangle, 3=Square)' },
      affectSpheres: { min: 0, max: 1, step: 1, label: 'Affect Spheres' },
      affectPoints: { min: 0, max: 1, step: 1, label: 'Affect Point Clouds' },
      smoothing: { min: 0.0, max: 1.0, step: 0.01, label: 'Wave Smoothing' },
      animated: { min: 0, max: 1, step: 1, label: 'Animated' },
      syncToTime: { min: 0, max: 1, step: 1, label: 'Sync to Global Time' }
    }
  },
  {
    type: 'sobel',
    name: 'Sobel Edge Detection',
    supportsBlending: true,
    defaultParameters: { intensity: 0.5 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' }
    }
  },
  {
    type: 'sobelthreshold',
    name: 'Sobel with Threshold',
    supportsBlending: true,
    defaultParameters: { intensity: 0.5, threshold: 0.1 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Threshold' }
    }
  },
  {
    type: 'ascii',
    name: 'ASCII Dithering',
    supportsBlending: true,
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
    supportsBlending: true,
    defaultParameters: { intensity: 1, dotSize: 4, contrast: 1.2 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      dotSize: { min: 2, max: 32, step: 0.5, label: 'Dot Size' },
      contrast: { min: 0, max: 2.0, step: 0.05, label: 'Contrast' }
    }
  },
  {
    type: 'circlepacking',
    name: 'Circle Packing',
    supportsBlending: true,
    defaultBlendMode: 'normal',
    defaultParameters: { 
      intensity: 1.0, 
      packingDensity: 281, 
      minCircleSize: 2.56, 
      maxCircleSize: 151.7, 
      circleSpacing: 1.0, 
      randomSeed: Math.floor(Math.random() * 1000),
      backgroundOpacity: 1.0,
      backgroundColor: 0,
      // Physics simulation parameters
      useVerletPhysics: 0,
      gravity: 0.1,
      damping: 0.8,
      substeps: 10,
      physicsIterations: 28,
      // Spatial optimization parameters
      usePhysicsPlacement: 1,
      // Animation parameters
      animatePhysics: 1,
      animationSpeed: 1.0,
      // Progressive growth parameters
      enableProgressiveGrowth: 1,
      growthRate: 0.5,
      startSizeMultiplier: 0.3
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      packingDensity: { min: 4, max: 1000, step: 1, label: 'Packing Density' },
      minCircleSize: { min: 1.5, max: 15.0, step: 0.01, label: 'Min Circle Size' },
      maxCircleSize: { min: 9.0, max: 300.0, step: 0.1, label: 'Max Circle Size' },
      circleSpacing: { min: 0.5, max: 2.0, step: 0.1, label: 'Circle Spacing' },
      randomSeed: { min: 0, max: 1000, step: 1, label: 'Random Seed' },
      backgroundOpacity: { min: 0, max: 1, step: 0.01, label: 'Background Opacity' },
      backgroundColor: { min: 0, max: 16777215, step: 1, label: 'Background Color', type: 'color' },
      // Physics simulation parameter definitions
      useVerletPhysics: { min: 0, max: 1, step: 1, label: 'Enable Verlet Physics', type: 'boolean' },
      gravity: { min: 0, max: 1.0, step: 0.01, label: 'Gravity Strength' },
      damping: { min: 0.8, max: 1.0, step: 0.01, label: 'Velocity Damping' },
      substeps: { min: 1, max: 40, step: 1, label: 'Physics Substeps' },
      physicsIterations: { min: 5, max: 200, step: 1, label: 'Physics Iterations' },
      // Spatial optimization parameter definitions
      usePhysicsPlacement: { min: 0, max: 1, step: 1, label: 'Physics-Based Placement', type: 'boolean' },
      // Animation parameter definitions
      animatePhysics: { min: 0, max: 1, step: 1, label: 'Animate Physics', type: 'boolean' },
      animationSpeed: { min: 0.1, max: 3.0, step: 0.1, label: 'Animation Speed' },
      // Progressive growth parameter definitions
      enableProgressiveGrowth: { min: 0, max: 1, step: 1, label: 'Enable Progressive Growth', type: 'boolean' },
      growthRate: { min: 0.1, max: 2.0, step: 0.1, label: 'Growth Rate' },
      startSizeMultiplier: { min: 0.1, max: 1.0, step: 0.1, label: 'Starting Size (× Target)' }
    }
  },
  {
    type: 'motionblur',
    name: 'Motion Blur',
    supportsBlending: true,
    defaultParameters: { 
      intensity: 0.8, 
      strength: 0.1, 
      samples: 12,
      maxVelocity: 32.0,
      velocityScale: 2.0,
      enableSphereMotion: 0,
      debugVelocity: 0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      strength: { min: 0.001, max: 1.0, step: 0.001, label: 'Blur Strength' },
      samples: { min: 4, max: 16, step: 1, label: 'Sample Count' },
      maxVelocity: { min: 8, max: 128, step: 1, label: 'Max Velocity (pixels)' },
      velocityScale: { min: 0.1, max: 5.0, step: 0.1, label: 'Velocity Scale' },
      enableSphereMotion: { min: 0, max: 1, step: 1, label: 'Enable Sphere Motion', type: 'boolean' },
      debugVelocity: { min: 0, max: 1, step: 1, label: 'Show Velocity Buffer', type: 'boolean' }
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
    defaultParameters: { intensity: 1.0, lineSpacing: 5.0, lineWidth: 2.0, animationSpeed: 0.0, generateWires: 0, minY: 0, maxY: 100, wireOpacity: 0.8, maxSegmentLength: 2.0 },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      lineSpacing: { min: 1.0, max: 20.0, step: 0.5, label: 'Line Spacing' },
      lineWidth: { min: 0.0, max: 8.0, step: 0.1, label: 'Line Width' },
      animationSpeed: { min: 0, max: 2.0, step: 0.1, label: 'Animation Speed' },
      generateWires: { min: 0, max: 1, step: 1, label: 'Generate Wire Geometry' },
      minY: { min: 0, max: 100, step: 1, label: 'Min Y Threshold (%)' },
      maxY: { min: 0, max: 100, step: 1, label: 'Max Y Threshold (%)' },
      wireOpacity: { min: 0.1, max: 1.0, step: 0.05, label: 'Wire Opacity' },
      maxSegmentLength: { min: 0.5, max: 20.0, step: 0.5, label: 'Cull Long Segments (%)' }
    }
  },
  {
    type: 'zdepth',
    name: 'Z-Depth',
    defaultParameters: { 
      intensity: 1.0,
      near: 1.0,
      far: 10.0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      near: { min: 0, max: 50, step: 0.1, label: 'Near Plane' },
      far: { min: 0, max: 50, step: 0.1, label: 'Far Plane' }
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
    supportsBlending: true,
    defaultBlendMode: 'add',
    defaultParameters: { 
      intensity: 1.0, 
      threshold: 0.8, 
      thresholdSoftness: 0.05,
      radius: 1.0, 
      strength: 2.0,
      softness: 0.5,
      iterations: 1
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 2, step: 0.01, label: 'Intensity' },
      threshold: { min: 0, max: 1, step: 0.01, label: 'Brightness Threshold' },
      thresholdSoftness: { min: 0.001, max: 0.2, step: 0.001, label: 'Threshold Softness' },
      radius: { min: 0.1, max: 5.0, step: 0.1, label: 'Glow Radius' },
      strength: { min: 0.1, max: 10.0, step: 0.1, label: 'Glow Strength' },
      softness: { min: 0.1, max: 3.0, step: 0.1, label: 'Edge Softness' },
      iterations: { min: 1, max: 5, step: 1, label: 'Iterations' }
    }
  },
  {
    type: 'voronoi',
    name: 'Voronoi Noise',
    supportsBlending: true,
    defaultParameters: { 
      intensity: 1.0,
      cellDensity: 100,
      lineOpacity: 0.5,
      colorR: 1.0,
      colorG: 1.0,
      colorB: 1.0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      cellDensity: { min: 10, max: 500, step: 10, label: 'Cell Density' },
      lineOpacity: { min: 0, max: 1, step: 0.01, label: 'Line Opacity' },
      colorR: { min: 0, max: 1, step: 0.01, label: 'Color Red', type: 'color' },
      colorG: { min: 0, max: 1, step: 0.01, label: 'Color Green', type: 'color' },
      colorB: { min: 0, max: 1, step: 0.01, label: 'Color Blue', type: 'color' }
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
    supportsBlending: true,
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
  },
  {
    type: 'engraving',
    name: 'Engraving',
    supportsBlending: true,
    defaultParameters: { 
      intensity: 1.0,
      angle: 90.0,
      minWidth: 0.0,
      maxWidth: 1.0,
      detail: 45.0,
      lineSpacing: 13.0,
      interpolationMode: 3.0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      angle: { min: 0, max: 360, step: 5, label: 'Line Angle (degrees)' },
      minWidth: { min: 0, max: 50, step: 0.1, label: 'Minimum Width (px)' },
      maxWidth: { min: 0, max: 2, step: 0.01, label: 'Maximum Width (× Line Spacing)' },
      detail: { min: 1.0, max: 256.0, step: 1.0, label: 'Detail Level' },
      lineSpacing: { min: 1.0, max: 50.0, step: 0.1, label: 'Line Spacing (px)' },
      interpolationMode: { min: 0, max: 4, step: 1, label: 'Interpolation (0=None, 1=Linear, 2=Smooth, 3=Cubic, 4=Ultra)' }
    }
  },
  {
    type: 'gaussianblur',
    name: 'Gaussian Blur',
    supportsBlending: true,
    defaultParameters: { 
      blurAmount: 1.0,
      radius: 5,
      iterations: 1
    },
    parameterDefinitions: {
      blurAmount: { min: 0, max: 10, step: 0.1, label: 'Blur Amount' },
      radius: { min: 1, max: 50, step: 1, label: 'Radius' },
      iterations: { min: 1, max: 10, step: 1, label: 'Iterations' }
    }
  },
  {
    type: 'ambientocclusion',
    name: 'Ambient Occlusion (SSAO)',
    supportsBlending: true,
    defaultParameters: { 
      intensity: 0.5,
      radius: 2.0,
      strength: 1.5,
      bias: 0.05,
      samples: 16,
      quality: 2,
      aoOnly: 0,
      debugDepth: 0
    },
    parameterDefinitions: {
      intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
      radius: { min: 0.1, max: 10.0, step: 0.1, label: 'Sample Radius (world units)' },
      strength: { min: 0.1, max: 5.0, step: 0.1, label: 'AO Strength' },
      bias: { min: 0.001, max: 0.2, step: 0.001, label: 'Depth Bias' },
      samples: { min: 4, max: 64, step: 1, label: 'Sample Count' },
      quality: { min: 1, max: 4, step: 1, label: 'Quality Levels' },
      aoOnly: { min: 0, max: 1, step: 1, label: 'Show AO Only', type: 'boolean' },
      debugDepth: { min: 0, max: 1, step: 1, label: 'Debug: Show Depth Buffer', type: 'boolean' }
    }
  }
]

export class EffectsChainManager {
  private effectsChain: EffectInstance[] = []
  private onChainUpdatedCallbacks: (() => void)[] = []
  private onEffectSelectedCallbacks: ((effectId: string | null) => void)[] = []
  private onParameterUpdatedCallbacks: ((effectId: string, parameterName: string, value: number) => void)[] = []
  private selectedEffectId: string | null = null
  private nextEffectId: number = 1
  private lastAddedEffectId: string | null = null
  private isLoadingFromScene: boolean = false

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
      parameters: parameters ? { ...definition.defaultParameters, ...parameters } : { ...definition.defaultParameters },
      blendMode: definition.defaultBlendMode || 'normal'
    }

    console.log('Created effect instance:', newEffect)
    this.effectsChain.push(newEffect)
    
    // Only track for auto-expansion if not loading from scene/preset
    if (!this.isLoadingFromScene) {
      this.lastAddedEffectId = newEffect.id
    }
    
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
      this.notifyParameterUpdated(effectId, parameterName, value)
    }
  }

  updateEffectBlendMode(effectId: string, blendMode: 'normal' | 'add' | 'multiply'): void {
    const effect = this.effectsChain.find(e => e.id === effectId)
    if (effect) {
      effect.blendMode = blendMode
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
    this.lastAddedEffectId = null
    this.notifyChainUpdated()
  }

  resetEffect(effectId: string): void {
    const effect = this.effectsChain.find(e => e.id === effectId)
    if (!effect) return

    const definition = this.getEffectDefinition(effect.type)
    if (!definition) return

    // Reset parameters to default values
    effect.parameters = { ...definition.defaultParameters }
    
    this.notifyChainUpdated()
    this.notifyParameterUpdated(effectId, 'reset', 0) // Notify parameter update
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

  onParameterUpdated(callback: (effectId: string, parameterName: string, value: number) => void): void {
    this.onParameterUpdatedCallbacks.push(callback)
  }

  // Notification methods
  private notifyChainUpdated(): void {
    this.onChainUpdatedCallbacks.forEach(callback => callback())
  }

  private notifyEffectSelected(effectId: string | null): void {
    this.onEffectSelectedCallbacks.forEach(callback => callback(effectId))
  }

  private notifyParameterUpdated(effectId: string, parameterName: string, value: number): void {
    this.onParameterUpdatedCallbacks.forEach(callback => callback(effectId, parameterName, value))
  }

  // Utility methods
  clearChain(): void {
    this.effectsChain = []
    this.selectedEffectId = null
    this.lastAddedEffectId = null
    this.notifyEffectSelected(null)
    this.notifyChainUpdated()
  }

  hasEffects(): boolean {
    return this.effectsChain.length > 0
  }

  getLastAddedEffectId(): string | null {
    return this.lastAddedEffectId
  }

  clearLastAddedEffectId(): void {
    this.lastAddedEffectId = null
  }

  setLoadingFromScene(loading: boolean): void {
    this.isLoadingFromScene = loading
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
      this.lastAddedEffectId = null // Don't auto-expand when loading from scenes
      
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