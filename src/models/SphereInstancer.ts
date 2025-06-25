import * as THREE from 'three'

export class SphereInstancer {
  private scene: THREE.Scene
  private instancedMeshes: THREE.InstancedMesh[] = []
  private originalPointClouds: THREE.Points[] = []
  private isSpheresEnabled: boolean = true
  
  // Sphere parameters
  public sphereRadius: number = 0.01 // Increased default size to be more visible
  public sphereDetail: number = 1 // 0=low, 1=medium, 2=high detail
  
  constructor(scene: THREE.Scene) {
    this.scene = scene
  }
  
  /**
   * Convert all point clouds in the scene to sphere instances
   */
  convertPointCloudsToSpheres(): void {
    if (this.isSpheresEnabled) {
      console.log('⚠️ Spheres already enabled, skipping conversion')
      return
    }
    
    console.log('🔄 Converting point clouds to spheres...')
    
    // Find all point clouds in the scene
    const pointClouds: THREE.Points[] = []
    this.scene.traverse((child) => {
      if (child instanceof THREE.Points) {
        pointClouds.push(child)
      }
    })
    
    console.log(`Found ${pointClouds.length} point clouds to convert`)
    
    // Convert each point cloud to instanced spheres
    pointClouds.forEach((pointCloud, index) => {
      this.convertSinglePointCloudToSpheres(pointCloud, index)
    })
    
    this.isSpheresEnabled = true
    console.log('✅ Point cloud to sphere conversion complete:', {
      totalSpheres: this.instancedMeshes.reduce((sum, mesh) => sum + mesh.count, 0),
      meshCount: this.instancedMeshes.length,
      originalClouds: this.originalPointClouds.length
    })
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

    // Check if this point cloud has already been converted
    const alreadyConverted = this.originalPointClouds.some(cloud => 
      cloud === pointCloud || cloud.uuid === pointCloud.uuid
    )
    
    if (alreadyConverted) {
      console.log('Point cloud already converted to spheres, skipping')
      return Promise.resolve()
    }

    console.log('🔄 Converting single point cloud to spheres progressively')
    
    // Convert this specific point cloud
    const currentIndex = this.instancedMeshes.length
    
    // Process conversion synchronously but return a promise for async handling
    return new Promise<void>((resolve) => {
      try {
        this.convertSinglePointCloudToSpheres(pointCloud, currentIndex)
        
        console.log(`✅ Progressive sphere conversion complete for chunk ${currentIndex}:`, {
          chunkVertices: pointCloud.geometry.attributes.position.count,
          totalSphereChunks: this.instancedMeshes.length,
          totalSpheres: this.instancedMeshes.reduce((sum, mesh) => sum + mesh.count, 0)
        })
        
        // Reduced delay for better performance
        setTimeout(() => resolve(), 25)
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
    console.log('🔄 Enabling sphere mode for progressive loading')
    this.isSpheresEnabled = true
  }

  /**
   * Disable sphere mode and revert any existing spheres
   */
  disableSphereMode(): void {
    console.log('🔄 Disabling sphere mode')
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
   * Convert a single point cloud to instanced spheres
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
    console.log(`Converting point cloud ${index} with ${pointCount} points`)
    console.log(`Using sphere radius: ${this.sphereRadius}, detail: ${this.sphereDetail}`)
    
    // Create sphere geometry based on detail level
    const sphereGeometry = this.createSphereGeometry()
    
    // Check for color attributes
    const hasColors = !!colorAttribute
    console.log(`Point cloud ${index}: hasColors=${hasColors}, colorAttribute:`, colorAttribute)
    
    // Create material - use shader material for proper instance color support
    const material = hasColors ? 
      new THREE.ShaderMaterial({
        fog: true,
        vertexShader: `
          varying vec3 vColor;
          varying float vFogDepth;
          
          void main() {
            vColor = instanceColor;
            vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            vFogDepth = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 fogColor;
          uniform float fogDensity;
          varying vec3 vColor;
          varying float vFogDepth;
          
          void main() {
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            fogFactor = clamp(fogFactor, 0.0, 1.0);
            gl_FragColor = vec4(mix(vColor, fogColor, fogFactor), 1.0);
          }
        `,
        uniforms: {
          fogColor: { value: new THREE.Color(0x151515) },
          fogDensity: { value: 0.003 }
        }
      }) :
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
        blending: THREE.NormalBlending,
        depthWrite: true,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
        fog: true
      })
    
    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(sphereGeometry, material, pointCount)
    
    // Set up instance matrices and colors
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    const position = new THREE.Vector3()
    
    // Create color array for instances if we have color data
    let instanceColors: Float32Array | null = null
    if (hasColors) {
      instanceColors = new Float32Array(pointCount * 3)
      console.log(`Creating instance colors array for ${pointCount} points`)
    }
    
    // Process each point
    for (let i = 0; i < pointCount; i++) {
      // Get position
      position.fromBufferAttribute(positionAttribute, i)
      
      // Create transformation matrix (position + scale)
      matrix.makeScale(this.sphereRadius, this.sphereRadius, this.sphereRadius)
      matrix.setPosition(position)
      instancedMesh.setMatrixAt(i, matrix)
      
      // Debug first few positions
      if (i < 3) {
        console.log(`Point ${i} position: x=${position.x.toFixed(3)}, y=${position.y.toFixed(3)}, z=${position.z.toFixed(3)}, radius=${this.sphereRadius}`)
      }
      
      // Set color if available
      if (hasColors && instanceColors) {
        color.fromBufferAttribute(colorAttribute, i)
        instanceColors[i * 3] = color.r
        instanceColors[i * 3 + 1] = color.g
        instanceColors[i * 3 + 2] = color.b
        
        // Debug first few colors
        if (i < 5) {
          console.log(`Point ${i} color: r=${color.r.toFixed(3)}, g=${color.g.toFixed(3)}, b=${color.b.toFixed(3)}`)
        }
      }
    }
    
    // Mark matrices as needing update
    instancedMesh.instanceMatrix.needsUpdate = true
    
    // Apply instance colors if we have them
    if (instanceColors) {
      const colorAttribute = new THREE.InstancedBufferAttribute(instanceColors, 3)
      instancedMesh.instanceColor = colorAttribute
      
      console.log(`Applied instance colors to mesh, first few values:`, instanceColors.slice(0, 15))
    } else {
      console.log('No instance colors applied - using material color')
    }
    
    // Copy transform from original point cloud
    instancedMesh.position.copy(pointCloud.position)
    instancedMesh.rotation.copy(pointCloud.rotation)
    instancedMesh.scale.copy(pointCloud.scale)
    instancedMesh.userData = { ...pointCloud.userData, isSphereInstanced: true }
    
    // Add some debugging for visibility
    console.log('Sphere mesh bounds:', {
      position: instancedMesh.position,
      scale: instancedMesh.scale,
      visible: instancedMesh.visible,
      count: instancedMesh.count
    })
    
    // Hide original point cloud and add instanced mesh
    // Exception: Don't hide point cloud if sky sphere is active (background effect)
    const skySpherActive = this.isSkySpherActive()
    if (!skySpherActive) {
      pointCloud.visible = false
    } else {
      console.log('Sky sphere active - keeping point cloud visible alongside spheres')
    }
    this.scene.add(instancedMesh)
    
    // Store references
    this.originalPointClouds.push(pointCloud)
    this.instancedMeshes.push(instancedMesh)
    
    console.log(`Created instanced spheres for point cloud ${index}:`, {
      pointCount,
      hasColors,
      sphereRadius: this.sphereRadius,
      sphereDetail: this.sphereDetail
    })
  }
  
  /**
   * Revert back to original point cloud rendering
   */
  revertToPointClouds(): void {
    if (!this.isSpheresEnabled) return
    
    console.log('Reverting to original point clouds...')
    
    // Remove instanced meshes
    this.instancedMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.dispose()
    })
    
    // Show original point clouds
    this.originalPointClouds.forEach(pointCloud => {
      pointCloud.visible = true
    })
    
    // Clear arrays
    this.instancedMeshes = []
    this.originalPointClouds = []
    this.isSpheresEnabled = false
    
    console.log('Reverted to point clouds')
  }
  
  /**
   * Toggle between spheres and point clouds
   */
  toggleSpheres(): void {
    console.log(`Toggling spheres. Currently enabled: ${this.isSpheresEnabled}, radius: ${this.sphereRadius}`)
    if (this.isSpheresEnabled) {
      this.disableSphereMode()
    } else {
      this.enableSphereMode()
      // Convert any existing point clouds to spheres individually to avoid pop-in
      this.convertExistingPointCloudsProgressively()
    }
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

    console.log(`🔄 Converting ${pointClouds.length} existing point clouds to spheres progressively`)

    // Convert each point cloud with a small delay to avoid pop-in
    pointClouds.forEach((pointCloud, index) => {
      setTimeout(() => {
        this.convertSinglePointCloudToSpheresProgressive(pointCloud)
      }, index * 50) // 50ms delay between each conversion
    })
  }
  
  /**
   * Update sphere radius for all instances
   */
  setSphereRadius(radius: number): void {
    this.sphereRadius = radius
    
    if (!this.isSpheresEnabled) return
    
    // Update all existing instances
    this.instancedMeshes.forEach(instancedMesh => {
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      
      for (let i = 0; i < instancedMesh.count; i++) {
        instancedMesh.getMatrixAt(i, matrix)
        matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3())
        
        matrix.makeScale(radius, radius, radius)
        matrix.setPosition(position)
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
   * Cleanup - dispose of all resources
   */
  dispose(): void {
    this.revertToPointClouds()
  }
}