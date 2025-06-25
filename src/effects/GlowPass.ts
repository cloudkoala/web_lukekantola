import * as THREE from 'three'

export class GlowPass {
  private renderTargets: THREE.WebGLRenderTarget[] = []
  private brightPassMaterial: THREE.ShaderMaterial
  private horizontalBlurMaterial: THREE.ShaderMaterial
  private verticalBlurMaterial: THREE.ShaderMaterial
  private combineMaterial: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  // Effect parameters
  public intensity: number = 1.0
  public threshold: number = 0.8
  public thresholdSoftness: number = 0.01
  public radius: number = 1.0
  public strength: number = 2.0
  public softness: number = 0.5
  public iterations: number = 1

  constructor(width: number, height: number) {
    // Create render targets for multi-pass rendering
    this.renderTargets = [
      // Bright pass target
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      }),
      // Horizontal blur target
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      }),
      // Vertical blur target
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

    // Create bright pass material (extracts bright pixels above threshold)
    this.brightPassMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        threshold: { value: this.threshold },
        smoothWidth: { value: this.thresholdSoftness }
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
        uniform float threshold;
        uniform float smoothWidth;
        varying vec2 vUv;

        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          float luminance = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
          
          // Smooth threshold using smoothstep for better quality
          float contribution = smoothstep(threshold - smoothWidth, threshold + smoothWidth, luminance);
          
          gl_FragColor = vec4(texel.rgb * contribution, texel.a);
        }
      `
    })

    // Create horizontal blur material
    this.horizontalBlurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
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
        uniform float radius;
        varying vec2 vUv;

        // Gaussian weight calculation
        float gaussian(float x, float sigma) {
          return exp(-(x * x) / (2.0 * sigma * sigma));
        }

        void main() {
          vec2 texelSize = 1.0 / resolution;
          vec4 color = vec4(0.0);
          float totalWeight = 0.0;
          
          // Calculate sigma from radius
          float sigma = radius * 0.5;
          if (sigma < 0.1) sigma = 0.1;
          
          // Sample range based on radius
          int samples = int(ceil(radius * 2.0));
          samples = min(samples, 15); // Limit for performance
          
          for (int i = -15; i <= 15; i++) {
            if (abs(i) > samples) continue;
            
            float offset = float(i) * texelSize.x * radius;
            float weight = gaussian(float(i), sigma);
            
            vec4 texSample = texture2D(tDiffuse, vUv + vec2(offset, 0.0));
            color += texSample * weight;
            totalWeight += weight;
          }
          
          gl_FragColor = color / totalWeight;
        }
      `
    })

    // Create vertical blur material
    this.verticalBlurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
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
        uniform float radius;
        varying vec2 vUv;

        // Gaussian weight calculation
        float gaussian(float x, float sigma) {
          return exp(-(x * x) / (2.0 * sigma * sigma));
        }

        void main() {
          vec2 texelSize = 1.0 / resolution;
          vec4 color = vec4(0.0);
          float totalWeight = 0.0;
          
          // Calculate sigma from radius
          float sigma = radius * 0.5;
          if (sigma < 0.1) sigma = 0.1;
          
          // Sample range based on radius
          int samples = int(ceil(radius * 2.0));
          samples = min(samples, 15); // Limit for performance
          
          for (int i = -15; i <= 15; i++) {
            if (abs(i) > samples) continue;
            
            float offset = float(i) * texelSize.y * radius;
            float weight = gaussian(float(i), sigma);
            
            vec4 texSample = texture2D(tDiffuse, vUv + vec2(0.0, offset));
            color += texSample * weight;
            totalWeight += weight;
          }
          
          gl_FragColor = color / totalWeight;
        }
      `
    })

    // Create combine material (blends original with glow)
    this.combineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tGlow: { value: null },
        intensity: { value: this.intensity },
        strength: { value: this.strength },
        softness: { value: this.softness }
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
        uniform sampler2D tGlow;
        uniform float intensity;
        uniform float strength;
        uniform float softness;
        varying vec2 vUv;

        void main() {
          vec4 original = texture2D(tDiffuse, vUv);
          vec4 glow = texture2D(tGlow, vUv);
          
          // Apply strength and softness to glow
          glow.rgb *= strength;
          glow.rgb = pow(glow.rgb, vec3(1.0 / softness));
          
          // Screen blend mode for additive glow effect
          vec3 screenBlend = original.rgb + glow.rgb - (original.rgb * glow.rgb);
          
          // Mix with original based on intensity
          vec3 result = mix(original.rgb, screenBlend, intensity);
          
          gl_FragColor = vec4(result, original.a);
        }
      `
    })

    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.brightPassMaterial)
    this.scene.add(this.mesh)
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Update uniforms
    this.brightPassMaterial.uniforms.threshold.value = this.threshold
    this.brightPassMaterial.uniforms.smoothWidth.value = this.thresholdSoftness
    this.horizontalBlurMaterial.uniforms.radius.value = this.radius
    this.verticalBlurMaterial.uniforms.radius.value = this.radius
    this.combineMaterial.uniforms.intensity.value = this.intensity
    this.combineMaterial.uniforms.strength.value = this.strength
    this.combineMaterial.uniforms.softness.value = this.softness

    // Pass 1: Extract bright pixels above threshold
    this.brightPassMaterial.uniforms.tDiffuse.value = inputTexture
    this.mesh.material = this.brightPassMaterial
    
    renderer.setRenderTarget(this.renderTargets[0])
    renderer.clear()
    renderer.render(this.scene, this.camera)

    // Multiple iterations of blur passes for stronger glow
    let currentTexture = this.renderTargets[0].texture
    
    for (let i = 0; i < this.iterations; i++) {
      // Pass 2: Horizontal blur
      this.horizontalBlurMaterial.uniforms.tDiffuse.value = currentTexture
      this.mesh.material = this.horizontalBlurMaterial
      
      renderer.setRenderTarget(this.renderTargets[1])
      renderer.clear()
      renderer.render(this.scene, this.camera)

      // Pass 3: Vertical blur
      this.verticalBlurMaterial.uniforms.tDiffuse.value = this.renderTargets[1].texture
      this.mesh.material = this.verticalBlurMaterial
      
      renderer.setRenderTarget(this.renderTargets[2])
      renderer.clear()
      renderer.render(this.scene, this.camera)
      
      // Use the result as input for next iteration
      currentTexture = this.renderTargets[2].texture
    }

    // Pass 4: Combine original with glow
    this.combineMaterial.uniforms.tDiffuse.value = inputTexture
    this.combineMaterial.uniforms.tGlow.value = this.renderTargets[2].texture
    this.mesh.material = this.combineMaterial
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }

  setSize(width: number, height: number) {
    this.renderTargets.forEach(target => target.setSize(width, height))
    this.horizontalBlurMaterial.uniforms.resolution.value.set(width, height)
    this.verticalBlurMaterial.uniforms.resolution.value.set(width, height)
  }

  // Parameter setters
  setIntensity(intensity: number) {
    this.intensity = Math.max(0.0, Math.min(2.0, intensity))
  }

  setThreshold(threshold: number) {
    this.threshold = Math.max(0.0, Math.min(1.0, threshold))
  }

  setThresholdSoftness(softness: number) {
    this.thresholdSoftness = Math.max(0.001, Math.min(0.2, softness))
  }

  setRadius(radius: number) {
    this.radius = Math.max(0.1, Math.min(5.0, radius))
  }

  setStrength(strength: number) {
    this.strength = Math.max(0.1, Math.min(10.0, strength))
  }

  setSoftness(softness: number) {
    this.softness = Math.max(0.1, Math.min(3.0, softness))
  }

  setIterations(iterations: number) {
    this.iterations = Math.max(1, Math.min(5, Math.round(iterations)))
  }

  dispose() {
    this.renderTargets.forEach(target => target.dispose())
    this.brightPassMaterial.dispose()
    this.horizontalBlurMaterial.dispose()
    this.verticalBlurMaterial.dispose()
    this.combineMaterial.dispose()
    this.mesh.geometry.dispose()
  }
}