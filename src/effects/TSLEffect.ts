import * as THREE from 'three'

interface TSLParameters {
  enabled: boolean
  effectType: 'crt' | 'wave' | 'noise' | 'hologram'
  intensity: number
  speed: number
  scale: number
}

export class TSLEffect {
  private webGPUSupported: boolean = false
  private tslMaterial: THREE.ShaderMaterial | null = null
  private uniforms: { [key: string]: THREE.IUniform } = {}
  
  constructor(_renderer: THREE.WebGLRenderer) {
    this.webGPUSupported = this.checkWebGPUSupport()
    this.initializeUniforms()
  }
  
  private checkWebGPUSupport(): boolean {
    // Check for WebGPU support without importing the module (to avoid top-level await issues)
    try {
      return typeof navigator !== 'undefined' && 'gpu' in navigator
    } catch (error) {
      return false
    }
  }

  private initializeUniforms() {
    this.uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0.5 },
      uSpeed: { value: 1.0 },
      uScale: { value: 1.0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    }
  }

  isWebGPUSupported(): boolean {
    return this.webGPUSupported
  }

  createTSLMaterial(parameters: TSLParameters): THREE.ShaderMaterial {
    // For now, use enhanced GLSL shaders (TSL nodes not available in this Three.js version)
    // Future enhancement: full TSL integration when WebGPU renderer is more mature
    const material = this.createEnhancedGLSLMaterial(parameters)
    this.tslMaterial = material
    return material
  }

  private createEnhancedGLSLMaterial(parameters: TSLParameters): THREE.ShaderMaterial {
    const vertexShader = `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uSpeed;
      uniform float uScale;
      uniform vec2 uResolution;
      uniform sampler2D tDiffuse;
      
      varying vec2 vUv;
      
      // Enhanced pseudo-random function
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      
      // Improved noise function
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
      
      void main() {
        vec2 uv = vUv;
        vec3 inputColor = texture2D(tDiffuse, uv).rgb;
        vec3 color = vec3(0.0);
        
        ${this.getEnhancedFragmentEffect(parameters.effectType)}
        
        // Mix with input texture for overlay effect
        color = mix(inputColor, color, uIntensity);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `

    return new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        tDiffuse: { value: null }
      },
      vertexShader,
      fragmentShader,
      transparent: true
    })
  }

  private getEnhancedFragmentEffect(effectType: string): string {
    switch (effectType) {
      case 'crt':
        return `
          // Enhanced CRT effect with WebGPU-style features
          float time = uTime * uSpeed;
          
          // CRT scanlines with animation
          float scanline = sin(uv.y * 800.0 + time * 5.0) * 0.04;
          float scanlineGlow = sin(uv.y * 200.0 + time * 2.0) * 0.02;
          
          // CRT curvature
          vec2 curved = (uv - 0.5) * 2.0;
          float curvature = length(curved) * 0.1;
          
          // Phosphor glow
          vec3 phosphor = vec3(0.2, 0.8, 0.2); // Green CRT color
          float glow = 1.0 - curvature;
          
          // Flicker effect
          float flicker = sin(time * 30.0) * 0.02 + 0.98;
          
          color = phosphor * glow * flicker + scanline + scanlineGlow;
        `
      case 'wave':
        return `
          // Enhanced wave effect with multiple frequencies
          float time = uTime * uSpeed;
          
          // Multiple wave frequencies
          float wave1 = sin(uv.x * uScale * 5.0 + time * 2.0) * 0.1;
          float wave2 = sin(uv.y * uScale * 3.0 + time * 1.5) * 0.05;
          float wave3 = sin((uv.x + uv.y) * uScale * 7.0 + time * 3.0) * 0.03;
          
          vec2 distortedUV = uv + vec2(wave1 + wave3, wave2 + wave3);
          
          // Dynamic color based on waves
          color = vec3(
            sin(time + wave1 * 10.0) * 0.5 + 0.5,
            cos(time * 1.2 + wave2 * 8.0) * 0.5 + 0.5,
            sin(time * 0.8 + wave3 * 12.0) * 0.5 + 0.5
          );
          
          // Add wave brightness variation
          float brightness = 0.5 + (wave1 + wave2 + wave3) * 2.0;
          color *= brightness;
        `
      case 'noise':
        return `
          // Enhanced noise with multiple octaves
          float time = uTime * uSpeed;
          vec2 noisePos = uv * uScale + time * 0.1;
          
          // Multi-octave noise
          float n1 = noise(noisePos);
          float n2 = noise(noisePos * 2.0) * 0.5;
          float n3 = noise(noisePos * 4.0) * 0.25;
          
          float totalNoise = n1 + n2 + n3;
          
          // Animated noise with color cycling
          float animatedNoise = sin(totalNoise * 3.14159 + time) * 0.5 + 0.5;
          
          // Color variation based on noise
          color = vec3(
            animatedNoise,
            sin(animatedNoise * 2.0 + time) * 0.5 + 0.5,
            cos(animatedNoise * 1.5 + time * 0.7) * 0.5 + 0.5
          );
        `
      case 'hologram':
        return `
          // Enhanced hologram effect
          float time = uTime * uSpeed;
          
          // Multiple hologram line frequencies
          float lines1 = sin(uv.y * 100.0 + time * 2.0) * 0.5 + 0.5;
          float lines2 = sin(uv.y * 300.0 + time * 3.0) * 0.3 + 0.7;
          float linesX = sin(uv.x * 50.0 + time * 1.5) * 0.2 + 0.8;
          
          // Hologram interference patterns
          float interference = sin(uv.x * 10.0 + time) * sin(uv.y * 15.0 + time * 1.3) * 0.1;
          
          // Dynamic flicker with multiple frequencies
          float flicker1 = sin(time * 10.0) * 0.05 + 0.95;
          float flicker2 = sin(time * 25.0 + 1.0) * 0.03 + 0.97;
          
          // Hologram color (cyan/blue with interference)
          vec3 hologramColor = vec3(0.2, 0.8, 1.0);
          hologramColor.g += interference;
          
          color = hologramColor * lines1 * lines2 * linesX * flicker1 * flicker2;
          
          // Add edge glow
          float edge = 1.0 - length(uv - 0.5) * 2.0;
          color += hologramColor * edge * 0.2;
        `
      default:
        return 'color = vec3(0.5, 0.5, 0.5);'
    }
  }

  updateUniforms(parameters: TSLParameters, deltaTime: number) {
    this.uniforms.uTime.value += deltaTime * parameters.speed
    this.uniforms.uIntensity.value = parameters.intensity
    this.uniforms.uSpeed.value = parameters.speed
    this.uniforms.uScale.value = parameters.scale
  }

  setSize(width: number, height: number) {
    this.uniforms.uResolution.value.set(width, height)
  }

  dispose() {
    if (this.tslMaterial) {
      this.tslMaterial.dispose()
      this.tslMaterial = null
    }
  }
}