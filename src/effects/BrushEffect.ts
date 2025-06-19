import * as THREE from 'three'

interface BrushParameters {
  enabled: boolean
  brushSize: number
  brushStrength: number
  elasticity: number
  damping: number
  pointerX: number
  pointerY: number
  pointerZ: number
  isActive: boolean
}

export class BrushEffect {
  private originalPositions: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private velocities: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private displacements: Map<THREE.BufferGeometry, Float32Array> = new Map()
  private raycaster: THREE.Raycaster
  private camera: THREE.Camera | null = null
  private scene: THREE.Scene | null = null
  private pointClouds: THREE.Points[] = []
  private debugSphere: THREE.Mesh | null = null
  
  constructor(_renderer: THREE.WebGLRenderer) {
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Points.threshold = 0.1
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene
    this.camera = camera
    this.updatePointClouds()
    this.createDebugSphere()
  }
  
  private createDebugSphere() {
    if (!this.scene) return
    
    // Create a debug sphere to visualize brush position
    const geometry = new THREE.SphereGeometry(0.1, 8, 6)
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000, 
      transparent: true, 
      opacity: 0.3,
      wireframe: true
    })
    this.debugSphere = new THREE.Mesh(geometry, material)
    this.debugSphere.visible = false
    this.scene.add(this.debugSphere)
  }

  private updatePointClouds() {
    if (!this.scene) return
    
    this.pointClouds = []
    this.scene.traverse((object) => {
      if (object instanceof THREE.Points) {
        this.pointClouds.push(object)
        this.initializeGeometry(object.geometry)
      }
    })
  }

  private initializeGeometry(geometry: THREE.BufferGeometry) {
    if (this.originalPositions.has(geometry)) return

    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute) return

    const positions = positionAttribute.array as Float32Array
    const count = positions.length

    // Store original positions
    this.originalPositions.set(geometry, new Float32Array(positions))
    
    // Initialize velocities and displacements
    this.velocities.set(geometry, new Float32Array(count))
    this.displacements.set(geometry, new Float32Array(count))
  }

  updateBrush(parameters: BrushParameters, mouseX: number, mouseY: number) {
    if (!parameters.enabled || !this.camera || !this.scene) return

    // Convert mouse coordinates to normalized device coordinates
    const mouse = new THREE.Vector2(
      (mouseX / window.innerWidth) * 2 - 1,
      -(mouseY / window.innerHeight) * 2 + 1
    )

    this.raycaster.setFromCamera(mouse, this.camera)
    
    // Get brush position in world space using camera and mouse
    let brushWorldPosition = new THREE.Vector3()
    
    if (parameters.isActive) {
      // Calculate brush position using camera direction and depth
      const cameraDirection = new THREE.Vector3()
      this.camera.getWorldDirection(cameraDirection)
      
      // Use a fixed distance from camera for brush position
      const brushDistance = 5.0 // Adjust based on your scene scale
      brushWorldPosition.copy(this.camera.position)
        .add(cameraDirection.multiplyScalar(brushDistance))
      
      // Add mouse offset in camera's local space
      const cameraRight = new THREE.Vector3(1, 0, 0)
      const cameraUp = new THREE.Vector3(0, 1, 0)
      
      if (this.camera instanceof THREE.PerspectiveCamera) {
        cameraRight.copy(cameraDirection).cross(this.camera.up).normalize()
        cameraUp.copy(cameraRight).cross(cameraDirection).normalize()
      }
      
      const offsetScale = 2.0 // Sensitivity of mouse movement
      brushWorldPosition.add(cameraRight.multiplyScalar(mouse.x * offsetScale))
      brushWorldPosition.add(cameraUp.multiplyScalar(mouse.y * offsetScale))
    }

    // Update debug sphere
    if (this.debugSphere && parameters.isActive) {
      this.debugSphere.position.copy(brushWorldPosition)
      this.debugSphere.scale.setScalar(parameters.brushSize)
      this.debugSphere.visible = true
    } else if (this.debugSphere) {
      this.debugSphere.visible = false
    }

    // Apply brush effect to all point clouds
    this.pointClouds.forEach(pointCloud => {
      this.applyBrushToGeometry(pointCloud.geometry, pointCloud.matrixWorld, parameters, brushWorldPosition)
    })
  }

  private applyBrushToGeometry(
    geometry: THREE.BufferGeometry, 
    matrixWorld: THREE.Matrix4,
    parameters: BrushParameters,
    brushWorldPosition: THREE.Vector3
  ) {
    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute) return

    const positions = positionAttribute.array as Float32Array
    const originalPositions = this.originalPositions.get(geometry)
    const velocities = this.velocities.get(geometry)
    const displacements = this.displacements.get(geometry)

    if (!originalPositions || !velocities || !displacements) return

    // Get inverse matrix to transform brush position to local space
    const inverseMatrix = new THREE.Matrix4().copy(matrixWorld).invert()
    const brushLocalPosition = brushWorldPosition.clone().applyMatrix4(inverseMatrix)

    const deltaTime = 0.016 // ~60fps timing

    // Apply brush physics to each vertex
    for (let i = 0; i < positions.length; i += 3) {
      const vertexLocal = new THREE.Vector3(
        originalPositions[i],
        originalPositions[i + 1], 
        originalPositions[i + 2]
      )
      
      // Calculate distance to brush center in local space
      const distance = vertexLocal.distanceTo(brushLocalPosition)
      const influence = Math.max(0, 1 - (distance / parameters.brushSize))
      
      if (influence > 0 && parameters.isActive) {
        // Calculate brush force direction (away from brush center)
        const force = vertexLocal.clone().sub(brushLocalPosition)
        
        // Normalize force if distance > 0, otherwise use random direction
        if (force.length() > 0.001) {
          force.normalize()
        } else {
          force.set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          ).normalize()
        }
        
        const forceStrength = influence * parameters.brushStrength * deltaTime
        
        // Apply force to velocity
        velocities[i] += force.x * forceStrength
        velocities[i + 1] += force.y * forceStrength
        velocities[i + 2] += force.z * forceStrength
      }
      
      // Apply damping to velocity
      velocities[i] *= parameters.damping
      velocities[i + 1] *= parameters.damping
      velocities[i + 2] *= parameters.damping
      
      // Update displacement based on velocity
      displacements[i] += velocities[i] * deltaTime
      displacements[i + 1] += velocities[i + 1] * deltaTime
      displacements[i + 2] += velocities[i + 2] * deltaTime
      
      // Apply elasticity (spring back to original position)
      const elasticForce = parameters.elasticity * deltaTime
      displacements[i] *= (1 - elasticForce)
      displacements[i + 1] *= (1 - elasticForce)
      displacements[i + 2] *= (1 - elasticForce)
      
      // Update final position
      positions[i] = originalPositions[i] + displacements[i]
      positions[i + 1] = originalPositions[i + 1] + displacements[i + 1]
      positions[i + 2] = originalPositions[i + 2] + displacements[i + 2]
    }
    
    // Mark attribute for update
    positionAttribute.needsUpdate = true
    
    // Update bounding sphere/box for proper culling
    geometry.computeBoundingSphere()
  }

  reset() {
    // Reset all geometries to original positions
    this.pointClouds.forEach(pointCloud => {
      const geometry = pointCloud.geometry
      const positionAttribute = geometry.getAttribute('position')
      const originalPositions = this.originalPositions.get(geometry)
      const velocities = this.velocities.get(geometry)
      const displacements = this.displacements.get(geometry)
      
      if (positionAttribute && originalPositions && velocities && displacements) {
        const positions = positionAttribute.array as Float32Array
        positions.set(originalPositions)
        velocities.fill(0)
        displacements.fill(0)
        positionAttribute.needsUpdate = true
      }
    })
  }

  dispose() {
    this.originalPositions.clear()
    this.velocities.clear()
    this.displacements.clear()
    this.pointClouds = []
    
    if (this.debugSphere && this.scene) {
      this.scene.remove(this.debugSphere)
      this.debugSphere.geometry.dispose()
      if (this.debugSphere.material instanceof THREE.Material) {
        this.debugSphere.material.dispose()
      }
      this.debugSphere = null
    }
  }
}