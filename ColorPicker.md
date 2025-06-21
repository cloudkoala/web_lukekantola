# Mobile Color Picker System

## Overview

The mobile color picker provides an intuitive HSV (Hue, Saturation, Value) color selection interface optimized for touch devices. It replaces traditional RGB sliders with a visual color picker that allows direct color manipulation.

## Features

### Visual Interface
- **Saturation/Luminance Square**: 140×100px interactive area for selecting color saturation and brightness
- **Vertical Hue Slider**: 32×100px vertical bar for selecting color hue (0-360°)
- **Real-time Preview**: Color changes are applied immediately to effects as you drag
- **Compact Design**: Popup modal positioned relative to effect parameters

### Touch Interaction
- **Drag Support**: Full touch and mouse drag support for both color square and hue slider
- **Precise Control**: Crosshair cursor and visual feedback for accurate color selection
- **Responsive Cursors**: Visual indicators show current selection points

### User Experience
- **Instant Feedback**: Color changes apply in real-time without confirmation
- **Smart Positioning**: Popup appears at bottom-left of parameters panel
- **Easy Dismissal**: Tap outside to accept current color, or use cancel button to revert

## Technical Implementation

### Color Space Conversion
```typescript
// HSV to RGB conversion for display
function hsvToRgb(h: number, s: number, v: number): {r: number, g: number, b: number}

// RGB to HSV conversion for initialization  
function rgbToHsv(r: number, g: number, b: number): {h: number, s: number, v: number}

// Hex color utilities
function hexToRgb(hex: string): {r: number, g: number, b: number}
function rgbToHex(r: number, g: number, b: number): string
```

### Integration Pattern
```typescript
// Color parameter detection
if (paramType === 'color') {
  // Create color swatch instead of slider
  const colorSwatch = createColorSwatch(hexValue)
  
  // Show popup on click
  colorSwatch.addEventListener('click', () => {
    showMobileColorPicker(initialHex, (newHex) => {
      // Update parameter and visual swatch
      updateColorParameter(newHex)
    })
  })
}
```

### Parameter Definition
```typescript
// In effect definitions
parameterDefinitions: {
  color1: {
    label: 'Primary Color',
    type: 'color',        // Triggers color picker instead of slider
    min: 0x000000,       // Black
    max: 0xffffff,       // White  
    step: 1,
    default: 0xff0000    // Red
  }
}
```

## UI Components

### Color Swatch
- **Size**: 24×24px circular button
- **Border**: 1px white outline for visibility
- **Background**: Current color value
- **Interaction**: Click to open color picker popup

### Popup Modal
- **Dimensions**: 200×140px (width includes padding)
- **Background**: Dark green with green border (`rgba(0, 20, 0, 0.95)`)
- **Animation**: Slide up with opacity fade
- **Z-index**: 10000 (above all other UI elements)

### Control Buttons
- **Size**: 20×20px circular buttons
- **Position**: 33% and 66% along bottom width
- **Checkmark (✓)**: Accept current color and close
- **Cancel (×)**: Revert to original color and close
- **Styling**: Green/red backgrounds with matching borders

## Usage Examples

### Adding Color Parameter to Effect
```typescript
// 1. Define in effect parameters
parameterDefinitions: {
  tintColor: {
    label: 'Tint Color',
    type: 'color',
    min: 0x000000,
    max: 0xffffff, 
    step: 1,
    default: 0x00ff00
  }
}

// 2. Use in shader
uniform vec3 u_tintColor;

// 3. Parameter automatically creates color picker on mobile
```

### Color Value Handling
```typescript
// Colors are stored as numeric hex values
const colorValue = 0xff0000  // Red

// Convert to hex string for display
const hexString = '#' + colorValue.toString(16).padStart(6, '0')

// Convert back to numeric for shader uniforms
const numericValue = parseInt(hexString.replace('#', ''), 16)
```

## Responsive Design

### Desktop vs Mobile
- **Desktop**: Simple circular color swatch opens native color picker
- **Mobile**: Circular swatch opens custom HSV color picker popup
- **Sync**: Both interfaces update the same underlying parameter

### Touch Optimization
- **Minimum Target Size**: Buttons sized for reliable touch interaction
- **Drag Sensitivity**: Optimized for finger-based color selection
- **Visual Feedback**: Clear cursors and immediate color updates

## Integration with Effects System

### Automatic Detection
The system automatically detects color parameters using the `type: 'color'` definition and creates appropriate UI:

```typescript
// Numeric parameters get sliders
pointSize: { type: 'number', ... }

// Color parameters get color pickers  
backgroundColor: { type: 'color', ... }
```

### Real-time Updates
Color changes immediately update effect parameters and are visible in the 3D scene:

```typescript
onColorChange: (newHex) => {
  const numericValue = parseInt(newHex.replace('#', ''), 16)
  effectsChainManager.updateEffectParameter(effectId, paramName, numericValue)
}
```

## Styling Customization

### CSS Classes
- `.mobile-color-swatch` - Color picker trigger button
- `.color-picker-popup` - Main popup container
- `.sat-lum-square` - Color selection area
- `.hue-slider` - Hue selection bar
- `.color-picker-confirm` / `.color-picker-cancel` - Control buttons

### Theme Integration
The color picker follows the application's retro terminal theme with:
- Dark backgrounds with green accents
- Monospace font for consistency
- Subtle glow effects on interactive elements
- Consistent border styling throughout

## Browser Compatibility

### Modern Browser Support
- **Touch Events**: Full iOS and Android support
- **Mouse Events**: Desktop fallback for development
- **CSS Features**: Supports modern flexbox and positioning
- **Color Space**: Standard RGB/HSV conversion algorithms

### Fallback Behavior
On unsupported devices, the system gracefully falls back to:
- Basic hex input fields
- Native color picker dialogs
- Standard RGB parameter sliders