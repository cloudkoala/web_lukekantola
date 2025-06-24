import * as THREE from 'three'

export class HalftoneDitheringPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  
  // Dithering parameters
  public enabled: boolean = false
  public intensity: number = 0.5
  public dotSize: number = 8
  public contrast: number = 1.2
  public angle: number = 0 // Halftone screen angle in degrees (fixed at 0)
  
  constructor(width: number, height: number) {
    // Create render target for the effect
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Create halftone dithering shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        dotSize: { value: this.dotSize },
        contrast: { value: this.contrast },
        angle: { value: 0 } // Fixed at 0 radians
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
  }
  
  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    if (!this.enabled) {
      // If disabled, just copy input to output
      if (outputTarget) {
        renderer.setRenderTarget(outputTarget || null)
        renderer.clear()
        // Simple blit operation would go here
      }
      return
    }
    
    // Update uniforms
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.dotSize.value = this.dotSize
    this.material.uniforms.contrast.value = this.contrast
    this.material.uniforms.angle.value = this.angle * Math.PI / 180
    
    // Render the effect
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  setSize(width: number, height: number) {
    this.renderTarget.setSize(width, height)
    this.material.uniforms.resolution.value.set(width, height)
  }
  
  dispose() {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
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
      uniform float intensity;
      uniform float dotSize;
      uniform float contrast;
      uniform float angle;
      
      varying vec2 vUv;
      
      vec3 sampleAverageColor(vec2 dotCoord, float dSize) {
        // Sample multiple points within the dot cell for average color
        vec3 avgColor = vec3(0.0);
        float samples = 0.0;
        
        // Sample 3x3 grid within each dot cell
        for (float x = 0.16; x < 1.0; x += 0.33) {
          for (float y = 0.16; y < 1.0; y += 0.33) {
            vec2 samplePos = (dotCoord + vec2(x, y)) * dSize / resolution;
            if (samplePos.x >= 0.0 && samplePos.x <= 1.0 && samplePos.y >= 0.0 && samplePos.y <= 1.0) {
              avgColor += texture2D(tDiffuse, samplePos).rgb;
              samples += 1.0;
            }
          }
        }
        
        return samples > 0.0 ? avgColor / samples : vec3(0.0);
      }
      
      void main() {
        vec2 pixelCoord = vUv * resolution;
        
        // Sample original color
        vec4 color = texture2D(tDiffuse, vUv);
        
        // Rotate coordinate system for angled halftone screen
        float cosAngle = cos(angle);
        float sinAngle = sin(angle);
        mat2 rotationMatrix = mat2(cosAngle, -sinAngle, sinAngle, cosAngle);
        vec2 rotatedCoord = rotationMatrix * pixelCoord;
        
        // Calculate dot grid position
        vec2 dotCoord = floor(rotatedCoord / dotSize);
        
        // Sample average color from the dot cell
        vec3 cellAvgColor = sampleAverageColor(dotCoord, dotSize);
        
        // Sample color from the center of each dot cell for luminance calculation
        vec2 dotCenter = (dotCoord + 0.5) * dotSize;
        vec2 rotatedBack = mat2(cosAngle, sinAngle, -sinAngle, cosAngle) * dotCenter;
        vec2 centerUv = rotatedBack / resolution;
        
        // Clamp to valid UV range
        centerUv = clamp(centerUv, 0.0, 1.0);
        vec4 cellColor = texture2D(tDiffuse, centerUv);
        
        // Convert to grayscale (luminance)
        float luminance = dot(cellColor.rgb, vec3(0.299, 0.587, 0.114));
        
        // Apply contrast
        luminance = pow(luminance, 1.0 / contrast);
        
        // Calculate position within dot cell
        vec2 dotUv = mod(rotatedCoord, dotSize) / dotSize;
        
        // Center the dot UV coordinates around 0.5
        vec2 centeredUv = dotUv - 0.5;
        
        // Calculate distance from center of dot
        float distanceFromCenter = length(centeredUv);
        
        // Create circular halftone dot based on luminance
        // Higher luminance = larger dot radius
        float dotRadius = luminance * 0.7; // Scale factor for dot size
        
        // Create smooth dot with anti-aliasing
        float dotMask = 1.0 - smoothstep(dotRadius - 0.1, dotRadius + 0.1, distanceFromCenter);
        
        // Create halftone output using the average color from the cell
        vec3 halftoneColor = cellAvgColor * dotMask;
        
        // For blend mode support, blend between original image and effect based on intensity
        // The blending will be handled by the PostProcessingPass
        vec3 effectColor = mix(color.rgb, halftoneColor, intensity);
        
        gl_FragColor = vec4(effectColor, color.a);
      }
    `
  }
}