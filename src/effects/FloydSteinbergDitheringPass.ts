import * as THREE from 'three'

export class FloydSteinbergDitheringPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  
  // Dithering parameters
  public enabled: boolean = false
  public intensity: number = 0.5
  public colorLevels: number = 4 // Number of levels per color channel (2-16)
  public contrast: number = 1.2
  
  constructor(width: number, height: number) {
    // Create render target for the effect
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Create Floyd-Steinberg dithering shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        colorLevels: { value: this.colorLevels },
        contrast: { value: this.contrast }
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
    this.material.uniforms.colorLevels.value = this.colorLevels
    this.material.uniforms.contrast.value = this.contrast
    
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
      uniform float colorLevels;
      uniform float contrast;
      
      varying vec2 vUv;
      
      // Quantize color to discrete levels
      vec3 quantizeColor(vec3 color, float levels) {
        return floor(color * levels) / levels;
      }
      
      // Get Floyd-Steinberg error distribution weight for a given offset
      float getErrorWeight(vec2 offset) {
        if (offset.x == 1.0 && offset.y == 0.0) return 7.0 / 16.0;  // Right
        if (offset.x == -1.0 && offset.y == -1.0) return 3.0 / 16.0; // Bottom-left
        if (offset.x == 0.0 && offset.y == -1.0) return 5.0 / 16.0;  // Bottom
        if (offset.x == 1.0 && offset.y == -1.0) return 1.0 / 16.0;  // Bottom-right
        return 0.0;
      }
      
      // Sample error from neighboring pixels (simulated)
      vec3 sampleNeighborError(vec2 uv, vec2 pixelSize) {
        vec3 totalError = vec3(0.0);
        
        // Sample from 4 neighboring pixels that would have contributed error
        // Note: This is a simplified approximation since we can't access previous error values
        for (float x = -1.0; x <= 1.0; x += 1.0) {
          for (float y = 0.0; y <= 1.0; y += 1.0) {
            if (x == 0.0 && y == 0.0) continue; // Skip current pixel
            
            vec2 offset = vec2(x, y);
            vec2 neighborUv = uv + offset * pixelSize;
            
            // Check bounds
            if (neighborUv.x >= 0.0 && neighborUv.x <= 1.0 && 
                neighborUv.y >= 0.0 && neighborUv.y <= 1.0) {
              
              vec3 neighborColor = texture2D(tDiffuse, neighborUv).rgb;
              
              // Apply contrast
              neighborColor = pow(neighborColor, vec3(1.0 / contrast));
              
              // Calculate what the quantized color would be
              vec3 quantized = quantizeColor(neighborColor, colorLevels);
              
              // Calculate error that would have been generated
              vec3 error = neighborColor - quantized;
              
              // Apply error weight based on Floyd-Steinberg matrix
              float weight = getErrorWeight(-offset); // Negative because we're looking backwards
              totalError += error * weight;
            }
          }
        }
        
        return totalError;
      }
      
      void main() {
        vec2 pixelSize = 1.0 / resolution;
        
        // Sample original color
        vec4 originalColor = texture2D(tDiffuse, vUv);
        vec3 color = originalColor.rgb;
        
        // Apply contrast
        color = pow(color, vec3(1.0 / contrast));
        
        // Add distributed error from neighboring pixels
        vec3 neighborError = sampleNeighborError(vUv, pixelSize);
        color += neighborError * 0.5; // Scale error contribution
        
        // Clamp to valid range
        color = clamp(color, 0.0, 1.0);
        
        // Quantize the color to create the dithered effect
        vec3 quantizedColor = quantizeColor(color, colorLevels);
        
        // Calculate current pixel error (for visual feedback)
        vec3 currentError = color - quantizedColor;
        
        // Create a subtle pattern based on pixel position to simulate error distribution
        vec2 pixelCoord = vUv * resolution;
        float patternX = mod(pixelCoord.x, 2.0);
        float patternY = mod(pixelCoord.y, 2.0);
        
        // Apply a subtle spatial dithering pattern to enhance the effect
        vec3 spatialDither = vec3(
          (patternX + patternY * 0.5 - 0.75) * 0.02,
          (patternY + patternX * 0.3 - 0.65) * 0.02,
          (patternX * patternY - 0.5) * 0.02
        );
        
        quantizedColor += spatialDither;
        quantizedColor = clamp(quantizedColor, 0.0, 1.0);
        
        // Blend with original color based on intensity
        vec3 finalColor = mix(originalColor.rgb, quantizedColor, intensity);
        
        gl_FragColor = vec4(finalColor, originalColor.a);
      }
    `
  }
}