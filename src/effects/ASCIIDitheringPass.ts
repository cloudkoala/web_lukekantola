import * as THREE from 'three'

export class ASCIIDitheringPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  
  // Dithering parameters
  public enabled: boolean = false
  public intensity: number = 0.5
  public characterSize: number = 8
  public contrast: number = 1.2
  
  constructor(width: number, height: number) {
    // Create render target for the effect
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Create ASCII dithering shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        characterSize: { value: this.characterSize },
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
    this.material.uniforms.characterSize.value = this.characterSize
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
      uniform float characterSize;
      uniform float contrast;
      
      varying vec2 vUv;
      
      // ASCII character patterns (8x8 bitmap patterns)
      // 24 characters ordered by density: space, period, colon, semicolon, apostrophe, dash, underscore, backtick, tilde, plus, asterisk, caret, less, greater, v, c, r, s, x, z, o, O, 8, at, hash, B, D, M, W
      float getCharacterPattern(int charIndex, vec2 pos) {
        vec2 p = floor(pos * 8.0) / 8.0; // Snap to 8x8 grid for discrete pixels
        
        if (charIndex == 0) { // ' ' (space)
          return 0.0;
        } else if (charIndex == 1) { // '.' (period)
          return (p.x >= 0.375 && p.x < 0.625 && p.y >= 0.125 && p.y < 0.375) ? 1.0 : 0.0;
        } else if (charIndex == 2) { // ':' (colon)
          return ((p.x >= 0.375 && p.x < 0.625) && 
                  ((p.y >= 0.125 && p.y < 0.375) || (p.y >= 0.625 && p.y < 0.875))) ? 1.0 : 0.0;
        } else if (charIndex == 3) { // ';' (semicolon)
          return ((p.x >= 0.375 && p.x < 0.625) && 
                  ((p.y >= 0.125 && p.y < 0.375) || (p.y >= 0.625 && p.y < 0.875))) ||
                 (p.x >= 0.25 && p.x < 0.5 && p.y >= 0.0 && p.y < 0.125) ? 1.0 : 0.0;
        } else if (charIndex == 4) { // apostrophe
          return (p.x >= 0.375 && p.x < 0.625 && p.y >= 0.75 && p.y < 1.0) ? 1.0 : 0.0;
        } else if (charIndex == 5) { // '-' (dash)
          return (p.y >= 0.375 && p.y < 0.625 && p.x >= 0.25 && p.x < 0.75) ? 1.0 : 0.0;
        } else if (charIndex == 6) { // '_' (underscore)
          return (p.y >= 0.0 && p.y < 0.125 && p.x >= 0.125 && p.x < 0.875) ? 1.0 : 0.0;
        } else if (charIndex == 7) { // backtick
          return (p.x >= 0.25 && p.x < 0.5 && p.y >= 0.75 && p.y < 1.0) ? 1.0 : 0.0;
        } else if (charIndex == 8) { // tilde
          return ((p.y >= 0.375 && p.y < 0.625) && 
                  ((p.x >= 0.125 && p.x < 0.25) || (p.x >= 0.375 && p.x < 0.625) || (p.x >= 0.75 && p.x < 0.875))) ? 1.0 : 0.0;
        } else if (charIndex == 9) { // plus
          return ((p.x >= 0.375 && p.x < 0.625) || (p.y >= 0.375 && p.y < 0.625 && p.x >= 0.25 && p.x < 0.75)) ? 1.0 : 0.0;
        } else if (charIndex == 10) { // asterisk
          return ((p.x >= 0.375 && p.x < 0.625) || 
                  (p.y >= 0.375 && p.y < 0.625) ||
                  (abs(p.x - 0.5) == abs(p.y - 0.5) && p.x >= 0.25 && p.x < 0.75)) ? 1.0 : 0.0;
        } else if (charIndex == 11) { // caret
          return ((p.x >= 0.375 && p.x < 0.625 && p.y >= 0.625) ||
                  (p.y >= 0.75 && abs(p.x - 0.5) <= (p.y - 0.625) * 0.5)) ? 1.0 : 0.0;
        } else if (charIndex == 12) { // less than
          return (p.y >= 0.25 && p.y < 0.75 && abs(p.x - 0.25) <= abs(p.y - 0.5) * 0.5) ? 1.0 : 0.0;
        } else if (charIndex == 13) { // greater than
          return (p.y >= 0.25 && p.y < 0.75 && abs(p.x - 0.75) <= abs(p.y - 0.5) * 0.5) ? 1.0 : 0.0;
        } else if (charIndex == 14) { // lowercase v
          return (p.y >= 0.5 && abs(p.x - 0.5) <= (p.y - 0.25) * 0.5) ? 1.0 : 0.0;
        } else if (charIndex == 15) { // lowercase c
          float dx = abs(p.x - 0.5);
          float dy = abs(p.y - 0.5);
          return ((dx*dx + dy*dy) <= 0.25 && (dx*dx + dy*dy) >= 0.09 && p.x <= 0.5) ? 1.0 : 0.0;
        } else if (charIndex == 16) { // lowercase r
          return ((p.x <= 0.25) || (p.y >= 0.625 && p.x <= 0.5)) ? 1.0 : 0.0;
        } else if (charIndex == 17) { // lowercase s
          return ((p.y >= 0.75 && p.x >= 0.25 && p.x < 0.75) ||
                  (p.y >= 0.375 && p.y < 0.625 && p.x >= 0.25 && p.x < 0.75) ||
                  (p.y >= 0.0 && p.y < 0.25 && p.x >= 0.25 && p.x < 0.75) ||
                  (p.x <= 0.25 && p.y >= 0.5) ||
                  (p.x >= 0.75 && p.y < 0.5)) ? 1.0 : 0.0;
        } else if (charIndex == 18) { // lowercase x
          return (abs(p.x - 0.5) == abs(p.y - 0.5) && p.x >= 0.125 && p.x < 0.875) ? 1.0 : 0.0;
        } else if (charIndex == 19) { // lowercase z
          return ((p.y >= 0.75) || (p.y < 0.25) || (abs(p.x - 0.75) <= (0.75 - p.y) * 0.5 && p.y >= 0.25 && p.y < 0.75)) ? 1.0 : 0.0;
        } else if (charIndex == 20) { // lowercase o
          float dx = abs(p.x - 0.5);
          float dy = abs(p.y - 0.5);
          return ((dx*dx + dy*dy) <= 0.25 && (dx*dx + dy*dy) >= 0.09) ? 1.0 : 0.0;
        } else if (charIndex == 21) { // uppercase O
          float dx = abs(p.x - 0.5);
          float dy = abs(p.y - 0.5);
          return ((dx*dx + dy*dy) <= 0.3 && (dx*dx + dy*dy) >= 0.15) ? 1.0 : 0.0;
        } else if (charIndex == 22) { // eight
          float dx = abs(p.x - 0.5);
          float dy1 = abs(p.y - 0.25);
          float dy2 = abs(p.y - 0.75);
          return (((dx*dx + dy1*dy1) <= 0.09 || (dx*dx + dy2*dy2) <= 0.09) || 
                  (p.x >= 0.375 && p.x < 0.625 && p.y >= 0.375 && p.y < 0.625)) ? 1.0 : 0.0;
        } else if (charIndex == 23) { // at symbol
          float dx = abs(p.x - 0.5);
          float dy = abs(p.y - 0.5);
          return ((dx*dx + dy*dy) <= 0.25 && 
                  ((dx*dx + dy*dy) >= 0.16 || (p.x >= 0.5 && p.y >= 0.375))) ? 1.0 : 0.0;
        } else { // All remaining cases use dense patterns
          return 1.0; // Solid block for maximum density
        }
      }
      
      vec3 sampleAverageColor(vec2 charCoord, float charSize) {
        // Sample multiple points within the character cell for average color
        vec3 avgColor = vec3(0.0);
        float samples = 0.0;
        
        // Sample 4x4 grid within each character cell
        for (float x = 0.125; x < 1.0; x += 0.25) {
          for (float y = 0.125; y < 1.0; y += 0.25) {
            vec2 samplePos = (charCoord + vec2(x, y)) * charSize / resolution;
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
        
        // Calculate character grid position
        vec2 charCoord = floor(pixelCoord / characterSize);
        
        // Sample average color from the character cell
        vec3 cellAvgColor = sampleAverageColor(charCoord, characterSize);
        
        // Sample color from the center of each character cell for luminance calculation
        vec2 charCenter = (charCoord + 0.5) * characterSize / resolution;
        vec4 cellColor = texture2D(tDiffuse, charCenter);
        
        // Convert to grayscale (luminance)
        float luminance = dot(cellColor.rgb, vec3(0.299, 0.587, 0.114));
        
        // Apply contrast
        luminance = pow(luminance, 1.0 / contrast);
        
        // Quantize luminance to discrete levels (24 character levels)
        float quantizedLuminance = floor(luminance * 24.0) / 24.0;
        
        // Calculate character UV coordinates
        vec2 charUv = mod(pixelCoord, characterSize) / characterSize;
        
        // Map quantized luminance to discrete character levels (24 levels)
        int charIndex = int(floor(quantizedLuminance * 24.0));
        
        // Clamp to valid range
        if (charIndex < 0) charIndex = 0;
        if (charIndex > 23) charIndex = 23;
        
        // Get pattern for the character
        float pattern = getCharacterPattern(charIndex, charUv);
        
        // Create ASCII-style output using the average color from the cell
        vec3 asciiColor = cellAvgColor * pattern;
        
        // Blend with original color based on intensity
        vec3 finalColor = mix(color.rgb, asciiColor, intensity);
        
        gl_FragColor = vec4(finalColor, color.a);
      }
    `
  }
}