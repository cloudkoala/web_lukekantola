import * as THREE from 'three'

export class EngravingPass {
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  // Engraving parameters
  public angle: number = 90.0 // Line angle in degrees
  public minWidth: number = 0.0 // Minimum line width in pixels
  public maxWidth: number = 1.0 // Maximum line width multiplier (× line spacing)
  public intensity: number = 1.0 // Opacity/intensity
  public detail: number = 45.0 // Number of sample points along each line
  public lineSpacing: number = 13.0 // Spacing between lines in pixels
  public interpolationMode: number = 3.0 // Interpolation mode (0=None, 1=Linear, 2=Smooth, 3=Cubic)

  constructor(width: number, height: number) {
    // Create orthographic camera and scene for post-processing
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.scene = new THREE.Scene()

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        angle: { value: this.angle },
        minWidth: { value: this.minWidth },
        maxWidth: { value: this.maxWidth },
        intensity: { value: this.intensity },
        detail: { value: this.detail },
        lineSpacing: { value: this.lineSpacing },
        interpolationMode: { value: this.interpolationMode }
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
        uniform vec2 resolution;
        uniform float angle;
        uniform float minWidth;
        uniform float maxWidth;
        uniform float intensity;
        uniform float detail;
        uniform float lineSpacing;
        uniform float interpolationMode;
        
        varying vec2 vUv;
        
        // Function to get luminance from color
        float getLuminance(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }
        
        // Function to rotate a 2D vector
        vec2 rotate(vec2 v, float a) {
          float s = sin(a);
          float c = cos(a);
          return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
        }
        
        // Sample luminance at a given UV coordinate with edge pixel repetition
        float sampleLuminance(vec2 uv) {
          // Clamp UV coordinates to stay within bounds (repeats edge pixels)
          vec2 clampedUV = clamp(uv, 0.0, 1.0);
          vec3 color = texture2D(tDiffuse, clampedUV).rgb;
          return getLuminance(color);
        }
        
        void main() {
          // Start with pure white background
          vec3 backgroundColor = vec3(1.0);
          
          // Convert angle from degrees to radians for rotation
          float angleRad = radians(angle);
          
          // Get current pixel coordinates in screen space
          vec2 pixelCoord = vUv * resolution;
          vec2 screenCenter = resolution * 0.5;
          
          // Calculate line direction vectors based on rotation
          vec2 lineDirection = vec2(cos(angleRad), sin(angleRad));
          vec2 perpDirection = vec2(-sin(angleRad), cos(angleRad));
          
          // Project current pixel onto the perpendicular direction to find which line
          vec2 centeredCoord = pixelCoord - screenCenter;
          float perpDistance = dot(centeredCoord, perpDirection);
          
          // Calculate which line we're on
          float lineIndex = floor((perpDistance + screenCenter.y) / lineSpacing);
          
          // Distance from line center (perpendicular to line direction)
          float distanceFromLineCenter = abs(mod(perpDistance + screenCenter.y, lineSpacing) - lineSpacing * 0.5);
          
          // Project current pixel onto the line direction to find position along line
          float parallelDistance = dot(centeredCoord, lineDirection);
          float positionAlongLine = parallelDistance + screenCenter.x;
          
          // Calculate the maximum extent needed to cover all corners at any angle
          // This ensures we sample the full length of lines that span corner-to-corner
          float screenDiagonal = length(resolution);
          float maxExtent = screenDiagonal * 0.6; // Extend beyond screen bounds
          
          // Calculate sample spacing based on detail level across the full extent
          float sampleSpacing = (maxExtent * 2.0) / detail;
          
          // Center the sampling range around the screen center
          float samplingStart = -maxExtent;
          float adjustedPosition = positionAlongLine - samplingStart;
          
          // Get sample points based on interpolation mode
          float sampleIndex = adjustedPosition / sampleSpacing;
          float sampleIndex1 = floor(sampleIndex);
          float sampleIndex2 = sampleIndex1 + 1.0;
          
          // For higher order interpolation modes, get additional points
          float sampleIndex0 = sampleIndex1 - 1.0;
          float sampleIndex3 = sampleIndex1 + 2.0;
          
          // Calculate actual positions along the line
          float samplePos0 = samplingStart + sampleIndex0 * sampleSpacing;
          float samplePos1 = samplingStart + sampleIndex1 * sampleSpacing;
          float samplePos2 = samplingStart + sampleIndex2 * sampleSpacing;
          float samplePos3 = samplingStart + sampleIndex3 * sampleSpacing;
          
          // Calculate the center of the current line in screen space
          float currentLineY = lineIndex * lineSpacing + lineSpacing * 0.5;
          vec2 lineCenter = screenCenter + perpDirection * (currentLineY - screenCenter.y);
          
          // Calculate sample points along the line in screen coordinates
          vec2 worldSample0 = lineCenter + lineDirection * (samplePos0 - screenCenter.x);
          vec2 worldSample1 = lineCenter + lineDirection * (samplePos1 - screenCenter.x);
          vec2 worldSample2 = lineCenter + lineDirection * (samplePos2 - screenCenter.x);
          vec2 worldSample3 = lineCenter + lineDirection * (samplePos3 - screenCenter.x);
          
          // Convert to UV coordinates
          vec2 sampleUV0 = worldSample0 / resolution;
          vec2 sampleUV1 = worldSample1 / resolution;
          vec2 sampleUV2 = worldSample2 / resolution;
          vec2 sampleUV3 = worldSample3 / resolution;
          
          // Sample luminance at points
          float lum0 = sampleLuminance(sampleUV0);
          float lum1 = sampleLuminance(sampleUV1);
          float lum2 = sampleLuminance(sampleUV2);
          float lum3 = sampleLuminance(sampleUV3);
          
          // Calculate interpolation factor
          float t = fract(sampleIndex);
          
          // Apply different interpolation modes
          float interpolatedLum;
          int mode = int(interpolationMode);
          
          if (mode == 0) {
            // Mode 0: No interpolation (nearest neighbor)
            interpolatedLum = lum1;
          } else if (mode == 1) {
            // Mode 1: Linear interpolation
            interpolatedLum = mix(lum1, lum2, t);
          } else if (mode == 2) {
            // Mode 2: Smooth interpolation (smoothstep)
            float smoothT = smoothstep(0.0, 1.0, t);
            interpolatedLum = mix(lum1, lum2, smoothT);
          } else if (mode == 3) {
            // Mode 3: Cubic interpolation (Catmull-Rom)
            interpolatedLum = lum1 + 0.5 * t * (lum2 - lum0 + t * (2.0 * lum0 - 5.0 * lum1 + 4.0 * lum2 - lum3 + t * (3.0 * (lum1 - lum2) + lum3 - lum0)));
          } else {
            // Mode 4: Quintic smoothstep (ultra-smooth)
            float quinticT = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
            interpolatedLum = mix(lum1, lum2, quinticT);
          }
          
          // Invert the luminance value (1 - value)
          float invertedLum = 1.0 - interpolatedLum;
          
          // Calculate stroke width based on inverted luminance
          // Black pixels (lum=0, inverted=1) give maxWidth * lineSpacing
          // White pixels (lum=1, inverted=0) give minWidth
          float actualMaxWidth = maxWidth * lineSpacing;
          float strokeWidth = mix(minWidth, actualMaxWidth, invertedLum);
          
          // Create smooth edges using smoothstep for anti-aliasing
          float edgeWidth = 0.5; // Half pixel for smooth edges
          float strokeEdge = strokeWidth * 0.5;
          float strokeFactor = 1.0 - smoothstep(strokeEdge - edgeWidth, strokeEdge + edgeWidth, distanceFromLineCenter);
          
          // Create the engraving result - black strokes on white background
          vec3 engravingResult = mix(backgroundColor, vec3(0.0), strokeFactor);
          
          // Mix with original image based on intensity
          vec4 originalTexel = texture2D(tDiffuse, vUv);
          vec3 finalColor = mix(originalTexel.rgb, engravingResult, intensity);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    })

    // Create quad geometry
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.mesh)
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget): void {
    // Update uniforms
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.angle.value = this.angle
    this.material.uniforms.minWidth.value = this.minWidth
    this.material.uniforms.maxWidth.value = this.maxWidth
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.detail.value = this.detail
    this.material.uniforms.lineSpacing.value = this.lineSpacing
    this.material.uniforms.interpolationMode.value = this.interpolationMode

    // Render
    const currentRenderTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(outputTarget || null)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(currentRenderTarget)
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.resolution.value.set(width, height)
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
  }

  // Parameter setters for easy control
  setAngle(degrees: number): void {
    this.angle = degrees
  }

  setMinWidth(width: number): void {
    this.minWidth = Math.max(0.0, Math.min(width, 50))
  }

  setMaxWidth(multiplier: number): void {
    this.maxWidth = Math.max(0.0, Math.min(multiplier, 2))
  }

  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(intensity, 1))
  }

  setDetail(detail: number): void {
    this.detail = Math.max(1.0, Math.min(detail, 256))
  }

  setLineSpacing(spacing: number): void {
    this.lineSpacing = Math.max(1, spacing)
  }

  setInterpolationMode(mode: number): void {
    this.interpolationMode = Math.max(0, Math.min(mode, 4))
  }
}