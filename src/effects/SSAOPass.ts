import * as THREE from 'three'

export class SSAOPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  // SSAO parameters
  public intensity: number = 0.5
  public radius: number = 2.0
  public strength: number = 1.5
  public bias: number = 0.05
  public samples: number = 16
  public quality: number = 2
  public aoOnly: number = 0
  public debugDepth: number = 0

  constructor(width: number, height: number) {
    // Create render target
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })

    // Create orthographic camera and scene
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.scene = new THREE.Scene()

    // Create material with SSAO shader
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        aoRadius: { value: this.radius },
        aoStrength: { value: this.strength },
        aoBias: { value: this.bias },
        aoSamples: { value: this.samples },
        aoQuality: { value: this.quality },
        aoOnly: { value: this.aoOnly },
        debugDepth: { value: this.debugDepth }
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
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float intensity;
        uniform float aoRadius;
        uniform float aoStrength;
        uniform float aoBias;
        uniform float aoSamples;
        uniform float aoQuality;
        uniform float aoOnly;
        uniform float debugDepth;
        varying vec2 vUv;

        // Helper function to decode depth from RGBA depth texture
        float decodeDepth(vec4 rgba) {
          return dot(rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
        }

        // BASIC WORKING SSAO - No depth buffer needed
        vec3 ssao(vec3 color, vec2 uv) {
          // Debug mode - just show we're working
          if (debugDepth > 0.5) {
            return vec3(uv.x, uv.y, 0.5); // Show UV coordinates
          }
          
          // Simple edge-based ambient occlusion using color differences
          float ao = 0.0;
          float samples = min(aoSamples, 8.0);
          float radius = aoRadius * 0.005;
          
          // Get current pixel luminance
          float centerLum = dot(color, vec3(0.299, 0.587, 0.114));
          
          for (float i = 0.0; i < samples; i += 1.0) {
            float angle = (i / samples) * 6.28318;
            vec2 offset = vec2(cos(angle), sin(angle)) * radius;
            vec2 sampleUV = uv + offset;
            
            if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
              vec4 sampleColor = texture2D(tDiffuse, sampleUV);
              float sampleLum = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
              
              // If neighbor is darker, it contributes to occlusion
              if (sampleLum < centerLum - aoBias) {
                ao += aoStrength / samples;
              }
            }
          }
          
          ao = clamp(ao, 0.0, 1.0);
          
          if (aoOnly > 0.5) {
            return vec3(1.0 - ao); // Show AO mask
          } else {
            return color * (1.0 - ao * intensity);
          }
        }

        void main() {
          vec4 originalColor = texture2D(tDiffuse, vUv);
          vec3 result = ssao(originalColor.rgb, vUv);
          gl_FragColor = vec4(result, originalColor.a);
        }
      `
    })

    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.mesh)
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, depthTexture?: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Update uniforms
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.tDepth.value = depthTexture || null
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.aoRadius.value = this.radius
    this.material.uniforms.aoStrength.value = this.strength
    this.material.uniforms.aoBias.value = this.bias
    this.material.uniforms.aoSamples.value = this.samples
    this.material.uniforms.aoQuality.value = this.quality
    this.material.uniforms.aoOnly.value = this.aoOnly
    this.material.uniforms.debugDepth.value = this.debugDepth

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
}