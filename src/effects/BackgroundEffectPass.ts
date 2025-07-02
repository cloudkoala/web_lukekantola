import * as THREE from 'three'

export class BackgroundEffectPass {
  private material: THREE.ShaderMaterial
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private mesh: THREE.Mesh
  private renderTarget: THREE.WebGLRenderTarget | null = null

  // Effect parameters
  public enabled: boolean = true
  public intensity: number = 1.0
  public speed: number = 1.0
  public scale: number = 1.0
  public pattern: 'gradient' | 'waves' | 'noise' | 'geometric' = 'gradient'
  public colorA: THREE.Color = new THREE.Color(0x151515)
  public colorB: THREE.Color = new THREE.Color(0x333333)

  // Performance parameters
  private qualityLevel: 'low' | 'medium' | 'high' = 'high'
  private samples: number = 16
  private iterations: number = 8

  constructor(width: number, height: number) {
    // Create fullscreen quad geometry (same pattern as CirclePackingPass)
    const geometry = new THREE.PlaneGeometry(2, 2)

    // Initialize shader material with comprehensive uniforms
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(width, height) },
        mousePosition: { value: new THREE.Vector2(0.5, 0.5) },
        intensity: { value: this.intensity },
        speed: { value: this.speed },
        scale: { value: this.scale },
        pattern: { value: 0 }, // 0=gradient, 1=waves, 2=noise, 3=geometric
        colorA: { value: this.colorA },
        colorB: { value: this.colorB },
        samples: { value: this.samples },
        iterations: { value: this.iterations }
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec2 resolution;
        uniform vec2 mousePosition;
        uniform float intensity;
        uniform float speed;
        uniform float scale;
        uniform int pattern;
        uniform vec3 colorA;
        uniform vec3 colorB;
        uniform int samples;
        uniform int iterations;
        
        varying vec2 vUv;
        
        // Noise functions
        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        
        float noise(vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);
          
          float a = random(i);
          float b = random(i + vec2(1.0, 0.0));
          float c = random(i + vec2(0.0, 1.0));
          float d = random(i + vec2(1.0, 1.0));
          
          vec2 u = f * f * (3.0 - 2.0 * f);
          
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        
        // Fractal noise
        float fbm(vec2 st) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          
          for (int i = 0; i < 4; i++) {
            if (i >= iterations) break;
            value += amplitude * noise(st * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          
          return value;
        }
        
        // Animated gradient pattern
        vec3 gradientPattern(vec2 uv) {
          float wave = sin(uv.x * 3.14159 * 2.0 + time * speed) * 0.5 + 0.5;
          wave += sin(uv.y * 3.14159 * 1.5 + time * speed * 0.7) * 0.3;
          wave = smoothstep(0.2, 0.8, wave);
          
          return mix(colorA, colorB, wave * intensity);
        }
        
        // Wave pattern
        vec3 wavePattern(vec2 uv) {
          vec2 mouse = mousePosition;
          float dist = distance(uv, mouse);
          
          float wave = sin(dist * 20.0 * scale - time * speed * 5.0) * exp(-dist * 3.0);
          wave *= intensity;
          
          vec3 baseColor = mix(colorA, colorB, 0.5);
          return baseColor + wave * (colorB - colorA);
        }
        
        // Noise pattern
        vec3 noisePattern(vec2 uv) {
          vec2 scaledUv = uv * scale;
          float noiseValue = fbm(scaledUv + time * speed * 0.1);
          noiseValue = smoothstep(0.3, 0.7, noiseValue);
          
          return mix(colorA, colorB, noiseValue * intensity);
        }
        
        // Geometric grid pattern
        vec3 geometricPattern(vec2 uv) {
          vec2 scaledUv = (uv - 0.5) * scale;
          vec2 id = floor(scaledUv / 0.2);
          vec2 gUv = fract(scaledUv / 0.2) - 0.5;
          
          float dist = length(gUv);
          float anim = sin(time * speed + length(id) * 0.5) * 0.5 + 0.5;
          
          float pattern = smoothstep(0.4, 0.1, dist - anim * 0.3);
          pattern += smoothstep(0.2, 0.05, dist - anim * 0.15) * 0.5;
          
          vec3 gridColor = vec3(pattern * 0.3, pattern * 0.5, pattern * 0.8);
          return mix(colorA, colorB, length(gridColor) * intensity);
        }
        
        void main() {
          vec2 uv = vUv;
          vec3 color;
          
          if (pattern == 0) {
            color = gradientPattern(uv);
          } else if (pattern == 1) {
            color = wavePattern(uv);
          } else if (pattern == 2) {
            color = noisePattern(uv);
          } else {
            color = geometricPattern(uv);
          }
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    })

    // Create mesh with fullscreen quad
    this.mesh = new THREE.Mesh(geometry, this.material)

    // Create scene and camera for background rendering
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  // Update method called each frame
  update(deltaTime: number, mouseX: number = 0.5, mouseY: number = 0.5) {
    if (!this.enabled) return

    // Update time uniform
    this.material.uniforms.time.value += deltaTime

    // Update mouse position
    this.material.uniforms.mousePosition.value.set(mouseX, mouseY)

    // Update effect parameters
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.speed.value = this.speed
    this.material.uniforms.scale.value = this.scale
    this.material.uniforms.colorA.value.copy(this.colorA)
    this.material.uniforms.colorB.value.copy(this.colorB)

    // Update pattern type
    const patternMap = { gradient: 0, waves: 1, noise: 2, geometric: 3 }
    this.material.uniforms.pattern.value = patternMap[this.pattern]
  }

  // Render the background effect
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget | null) {
    if (!this.enabled) return

    // Render background (target should already be set by caller)
    renderer.render(this.scene, this.camera)
  }

  // Performance scaling integration
  updateQuality(currentFPS: number) {
    let newQualityLevel = this.qualityLevel

    if (currentFPS < 30 && this.qualityLevel !== 'low') {
      newQualityLevel = 'low'
    } else if (currentFPS > 50 && currentFPS < 45 && this.qualityLevel !== 'medium') {
      newQualityLevel = 'medium'
    } else if (currentFPS >= 45 && this.qualityLevel !== 'high') {
      newQualityLevel = 'high'
    }

    if (newQualityLevel !== this.qualityLevel) {
      this.qualityLevel = newQualityLevel
      this.updateShaderComplexity()
    }
  }

  private updateShaderComplexity() {
    const complexityMap = {
      low: { samples: 4, iterations: 2 },
      medium: { samples: 8, iterations: 4 },
      high: { samples: 16, iterations: 8 }
    }

    const settings = complexityMap[this.qualityLevel]
    this.samples = settings.samples
    this.iterations = settings.iterations
    
    this.material.uniforms.samples.value = this.samples
    this.material.uniforms.iterations.value = this.iterations
  }

  // Resize handling
  resize(width: number, height: number) {
    this.material.uniforms.resolution.value.set(width, height)
  }

  // Pattern switching methods
  setPattern(pattern: 'gradient' | 'waves' | 'noise' | 'geometric') {
    this.pattern = pattern
  }

  // Color setting methods
  setColorA(color: THREE.Color | string | number) {
    if (typeof color === 'string' || typeof color === 'number') {
      this.colorA.set(color)
    } else {
      this.colorA.copy(color)
    }
  }

  setColorB(color: THREE.Color | string | number) {
    if (typeof color === 'string' || typeof color === 'number') {
      this.colorB.set(color)
    } else {
      this.colorB.copy(color)
    }
  }

  // Cleanup
  dispose() {
    this.material.dispose()
    this.mesh.geometry.dispose()
    
    if (this.renderTarget) {
      this.renderTarget.dispose()
    }
  }
}