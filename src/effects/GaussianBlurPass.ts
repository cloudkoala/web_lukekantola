import * as THREE from 'three'

export class GaussianBlurPass {
  private renderTargets: THREE.WebGLRenderTarget[] = []
  private horizontalMaterial: THREE.ShaderMaterial
  private verticalMaterial: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  // Effect parameters
  public blurAmount: number = 1.0
  public radius: number = 5
  public iterations: number = 1

  constructor(width: number, height: number) {
    // Create render targets for ping-pong rendering
    this.renderTargets = [
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      }),
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      })
    ]

    // Create orthographic camera and scene
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.scene = new THREE.Scene()

    // Create horizontal blur material
    this.horizontalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        blurAmount: { value: this.blurAmount },
        radius: { value: this.radius }
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
        uniform float blurAmount;
        uniform float radius;
        varying vec2 vUv;

        // Generate Gaussian weights for given radius
        float gaussian(float x, float sigma) {
          return exp(-(x * x) / (2.0 * sigma * sigma)) / (sigma * sqrt(6.28318530718));
        }

        vec3 gaussianBlurHorizontal(sampler2D tex, vec2 uv, vec2 resolution, float amount, float blurRadius) {
          vec3 color = vec3(0.0);
          float totalWeight = 0.0;
          
          // Calculate sigma from radius (radius ≈ 3*sigma for 99.7% coverage)
          float sigma = blurRadius / 3.0;
          if (sigma < 0.1) sigma = 0.1; // Prevent division by zero
          
          // Sample range based on radius
          int samples = int(ceil(blurRadius));
          samples = min(samples, 32); // Limit for performance
          
          // Calculate step size
          float texelSize = 1.0 / resolution.x;
          
          for (int i = -32; i <= 32; i++) {
            if (abs(i) > samples) continue;
            
            float offset = float(i) * texelSize * amount;
            float weight = gaussian(float(i), sigma);
            
            vec3 texSample = texture2D(tex, uv + vec2(offset, 0.0)).rgb;
            color += texSample * weight;
            totalWeight += weight;
          }
          
          return color / totalWeight;
        }

        void main() {
          gl_FragColor = vec4(gaussianBlurHorizontal(tDiffuse, vUv, resolution, blurAmount, radius), 1.0);
        }
      `
    })

    // Create vertical blur material
    this.verticalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        blurAmount: { value: this.blurAmount },
        radius: { value: this.radius }
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
        uniform float blurAmount;
        uniform float radius;
        varying vec2 vUv;

        // Generate Gaussian weights for given radius
        float gaussian(float x, float sigma) {
          return exp(-(x * x) / (2.0 * sigma * sigma)) / (sigma * sqrt(6.28318530718));
        }

        vec3 gaussianBlurVertical(sampler2D tex, vec2 uv, vec2 resolution, float amount, float blurRadius) {
          vec3 color = vec3(0.0);
          float totalWeight = 0.0;
          
          // Calculate sigma from radius (radius ≈ 3*sigma for 99.7% coverage)
          float sigma = blurRadius / 3.0;
          if (sigma < 0.1) sigma = 0.1; // Prevent division by zero
          
          // Sample range based on radius
          int samples = int(ceil(blurRadius));
          samples = min(samples, 32); // Limit for performance
          
          // Calculate step size
          float texelSize = 1.0 / resolution.y;
          
          for (int i = -32; i <= 32; i++) {
            if (abs(i) > samples) continue;
            
            float offset = float(i) * texelSize * amount;
            float weight = gaussian(float(i), sigma);
            
            vec3 texSample = texture2D(tex, uv + vec2(0.0, offset)).rgb;
            color += texSample * weight;
            totalWeight += weight;
          }
          
          return color / totalWeight;
        }

        void main() {
          gl_FragColor = vec4(gaussianBlurVertical(tDiffuse, vUv, resolution, blurAmount, radius), 1.0);
        }
      `
    })

    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.horizontalMaterial)
    this.scene.add(this.mesh)
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Update uniforms
    this.horizontalMaterial.uniforms.blurAmount.value = this.blurAmount
    this.horizontalMaterial.uniforms.radius.value = this.radius
    this.verticalMaterial.uniforms.blurAmount.value = this.blurAmount
    this.verticalMaterial.uniforms.radius.value = this.radius

    let currentTexture = inputTexture
    
    // Perform multiple iterations for stronger blur
    for (let i = 0; i < this.iterations; i++) {
      // Horizontal pass
      this.horizontalMaterial.uniforms.tDiffuse.value = currentTexture
      this.mesh.material = this.horizontalMaterial
      
      renderer.setRenderTarget(this.renderTargets[0])
      renderer.clear()
      renderer.render(this.scene, this.camera)
      
      // Vertical pass
      this.verticalMaterial.uniforms.tDiffuse.value = this.renderTargets[0].texture
      this.mesh.material = this.verticalMaterial
      
      // On the last iteration, render to output target
      const target = (i === this.iterations - 1) ? (outputTarget || null) : this.renderTargets[1]
      renderer.setRenderTarget(target)
      renderer.clear()
      renderer.render(this.scene, this.camera)
      
      // Use the result as input for next iteration
      currentTexture = this.renderTargets[1].texture
    }
  }

  setSize(width: number, height: number) {
    this.renderTargets.forEach(target => target.setSize(width, height))
    this.horizontalMaterial.uniforms.resolution.value.set(width, height)
    this.verticalMaterial.uniforms.resolution.value.set(width, height)
  }

  // Parameter setters
  setBlurAmount(amount: number) {
    this.blurAmount = Math.max(0.0, Math.min(10.0, amount))
  }

  setRadius(radius: number) {
    this.radius = Math.max(1, Math.min(50, Math.round(radius)))
  }

  setIterations(iterations: number) {
    this.iterations = Math.max(1, Math.min(10, Math.round(iterations)))
  }

  dispose() {
    this.renderTargets.forEach(target => target.dispose())
    this.horizontalMaterial.dispose()
    this.verticalMaterial.dispose()
    this.mesh.geometry.dispose()
  }
}