import * as THREE from 'three'

// Singleton geometry cache for sphere reuse
class GeometryCache {
  private static instance: GeometryCache
  private cache = new Map<string, THREE.SphereGeometry>()
  
  static getInstance(): GeometryCache {
    if (!GeometryCache.instance) {
      GeometryCache.instance = new GeometryCache()
    }
    return GeometryCache.instance
  }
  
  getGeometry(widthSegments: number, heightSegments: number): THREE.SphereGeometry {
    const key = `${widthSegments}-${heightSegments}`
    if (!this.cache.has(key)) {
      this.cache.set(key, new THREE.SphereGeometry(1, widthSegments, heightSegments))
    }
    return this.cache.get(key)!
  }
  
  dispose(): void {
    this.cache.forEach(geometry => geometry.dispose())
    this.cache.clear()
  }
}

// Material pool for reusing shader materials
class MaterialPool {
  private static instance: MaterialPool
  private coloredMaterials = new Map<string, THREE.ShaderMaterial>()
  private simpleMaterials = new Map<string, THREE.ShaderMaterial>()
  
  static getInstance(): MaterialPool {
    if (!MaterialPool.instance) {
      MaterialPool.instance = new MaterialPool()
    }
    return MaterialPool.instance
  }
  
  getMaterial(hasColors: boolean, randomIntensity: number, randomSeed: number): THREE.ShaderMaterial {
    const cache = hasColors ? this.coloredMaterials : this.simpleMaterials
    const key = `${hasColors}-${randomIntensity.toFixed(3)}-${randomSeed}`
    
    if (!cache.has(key)) {
      cache.set(key, this.createMaterial(hasColors, randomIntensity, randomSeed))
    }
    
    // Clone material to avoid shared uniform issues
    const baseMaterial = cache.get(key)!
    const clonedMaterial = baseMaterial.clone()
    
    // Update uniforms on the cloned material
    clonedMaterial.uniforms.randomIntensity.value = randomIntensity
    clonedMaterial.uniforms.randomSeed.value = randomSeed
    
    return clonedMaterial
  }
  
  private createMaterial(hasColors: boolean, randomIntensity: number, randomSeed: number): THREE.ShaderMaterial {
    const commonUniforms = {
      fogColor: { value: new THREE.Color(0x151515) },
      fogDensity: { value: 0.003 },
      randomIntensity: { value: randomIntensity },
      randomSeed: { value: randomSeed },
      luminanceInfluence: { value: 0.0 },
      thresholdLow: { value: 0.0 },
      thresholdHigh: { value: 1.0 }
    }
    
    const vertexShader = `
      attribute float randomScale;
      uniform float randomIntensity;
      uniform float randomSeed;
      uniform float luminanceInfluence;
      uniform float thresholdLow;
      uniform float thresholdHigh;
      varying vec3 vColor;
      varying float vFogDepth;
      
      void main() {
        vColor = ${hasColors ? 'instanceColor' : 'vec3(1.0)'};
        
        float scaleFactor = randomScale;
        
        if (abs(luminanceInfluence) > 0.001) {
          float luminance = ${hasColors ? 'dot(instanceColor, vec3(0.299, 0.587, 0.114))' : '1.0'};
          float remappedLuminance = clamp((luminance - thresholdLow) / (thresholdHigh - thresholdLow), 0.0, 1.0);
          
          if (luminanceInfluence > 0.0) {
            scaleFactor = mix(randomScale, remappedLuminance, luminanceInfluence);
          } else {
            scaleFactor = mix(randomScale, (1.0 - remappedLuminance), -luminanceInfluence);
          }
        }
        
        vec3 scaledPosition = position;
        if (randomIntensity > 0.0) {
          float finalScale = 1.0 + scaleFactor * randomIntensity;
          scaledPosition = position * finalScale;
        }
        
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaledPosition, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `
    
    const fragmentShader = `
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec3 vColor;
      varying float vFogDepth;
      
      void main() {
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        vec3 brightColor = vColor * 1.8;
        gl_FragColor = vec4(mix(brightColor, fogColor, fogFactor), 1.0);
      }
    `
    
    return new THREE.ShaderMaterial({
      fog: true,
      vertexShader,
      fragmentShader,
      uniforms: commonUniforms
    })
  }
  
  dispose(): void {
    this.coloredMaterials.forEach(material => material.dispose())
    this.simpleMaterials.forEach(material => material.dispose())
    this.coloredMaterials.clear()
    this.simpleMaterials.clear()
  }
}

// Object pools for reusing expensive objects
class ObjectPools {
  private static instance: ObjectPools
  private matrixPool: THREE.Matrix4[] = []
  private vectorPool: THREE.Vector3[] = []
  private colorPool: THREE.Color[] = []
  private quaternionPool: THREE.Quaternion[] = []
  
  static getInstance(): ObjectPools {
    if (!ObjectPools.instance) {
      ObjectPools.instance = new ObjectPools()
    }
    return ObjectPools.instance
  }
  
  getMatrix(): THREE.Matrix4 {
    return this.matrixPool.pop() || new THREE.Matrix4()
  }
  
  releaseMatrix(matrix: THREE.Matrix4): void {
    matrix.identity()
    this.matrixPool.push(matrix)
  }
  
  getVector(): THREE.Vector3 {
    return this.vectorPool.pop() || new THREE.Vector3()
  }
  
  releaseVector(vector: THREE.Vector3): void {
    vector.set(0, 0, 0)
    this.vectorPool.push(vector)
  }
  
  getColor(): THREE.Color {
    return this.colorPool.pop() || new THREE.Color()
  }
  
  releaseColor(color: THREE.Color): void {
    color.setRGB(1, 1, 1)
    this.colorPool.push(color)
  }
  
  getQuaternion(): THREE.Quaternion {
    return this.quaternionPool.pop() || new THREE.Quaternion()
  }
  
  releaseQuaternion(quaternion: THREE.Quaternion): void {
    quaternion.identity()
    this.quaternionPool.push(quaternion)
  }
}

// Random value lookup table for performance
class RandomLookup {
  private static instance: RandomLookup
  private lookupTable: Float32Array
  private tableSize = 65536 // 2^16 for good distribution
  
  static getInstance(): RandomLookup {
    if (!RandomLookup.instance) {
      RandomLookup.instance = new RandomLookup()
    }
    return RandomLookup.instance
  }
  
  constructor() {
    this.lookupTable = new Float32Array(this.tableSize)
    for (let i = 0; i < this.tableSize; i++) {
      this.lookupTable[i] = Math.random()
    }
  }
  
  getValue(index: number, seed: number = 42): number {
    const hash = (index * 12.9898 + seed) % this.tableSize
    return this.lookupTable[Math.abs(Math.floor(hash))]
  }
}

export class SphereInstancer {
  private scene: THREE.Scene
  private instancedMeshes: THREE.InstancedMesh[] = []
  private originalPointClouds: Set<THREE.Points> = new Set()
  private processedUUIDs: Set<string> = new Set()
  private isSpheresEnabled: boolean = true
  
  // Cached instances for reuse
  private geometryCache = GeometryCache.getInstance()
  private materialPool = MaterialPool.getInstance()
  private objectPools = ObjectPools.getInstance()
  private randomLookup = RandomLookup.getInstance()
  
  // Sphere parameters
  public sphereRadius: number = 0.01 // Increased default size to be more visible
  public sphereDetail: number = 1 // 0=low, 1=medium, 2=high detail
  
  // Random scale parameters
  private randomScaleIntensity: number = 0
  private randomScaleSeed: number = 42
  
  // Cached scale matrix to avoid repeated calculations
  private cachedScaleMatrix: THREE.Matrix4 = new THREE.Matrix4()
  private cachedRadius: number = -1
  
  constructor(scene: THREE.Scene) {
    this.scene = scene
    
    // Ensure singletons are initialized
    this.geometryCache = GeometryCache.getInstance()
    this.materialPool = MaterialPool.getInstance()
    this.objectPools = ObjectPools.getInstance()
    this.randomLookup = RandomLookup.getInstance()
  }

  /**
   * Set random scale parameters for sphere instances
   */
  public setRandomScale(intensity: number, seed: number = 42, luminanceInfluence: number = 0, thresholdLow: number = 0, thresholdHigh: number = 1) {
    this.randomScaleIntensity = intensity
    this.randomScaleSeed = seed
    
    // Update existing sphere materials if any exist
    this.instancedMeshes.forEach(mesh => {
      const material = mesh.material as THREE.ShaderMaterial
      if (material && material.uniforms) {
        if (material.uniforms.randomIntensity) {
          material.uniforms.randomIntensity.value = intensity
        }
        if (material.uniforms.randomSeed) {
          material.uniforms.randomSeed.value = seed
        }
        if (material.uniforms.luminanceInfluence) {
          material.uniforms.luminanceInfluence.value = luminanceInfluence
        }
        if (material.uniforms.thresholdLow) {
          material.uniforms.thresholdLow.value = thresholdLow
        }
        if (material.uniforms.thresholdHigh) {
          material.uniforms.thresholdHigh.value = thresholdHigh
        }
      }
    })
  }
  
  /**
   * Convert all point clouds in the scene to sphere instances
   */
  convertPointCloudsToSpheres(): void {
    if (this.isSpheresEnabled) {
        return
    }
    
    
    // Find all point clouds in the scene
    const pointClouds: THREE.Points[] = []
    this.scene.traverse((child) => {
      if (child instanceof THREE.Points) {
        pointClouds.push(child)
      }
    })
    
    
    // Convert each point cloud to instanced spheres
    pointClouds.forEach((pointCloud, index) => {
      this.convertSinglePointCloudToSpheres(pointCloud, index)
    })
    
    this.isSpheresEnabled = true
  }

  /**
   * Convert a single point cloud to spheres progressively as chunks load
   * This allows spheres to appear one chunk at a time instead of all at once
   * Returns a promise that resolves when conversion is complete
   */
  async convertSinglePointCloudToSpheresProgressive(pointCloud: THREE.Points): Promise<void> {
    if (!this.isSpheresEnabled) {
      // If spheres aren't enabled globally, just return
      return Promise.resolve()
    }

    // Check if this point cloud has already been converted using Set for O(1) lookup
    if (this.processedUUIDs.has(pointCloud.uuid)) {
      return Promise.resolve()
    }

    
    // Convert this specific point cloud
    const currentIndex = this.instancedMeshes.length
    
    // Process conversion synchronously but return a promise for async handling
    return new Promise<void>((resolve) => {
      try {
        this.convertSinglePointCloudToSpheres(pointCloud, currentIndex)
        
        
        // Resolve immediately for better performance
        resolve()
      } catch (error) {
        console.error('Error in sphere conversion:', error)
        resolve() // Don't fail loading if sphere conversion fails
      }
    })
  }

  /**
   * Enable sphere mode - sets the flag so progressive loading will create spheres
   */
  enableSphereMode(): void {
    this.isSpheresEnabled = true
  }

  /**
   * Disable sphere mode and revert any existing spheres
   */
  disableSphereMode(): void {
    this.revertToPointClouds()
  }
  
  /**
   * Check if sky sphere effect is currently active in the scene
   */
  private isSkySpherActive(): boolean {
    // Look for sky sphere mesh in scene
    let hasSkySphereMesh = false
    this.scene.traverse((child) => {
      if (child.userData && child.userData.isSkySphereMesh) {
        hasSkySphereMesh = true
      }
    })
    return hasSkySphereMesh
  }

  /**
   * Convert a single point cloud to instanced spheres (OPTIMIZED)
   */
  private convertSinglePointCloudToSpheres(pointCloud: THREE.Points, index: number): void {
    const geometry = pointCloud.geometry
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute
    const colorAttribute = geometry.getAttribute('color') as THREE.BufferAttribute
    
    if (!positionAttribute) {
      console.warn('Point cloud missing position attribute, skipping')
      return
    }
    
    const pointCount = positionAttribute.count
    
    // Create fresh sphere geometry for each chunk (avoid shared attribute conflicts)
    const sphereGeometry = this.createSphereGeometry()
    
    // Check for color attributes
    const hasColors = !!colorAttribute
    
    // Get material from pool (reused/cloned)
    const material = this.materialPool.getMaterial(hasColors, this.randomScaleIntensity, this.randomScaleSeed)
    
    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, pointCount)
    
    // Process instances with optimized object pooling
    this.processInstancesOptimized(instancedMesh, positionAttribute, colorAttribute, pointCount)
    
    // Copy transform from original point cloud
    instancedMesh.position.copy(pointCloud.position)
    instancedMesh.rotation.copy(pointCloud.rotation)
    instancedMesh.scale.copy(pointCloud.scale)
    instancedMesh.userData = { ...pointCloud.userData, isSphereInstanced: true }
    
    
    // Hide original point cloud and add instanced mesh
    // Exception: Don't hide point cloud if sky sphere is active (background effect)
    const skySpherActive = this.isSkySpherActive()
    if (!skySpherActive) {
      pointCloud.visible = false
    } else {
    }
    this.scene.add(instancedMesh)
    
    // Store references using Set for faster lookups
    this.originalPointClouds.add(pointCloud)
    this.processedUUIDs.add(pointCloud.uuid)
    this.instancedMeshes.push(instancedMesh)
    
    // Sphere creation completed for chunk
  }
  
  /**
   * Get sphere geometry (create fresh to avoid cache issues)
   */
  private getCachedSphereGeometry(): THREE.SphereGeometry {
    const detailLevels = [
      { widthSegments: 6, heightSegments: 4 },   // Low detail
      { widthSegments: 8, heightSegments: 6 },   // Medium detail
      { widthSegments: 12, heightSegments: 8 }   // High detail
    ]
    
    const detail = detailLevels[this.sphereDetail] || detailLevels[1]
    // Create fresh geometry - caching causes issues with instanced attributes
    return new THREE.SphereGeometry(1, detail.widthSegments, detail.heightSegments)
  }
  
  /**
   * Process instances with optimized object pooling (OPTIMIZED)
   */
  private processInstancesOptimized(
    instancedMesh: THREE.InstancedMesh,
    positionAttribute: THREE.BufferAttribute,
    colorAttribute: THREE.BufferAttribute | null,
    pointCount: number
  ): void {
    // Get pooled objects with fallback to new objects
    const matrix = this.objectPools?.getMatrix() || new THREE.Matrix4()
    const position = this.objectPools?.getVector() || new THREE.Vector3()
    const color = this.objectPools?.getColor() || new THREE.Color()
    
    // Use cached scale matrix for better performance
    const scaleMatrix = this.getCachedScaleMatrix()
    
    // Create color array for instances if we have color data
    let instanceColors: Float32Array | null = null
    const hasColors = !!colorAttribute
    if (hasColors) {
      instanceColors = new Float32Array(pointCount * 3)
    }
    
    // Generate random scale array using lookup table (OPTIMIZED)
    const instanceRandomScales = this.generateRandomScales(pointCount)
    
    // Process each point (optimized loop with batched operations)
    for (let i = 0; i < pointCount; i++) {
      // Get position
      position.fromBufferAttribute(positionAttribute, i)
      
      // Create transformation matrix efficiently
      matrix.copy(scaleMatrix)
      matrix.setPosition(position)
      instancedMesh.setMatrixAt(i, matrix)
      
      // Set color if available (optimized color extraction)
      if (hasColors && instanceColors && colorAttribute) {
        color.fromBufferAttribute(colorAttribute, i)
        const baseIndex = i * 3
        instanceColors[baseIndex] = color.r
        instanceColors[baseIndex + 1] = color.g
        instanceColors[baseIndex + 2] = color.b
      }
    }
    
    // Mark matrices as needing update
    instancedMesh.instanceMatrix.needsUpdate = true
    
    // Apply instance colors if we have them
    if (instanceColors) {
      const colorAttribute = new THREE.InstancedBufferAttribute(instanceColors, 3)
      instancedMesh.instanceColor = colorAttribute
    }
    
    // Apply random scale attribute
    const randomScaleAttribute = new THREE.InstancedBufferAttribute(instanceRandomScales, 1)
    instancedMesh.geometry.setAttribute('randomScale', randomScaleAttribute)
    
    // Objects will be garbage collected automatically
  }
  
  /**
   * Generate random scale values using lookup table (OPTIMIZED)
   */
  private generateRandomScales(pointCount: number): Float32Array {
    const instanceRandomScales = new Float32Array(pointCount)
    for (let i = 0; i < pointCount; i++) {
      // Use optimized lookup table instead of expensive Math.sin()
      instanceRandomScales[i] = this.randomLookup.getValue(i, this.randomScaleSeed)
    }
    return instanceRandomScales
  }
  
  /**
   * Get cached scale matrix (OPTIMIZED)
   */
  private getCachedScaleMatrix(): THREE.Matrix4 {
    if (this.cachedRadius !== this.sphereRadius) {
      this.cachedScaleMatrix.makeScale(this.sphereRadius, this.sphereRadius, this.sphereRadius)
      this.cachedRadius = this.sphereRadius
    }
    return this.cachedScaleMatrix
  }
  
  /**
   * Revert back to original point cloud rendering (OPTIMIZED)
   */
  revertToPointClouds(): void {
    if (!this.isSpheresEnabled) return
    
    
    // Remove instanced meshes
    this.instancedMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.dispose()
    })
    
    // Show original point clouds
    this.originalPointClouds.forEach(pointCloud => {
      pointCloud.visible = true
    })
    
    // Clear collections
    this.instancedMeshes = []
    this.originalPointClouds.clear()
    this.processedUUIDs.clear()
    this.isSpheresEnabled = false
    
  }
  
  /**
   * Toggle between spheres and point clouds
   */
  toggleSpheres(): void {
    if (this.isSpheresEnabled) {
      this.disableSphereMode()
    } else {
      this.enableSphereMode()
      // Convert any existing point clouds to spheres individually to avoid pop-in
      this.convertExistingPointCloudsProgressively()
    }
  }

  /**
   * Set sphere mode to a specific state (instead of toggling)
   */
  setSphereMode(enabled: boolean): void {
    
    if (enabled) {
      // Always ensure sphere mode is properly enabled and convert existing point clouds
      this.isSpheresEnabled = true
      this.enableSphereMode()
      // Force conversion of any existing point clouds
      this.convertExistingPointCloudsProgressively()
    } else {
      // Only disable if currently enabled
      if (this.isSpheresEnabled) {
        this.disableSphereMode()
      }
    }
  }

  /**
   * Reset internal state without touching scene objects (OPTIMIZED)
   */
  resetState(): void {
    this.instancedMeshes = []
    this.originalPointClouds.clear()
    this.processedUUIDs.clear()
    this.isSpheresEnabled = false
  }

  /**
   * Convert existing point clouds progressively to avoid pop-in effect
   */
  private convertExistingPointCloudsProgressively(): void {
    const pointClouds: THREE.Points[] = []
    this.scene.traverse((child) => {
      if (child instanceof THREE.Points) {
        pointClouds.push(child)
      }
    })

    // Converting existing point clouds to spheres

    // Convert each point cloud immediately for better performance
    pointClouds.forEach((pointCloud, index) => {
      // Use requestAnimationFrame instead of setTimeout for better performance
      requestAnimationFrame(() => {
        this.convertSinglePointCloudToSpheresProgressive(pointCloud)
      })
    })
  }
  
  /**
   * Update sphere radius for all instances (OPTIMIZED)
   */
  setSphereRadius(radius: number): void {
    this.sphereRadius = radius
    
    if (!this.isSpheresEnabled) return
    
    // Update all existing instances
    this.instancedMeshes.forEach(instancedMesh => {
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      
      for (let i = 0; i < instancedMesh.count; i++) {
        instancedMesh.getMatrixAt(i, matrix)
        matrix.decompose(position, quaternion, scale)
        
        // Only update scale, keep position and rotation
        matrix.compose(position, quaternion, new THREE.Vector3(radius, radius, radius))
        instancedMesh.setMatrixAt(i, matrix)
      }
      
      instancedMesh.instanceMatrix.needsUpdate = true
    })
  }
  
  /**
   * Update sphere detail level
   */
  setSphereDetail(detail: number): void {
    this.sphereDetail = Math.max(0, Math.min(2, Math.floor(detail)))
    
    // If spheres are currently enabled, recreate them with new detail
    if (this.isSpheresEnabled) {
      this.revertToPointClouds()
      this.convertPointCloudsToSpheres()
    }
  }
  
  /**
   * Create sphere geometry based on detail level
   */
  private createSphereGeometry(): THREE.SphereGeometry {
    const detailLevels = [
      { widthSegments: 6, heightSegments: 4 },   // Low detail
      { widthSegments: 8, heightSegments: 6 },   // Medium detail
      { widthSegments: 12, heightSegments: 8 }   // High detail
    ]
    
    const detail = detailLevels[this.sphereDetail] || detailLevels[1]
    return new THREE.SphereGeometry(1, detail.widthSegments, detail.heightSegments)
  }
  
  /**
   * Get current state
   */
  isEnabled(): boolean {
    return this.isSpheresEnabled
  }
  
  /**
   * Get stats about current spheres
   */
  getStats(): { totalSpheres: number, meshCount: number } {
    const totalSpheres = this.instancedMeshes.reduce((sum, mesh) => sum + mesh.count, 0)
    return {
      totalSpheres,
      meshCount: this.instancedMeshes.length
    }
  }
  
  /**
   * Update fog settings for all sphere materials
   */
  updateFogSettings(fogColor: THREE.Color, fogDensity: number): void {
    this.instancedMeshes.forEach(mesh => {
      const material = mesh.material
      if (material instanceof THREE.ShaderMaterial && material.uniforms) {
        if (material.uniforms.fogColor) {
          material.uniforms.fogColor.value.copy(fogColor)
        }
        if (material.uniforms.fogDensity) {
          material.uniforms.fogDensity.value = fogDensity
        }
      }
      // MeshBasicMaterial automatically uses scene fog when fog: true
    })
  }

  /**
   * Cleanup - dispose of all resources (OPTIMIZED)
   */
  dispose(): void {
    this.revertToPointClouds()
    
    // Dispose of cached resources (only if this is the last instance)
    // Note: Singletons will persist across instances for performance
  }
}