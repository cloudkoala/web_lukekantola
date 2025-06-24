# Effect Blending Modes System

A comprehensive guide to the effect blending modes system in the Gaussian Splat Showcase application.

## Overview

The effects system supports three blending modes that determine how each effect combines with the previous effects in the chain. Each effect can be configured with a different blend mode to create complex visual compositions.

## Supported Blend Modes

### 1. Normal (Default)
**Mode**: `"normal"`  
**Behavior**: The effect completely replaces the input image based on its intensity parameter.

```glsl
// GLSL Implementation
result = effectOutput
```

**Use Cases**:
- Most standard effects (sepia, blur, gamma correction)
- Effects that should fully replace the previous result
- Color correction and basic post-processing

**Example Configuration**:
```json
{
  "id": "effect_1",
  "type": "sepia",
  "enabled": true,
  "parameters": {
    "intensity": 0.8
  },
  "blendMode": "normal"
}
```

### 2. Add (Additive)
**Mode**: `"add"`  
**Behavior**: Adds the effect's output to the base image, creating brightening effects.

```glsl
// GLSL Implementation  
result = clamp(base.rgb + blend.rgb, 0.0, 1.0)
```

**Visual Characteristics**:
- **Black areas** from effect = no change to base image
- **White areas** from effect = brighten the base image
- **Gray areas** from effect = proportional brightening

**Use Cases**:
- Light sources and glowing effects
- Particle systems and highlights
- Engraving and line art effects that should add detail
- Creating luminous overlays

**Example Configuration**:
```json
{
  "id": "effect_2", 
  "type": "engraving",
  "enabled": true,
  "parameters": {
    "intensity": 1,
    "angle": 45,
    "detail": 12
  },
  "blendMode": "add"
}
```

### 3. Multiply (Darkening)
**Mode**: `"multiply"`  
**Behavior**: Multiplies the base image with the inverted effect output, creating darkening effects.

```glsl
// GLSL Implementation
result = base.rgb * (1.0 - blend.rgb)
```

**Visual Characteristics**:
- **Black areas** from effect = darken the base image significantly
- **White areas** from effect = no change to base image  
- **Gray areas** from effect = proportional darkening

**Use Cases**:
- Shadow and depth effects
- Outlining and edge detection
- Creating dramatic contrast
- Simulating traditional darkroom techniques

**Example Configuration**:
```json
{
  "id": "effect_3",
  "type": "sobelthreshold", 
  "enabled": true,
  "parameters": {
    "intensity": 1,
    "threshold": 0.01
  },
  "blendMode": "multiply"
}
```

## Technical Implementation

### Effect Chain Processing

Effects are processed **sequentially** in the order they appear in the effects chain:

1. **Input**: Previous effect's output (or original image for first effect)
2. **Effect Processing**: Apply the effect's algorithm
3. **Blending**: Combine effect output with input based on blend mode
4. **Output**: Result becomes input for next effect

### Intensity vs Blend Mode

Effects support **two levels of blending**:

1. **Internal Intensity**: Controls how much of the effect is applied
   ```glsl
   effectResult = mix(originalColor, effectColor, intensity)
   ```

2. **External Blend Mode**: Controls how the effect combines with the previous result
   ```glsl
   finalResult = blend(previousResult, effectResult, blendMode)
   ```

### Shader Implementation

The blending is handled in `PostProcessingPass.ts` with a dedicated blending shader:

```glsl
// Blend function in fragment shader
vec3 blend(vec3 base, vec3 effectColor, int blendMode) {
  if (blendMode == 1) { // Add
    return clamp(base + effectColor, 0.0, 1.0);
  } else if (blendMode == 2) { // Multiply  
    return base * (1.0 - effectColor);
  } else { // Normal (default)
    return effectColor;
  }
}
```

## Scene Configuration

### Adding Blend Modes to Effects

In scene configuration files (`scenes-config.json`), specify the blend mode for each effect:

```json
{
  "effectsChain": [
    {
      "id": "effect_1",
      "type": "background", 
      "enabled": true,
      "parameters": {
        "hue": 0.5,
        "saturation": 80,
        "lightness": 20
      }
      // No blendMode = defaults to "normal"
    },
    {
      "id": "effect_2",
      "type": "engraving",
      "enabled": true, 
      "parameters": {
        "intensity": 0.8,
        "angle": 45
      },
      "blendMode": "add"
    },
    {
      "id": "effect_3", 
      "type": "sobelthreshold",
      "enabled": true,
      "parameters": {
        "intensity": 1,
        "threshold": 0.02
      },
      "blendMode": "multiply"
    }
  ]
}
```

### Export and Import

**Scene Export**: Blend modes are automatically included when exporting scenes via:
- Desktop: Click camera coordinates display (top-left)
- Mobile: Use share button
- URL: Generate shareable links

**Scene Import**: Blend modes are restored when loading scenes from:
- Configuration files
- Shared URLs
- Preset scenes

## Best Practices

### Effect Ordering

**Recommended Chain Order**:
1. **Background effects** (normal mode)
2. **Color correction** (normal mode) 
3. **Additive details** (add mode) - engraving, highlights
4. **Darkening effects** (multiply mode) - outlines, shadows
5. **Final adjustments** (normal mode) - vignette, final color grading

### Blend Mode Selection Guide

**Choose Normal When**:
- Effect should completely replace previous result
- Standard color correction or filtering
- Effect doesn't need to interact with underlying layers

**Choose Add When**:
- Adding light, glow, or highlight effects
- Line art or engraving that should brighten
- Creating luminous overlays
- Particle or energy effects

**Choose Multiply When**:
- Adding shadows or depth
- Edge detection and outlining
- Creating dramatic contrast
- Simulating ink or darkroom effects

### Performance Considerations

- **Blend modes add minimal overhead** - single shader pass per effect
- **Effect order matters** - sequential processing means later effects see cumulative results
- **Chain length impacts performance** - use fewer effects for better mobile performance

## Troubleshooting

### Common Issues

**Effect Too Subtle**:
- Increase effect intensity parameter
- Check if previous effects are overwhelming the result
- Try different blend mode (add for brightening, multiply for darkening)

**Unexpected Visual Results**:
- Verify effect order in chain
- Check that blend mode matches intended behavior
- Remember that effects see cumulative results from previous effects

**Colors Clipping**:
- Add mode can cause over-brightening (colors hit 1.0 and clip)
- Use lower intensity values with add mode
- Consider using normal mode for color-sensitive effects

### Effect Chain Analysis

Use the effects panel to:
- **Preview individual effects** by toggling them on/off
- **Reorder effects** by dragging in the effects list
- **Adjust blend modes** using the blend mode buttons
- **Export configurations** for sharing or backup

## Development

### Adding Blend Mode Support to New Effects

1. **Effect Definition**: Set `supportsBlending: true` in effect definition
2. **UI Integration**: Blend mode buttons are automatically generated
3. **Scene State**: Blend modes are automatically captured in scene export
4. **Shader Compatibility**: Ensure effect shaders output appropriate color ranges

### Type Safety

The blend mode system uses TypeScript for type safety:

```typescript
// In types.ts
interface EffectInstanceState {
  id: string
  type: string  
  enabled: boolean
  parameters: Record<string, any>
  blendMode?: 'normal' | 'add' | 'multiply'
}
```

See `CreateEffect.md` and `Postprocess.md` for more details on the effects system architecture.