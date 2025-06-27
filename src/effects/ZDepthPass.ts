import * as THREE from 'three'

export class ZDepthPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  
  // Z-Depth parameters
  public enabled: boolean = false
  public intensity: number = 1.0
  public near: number = 1.0
  public far: number = 10.0
  
  constructor(width: number, height: number) {
    // Create render target for the effect
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Create Z-Depth shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        near: { value: this.near },
        far: { value: this.far }
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
  
  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, depthTexture?: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    console.log('ZDepthPass: render() called with intensity:', this.intensity, 'near:', this.near, 'far:', this.far, 'hasDepth:', !!depthTexture)
    
    // Update uniforms
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.tDepth.value = depthTexture || null
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.near.value = this.near
    this.material.uniforms.far.value = this.far
    
    console.log('ZDepthPass: Rendering with uniforms - intensity:', this.material.uniforms.intensity.value, 'near:', this.near, 'far:', this.far)
    
    // Render to output
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
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float intensity;
      uniform float near;
      uniform float far;
      
      varying vec2 vUv;
      
      void main() {
        vec4 originalColor = texture2D(tDiffuse, vUv);
        
        // Read depth value from depth buffer
        float depth = texture2D(tDepth, vUv).r;
        
        // Simple depth visualization for debugging
        // Raw depth: 0 = near (white), 1 = far (black)  
        float depthVis = 1.0 - depth;
        
        // Apply near/far range scaling
        float normalizedDepth = (depth * (far - near) + near) / 50.0;
        normalizedDepth = clamp(normalizedDepth, 0.0, 1.0);
        
        // Handle near > far swap
        if (near > far) {
          normalizedDepth = 1.0 - normalizedDepth;
        }
        
        // Final depth color
        vec3 depthColor = vec3(1.0 - normalizedDepth);
        vec3 finalColor = mix(originalColor.rgb, depthColor, intensity);
        
        gl_FragColor = vec4(finalColor, originalColor.a);
      }
    `
  }
}