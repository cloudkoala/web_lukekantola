# Creating New Post-Processing Effects Guide

A comprehensive step-by-step guide for adding new effects to the Gaussian Splat Showcase post-processing system.

## Overview

The post-processing system uses a modular architecture with effects chaining, where each effect can be independently added, configured, and combined with others. Effects are processed using GPU shaders and support real-time parameter adjustment.

## Effect Types

The system supports several types of effects:

1. **Shader-Based Effects**: GPU fragment shader effects (sepia, blur, etc.)
2. **Dithering Effects**: Specialized rendering passes (ASCII, halftone, **circle packing**, etc.)
3. **Geometry Effects**: 3D point cloud manipulations (material, network, etc.)
4. **Scene Effects**: Background and rendering control effects

This guide focuses on **Shader-Based Effects** as they are the most common and straightforward to implement.

## Required Files to Modify

When adding a new shader-based effect, you need to modify these files:

1. **`src/effects/EffectsChainManager.ts`** - Effect definition and parameters
2. **`src/effects/PostProcessingPass.ts`** - Effect implementation and rendering
3. **`src/main.ts`** - Mobile categorization (for mobile selector overlay)
4. **`PostProcess.md`** - Documentation (optional but recommended)

## Step-by-Step Implementation

### Step 1: Add Effect Type Definition

**File:** `src/effects/PostProcessingPass.ts`

Add your new effect type to the `EffectType` union:

```typescript
export type EffectType = 'none' | 'background' | /* ... existing types ... */ | 'yourneweffect'
```

### Step 2: Define Effect in Effects Chain Manager

**File:** `src/effects/EffectsChainManager.ts`

Add your effect definition to the `EFFECT_DEFINITIONS` array:

```typescript
{
  type: 'yourneweffect',
  name: 'Your New Effect',
  defaultParameters: { 
    intensity: 0.5,
    customParam1: 1.0,
    customParam2: 0.0
  },
  parameterDefinitions: {
    intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
    customParam1: { min: 0, max: 2, step: 0.1, label: 'Custom Parameter 1' },
    customParam2: { min: -1, max: 1, step: 0.05, label: 'Custom Parameter 2' }
  }
}
```

**Parameter Definition Properties:**
- `min`: Minimum value for the parameter
- `max`: Maximum value for the parameter  
- `step`: Step size for UI controls
- `label`: Human-readable label for the UI

### Step 3: Add Effect Type Index

**File:** `src/effects/PostProcessingPass.ts`

In the `getEffectTypeIndexFromType()` method, add your effect case:

```typescript
case 'yourneweffect': return 23  // Use next available number
```

### Step 4: Add Shader Uniforms

**File:** `src/effects/PostProcessingPass.ts`

In the constructor, add uniforms for your effect parameters:

```typescript
// In the uniforms object
yourEffectParam1: { value: 1.0 },
yourEffectParam2: { value: 0.0 },
// Add more as needed
```

### Step 5: Add Parameter Handling

**File:** `src/effects/PostProcessingPass.ts`

In the `renderSingleEffectFromInstance()` method, add a case for your effect:

```typescript
case 'yourneweffect':
  this.material.uniforms.yourEffectParam1.value = effect.parameters.customParam1 ?? 1.0
  this.material.uniforms.yourEffectParam2.value = effect.parameters.customParam2 ?? 0.0
  break
```

### Step 6: Add Shader Uniforms Declaration

**File:** `src/effects/PostProcessingPass.ts`

In the `getFragmentShader()` method, add uniform declarations:

```glsl
uniform float yourEffectParam1;
uniform float yourEffectParam2;
// Add after existing uniforms, before "varying vec2 vUv;"
```

### Step 7: Implement Shader Function

**File:** `src/effects/PostProcessingPass.ts`

Add your effect function in the fragment shader (before the main function):

```glsl
// Your New Effect
vec3 yourNewEffect(vec3 color, vec2 uv) {
  // Implement your effect logic here
  // Example: simple color tinting
  vec3 tintedColor = color * vec3(yourEffectParam1, 1.0, yourEffectParam2);
  return mix(color, tintedColor, intensity);
}
```

### Step 8: Add Effect Application

**File:** `src/effects/PostProcessingPass.ts`

In the main function of the fragment shader, add your effect case:

```glsl
} else if (effectType == 23) {  // Use your effect type index
  // Your New Effect
  color = yourNewEffect(color, vUv);
}
```

### Step 9: Add Effect Categorization

**Files:** `src/main.ts` (mobile) and `src/interface/EffectsPanel.ts` (desktop)

Both mobile and desktop use categorization. Add your effect to the appropriate category in both files:

**Mobile:** Find the `categories` object in the `showMobileEffectSelector()` function in `src/main.ts` (collapsible sections)

**Desktop:** Find the `categories` object in the `createAddEffectModal()` function in `src/interface/EffectsPanel.ts` (simple dividers)

```javascript
const categories = {
  'Color': {
    color: '#FF6B6B',
    effects: ['background', 'gamma', 'sepia', 'colorify', 'yourneweffect', 'invert', 'bleachbypass']
  },
  // ... other categories
}
```

**Available Categories:**
- **Color** (#FF6B6B) - Color processing effects
- **Blur** (#4ECDC4) - Blur and glow effects  
- **Grain** (#45B7D1) - Noise and texture effects
- **Post-Process** (#96CEB4) - Image processing effects
- **3D Effects** (#FECA57) - Geometry manipulation effects
- **In Development** (#888888) - Experimental effects

## Effect Function Patterns

### Basic Color Processing
```glsl
vec3 yourEffect(vec3 color, vec2 uv) {
  // Process color channels
  vec3 processedColor = someOperation(color);
  
  // Blend with original using intensity
  return mix(color, processedColor, intensity);
}
```

### UV-Based Effects
```glsl
vec3 yourEffect(vec3 color, vec2 uv) {
  // Use UV coordinates for spatial effects
  float factor = distance(uv, vec2(0.5)); // Distance from center
  vec3 modifiedColor = color * factor;
  
  return mix(color, modifiedColor, intensity);
}
```

### Time-Based Animation
```glsl
vec3 yourEffect(vec3 color, vec2 uv) {
  // Use time uniform for animation
  float animatedFactor = sin(time * speed + uv.x * frequency);
  vec3 animatedColor = color + vec3(animatedFactor * 0.1);
  
  return mix(color, animatedColor, intensity);
}
```

### Luminance-Preserving Effects
```glsl
vec3 yourEffect(vec3 color, vec2 uv) {
  // Preserve original brightness
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 newColor = someColorTransformation();
  
  // Scale by original luminance
  newColor = newColor * luminance;
  
  return mix(color, newColor, intensity);
}
```

## Available Shader Utilities

The fragment shader provides several utility functions you can use:

- `random(vec2)` - Pseudo-random number generation
- `blur(sampler2D, vec2, vec2, float, float, float)` - Multi-type blur function
- Standard GLSL functions: `mix()`, `clamp()`, `smoothstep()`, `sin()`, `cos()`, etc.

## Available Uniforms

Your effect has access to these uniforms:

- `tDiffuse` - Input texture
- `resolution` - Screen resolution (vec2)
- `time` - Current time for animation
- `intensity` - Effect intensity (0-1)
- All effect-specific uniforms you define

## Testing Your Effect

1. **Build the project**: `npm run build`
2. **Run development server**: `npm run dev`
3. **Add your effect** through the Effects Panel dropdown (desktop) or category selector (mobile)
4. **Adjust parameters** in real-time
5. **Test effect chaining** with other effects
6. **Test mobile categorization** by viewing on mobile device or using browser dev tools

## Best Practices

### Performance
- Use `mix()` for blending instead of manual interpolation
- Minimize texture lookups in loops
- Use `smoothstep()` instead of `if` statements when possible
- Avoid divisions by using multiplication with reciprocals

### Code Quality
- Follow existing naming conventions
- Add descriptive comments for complex algorithms
- Use meaningful parameter names
- Test edge cases (intensity = 0, intensity = 1)

### User Experience
- Provide sensible default parameters
- Use intuitive parameter ranges (0-100% instead of 0-1 when appropriate)
- Add helpful parameter labels
- Consider the effect's visual impact at different intensities

### Shader Compatibility
- Use WebGL 1.0 compatible GLSL
- Use `mediump` precision for mobile compatibility
- Avoid vendor-specific extensions
- Test on different hardware configurations

## Advanced Features

### Multi-Pass Effects
For complex effects requiring multiple rendering passes:

1. Create additional render targets
2. Implement multi-pass rendering in `renderSingleEffectFromInstance()`
3. Use ping-pong buffers for iterative processing

### Custom Dithering Effects
For specialized dithering algorithms like the **Circle Packing Effect**:

1. Create a new dithering pass class (see `CirclePackingPass.ts`, `HalftoneDitheringPass.ts`, `ASCIIDitheringPass.ts`)
2. Add it to the `PostProcessingPass` constructor
3. Handle it in `renderDitheringEffect()` method
4. Implement shader-based circle packing algorithms for color grouping and posterization

### Geometry Effects
For effects that modify 3D geometry:

1. Create methods similar to `applyMaterialEffect()`
2. Handle in `renderSingleEffectFromInstance()`
3. Manage geometry state and cleanup

## Common Issues and Solutions

### Effect Not Appearing
- Check effect type index is unique and sequential
- Verify uniform declarations match parameter names
- Ensure effect case is added to main shader logic

### Parameter Changes Not Working
- Verify parameter names match between definition and uniform setting
- Check parameter ranges and default values
- Ensure nullish coalescing (`??`) is used for parameter fallbacks

### Performance Issues
- Reduce texture sampling frequency
- Optimize shader math operations
- Consider reducing effect quality on lower-end devices

### Visual Artifacts
- Check UV coordinate bounds (0-1 range)
- Verify color channel clamping (0-1 range)
- Test with extreme parameter values

## Example: Circle Packing Dithering Effect

Here's a real-world example of the **Circle Packing Effect** - a specialized dithering effect that combines posterization with circle packing algorithms:

### Implementation Overview
The Circle Packing effect creates a unique artistic style by:
1. **Posterizing colors** into distinct levels (2-16 levels)
2. **Grouping similar colors** using tolerance thresholds
3. **Packing circles** within each color region using grid-based algorithms
4. **Varying circle sizes** based on luminance intensity

### 1. Pass Class Structure
```typescript
// CirclePackingPass.ts - Specialized dithering pass
export class CirclePackingPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  
  // Circle packing parameters
  public intensity: number = 0.8
  public packingDensity: number = 12
  public colorLevels: number = 8
  public minCircleSize: number = 0.1
  public maxCircleSize: number = 0.8
  public circleSpacing: number = 1.2
  public colorTolerance: number = 0.15
  public randomSeed: number = 42
  
  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Render circle packing effect
  }
}
```

### 2. Advanced Shader Implementation
```glsl
// Posterize color to specific levels for grouping
vec3 posterize(vec3 color, float levels) {
  return floor(color * levels) / levels;
}

// Grid-based circle placement with random offsets
float generateCirclePacking(vec2 pixelCoord, vec3 targetColor, float regionSize) {
  float maxCircles = packingDensity;
  float gridSize = regionSize / sqrt(maxCircles);
  vec2 gridCoord = floor(pixelCoord / gridSize);
  
  // Check surrounding grid cells for circles
  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 neighborGrid = gridCoord + vec2(x, y);
      vec2 randomOffset = hash2(neighborGrid) * 0.5;
      vec2 circleCenter = (neighborGrid + 0.5 + randomOffset) * gridSize;
      
      // Sample color and check similarity
      vec3 circleColor = sampleRegionColor(circleCenter, gridSize);
      vec3 posterizedCircleColor = posterize(circleColor, colorLevels);
      float colorSimilarity = 1.0 - colorDistance(posterizedCircleColor, targetColor);
      
      if (colorSimilarity > (1.0 - colorTolerance)) {
        float luminance = dot(circleColor, vec3(0.299, 0.587, 0.114));
        float circleRadius = mix(minCircleSize, maxCircleSize, luminance) * gridSize * 0.4;
        float distToCenter = length(pixelCoord - circleCenter);
        float circleMask = 1.0 - smoothstep(circleRadius - 2.0, circleRadius + 2.0, distToCenter);
        
        return circleMask * colorSimilarity;
      }
    }
  }
  return 0.0;
}
```

### 3. Integration with Effects System
```typescript
// In PostProcessingPass.ts
case 'circlepacking':
  this.circlePackingPass.intensity = effect.parameters.intensity ?? 0.8
  this.circlePackingPass.packingDensity = effect.parameters.packingDensity ?? 12
  this.circlePackingPass.colorLevels = effect.parameters.colorLevels ?? 8
  // ... other parameters
  this.circlePackingPass.render(renderer, inputTexture, outputTarget)
  return
```

## Example: Complete Color Shift Effect

Here's a complete example implementing a simple color shift effect:

### 1. Type Definition
```typescript
// In PostProcessingPass.ts
export type EffectType = '...' | 'colorshift'
```

### 2. Effect Definition
```typescript
// In EffectsChainManager.ts
{
  type: 'colorshift',
  name: 'Color Shift',
  defaultParameters: { 
    intensity: 0.5,
    hueShift: 0.0,
    saturation: 1.0
  },
  parameterDefinitions: {
    intensity: { min: 0, max: 1, step: 0.01, label: 'Intensity' },
    hueShift: { min: -180, max: 180, step: 1, label: 'Hue Shift (degrees)' },
    saturation: { min: 0, max: 2, step: 0.1, label: 'Saturation' }
  }
}
```

### 3. Implementation
```typescript
// Add to uniforms
hueShift: { value: 0.0 },
colorShiftSaturation: { value: 1.0 },

// Add to getEffectTypeIndexFromType
case 'colorshift': return 27

// Add to renderSingleEffectFromInstance
case 'colorshift':
  this.material.uniforms.hueShift.value = effect.parameters.hueShift ?? 0.0
  this.material.uniforms.colorShiftSaturation.value = effect.parameters.saturation ?? 1.0
  break
```

### 4. Shader Implementation
```glsl
// Add uniforms
uniform float hueShift;
uniform float colorShiftSaturation;

// Add function
vec3 colorShift(vec3 color, vec2 uv) {
  // Convert to HSV for hue shifting
  float maxVal = max(max(color.r, color.g), color.b);
  float minVal = min(min(color.r, color.g), color.b);
  float delta = maxVal - minVal;
  
  float hue = 0.0;
  if (delta > 0.0) {
    if (maxVal == color.r) {
      hue = mod((color.g - color.b) / delta, 6.0);
    } else if (maxVal == color.g) {
      hue = (color.b - color.r) / delta + 2.0;
    } else {
      hue = (color.r - color.g) / delta + 4.0;
    }
  }
  
  // Apply hue shift
  hue = mod(hue + hueShift / 60.0, 6.0);
  
  // Convert back to RGB (simplified)
  float sat = (maxVal > 0.0) ? delta / maxVal : 0.0;
  sat *= colorShiftSaturation;
  
  vec3 shiftedColor = /* HSV to RGB conversion */;
  
  return mix(color, shiftedColor, intensity);
}

// Add to main function
} else if (effectType == 27) {
  color = colorShift(color, vUv);
}
```

## Advanced Example: Circle Packing Effect

The Circle Packing effect represents the most sophisticated effect in the system, demonstrating advanced techniques for complex post-processing effects. It serves as an excellent reference for implementing effects that require:

### Key Advanced Features
- **WebWorker Parallelization**: Offloads heavy computation to prevent UI blocking
- **Custom Spatial Data Structures**: Uses QuadTree for O(log n) collision detection
- **Multi-Phase Processing**: Hierarchical circle placement with content analysis
- **Complex Parameter Management**: 10+ interconnected parameters with validation
- **Custom Render Pipeline**: Specialized fragment shader with circle data textures

### Architecture Highlights
```typescript
// WebWorker integration for parallel processing
this.worker = new Worker(new URL('./CirclePackingWorker.ts', import.meta.url))

// QuadTree spatial optimization  
const quadTree = new QuadTree({ x: 0, y: 0, width, height }, 15)

// Multi-phase hierarchical generation
const largeCircles = this.generateLargeCirclesFromColorBlocks(imageData)
const mediumCircles = this.generateMediumCircles(imageData)
const smallCircles = this.generateSmallCircles(imageData) 
const finalCircles = this.applyForceBasedRelaxation(allCircles)
```

### Performance Innovations
- **60-80% performance improvement** through WebWorker parallelization
- **O(log n) collision detection** vs O(n) linear search using QuadTree
- **Progressive generation** with real-time progress feedback
- **Adaptive quality scaling** based on density and device capabilities

For complete implementation details, see `CirclePackingEffect.md`.

## Resources

- **Three.js Shader Documentation**: https://threejs.org/docs/#api/en/materials/ShaderMaterial
- **GLSL Reference**: https://www.khronos.org/files/webgl/webgl-reference-card-1_0.pdf
- **Circle Packing Implementation**: `CirclePackingEffect.md` - Complete technical guide
- **Existing Effects**: Study similar effects in the codebase for patterns
- **GPU Gems**: http://developer.nvidia.com/gpugems/ (Advanced shader techniques)

## Contributing

When contributing new effects:

1. Follow the established code patterns
2. Add comprehensive documentation to `PostProcess.md`
3. Test thoroughly on different devices
4. Consider backward compatibility
5. Submit effects that add unique value to the system

This guide provides everything needed to create professional-quality post-processing effects for the Gaussian Splat Showcase. The modular architecture makes it straightforward to add new effects while maintaining system stability and performance.