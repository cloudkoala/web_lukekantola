import * as THREE from 'three'

export class MotionBlurPass {
  private renderTargets: THREE.WebGLRenderTarget[] = []
  private velocityMaterial: THREE.ShaderMaterial
  private sphereVelocityMaterial: THREE.ShaderMaterial
  private blurMaterial: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  
  // Camera matrices for velocity calculation
  private currentViewProjectionMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private previousViewProjectionMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private inverseViewProjectionMatrix: THREE.Matrix4 = new THREE.Matrix4()
  
  // Sphere motion tracking
  private sphereMeshes: THREE.InstancedMesh[] = []
  private previousSphereMatrices: Map<THREE.InstancedMesh, Float32Array> = new Map()
  private sphereVelocityScene: THREE.Scene = new THREE.Scene()
  
  // Effect parameters - increased for more visible effect
  public intensity: number = 0.8
  public strength: number = 0.1
  public samples: number = 12
  public maxVelocity: number = 32.0 // Max velocity in pixels
  public velocityScale: number = 2.0
  public enableSphereMotion: boolean = false // Disabled by default for debugging
  public debugVelocityBuffer: boolean = false // Show velocity vectors as colors

  constructor(width: number, height: number) {
    // Create render targets
    this.renderTargets = [
      // Velocity buffer target
      new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType, // Changed back to standard type for compatibility
        depthBuffer: false
      }),
      // Final motion blur target
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

    // Create simple time-based velocity material (Pass 1: Generate simple motion vectors)
    this.velocityMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0.0 },
        resolution: { value: new THREE.Vector2(width, height) },
        velocityScale: { value: this.velocityScale }
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
        uniform float time;
        uniform vec2 resolution;
        uniform float velocityScale;
        varying vec2 vUv;

        void main() {
          // Create strong horizontal motion for testing
          vec2 center = vec2(0.5, 0.5);
          float distanceFromCenter = length(vUv - center);
          
          // Strong horizontal velocity that varies with time and position
          float horizontalVelocity = sin(time * 1.5) * velocityScale * 0.3;
          // Add some vertical component based on position
          float verticalVelocity = cos(time * 1.0 + distanceFromCenter * 10.0) * velocityScale * 0.1;
          
          vec2 velocity = vec2(horizontalVelocity, verticalVelocity);
          
          // Store velocity in RG channels, encode in 0-1 range
          // Use stronger encoding to make effect more visible
          gl_FragColor = vec4(velocity * 0.5 + 0.5, distanceFromCenter, 1.0);
        }
      `
    })

    // Create sphere velocity material (Pass 1b: Generate velocity for sphere instances)
    this.sphereVelocityMaterial = new THREE.ShaderMaterial({
      uniforms: {
        currentViewProjectionMatrix: { value: this.currentViewProjectionMatrix },
        previousViewProjectionMatrix: { value: this.previousViewProjectionMatrix },
        resolution: { value: new THREE.Vector2(width, height) },
        velocityScale: { value: this.velocityScale },
        previousInstanceMatrix: { value: null }, // Will be set per sphere mesh
      },
      vertexShader: `
        uniform mat4 currentViewProjectionMatrix;
        uniform mat4 previousViewProjectionMatrix;
        uniform float velocityScale;
        uniform sampler2D previousInstanceMatrix;
        varying vec2 vVelocity;
        varying vec2 vUv;

        // Helper function to reconstruct matrix from texture
        mat4 getMatrixFromTexture(sampler2D tex, float instanceId) {
          float texWidth = 4.0; // 4 pixels wide for 4x4 matrix
          float y = instanceId;
          
          vec4 row0 = texture2D(tex, vec2(0.5/texWidth, (y + 0.5) / texWidth));
          vec4 row1 = texture2D(tex, vec2(1.5/texWidth, (y + 0.5) / texWidth));
          vec4 row2 = texture2D(tex, vec2(2.5/texWidth, (y + 0.5) / texWidth));
          vec4 row3 = texture2D(tex, vec2(3.5/texWidth, (y + 0.5) / texWidth));
          
          return mat4(row0, row1, row2, row3);
        }

        void main() {
          vUv = uv;
          
          // Get instance ID
          float instanceId = float(gl_InstanceID);
          
          // Current position in world space
          vec4 currentWorldPos = instanceMatrix * vec4(position, 1.0);
          
          // Get previous instance matrix and transform position
          mat4 prevMatrix = getMatrixFromTexture(previousInstanceMatrix, instanceId);
          vec4 previousWorldPos = prevMatrix * vec4(position, 1.0);
          
          // Project to screen space
          vec4 currentClip = currentViewProjectionMatrix * currentWorldPos;
          vec4 previousClip = previousViewProjectionMatrix * previousWorldPos;
          
          vec2 currentScreen = (currentClip.xy / currentClip.w) * 0.5 + 0.5;
          vec2 previousScreen = (previousClip.xy / previousClip.w) * 0.5 + 0.5;
          
          // Calculate velocity
          vVelocity = (currentScreen - previousScreen) * velocityScale;
          
          gl_Position = currentClip;
        }
      `,
      fragmentShader: `
        varying vec2 vVelocity;
        varying vec2 vUv;
        uniform vec2 resolution;

        void main() {
          // Scale velocity by resolution to get pixel-space motion
          vec2 velocity = vVelocity * resolution;
          
          // Store velocity in RG channels, encode sign in B channel  
          gl_FragColor = vec4(velocity * 0.5 + 0.5, 1.0, 1.0);
        }
      `
    })

    // Create motion blur material (Pass 2: Apply motion blur using velocity buffer)
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tVelocity: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        strength: { value: this.strength },
        samples: { value: this.samples },
        maxVelocity: { value: this.maxVelocity },
        debugVelocityBuffer: { value: this.debugVelocityBuffer }
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
        uniform sampler2D tVelocity;
        uniform vec2 resolution;
        uniform float intensity;
        uniform float strength;
        uniform float samples;
        uniform float maxVelocity;
        uniform bool debugVelocityBuffer;
        varying vec2 vUv;

        void main() {
          // Sample original color
          vec4 originalColor = texture2D(tDiffuse, vUv);
          
          // Sample velocity vector
          vec4 velocityData = texture2D(tVelocity, vUv);
          vec2 velocity = (velocityData.rg - 0.5) * 2.0; // Decode from [0,1] to [-1,1]
          
          // Debug: Show velocity buffer as colors
          if (debugVelocityBuffer) {
            float velocityMagnitude = length(velocity);
            vec3 velocityColor = vec3(
              abs(velocity.x), // Red channel for horizontal velocity
              abs(velocity.y), // Green channel for vertical velocity  
              velocityMagnitude // Blue channel for magnitude
            );
            gl_FragColor = vec4(velocityColor, 1.0);
            return;
          }
          
          // Convert to pixel space and apply strength
          velocity = velocity * strength * maxVelocity;
          
          // Skip motion blur for very stationary pixels (lowered threshold)
          float velocityMagnitude = length(velocity);
          if (velocityMagnitude < 0.1) {
            gl_FragColor = originalColor;
            return;
          }
          
          // Clamp velocity to prevent extreme values
          if (velocityMagnitude > maxVelocity) {
            velocity = normalize(velocity) * maxVelocity;
          }
          
          // Calculate sampling step
          vec2 texelSize = 1.0 / resolution;
          vec2 velocityStep = velocity * texelSize / samples;
          
          // Accumulate color samples along velocity vector
          vec4 blurredColor = originalColor;
          float totalWeight = 1.0;
          
          // Sample along both directions of velocity vector
          int sampleCount = int(samples);
          for (int i = 1; i <= 16; i++) {
            if (i > sampleCount) break;
            
            float t = float(i) / samples;
            float weight = 1.0 - t; // Linear falloff
            
            // Sample in positive direction
            vec2 sampleUV1 = vUv + velocityStep * float(i);
            if (sampleUV1.x >= 0.0 && sampleUV1.x <= 1.0 && 
                sampleUV1.y >= 0.0 && sampleUV1.y <= 1.0) {
              blurredColor += texture2D(tDiffuse, sampleUV1) * weight;
              totalWeight += weight;
            }
            
            // Sample in negative direction  
            vec2 sampleUV2 = vUv - velocityStep * float(i);
            if (sampleUV2.x >= 0.0 && sampleUV2.x <= 1.0 && 
                sampleUV2.y >= 0.0 && sampleUV2.y <= 1.0) {
              blurredColor += texture2D(tDiffuse, sampleUV2) * weight;
              totalWeight += weight;
            }
          }
          
          // Normalize by total weight
          blurredColor /= totalWeight;
          
          // Mix original with blurred based on intensity
          gl_FragColor = mix(originalColor, blurredColor, intensity);
        }
      `
    })

    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.velocityMaterial)
    this.scene.add(this.mesh)
  }

  // Update camera matrices for velocity calculation
  updateCameraMatrices(camera: THREE.Camera) {
    // Store previous frame's matrix
    this.previousViewProjectionMatrix.copy(this.currentViewProjectionMatrix)
    
    // Calculate current view-projection matrix
    const viewMatrix = camera.matrixWorldInverse
    const projectionMatrix = camera.projectionMatrix
    this.currentViewProjectionMatrix.multiplyMatrices(projectionMatrix, viewMatrix)
    
    // Calculate inverse for world position reconstruction
    this.inverseViewProjectionMatrix.copy(this.currentViewProjectionMatrix).invert()
  }

  // Add sphere meshes to track for motion blur
  addSphereMesh(sphereMesh: THREE.InstancedMesh) {
    if (!this.sphereMeshes.includes(sphereMesh)) {
      this.sphereMeshes.push(sphereMesh)
      
      // Initialize previous matrices for this mesh
      const matrixArray = new Float32Array(sphereMesh.count * 16) // 16 floats per 4x4 matrix
      
      // Copy current matrices as initial previous matrices
      for (let i = 0; i < sphereMesh.count; i++) {
        const matrix = new THREE.Matrix4()
        sphereMesh.getMatrixAt(i, matrix)
        matrix.toArray(matrixArray, i * 16)
      }
      
      this.previousSphereMatrices.set(sphereMesh, matrixArray)
      
      // Add to velocity scene
      this.sphereVelocityScene.add(sphereMesh)
    }
  }

  // Remove sphere mesh from tracking
  removeSphereMesh(sphereMesh: THREE.InstancedMesh) {
    const index = this.sphereMeshes.indexOf(sphereMesh)
    if (index !== -1) {
      this.sphereMeshes.splice(index, 1)
      this.previousSphereMatrices.delete(sphereMesh)
      this.sphereVelocityScene.remove(sphereMesh)
    }
  }

  // Update previous sphere matrices before rendering
  updateSphereMatrices() {
    if (!this.enableSphereMotion) return
    
    this.sphereMeshes.forEach(sphereMesh => {
      const previousMatrices = this.previousSphereMatrices.get(sphereMesh)
      if (!previousMatrices) return
      
      // Store current matrices as previous for next frame
      for (let i = 0; i < sphereMesh.count; i++) {
        const matrix = new THREE.Matrix4()
        sphereMesh.getMatrixAt(i, matrix)
        matrix.toArray(previousMatrices, i * 16)
      }
    })
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, depthTexture?: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
    // Update uniforms with simple time-based motion
    this.velocityMaterial.uniforms.time.value = performance.now() * 0.001
    this.velocityMaterial.uniforms.tDiffuse.value = inputTexture
    this.velocityMaterial.uniforms.velocityScale.value = this.velocityScale
    
    this.blurMaterial.uniforms.intensity.value = this.intensity
    this.blurMaterial.uniforms.strength.value = this.strength
    this.blurMaterial.uniforms.samples.value = this.samples
    this.blurMaterial.uniforms.maxVelocity.value = this.maxVelocity
    this.blurMaterial.uniforms.debugVelocityBuffer.value = this.debugVelocityBuffer

    // Pass 1: Generate simple velocity buffer 
    this.mesh.material = this.velocityMaterial
    
    renderer.setRenderTarget(this.renderTargets[0])
    renderer.clear()
    renderer.render(this.scene, this.camera)

    // Pass 2: Apply motion blur using velocity buffer
    this.blurMaterial.uniforms.tDiffuse.value = inputTexture
    this.blurMaterial.uniforms.tVelocity.value = this.renderTargets[0].texture
    this.mesh.material = this.blurMaterial
    
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }

  setSize(width: number, height: number) {
    this.renderTargets.forEach(target => target.setSize(width, height))
    this.velocityMaterial.uniforms.resolution.value.set(width, height)
    this.blurMaterial.uniforms.resolution.value.set(width, height)
  }

  // Parameter setters
  setIntensity(intensity: number) {
    this.intensity = Math.max(0.0, Math.min(1.0, intensity))
  }

  setStrength(strength: number) {
    this.strength = Math.max(0.001, Math.min(1.0, strength))
  }

  setSamples(samples: number) {
    this.samples = Math.max(4, Math.min(16, Math.round(samples)))
  }

  setMaxVelocity(maxVelocity: number) {
    this.maxVelocity = Math.max(8.0, Math.min(128.0, maxVelocity))
  }

  setVelocityScale(scale: number) {
    this.velocityScale = Math.max(0.1, Math.min(5.0, scale))
  }

  setEnableSphereMotion(enabled: boolean) {
    this.enableSphereMotion = enabled
  }

  setDebugVelocityBuffer(enabled: boolean) {
    this.debugVelocityBuffer = enabled
  }

  dispose() {
    this.renderTargets.forEach(target => target.dispose())
    this.velocityMaterial.dispose()
    this.sphereVelocityMaterial.dispose()
    this.blurMaterial.dispose()
    this.mesh.geometry.dispose()
    
    // Clear sphere tracking
    this.sphereMeshes = []
    this.previousSphereMatrices.clear()
    this.sphereVelocityScene.clear()
  }
}