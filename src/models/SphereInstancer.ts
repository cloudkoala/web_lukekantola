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
    if (this.isSpheresEnabled) return
    
    console.log('Converting point clouds to spheres...')
    
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
    console.log('Point cloud to sphere conversion complete')
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
        vertexShader: `
          varying vec3 vColor;
          
          void main() {
            vColor = instanceColor;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          
          void main() {
            gl_FragColor = vec4(vColor, 1.0);
          }
        `
      }) :
      new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.8
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
    pointCloud.visible = false
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
      this.revertToPointClouds()
    } else {
      this.convertPointCloudsToSpheres()
    }
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
   * Cleanup - dispose of all resources
   */
  dispose(): void {
    this.revertToPointClouds()
  }
}