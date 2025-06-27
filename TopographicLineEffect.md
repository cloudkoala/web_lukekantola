# Topographic Line Effect - Technical Documentation

## Overview

The Topographic Line Effect creates elevation-based contour lines from 3D point clouds, similar to topographic maps. The system supports two distinct modes: **Point-based transparency** and **Wire geometry generation**.

## System Architecture

### Core Components

1. **PostProcessingPass.ts** - Main effect implementation
2. **EffectsChainManager.ts** - Effect configuration and parameters
3. **EffectsPanel.ts** - UI controls and real-time parameter adjustment

### Effect Parameters

```typescript
{
  intensity: 1.0,           // Overall effect strength (0-1)
  lineSpacing: 5.0,         // Distance between contour lines (1-20)
  lineWidth: 2.0,           // Visual line thickness (0-8)
  animationSpeed: 0.0,      // Animation speed for moving lines (0-2)
  generateWires: 0,         // Mode: 0=points, 1=wire geometry
  minY: 0,                  // Y-axis lower threshold (0-100%)
  maxY: 100,                // Y-axis upper threshold (0-100%)
  wireOpacity: 0.8          // Wire transparency (0.1-1.0)
}
```

## Implementation Logic

### Mode A: Point-Based Lines (generateWires = 0)

Modifies point cloud transparency to create contour line effects:

```typescript
// Calculate world-space line spacing
const worldLineSpacing = (effectiveYRange * lineSpacing) / 100

// For each point, calculate distance to nearest contour line
const normalizedY = (y - effectiveMinY) / effectiveYRange
const animatedY = normalizedY + (animationSpeed * time)
const distanceToLine = Math.abs((animatedY * 100) % lineSpacing - lineSpacing * 0.5)

// Apply transparency based on distance (creates line effect)
const lineIntensity = Math.max(0, 1 - (distanceToLine / (lineWidth * 0.5)))
```

### Mode B: Wire Geometry (generateWires = 1)

Creates actual 3D line geometry for contour visualization:

#### 1. Elevation Slicing
```typescript
// Calculate elevation levels
const numLines = Math.ceil(effectiveYRange / worldLineSpacing)
for (let i = 0; i <= numLines; i++) {
  const lineY = effectiveMinY + (i * worldLineSpacing)
  const tolerance = worldLineSpacing * 0.02  // 2% tolerance
  
  // Extract points at this elevation
  const contourPoints = extractPointsAtElevation(lineY, tolerance)
}
```

#### 2. Contour Loop Creation
```typescript
// Group points into connected loops
const loops = separateIntoLoops(contourPoints)

// For each loop, create closed line geometry
loops.forEach(loop => {
  const sortedPoints = sortPointsByAngle(loop)
  const lineGeometry = createLineSegments(sortedPoints)
})
```

#### 3. Line Segment Generation
```typescript
// Create line pairs for proper rendering
const linePoints: THREE.Vector3[] = []
for (let i = 0; i < sortedPoints.length; i++) {
  const current = sortedPoints[i]
  const next = sortedPoints[(i + 1) % sortedPoints.length] // Loop closure
  
  linePoints.push(current.clone())
  linePoints.push(next.clone())
}
```

## Key Algorithms

### Spatial Clustering for Loop Separation

```typescript
// Calculate distance threshold for connecting points
const averageDistance = calculateAverageDistance(points)
const maxDistance = averageDistance * 2.5

// Build connected chains of nearby points
const visitedPoints = new Set<number>()
const loops: THREE.Vector3[][] = []

points.forEach((point, index) => {
  if (!visitedPoints.has(index)) {
    const loop = buildConnectedLoop(point, points, maxDistance, visitedPoints)
    if (loop.length >= 3) loops.push(loop) // Minimum 3 points for valid loop
  }
})
```

### Angular Point Sorting

```typescript
// Sort points by angle around center for proper loop closure
const center = calculateCenterPoint(points)
const sortedPoints = points.sort((a, b) => {
  const angleA = Math.atan2(a.z - center.z, a.x - center.x)
  const angleB = Math.atan2(b.z - center.z, b.x - center.x)
  return angleA - angleB
})
```

## Line Spacing vs Line Width Relationship

### Current Implementation Issue

**Problem**: Line spacing affects both line density AND perceived line width.

**Why This Happens**:
1. **Tolerance Calculation**: `tolerance = worldLineSpacing * 0.02`
2. **Point Extraction**: Smaller spacing → smaller tolerance → thinner point bands
3. **Visual Result**: Dense lines appear thicker due to overlap and proximity

**Mathematical Relationship**:
```typescript
// Current coupling
worldLineSpacing = (effectiveYRange * lineSpacing) / 100
tolerance = worldLineSpacing * 0.02  // ← Coupled to spacing

// Visual thickness = tolerance * point density
// Smaller spacing → smaller tolerance → thinner lines
```

### Proposed Decoupling Solution

**Separate tolerance from line spacing**:
```typescript
// Independent parameters
const worldLineSpacing = (effectiveYRange * lineSpacing) / 100
const independentTolerance = (effectiveYRange * lineWidth) / 1000  // New calculation

// Use fixed width calculation
const tolerance = Math.max(independentTolerance, worldLineSpacing * 0.01)
```

## Max Segment Length Implementation

### Current Wire Generation Limitation

**Problem**: Long contour lines can create performance issues and visual artifacts.

**Current Code**:
```typescript
// No segment length limits - connects all adjacent points
const linePoints: THREE.Vector3[] = []
for (let i = 0; i < sortedPoints.length; i++) {
  const current = sortedPoints[i]
  const next = sortedPoints[(i + 1) % sortedPoints.length]
  
  linePoints.push(current.clone())
  linePoints.push(next.clone()) // ← No distance check
}
```

### Proposed Max Segment Length Solution

```typescript
// Add segment length limiting
const maxSegmentLength = effectiveYRange * 0.1  // 10% of Y range
const linePoints: THREE.Vector3[] = []

for (let i = 0; i < sortedPoints.length; i++) {
  const current = sortedPoints[i]
  const next = sortedPoints[(i + 1) % sortedPoints.length]
  const distance = current.distanceTo(next)
  
  if (distance <= maxSegmentLength) {
    linePoints.push(current.clone())
    linePoints.push(next.clone())
  } else {
    // Subdivide long segments
    const subdivisions = Math.ceil(distance / maxSegmentLength)
    for (let j = 0; j < subdivisions; j++) {
      const t1 = j / subdivisions
      const t2 = (j + 1) / subdivisions
      const point1 = current.clone().lerp(next, t1)
      const point2 = current.clone().lerp(next, t2)
      
      linePoints.push(point1)
      linePoints.push(point2)
    }
  }
}
```

## Performance Characteristics

### Wire Generation Performance
- **Point Processing**: O(n) for elevation extraction
- **Loop Separation**: O(n²) for distance calculations (limited to 50 max points)
- **Geometry Creation**: O(m) where m = number of contour points
- **Memory Usage**: ~2KB per 100 contour points

### Optimization Strategies
1. **Spatial Indexing**: Use QuadTree for faster point queries
2. **Level-of-Detail**: Reduce line density at distance
3. **Frustum Culling**: Only generate lines in camera view
4. **Geometry Instancing**: Reuse line segments where possible

## Technical Specifications

### Line Material Configuration
```typescript
const material = new THREE.LineBasicMaterial({
  color: 0x00ff00,        // Green contour lines
  linewidth: 2,           // Browser-dependent (usually 1px)
  transparent: true,
  opacity: wireOpacity,   // User-controlled transparency
  depthTest: true,        // Proper depth sorting
  depthWrite: false       // Prevent depth conflicts
})
```

### Memory Management
- **Wire Tracking**: `topographicWires[]` array maintains references
- **Cleanup**: `clearTopographicWires()` properly disposes geometry
- **State Restoration**: Original point colors preserved and restored

## Usage Examples

### Basic Contour Lines
```typescript
// Simple elevation contours
applyTopographicEffect({
  intensity: 1.0,
  lineSpacing: 10.0,      // 10 units between lines
  generateWires: 1,       // Use wire geometry
  minY: 0,                // Full Y range
  maxY: 100
})
```

### Animated Flowing Lines
```typescript
// Moving contour animation
applyTopographicEffect({
  intensity: 0.8,
  lineSpacing: 5.0,
  animationSpeed: 1.0,    // Flowing effect
  generateWires: 0,       // Point-based for performance
  lineWidth: 3.0
})
```

### Selective Elevation Range
```typescript
// Focus on specific elevation band
applyTopographicEffect({
  intensity: 1.0,
  lineSpacing: 2.0,       // Dense lines
  generateWires: 1,
  minY: 30,               // 30% of Y range
  maxY: 70,               // 70% of Y range
  wireOpacity: 0.9
})
```

## Future Enhancements

### Proposed Improvements
1. **Segment Length Control**: Add `maxSegmentLength` parameter
2. **Decoupled Line Width**: Independent tolerance calculation
3. **Adaptive Density**: Dynamic line spacing based on camera distance
4. **Color Gradients**: Elevation-based color mapping
5. **Line Styles**: Dashed, dotted, or custom line patterns
6. **3D Surfaces**: Convert contours to elevation surfaces

### Performance Optimizations
1. **Spatial Indexing**: QuadTree for O(log n) point queries
2. **Geometry Instancing**: Reuse common line segments
3. **LOD System**: Reduce complexity at distance
4. **Worker Threads**: Offload heavy computations

## Technical Notes

### WebGL Line Width Limitations
- Most browsers limit `linewidth` to 1 pixel
- For thicker lines, consider using geometry-based approaches
- Alternative: Use instanced geometry with custom shaders

### Coordinate System
- **Y-axis**: Vertical elevation (up/down)
- **XZ-plane**: Horizontal contour projection
- **World Space**: All calculations in Three.js world coordinates

### Edge Cases
- **Insufficient Points**: Requires minimum 3 points per contour
- **Flat Surfaces**: Zero Y-range handled gracefully
- **Large Datasets**: Performance degrades with >10,000 points per contour

This implementation provides a solid foundation for topographic visualization while maintaining flexibility for future enhancements and optimizations.