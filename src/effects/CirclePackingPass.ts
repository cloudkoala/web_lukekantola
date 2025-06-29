import * as THREE from 'three'
import { QuadTree } from './QuadTree'
import { SpatialHashGrid } from './SpatialHashGrid'

interface CircleData {
  x: number
  y: number
  radius: number
  color: [number, number, number]
  // Physics properties for Verlet integration
  prevX?: number
  prevY?: number
  mass?: number
  pinned?: boolean
  // Progressive growth properties
  targetRadius?: number // Final desired radius
  currentRadius?: number // Current animated radius
  growthStartTime?: number // When this circle started growing
  // Adaptive color monitoring properties
  originalColor?: [number, number, number] // Original sampled color
  isAdapting?: boolean // Currently in adaptation cycle
  adaptationStartTime?: number // When adaptation began
  adaptationPhase?: 'shrinking' | 'resampling' | 'growing' // Current adaptation phase
  // New system properties
  isDynamicSpawn?: boolean // Mark spawned circles for special growth behavior
  spawnProtectionTime?: number // Protect newly spawned circles from color monitoring
  // Smooth radius animation properties
  colorTargetRadius?: number // Target radius from color similarity
  radiusAnimationStartTime?: number // When radius animation began
  radiusAnimationStartRadius?: number // Starting radius for animation
  isGradualExpanding?: boolean // Whether circle is in gradual expansion mode
  // New color seeking properties
  targetX?: number // Target X position for movement
  targetY?: number // Target Y position for movement
  targetColor?: [number, number, number] // Target color to blend toward
}


// Poisson Disk Sampling for natural, non-clustered circle distribution
class PoissonDiskSampler {
  private width: number
  private height: number
  private minDistance: number
  private maxAttempts: number
  private cellSize: number
  private gridWidth: number
  private gridHeight: number
  private grid: (number[] | null)[][]
  private activeList: number[][]
  private points: number[][]

  constructor(width: number, height: number, minDistance: number, maxAttempts: number = 30) {
    this.width = width
    this.height = height
    this.minDistance = minDistance
    this.maxAttempts = maxAttempts
    
    // Grid cell size should be minDistance / sqrt(2) for optimal coverage
    this.cellSize = minDistance / Math.sqrt(2)
    this.gridWidth = Math.ceil(width / this.cellSize)
    this.gridHeight = Math.ceil(height / this.cellSize)
    
    // Initialize grid
    this.grid = Array(this.gridHeight).fill(null).map(() => 
      Array(this.gridWidth).fill(null)
    )
    
    this.activeList = []
    this.points = []
  }

  // Generate Poisson-distributed points
  generatePoints(): number[][] {
    // Start with multiple random seed points to ensure better distribution
    const numSeeds = Math.min(5, Math.max(1, Math.floor(this.width * this.height / 50000)))
    
    for (let i = 0; i < numSeeds; i++) {
      const seedPoint = [Math.random() * this.width, Math.random() * this.height]
      this.addPoint(seedPoint)
    }

    while (this.activeList.length > 0) {
      // Pick a random active point
      const randomIndex = Math.floor(Math.random() * this.activeList.length)
      const point = this.activeList[randomIndex]
      
      let found = false
      
      // Try to generate a new point around this active point
      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        const newPoint = this.generateAroundPoint(point)
        
        if (this.isValidPoint(newPoint)) {
          this.addPoint(newPoint)
          found = true
          break
        }
      }
      
      // If no valid point found, remove from active list
      if (!found) {
        this.activeList.splice(randomIndex, 1)
      }
    }
    
    return this.points
  }

  private addPoint(point: number[]): void {
    this.points.push(point)
    this.activeList.push(point)
    
    // Add to grid
    const gridX = Math.floor(point[0] / this.cellSize)
    const gridY = Math.floor(point[1] / this.cellSize)
    
    if (gridX >= 0 && gridX < this.gridWidth && gridY >= 0 && gridY < this.gridHeight) {
      this.grid[gridY][gridX] = point
    }
  }

  private generateAroundPoint(point: number[]): number[] {
    // Generate point in annulus between minDistance and 2*minDistance
    const angle = Math.random() * 2 * Math.PI
    const radius = this.minDistance + Math.random() * this.minDistance
    
    return [
      point[0] + Math.cos(angle) * radius,
      point[1] + Math.sin(angle) * radius
    ]
  }

  private isValidPoint(point: number[]): boolean {
    // Check bounds
    if (point[0] < 0 || point[0] >= this.width || point[1] < 0 || point[1] >= this.height) {
      return false
    }
    
    // Check minimum distance constraint
    const gridX = Math.floor(point[0] / this.cellSize)
    const gridY = Math.floor(point[1] / this.cellSize)
    
    // Check neighboring grid cells
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const checkX = gridX + dx
        const checkY = gridY + dy
        
        if (checkX >= 0 && checkX < this.gridWidth && 
            checkY >= 0 && checkY < this.gridHeight) {
          
          const neighbor = this.grid[checkY][checkX]
          if (neighbor) {
            const distance = Math.sqrt(
              (point[0] - neighbor[0]) ** 2 + (point[1] - neighbor[1]) ** 2
            )
            if (distance < this.minDistance) {
              return false
            }
          }
        }
      }
    }
    
    return true
  }
}

export class CirclePackingPass {
  private renderTarget: THREE.WebGLRenderTarget
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  
  // Circle packing parameters
  public enabled: boolean = false
  public intensity: number = 0.8
  public packingDensity: number = 18 // Number of circles to generate
  public totalCircles: number = 300 // Total number of circles to generate
  public minCircleSize: number = 0.3 // Minimum circle radius (0-1)
  public maxCircleSize: number = 8.0 // Maximum circle radius
  public circleSpacing: number = 1.2 // Spacing multiplier between circles
  public randomSeed: number = 42 // For consistent random circle placement
  public blackBackground: number = 1 // Whether to use black background
  public backgroundColorR: number = 0.0 // Custom background red component (0-1)
  public backgroundColorG: number = 0.0 // Custom background green component (0-1)
  public backgroundColorB: number = 0.0 // Custom background blue component (0-1)
  
  // Physics simulation parameters
  public useVerletPhysics: boolean = true // Enable Verlet integration physics
  public gravity: number = 0.1 // Gravity force for physics simulation
  public damping: number = 0.98 // Velocity damping factor (0-1)
  public substeps: number = 3 // Physics substeps per iteration
  public physicsIterations: number = 15 // Number of physics iterations
  
  // Placement and animation parameters
  public usePhysicsPlacement: boolean = false // Use physics-based bouncing ball placement
  public animatePhysics: boolean = false // Show real-time physics animation
  public animationSpeed: number = 1.0 // Speed multiplier for physics animation
  
  // Progressive growth parameters
  public enableProgressiveGrowth: boolean = true // Enable circles to grow over time
  public growthRate: number = 0.5 // Growth speed (0.1 = slow, 2.0 = fast)
  public startSizeMultiplier: number = 0.3 // Initial size as fraction of target (0.1-1.0)
  
  // Adaptive color monitoring parameters
  public enableColorMonitoring: boolean = true // Enable adaptive color monitoring
  public colorSimilarityThreshold: number = 0.8 // Threshold for color similarity (0.1-1.0)
  public colorUpdateInterval: number = 100 // How often to check colors (ms)
  public enableColorChangeMap: boolean = true // Enable color change detection for adaptive sizing
  public showColorChangeMap: boolean = false // Show the color change gradient visualization
  
  // Dynamic circle spawning parameters
  public enableDynamicSpawning: boolean = true // Enable dynamic circle spawning in empty areas
  public spawnInterval: number = 3000 // How often to check for empty areas and spawn circles (ms)
  public maxSpawnsPerCheck: number = 3 // Maximum new circles to spawn per check
  public minEmptyAreaSize: number = 0.001 // Minimum empty area size (grid cells) to consider for spawning
  
  // Pre-computed circle data
  private circles: CircleData[] = []
  private needsRecompute: boolean = true
  private circleDataTexture: THREE.DataTexture | null = null
  
  // Real-time physics animation state
  private isAnimating: boolean = false
  private animationStartTime: number = 0
  private animationDuration: number = 5000 // 5 seconds
  private spatialStructure: QuadTree | SpatialHashGrid | null = null
  
  // Progressive growth state
  private growthStartTime: number = 0
  private lastGrowthUpdate: number = 0
  
  // Adaptive color monitoring state
  private lastColorCheck: number = 0
  private currentInputTexture: THREE.Texture | null = null
  private currentRenderer: THREE.WebGLRenderer | null = null
  private effectStartTime: number = 0 // When effect was initialized
  private relaxationDelay: number = 5000 // Delay color monitoring for 5 seconds to allow physics settling
  
  // Dynamic spawning state
  private lastSpawnCheck: number = 0
  private totalSpawnedCircles: number = 0
  
  // WebWorker support for parallel processing
  private worker: Worker | null = null
  private isGenerating: boolean = false
  private generationProgress: number = 0
  private useWebWorker: boolean = true // Can be disabled for debugging
  
  // Color change detection for adaptive sizing
  private colorChangeMap: Float32Array | null = null
  private previousImageData: ImageData | null = null
  private lastColorChangeUpdate: number = 0
  private colorChangeTexture: THREE.DataTexture | null = null
  
  // Track parameter changes to trigger recompute
  private lastParameters = {
    packingDensity: this.packingDensity,
    minCircleSize: this.minCircleSize,
    maxCircleSize: this.maxCircleSize,
    circleSpacing: this.circleSpacing,
    randomSeed: this.randomSeed,
    useVerletPhysics: this.useVerletPhysics,
    gravity: this.gravity,
    damping: this.damping,
    substeps: this.substeps,
    physicsIterations: this.physicsIterations,
    usePhysicsPlacement: this.usePhysicsPlacement,
    animatePhysics: this.animatePhysics,
    animationSpeed: this.animationSpeed
    // Note: background colors don't need recompute, they're handled by shader
  }
  
  constructor(width: number, height: number) {
    // Create render target for the effect
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Create circle data texture (more efficient than uniforms)
    // Use 300x2 texture: row 0 = position+radius, row 1 = color
    this.circleDataTexture = new THREE.DataTexture(
      new Float32Array(300 * 2 * 4), // 300 circles * 2 rows * 4 channels (RGBA)
      300, 2, // 300x2 texture
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.circleDataTexture.needsUpdate = true

    // Create circle packing shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        intensity: { value: this.intensity },
        blackBackground: { value: this.blackBackground },
        globalBackgroundR: { value: 0.08 },
        globalBackgroundG: { value: 0.08 },
        globalBackgroundB: { value: 0.08 },
        circleDataTexture: { value: this.circleDataTexture },
        numCircles: { value: 0 },
        colorChangeMap: { value: null },
        showColorChangeMap: { value: 0.0 }
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader()
    })
    
    // Create full-screen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    
    // Create scene and camera for post-processing
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)
    
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    
    // Initialize WebWorker for parallel circle generation
    this.initializeWebWorker()
  }
  
  private initializeWebWorker(): void {
    if (!this.useWebWorker || typeof Worker === 'undefined') {
      console.log('WebWorker not available or disabled, using main thread')
      return
    }
    
    try {
      // Create WebWorker from the CirclePackingWorker file
      this.worker = new Worker(new URL('./CirclePackingWorker.ts', import.meta.url), {
        type: 'module'
      })
      
      this.worker.onmessage = (event) => {
        const { type, data } = event.data
        
        switch (type) {
          case 'result':
            this.onWorkerResult(data)
            break
          case 'progress':
            this.onWorkerProgress(data)
            break
          case 'error':
            this.onWorkerError(data)
            break
        }
      }
      
      this.worker.onerror = (error) => {
        console.error('WebWorker error:', error)
        this.isGenerating = false
        // Fallback to main thread
        this.useWebWorker = false
      }
      
      console.log('WebWorker initialized successfully')
      
    } catch (error) {
      console.warn('Failed to initialize WebWorker, falling back to main thread:', error)
      this.useWebWorker = false
    }
  }
  
  private onWorkerResult(circles: CircleData[]): void {
    this.circles = circles
    this.isGenerating = false
    this.generationProgress = 100
    this.needsRecompute = false
    
    // Set effect start time for relaxation delay
    this.effectStartTime = performance.now()
    
    // Initialize progressive growth for all circles
    this.initializeProgressiveGrowth()
    
    this.updateCircleDataInShader()
    console.log(`WebWorker completed: ${circles.length} circles generated`)
  }
  
  private onWorkerProgress(data: { message: string, progress: number }): void {
    this.generationProgress = data.progress
    // You could emit this progress to the UI if needed
    console.log(`Progress: ${data.progress}% - ${data.message}`)
  }
  
  private onWorkerError(data: { message: string }): void {
    console.error('WebWorker generation error:', data.message)
    this.isGenerating = false
    this.generationProgress = 0
    // Fallback to main thread generation
    this.useWebWorker = false
    this.needsRecompute = true
  }
  
  private generateCirclesWithWorker(imageData: ImageData): void {
    if (!this.worker) {
      console.error('WebWorker not available')
      return
    }
    
    this.isGenerating = true
    this.generationProgress = 0
    
    // Send parameters to worker
    const params = {
      imageData: imageData,
      width: imageData.width,
      height: imageData.height,
      packingDensity: this.packingDensity,
      minCircleSize: this.minCircleSize,
      maxCircleSize: this.maxCircleSize,
      circleSpacing: this.circleSpacing,
      pixelateSize: this.pixelateSize,
      posterizeLevels: this.posterizeLevels,
      randomSeed: this.randomSeed,
      useVerletPhysics: this.useVerletPhysics,
      gravity: this.gravity,
      damping: this.damping,
      substeps: this.substeps,
      physicsIterations: this.physicsIterations
    }
    
    this.worker.postMessage({
      type: 'generateCircles',
      data: params
    })
  }
  
  // Public methods for monitoring generation progress
  getGenerationProgress(): number {
    return this.generationProgress
  }
  
  isCurrentlyGenerating(): boolean {
    return this.isGenerating
  }
  
  // Method to toggle WebWorker usage (useful for debugging)
  setUseWebWorker(use: boolean): void {
    this.useWebWorker = use
    if (!use && this.worker) {
      this.worker.terminate()
      this.worker = null
    } else if (use && !this.worker) {
      this.initializeWebWorker()
    }
  }
  
  // Simplified circle packing with physics-based placement
  private generateCirclePacking(originalImageData: ImageData, width: number, height: number): CircleData[] {
    const startTime = performance.now()
    
    // Always use spatial hash grid for best performance
    const spatialStructure = new SpatialHashGrid(width, height, this.maxCircleSize * 0.5)
    
    // Use physics-based placement if enabled, otherwise use simple random placement
    if (this.usePhysicsPlacement) {
      console.log('Using physics-based bouncing ball placement system')
      return this.generatePhysicsBasedCirclePacking(originalImageData, width, height, spatialStructure)
    } else {
      console.log('Using simple random placement with physics relaxation')
      return this.generateSimpleCirclePacking(originalImageData, width, height, spatialStructure)
    }
  }
  
  // Adaptive circle placement with proper packing logic
  private generateSimpleCirclePacking(originalImageData: ImageData, width: number, height: number, spatialStructure: SpatialHashGrid): CircleData[] {
    const circles: CircleData[] = []
    
    // Use totalCircles parameter with screen scaling
    const screenArea = width * height
    const baseArea = 1920 * 1080 // Reference resolution (Full HD)
    const areaRatio = screenArea / baseArea
    const screenAwareAttempts = Math.floor(this.totalCircles * areaRatio * 10) // Scale attempts with screen size
    
    console.log(`Screen: ${width}×${height} (${screenArea}px), Target circles: ${this.totalCircles}, Attempts: ${screenAwareAttempts}`)
    
    const totalAttempts = screenAwareAttempts
    
    // Track consecutive failures to detect when packing is saturated
    let consecutiveFailures = 0
    const maxConsecutiveFailures = Math.min(1000, totalAttempts * 0.1)
    
    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      // Weighted random position - bias toward high-change areas
      let x: number, y: number
      
      if (this.enableColorChangeMap && this.colorChangeMap && Math.random() < 0.6) {
        // 60% of attempts: use weighted sampling based on color change intensity
        x = this.sampleWeightedPosition(width, height).x
        y = this.sampleWeightedPosition(width, height).y
      } else {
        // 40% of attempts: use pure random sampling for coverage
        x = Math.random() * width
        y = Math.random() * height
      }
      
      // Calculate optimal radius for this position (adaptive sizing)
      const optimalRadius = this.calculateOptimalRadius(x, y, spatialStructure, width, height)
      
      // Skip if no valid radius can fit
      if (optimalRadius < this.minCircleSize) {
        consecutiveFailures++
        if (consecutiveFailures > maxConsecutiveFailures) {
          console.log(`Stopping circle generation - packing saturated after ${circles.length} circles`)
          break
        }
        continue
      }
      
      // Reset failure counter on successful placement
      consecutiveFailures = 0
      
      if (this.isValidCirclePosition(x, y, optimalRadius, spatialStructure, width, height)) {
        // Sample color from original image
        const pixelX = Math.max(0, Math.min(width - 1, Math.floor(x)))
        const pixelY = Math.max(0, Math.min(height - 1, Math.floor(y)))
        const pixelIndex = (pixelY * width + pixelX) * 4
        
        let color: [number, number, number] = [
          originalImageData.data[pixelIndex] / 255,
          originalImageData.data[pixelIndex + 1] / 255,
          originalImageData.data[pixelIndex + 2] / 255
        ]
        
        // Prevent pure black circles
        const brightness = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114
        if (brightness < 0.1) {
          const factor = 0.1 / Math.max(brightness, 0.001)
          color = [
            Math.min(1.0, color[0] * factor + 0.05),
            Math.min(1.0, color[1] * factor + 0.05),
            Math.min(1.0, color[2] * factor + 0.05)
          ]
        }
        
        // Initialize circle with progressive growth properties
        const currentTime = performance.now()
        const initialRadius = this.enableProgressiveGrowth ? 
          optimalRadius * this.startSizeMultiplier : optimalRadius
        
        const newCircle: CircleData = { 
          x, 
          y, 
          radius: initialRadius, 
          color,
          targetRadius: optimalRadius,
          currentRadius: initialRadius,
          growthStartTime: currentTime
        }
        circles.push(newCircle)
        spatialStructure.insert(newCircle)
      }
    }
    
    console.log(`Simple placement: generated ${circles.length} circles`)
    
    // Apply physics relaxation if enabled
    if (this.useVerletPhysics) {
      return this.applyVerletPhysicsSimulation(circles, width, height)
    } else {
      return this.applySimpleForceRelaxation(circles, width, height)
    }
  }

  // Calculate the optimal (largest possible) radius at a given position
  private calculateOptimalRadius(x: number, y: number, spatialStructure: SpatialHashGrid, width: number, height: number): number {
    // Start with maximum possible radius and work down
    const maxPossibleRadius = Math.min(this.maxCircleSize, 
      Math.min(x, y, width - x, height - y)) // Distance to nearest edge
    
    // Use spatial hash grid to find the largest radius that doesn't collide
    let optimalRadius = spatialStructure.getMaxRadiusAt(x, y, this.circleSpacing, {width, height})
    
    // Apply color change-based sizing if enabled
    if (this.enableColorChangeMap && this.colorChangeMap) {
      const colorChangeIntensity = this.getColorChangeIntensity(x, y)
      
      // High color change = smaller, denser circles
      // Low color change = larger, sparser circles
      const sizeMultiplier = 1.0 - (colorChangeIntensity * 0.7) // Reduce size by up to 70%
      optimalRadius *= sizeMultiplier
      
      // In high-change areas, allow smaller circles than normal minimum
      const adaptiveMinSize = colorChangeIntensity > 0.5 ? 
        this.minCircleSize * 0.5 : this.minCircleSize
      
      // Clamp to adaptive range
      return Math.max(adaptiveMinSize, Math.min(maxPossibleRadius, optimalRadius))
    }
    
    // Normal sizing without color change detection
    return Math.max(this.minCircleSize, Math.min(maxPossibleRadius, optimalRadius))
  }

  // Check if a circle can be placed at the given position without collisions
  private isValidCirclePosition(x: number, y: number, radius: number, spatialStructure: SpatialHashGrid, width: number, height: number): boolean {
    // Check boundary constraints
    if (x - radius < 0 || x + radius > width || y - radius < 0 || y + radius > height) {
      return false
    }
    
    // Check for collisions with existing circles
    const collision = spatialStructure.checkCollision({x, y, radius, color: [0,0,0]}, this.circleSpacing)
    return collision === null
  }
  
  // Apply physics-based relaxation using Verlet integration or fallback to force-based
  private applyForceBasedRelaxation(circles: CircleData[], width: number, height: number): CircleData[] {
    if (this.useVerletPhysics) {
      return this.applyVerletPhysicsSimulation(circles, width, height)
    } else {
      return this.applySimpleForceRelaxation(circles, width, height)
    }
  }
  
  // New Verlet integration physics simulation
  private applyVerletPhysicsSimulation(circles: CircleData[], width: number, height: number): CircleData[] {
    const physicsCircles = circles.map(circle => ({
      ...circle,
      prevX: circle.prevX ?? circle.x,
      prevY: circle.prevY ?? circle.y,
      mass: Math.PI * circle.radius * circle.radius, // mass = π × radius²
      pinned: false
    }))
    
    const fixedTimeStep = 0.016 // ~60 FPS timestep
    const substepDelta = fixedTimeStep / this.substeps
    
    console.log(`Verlet physics: ${this.physicsIterations} iterations, ${this.substeps} substeps`)
    
    for (let iteration = 0; iteration < this.physicsIterations; iteration++) {
      for (let substep = 0; substep < this.substeps; substep++) {
        this.verletIntegrationStep(physicsCircles, width, height, substepDelta)
        this.resolveCollisions(physicsCircles)
        this.constrainToBounds(physicsCircles, width, height)
      }
    }
    
    return physicsCircles
  }
  
  // Verlet integration step: position = position + velocity + acceleration
  private verletIntegrationStep(circles: CircleData[], width: number, height: number, deltaTime: number): void {
    for (const circle of circles) {
      if (circle.pinned || circle.radius <= 0) continue
      
      // Calculate current velocity from position difference
      const velocityX = circle.x - (circle.prevX ?? circle.x)
      const velocityY = circle.y - (circle.prevY ?? circle.y)
      
      // Store current position as previous
      circle.prevX = circle.x
      circle.prevY = circle.y
      
      // Apply gravity
      const gravityForce = this.gravity * deltaTime * deltaTime
      
      // Apply damping to velocity
      const dampedVelX = velocityX * this.damping
      const dampedVelY = velocityY * this.damping
      
      // Verlet integration: newPosition = currentPosition + velocity + acceleration
      circle.x += dampedVelX
      circle.y += dampedVelY + gravityForce
      
      // Add slight random force to prevent perfect symmetry
      circle.x += (Math.random() - 0.5) * 0.01
      circle.y += (Math.random() - 0.5) * 0.01
    }
  }
  
  // Mass-based collision resolution
  private resolveCollisions(circles: CircleData[]): void {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const circle1 = circles[i]
        const circle2 = circles[j]
        
        // Skip zero-radius circles
        if (circle1.radius <= 0 || circle2.radius <= 0) continue
        
        const dx = circle2.x - circle1.x
        const dy = circle2.y - circle1.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const minDistance = (circle1.radius + circle2.radius) * this.circleSpacing
        
        if (distance < minDistance && distance > 0) {
          // Calculate overlap
          const overlap = minDistance - distance
          
          // Normalize collision vector
          const normalX = dx / distance
          const normalY = dy / distance
          
          // Mass-based separation (heavier circles move much less)
          const mass1 = circle1.mass ?? 1
          const mass2 = circle2.mass ?? 1
          const totalMass = mass1 + mass2
          
          // More pronounced mass effect - smaller circles bounce off bigger ones
          const mass1Ratio = (mass2 / totalMass) * 1.5 // Amplify mass effect
          const mass2Ratio = (mass1 / totalMass) * 1.5
          
          // Separate circles based on mass ratios
          const separationX = normalX * overlap * 0.5
          const separationY = normalY * overlap * 0.5
          
          if (!circle1.pinned) {
            circle1.x -= separationX * mass1Ratio
            circle1.y -= separationY * mass1Ratio
          }
          
          if (!circle2.pinned) {
            circle2.x += separationX * mass2Ratio
            circle2.y += separationY * mass2Ratio
          }
        }
      }
    }
  }
  
  // Constrain circles to stay within bounds
  private constrainToBounds(circles: CircleData[], width: number, height: number): void {
    for (const circle of circles) {
      // Skip zero-radius circles
      if (circle.radius <= 0) continue
      
      const margin = circle.radius
      
      // Left boundary
      if (circle.x < margin) {
        circle.x = margin
        if (circle.prevX !== undefined && circle.prevX < circle.x) {
          circle.prevX = circle.x + (circle.x - circle.prevX) * 0.8 // Bounce with damping
        }
      }
      
      // Right boundary
      if (circle.x > width - margin) {
        circle.x = width - margin
        if (circle.prevX !== undefined && circle.prevX > circle.x) {
          circle.prevX = circle.x + (circle.x - circle.prevX) * 0.8
        }
      }
      
      // Top boundary
      if (circle.y < margin) {
        circle.y = margin
        if (circle.prevY !== undefined && circle.prevY < circle.y) {
          circle.prevY = circle.y + (circle.y - circle.prevY) * 0.8
        }
      }
      
      // Bottom boundary
      if (circle.y > height - margin) {
        circle.y = height - margin
        if (circle.prevY !== undefined && circle.prevY > circle.y) {
          circle.prevY = circle.y + (circle.y - circle.prevY) * 0.8
        }
      }
    }
  }
  
  // Original simple force-based relaxation (fallback)
  private applySimpleForceRelaxation(circles: CircleData[], width: number, height: number): CircleData[] {
    const relaxedCircles = circles.map(circle => ({ ...circle })) // Deep copy
    const iterations = Math.min(10, Math.max(3, Math.floor(circles.length / 50))) // Adaptive iterations
    const dampingFactor = 0.5 // Reduce movement over time
    
    console.log(`Applying ${iterations} simple force relaxation iterations to ${circles.length} circles`)
    
    for (let iteration = 0; iteration < iterations; iteration++) {
      const forces: Array<{fx: number, fy: number}> = []
      
      // Calculate forces for each circle
      for (let i = 0; i < relaxedCircles.length; i++) {
        forces[i] = { fx: 0, fy: 0 }
        const circle1 = relaxedCircles[i]
        
        // Repulsion forces from other circles
        for (let j = 0; j < relaxedCircles.length; j++) {
          if (i === j) continue
          
          const circle2 = relaxedCircles[j]
          const dx = circle1.x - circle2.x
          const dy = circle1.y - circle2.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const minDistance = (circle1.radius + circle2.radius) * this.circleSpacing
          
          if (distance < minDistance && distance > 0) {
            // Overlap detected - apply repulsion force
            const overlap = minDistance - distance
            const forceStrength = overlap * 0.1 // Force proportional to overlap
            const forceX = (dx / distance) * forceStrength
            const forceY = (dy / distance) * forceStrength
            
            forces[i].fx += forceX
            forces[i].fy += forceY
          }
        }
        
        // Boundary forces to keep circles within bounds
        const boundaryPadding = circle1.radius + 2
        
        if (circle1.x < boundaryPadding) {
          forces[i].fx += (boundaryPadding - circle1.x) * 0.2
        }
        if (circle1.x > width - boundaryPadding) {
          forces[i].fx -= (circle1.x - (width - boundaryPadding)) * 0.2
        }
        if (circle1.y < boundaryPadding) {
          forces[i].fy += (boundaryPadding - circle1.y) * 0.2
        }
        if (circle1.y > height - boundaryPadding) {
          forces[i].fy -= (circle1.y - (height - boundaryPadding)) * 0.2
        }
        
        // Add slight upward bias to counteract any downward clustering tendency
        const centerY = height / 2
        if (circle1.y > centerY) {
          const distanceFromCenter = (circle1.y - centerY) / centerY
          forces[i].fy -= distanceFromCenter * 0.05 // Very gentle upward force
        }
      }
      
      // Apply forces with damping
      const currentDamping = dampingFactor * (1 - iteration / iterations) // Reduce movement over time
      let maxMovement = 0
      
      for (let i = 0; i < relaxedCircles.length; i++) {
        const movement = Math.sqrt(forces[i].fx * forces[i].fx + forces[i].fy * forces[i].fy)
        maxMovement = Math.max(maxMovement, movement)
        
        // Limit maximum movement per iteration
        const maxStep = Math.min(relaxedCircles[i].radius * 0.5, 5.0)
        if (movement > maxStep) {
          forces[i].fx = (forces[i].fx / movement) * maxStep
          forces[i].fy = (forces[i].fy / movement) * maxStep
        }
        
        relaxedCircles[i].x += forces[i].fx * currentDamping
        relaxedCircles[i].y += forces[i].fy * currentDamping
        
        // Clamp to bounds
        relaxedCircles[i].x = Math.max(relaxedCircles[i].radius, 
          Math.min(width - relaxedCircles[i].radius, relaxedCircles[i].x))
        relaxedCircles[i].y = Math.max(relaxedCircles[i].radius, 
          Math.min(height - relaxedCircles[i].radius, relaxedCircles[i].y))
      }
      
      // Early termination if system is stable
      if (maxMovement < 0.1) {
        console.log(`Relaxation converged after ${iteration + 1} iterations`)
        break
      }
    }
    
    return relaxedCircles
  }
  
  // Physics-based bouncing ball placement system (inspired by sphere-drawings)
  private generatePhysicsBasedCirclePacking(originalImageData: ImageData, width: number, height: number, spatialStructure: QuadTree | SpatialHashGrid): CircleData[] {
    const circles: CircleData[] = []
    
    // Calculate screen-aware circle count for physics placement
    const screenArea = width * height
    const baseArea = 1920 * 1080 // Reference resolution (Full HD)
    const areaRatio = screenArea / baseArea
    const maxCircles = Math.floor(this.packingDensity * 2 * areaRatio) // Adjust density for physics placement
    
    console.log(`Physics placement: generating ${maxCircles} circles (area ratio: ${areaRatio.toFixed(2)}) with bouncing ball simulation`)
    
    // Spawn circles from the top with random initial velocities
    for (let i = 0; i < maxCircles; i++) {
      const circle = this.createBouncingBall(originalImageData, width, height, i)
      if (circle) {
        // Simulate bouncing ball physics until it settles
        const settledCircle = this.simulateBouncingBall(circle, circles, width, height, spatialStructure)
        if (settledCircle) {
          circles.push(settledCircle)
          
          // Update spatial structure for collision detection
          if (spatialStructure instanceof SpatialHashGrid) {
            spatialStructure.clear()
            for (const c of circles) {
              spatialStructure.insert(c)
            }
          } else {
            spatialStructure.insert(settledCircle)
          }
        }
      }
    }
    
    console.log(`Physics placement complete: ${circles.length} circles settled`)
    
    // Apply final Verlet physics simulation for polish
    if (this.useVerletPhysics) {
      return this.applyVerletPhysicsSimulation(circles, width, height)
    }
    
    return circles
  }
  
  // Create a bouncing ball with physics properties
  private createBouncingBall(originalImageData: ImageData, width: number, height: number, index: number): CircleData | null {
    // Deterministic spawn positions across the top
    const spawnX = ((index % 10) + 1) * (width / 11) + (Math.random() - 0.5) * 20
    const spawnY = -50 // Start above the screen
    
    // Random size based on configuration
    const radius = this.minCircleSize + Math.random() * (this.maxCircleSize - this.minCircleSize)
    
    // Sample color from a random position in the image for color variety
    const sampleX = Math.max(0, Math.min(width - 1, Math.floor(spawnX)))
    const sampleY = Math.max(0, Math.min(height - 1, Math.floor(height * Math.random())))
    const pixelIndex = (sampleY * width + sampleX) * 4
    
    let color: [number, number, number] = [
      originalImageData.data[pixelIndex] / 255,
      originalImageData.data[pixelIndex + 1] / 255,
      originalImageData.data[pixelIndex + 2] / 255
    ]
    
    // Prevent pure black circles
    const brightness = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114
    if (brightness < 0.1) {
      const factor = 0.1 / Math.max(brightness, 0.001)
      color = [
        Math.min(1.0, color[0] * factor + 0.05),
        Math.min(1.0, color[1] * factor + 0.05),
        Math.min(1.0, color[2] * factor + 0.05)
      ]
    }
    
    return {
      x: spawnX,
      y: spawnY,
      radius,
      color,
      prevX: spawnX + (Math.random() - 0.5) * 2, // Small initial velocity
      prevY: spawnY - Math.random() * 2,
      mass: Math.PI * radius * radius,
      pinned: false
    }
  }
  
  // Simulate bouncing ball physics until it settles
  private simulateBouncingBall(ball: CircleData, existingCircles: CircleData[], width: number, height: number, spatialStructure: QuadTree | SpatialHashGrid): CircleData | null {
    const maxSimulationSteps = 200 // Prevent infinite loops
    const settleThreshold = 0.1 // Velocity threshold for "settled"
    
    for (let step = 0; step < maxSimulationSteps; step++) {
      // Verlet integration step
      const velocityX = ball.x - (ball.prevX ?? ball.x)
      const velocityY = ball.y - (ball.prevY ?? ball.y)
      
      ball.prevX = ball.x
      ball.prevY = ball.y
      
      // Apply gravity and damping
      const gravity = this.gravity * 0.5 // Reduced gravity for settling
      ball.x += velocityX * this.damping
      ball.y += velocityY * this.damping + gravity
      
      // Boundary collisions with bouncing
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius
        if (ball.prevX !== undefined) {
          ball.prevX = ball.x + (ball.x - ball.prevX) * 0.6 // Bounce with energy loss
        }
      }
      if (ball.x + ball.radius > width) {
        ball.x = width - ball.radius
        if (ball.prevX !== undefined) {
          ball.prevX = ball.x + (ball.x - ball.prevX) * 0.6
        }
      }
      if (ball.y + ball.radius > height) {
        ball.y = height - ball.radius
        if (ball.prevY !== undefined) {
          ball.prevY = ball.y + (ball.y - ball.prevY) * 0.6 // Bounce with energy loss
        }
      }
      
      // Circle collisions
      const hasCollision = this.resolveBouncingBallCollisions(ball, existingCircles, spatialStructure)
      
      // Check if ball has settled (low velocity and on ground or resting on other circles)
      const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY)
      const isNearGround = ball.y + ball.radius >= height - 5
      const isResting = speed < settleThreshold && (isNearGround || hasCollision)
      
      if (isResting) {
        // Ball has settled, return final position
        return {
          x: ball.x,
          y: ball.y,
          radius: ball.radius,
          color: ball.color,
          mass: ball.mass
        }
      }
    }
    
    // Failed to settle within time limit, reject this ball
    return null
  }
  
  // Resolve collisions for bouncing ball
  private resolveBouncingBallCollisions(ball: CircleData, existingCircles: CircleData[], spatialStructure: QuadTree | SpatialHashGrid): boolean {
    let hasCollision = false
    
    // Get nearby circles for collision detection
    const nearby = spatialStructure instanceof SpatialHashGrid 
      ? spatialStructure.getNearbyCircles(ball.x, ball.y, ball.radius + this.circleSpacing)
      : existingCircles // Fallback to checking all circles for QuadTree
    
    for (const other of nearby) {
      const dx = ball.x - other.x
      const dy = ball.y - other.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const minDistance = ball.radius + other.radius + this.circleSpacing
      
      if (distance < minDistance && distance > 0) {
        hasCollision = true
        
        // Collision response: bounce ball away from other circle
        const overlap = minDistance - distance
        const normalX = dx / distance
        const normalY = dy / distance
        
        // Move ball away from collision
        ball.x += normalX * overlap
        ball.y += normalY * overlap
        
        // Bounce velocity (reverse velocity component along collision normal)
        if (ball.prevX !== undefined && ball.prevY !== undefined) {
          const velocityX = ball.x - ball.prevX
          const velocityY = ball.y - ball.prevY
          
          // Reflect velocity along collision normal with energy loss
          const dotProduct = velocityX * normalX + velocityY * normalY
          ball.prevX = ball.x - (velocityX - 2 * dotProduct * normalX) * 0.7 // 30% energy loss
          ball.prevY = ball.y - (velocityY - 2 * dotProduct * normalY) * 0.7
        }
      }
    }
    
    return hasCollision
  }
  
  // Start real-time physics animation
  public startPhysicsAnimation(originalImageData: ImageData, width: number, height: number): void {
    if (this.isAnimating) return // Already animating
    
    console.log('Starting real-time physics animation!')
    
    // Create spatial structure for animation
    this.spatialStructure = this.useSpatialHashGrid 
      ? new SpatialHashGrid(width, height, this.maxCircleSize * 0.5)
      : new QuadTree({ x: 0, y: 0, width, height }, 15)
    
    // Initialize circles with physics properties
    this.circles = []
    
    // Calculate screen-aware circle count for animation
    const screenArea = width * height
    const baseArea = 1920 * 1080 // Reference resolution (Full HD)
    const areaRatio = screenArea / baseArea
    const maxCircles = Math.floor(this.packingDensity * 0.5 * areaRatio) // Fewer circles for better animation performance
    
    for (let i = 0; i < maxCircles; i++) {
      const circle = this.createBouncingBall(originalImageData, width, height, i)
      if (circle) {
        this.circles.push(circle)
      }
    }
    
    // Start animation
    this.isAnimating = true
    this.animationStartTime = performance.now()
    console.log(`Animation started with ${this.circles.length} circles`)
  }
  
  // Update physics animation (called every frame)
  public updatePhysicsAnimation(deltaTime: number, width: number, height: number): boolean {
    if (!this.isAnimating || !this.spatialStructure) return false
    
    // Continue physics simulation continuously when animatePhysics is enabled
    // Only stop if animatePhysics is disabled
    if (!this.animatePhysics) {
      this.isAnimating = false
      console.log('Physics animation stopped - animatePhysics disabled')
      return false
    }
    
    // Apply physics step with animation speed multiplier
    const physicsStep = deltaTime * this.animationSpeed * 0.001 // Convert to seconds
    
    // Clear spatial structure for this frame
    if (this.spatialStructure instanceof SpatialHashGrid) {
      this.spatialStructure.clear()
      for (const circle of this.circles) {
        // Only insert living circles with positive radius
        if (circle.radius > 0) {
          this.spatialStructure.insert(circle)
        }
      }
    }
    
    // Apply one frame of physics simulation
    this.verletIntegrationStep(this.circles, width, height, physicsStep)
    this.resolveCollisions(this.circles)
    this.constrainToBounds(this.circles, width, height)
    
    // Update shader with new positions
    this.updateCircleDataInShader()
    
    return true // Continue animating
  }
  
  // Stop animation
  public stopPhysicsAnimation(): void {
    this.isAnimating = false
    console.log('Animation stopped')
  }
  
  // Check if currently animating
  public isPhysicsAnimating(): boolean {
    return this.isAnimating
  }

  // Update progressive growth for all circles
  private updateProgressiveGrowth(deltaTime: number): void {
    if (!this.circles || this.circles.length === 0) return
    
    const currentTime = performance.now()
    let needsUpdate = false
    
    for (const circle of this.circles) {
      // Skip if growth properties aren't set
      if (!circle.targetRadius || !circle.currentRadius || !circle.growthStartTime) continue
      
      // Skip if already at target size
      if (circle.currentRadius >= circle.targetRadius) continue
      
      // Skip circles that are being animated by color similarity
      if (circle.radiusAnimationStartTime) continue
      
      // Special handling for dynamic spawns - grow until collision
      if (circle.isDynamicSpawn) {
        // Try to grow incrementally and check for collisions
        const growthIncrement = deltaTime * this.growthRate * 0.1 // Smaller increments for collision detection
        const potentialNewRadius = Math.min(circle.currentRadius + growthIncrement, circle.targetRadius)
        
        // Check if this new size would cause collision
        if (this.spatialStructure && this.wouldCollideAtRadius(circle, potentialNewRadius)) {
          // Stop growing - we've hit something, lock size and mark as stable
          circle.targetRadius = circle.currentRadius // Lock current size as final
          circle.pinned = true // Make it stable in physics
          console.log(`Dynamic spawn stabilized at radius ${circle.currentRadius.toFixed(1)} (collision detected)`)
          continue
        }
        
        // Check if we've reached target size
        if (potentialNewRadius >= circle.targetRadius) {
          circle.currentRadius = circle.targetRadius
          circle.radius = circle.targetRadius
          circle.pinned = true // Make it stable in physics
          console.log(`Dynamic spawn reached target radius ${circle.targetRadius.toFixed(1)}`)
          needsUpdate = true
          continue
        }
        
        circle.currentRadius = potentialNewRadius
        circle.radius = potentialNewRadius
        
        // Resample color as dynamic spawned circle grows
        this.resampleCircleColor(circle)
        
        needsUpdate = true
        continue
      }
      
      // Regular progressive growth for non-dynamic circles
      const elapsedTime = currentTime - circle.growthStartTime
      const growthProgress = Math.min(1.0, elapsedTime * this.growthRate * 0.001) // Convert to seconds
      
      // Smooth easing function (ease-out)
      const easedProgress = 1 - Math.pow(1 - growthProgress, 3)
      
      // Calculate new radius
      const initialRadius = circle.targetRadius * this.startSizeMultiplier
      const newRadius = initialRadius + (circle.targetRadius - initialRadius) * easedProgress
      
      // Update radius if changed significantly
      if (Math.abs(newRadius - circle.currentRadius) > 0.1) {
        circle.currentRadius = newRadius
        circle.radius = newRadius // Update actual radius used by shader
        
        // Update mass based on new radius
        circle.mass = Math.PI * circle.radius * circle.radius
        
        // Resample color as circle grows to match current size content
        this.resampleCircleColor(circle)
        
        needsUpdate = true
      }
    }
    
    // Update shader data if any circles grew
    if (needsUpdate) {
      this.updateCircleDataInShader()
    }
  }

  // Initialize progressive growth properties for all circles
  private initializeProgressiveGrowth(): void {
    if (!this.enableProgressiveGrowth || !this.circles) return
    
    const currentTime = performance.now()
    this.growthStartTime = currentTime
    
    for (let i = 0; i < this.circles.length; i++) {
      const circle = this.circles[i]
      
      // Set target radius (current radius is the intended final size)
      circle.targetRadius = circle.radius
      
      // Set starting radius (reduced by startSizeMultiplier)
      const startRadius = circle.radius * this.startSizeMultiplier
      circle.radius = startRadius
      circle.currentRadius = startRadius
      
      // Stagger growth start times for visual variety (0-500ms random delay)
      circle.growthStartTime = currentTime + Math.random() * 500
    }
    
    console.log(`Progressive growth initialized for ${this.circles.length} circles`)
  }

  // Update adaptive color monitoring for all circles
  private updateColorMonitoring(inputTexture: THREE.Texture, deltaTime: number): void {
    if (!this.circles || this.circles.length === 0) return
    
    const currentTime = performance.now()
    
    // Update color change detection map
    if (this.enableColorChangeMap) {
      this.updateColorChangeDetection(currentTime)
    }
    
    // Skip color monitoring during initial relaxation period to allow physics settling
    if (this.effectStartTime > 0 && currentTime - this.effectStartTime < this.relaxationDelay) {
      // Still update any ongoing adaptations and radius animations
      this.updateCircleAdaptations(currentTime, deltaTime)
      this.updateRadiusAnimations(deltaTime)
      return
    }
    
    // Calculate adaptive update interval based on average color change intensity
    let adaptiveUpdateInterval = this.colorUpdateInterval
    if (this.colorChangeMap && this.enableColorChangeMap) {
      // Calculate average color change intensity
      let totalIntensity = 0
      for (let i = 0; i < this.colorChangeMap.length; i++) {
        totalIntensity += this.colorChangeMap[i]
      }
      const avgIntensity = totalIntensity / this.colorChangeMap.length
      
      // Adaptive frequency: high change = faster updates, low change = slower updates
      // Scale from 0.2x to 3.0x the base interval
      const frequencyMultiplier = 0.2 + (1.0 - avgIntensity) * 2.8
      adaptiveUpdateInterval = this.colorUpdateInterval * frequencyMultiplier
      
      // Debug adaptive frequency occasionally
      if (Math.random() < 0.05) {
        console.log(`Adaptive frequency: avgIntensity=${avgIntensity.toFixed(3)}, multiplier=${frequencyMultiplier.toFixed(2)}x, interval=${adaptiveUpdateInterval.toFixed(0)}ms`)
      }
    }
    
    // Check if enough time has passed for color monitoring update (using adaptive interval)
    if (currentTime - this.lastColorCheck < adaptiveUpdateInterval) {
      // Still update any ongoing adaptations and radius animations
      this.updateCircleAdaptations(currentTime, deltaTime)
      this.updateRadiusAnimations(deltaTime)
      return
    }
    
    // Log when color monitoring starts (only once)
    if (this.lastColorCheck === 0 && this.effectStartTime > 0) {
      console.log(`Color monitoring started after ${(currentTime - this.effectStartTime).toFixed(0)}ms relaxation delay`)
    }
    
    this.lastColorCheck = currentTime
    this.currentInputTexture = inputTexture
    
    // Check a randomized batch of circles each frame
    const batchSize = Math.floor(this.circles.length * 0.3) // Process 30% each frame (reduced from 90%)
    
    // Create weighted batch of circle indices based on color change intensity
    const availableIndices = []
    const circleWeights = []
    
    for (let i = 0; i < this.circles.length; i++) {
      const circle = this.circles[i]
      // Only include circles that can be processed
      if (!circle.isAdapting && (!circle.spawnProtectionTime || currentTime >= circle.spawnProtectionTime)) {
        availableIndices.push(i)
        
        // Calculate weight based on color change intensity at circle position
        let weight = 1.0 // Default weight
        if (this.colorChangeMap && this.imageData && this.enableColorChangeMap) {
          const changeIntensity = this.getColorChangeIntensity(circle.x, circle.y)
          // Higher change intensity = higher weight (2x more likely to be selected)
          weight = 0.5 + changeIntensity * 1.5
        }
        circleWeights.push(weight)
      }
    }
    
    // Select circles using weighted random sampling
    const indicesToProcess = []
    const desiredCount = Math.min(batchSize, availableIndices.length)
    
    for (let i = 0; i < desiredCount; i++) {
      // Calculate total weight of remaining candidates
      const totalWeight = circleWeights.reduce((sum, weight, idx) => 
        availableIndices[idx] !== -1 ? sum + weight : sum, 0)
      
      if (totalWeight <= 0) break
      
      // Select weighted random index
      let randomWeight = Math.random() * totalWeight
      let selectedIdx = -1
      
      for (let j = 0; j < availableIndices.length; j++) {
        if (availableIndices[j] === -1) continue // Already selected
        randomWeight -= circleWeights[j]
        if (randomWeight <= 0) {
          selectedIdx = j
          break
        }
      }
      
      if (selectedIdx !== -1) {
        indicesToProcess.push(availableIndices[selectedIdx])
        availableIndices[selectedIdx] = -1 // Mark as selected
      }
    }
    let processedCount = 0
    
    for (const circleIndex of indicesToProcess) {
      const circle = this.circles[circleIndex]
      this.checkCircleColorSimilarity(circle, inputTexture, currentTime)
      processedCount++
    }
    
    // Update ongoing adaptations
    this.updateCircleAdaptations(currentTime, deltaTime)
    this.updateRadiusAnimations(deltaTime)
    
    // Log processing stats occasionally
    if (Math.random() < 0.01) { // Log ~1% of the time
      const highChangeCircles = indicesToProcess.filter(idx => {
        const circle = this.circles[idx]
        return this.colorChangeMap && this.imageData && this.getColorChangeIntensity(circle.x, circle.y) > 0.5
      }).length
      console.log(`Color monitoring: processed ${processedCount}/${this.circles.length} circles (${(processedCount/this.circles.length*100).toFixed(1)}%), ${highChangeCircles} in high-change areas`)
    }
  }

  // Check if a circle's color matches the content beneath it
  private async checkCircleColorSimilarity(circle: CircleData, inputTexture: THREE.Texture, currentTime: number): Promise<void> {
    try {
      // Store position before async sampling to detect if circle moved during sampling
      const startPosition = { x: circle.x, y: circle.y }
      
      // Sample the average color under the circle
      const sampledColor = await this.sampleCircleAreaColor(circle, inputTexture)
      
      // Validate circle hasn't moved significantly during async operation
      const positionDrift = Math.sqrt(
        Math.pow(circle.x - startPosition.x, 2) + Math.pow(circle.y - startPosition.y, 2)
      )
      if (positionDrift > 5.0) {
        // Circle moved too much during sampling, skip this update
        return
      }
      
      // Store original color if not set
      if (!circle.originalColor) {
        circle.originalColor = [...circle.color]
      }
      
      // Calculate color similarity
      const similarity = this.calculateColorSimilarity(circle.color, sampledColor)
      
      // New system: Scale circle size based on color similarity
      this.updateCircleSizeBasedOnSimilarity(circle, similarity)
      
    } catch (error) {
      // Silently handle sampling errors
      console.warn('Color sampling failed:', error)
    }
  }

  // New algorithm: Sample center + 8 surrounding pixels, move to best match
  private updateCircleSizeBasedOnSimilarity(circle: CircleData, similarity: number): void {
    
    // Skip processing if circle is already adapting
    if (circle.isAdapting) return
    
    // If similarity is below threshold, start color seeking behavior
    if (similarity < this.colorSimilarityThreshold) {
      circle.isAdapting = true
      circle.adaptationStartTime = performance.now()
      circle.adaptationPhase = 'resampling' // Start with seeking new position
      circle.originalColor = [...circle.color] as [number, number, number]
      
      console.log(`Circle below threshold (${similarity.toFixed(3)}): starting color seeking`)
    }
    // If similarity is good, no action needed - circle stays in place
  }

  // Update smooth radius animations for color similarity
  private updateRadiusAnimations(deltaTime: number): void {
    if (!this.circles || this.circles.length === 0) return
    
    const currentTime = performance.now()
    let needsUpdate = false
    let animatingCount = 0
    
    for (const circle of this.circles) {
      // Skip circles without animation data
      if (!circle.colorTargetRadius || !circle.radiusAnimationStartTime || !circle.radiusAnimationStartRadius) {
        continue
      }
      
      animatingCount++
      
      // Calculate animation progress using dedicated expansion duration
      const elapsedTime = currentTime - circle.radiusAnimationStartTime
      const animationDuration = this.expansionDuration // Use dedicated expansion duration parameter
      const progress = Math.min(1.0, elapsedTime / animationDuration)
      
      // Smooth easing function (ease-out for natural feel)
      const easedProgress = 1 - Math.pow(1 - progress, 2)
      
      // Interpolate between start and target radius
      const startRadius = circle.radiusAnimationStartRadius
      const targetRadius = circle.colorTargetRadius
      const newRadius = startRadius + (targetRadius - startRadius) * easedProgress
      
      // Update circle radius
      if (Math.abs(circle.radius - newRadius) > 0.01) {
        const oldRadius = circle.radius
        circle.radius = newRadius
        circle.currentRadius = newRadius
        
        // Update mass based on new radius (mass = π × radius²)
        circle.mass = Math.PI * circle.radius * circle.radius
        
        needsUpdate = true
        
      }
      
      // Animation complete - clean up animation data
      if (progress >= 1.0) {
        // Update the circle's targetRadius to match the color-based target
        if (circle.colorTargetRadius !== undefined) {
          circle.targetRadius = circle.colorTargetRadius
        }
        
        circle.radiusAnimationStartTime = undefined
        circle.radiusAnimationStartRadius = undefined
        
        // If circle is adapting and reached minimum size, move to resampling phase
        if (circle.isAdapting && circle.adaptationPhase === 'shrinking' && circle.radius <= this.minCircleSize + 0.1) {
          circle.adaptationPhase = 'resampling'
          console.log('Circle reached minimum size, starting resampling phase')
        }
      }
    }
    
    
    // Update shader if any circles changed
    if (needsUpdate) {
      this.updateCircleDataInShader()
    }
  }

  // Remove circles that have died from color mismatch
  private removeDeadCircles(): void {
    const initialCount = this.circles.length
    
    // Count how many dynamic spawns are being removed
    const removedDynamicCount = this.circles.filter(circle => 
      (circle.radius <= 0.01) && circle.isDynamicSpawn
    ).length
    
    // Filter out dead circles and circles with effectively zero radius
    this.circles = this.circles.filter(circle => 
      circle.radius > 0.01
    )
    
    const removedCount = initialCount - this.circles.length
    if (removedCount > 0) {
      // Decrease spawn count when dynamic spawns are removed
      this.totalSpawnedCircles = Math.max(0, this.totalSpawnedCircles - removedDynamicCount)
      
      // Update spatial structure with living circles only
      if (this.spatialStructure) {
        this.spatialStructure.clear()
        for (const circle of this.circles) {
          // Double-check before inserting
          if (circle.radius > 0) {
            this.spatialStructure.insert(circle)
          }
        }
        
        // If we removed a lot of circles, rebuild the spatial grid to ensure accuracy
        if (removedCount > 10) {
          this.convertToSpatialHashGrid()
        }
      }
      
      // Update shader with remaining circles
      this.updateCircleDataInShader()
    }
  }

  // Start the adaptation cycle for a circle
  private startCircleAdaptation(circle: CircleData, newColor: [number, number, number], currentTime: number): void {
    circle.isAdapting = true
    circle.adaptationStartTime = currentTime
    circle.adaptationPhase = 'shrinking'
    
    // Store the new target color
    circle.originalColor = newColor
  }

  // Update all circles that are currently adapting
  private updateCircleAdaptations(currentTime: number, deltaTime: number): void {
    let needsUpdate = false
    
    for (const circle of this.circles) {
      if (!circle.isAdapting || !circle.adaptationStartTime) continue
      
      const elapsedTime = currentTime - circle.adaptationStartTime
      
      switch (circle.adaptationPhase) {
        case 'shrinking':
          // Handled by radius animation system
          break
          
        case 'resampling':
          // Sample center + 8 surrounding pixels to find best color match
          this.findBestColorPosition(circle).then((result) => {
            if (result.bestPosition) {
              // Found a better position, try to move there
              circle.adaptationPhase = 'growing'
              circle.adaptationStartTime = currentTime
              
              // Store the target position and color
              circle.targetX = result.bestPosition.x
              circle.targetY = result.bestPosition.y
              circle.targetColor = result.bestPosition.color
              
              console.log(`Circle found better position: (${result.bestPosition.x.toFixed(1)}, ${result.bestPosition.y.toFixed(1)})`)
            } else {
              // No better position found, end adaptation
              circle.isAdapting = false
              circle.adaptationPhase = undefined
              console.log('Circle found no better position, staying in place')
            }
          }).catch(err => {
            console.error('Color seeking failed:', err)
            circle.isAdapting = false
            circle.adaptationPhase = undefined
          })
          break
          
        case 'growing':
          // Handle ray-casting movement and size adaptation
          if (circle.targetX !== undefined && circle.targetY !== undefined) {
            // Calculate direction vector to target
            const dx = circle.targetX - circle.x
            const dy = circle.targetY - circle.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            
            if (distance > 0) {
              // Normalize direction
              const dirX = dx / distance
              const dirY = dy / distance
              
              // Cast ray to find collision distance
              const collisionDistance = this.castRayToCollision(circle, dirX, dirY)
              
              // Move much more conservatively - only 10% of collision distance
              const moveDistance = collisionDistance * 0.1
              const newX = circle.x + dirX * moveDistance
              const newY = circle.y + dirY * moveDistance
              
              // Update position
              circle.x = newX
              circle.y = newY
              
              // Blend color 50% toward target
              if (circle.targetColor) {
                circle.color = this.blendColors(circle.color, circle.targetColor, 0.5)
              }
              
              // Adjust radius based on available space - very conservatively
              if (collisionDistance > circle.radius * 2) {
                // Lots of space available, grow very slightly
                const newRadius = circle.radius + 0.2
                circle.radius = newRadius
                circle.mass = Math.PI * circle.radius * circle.radius
                console.log(`Circle moved ${moveDistance.toFixed(1)}px and grew to radius ${circle.radius.toFixed(2)}`)
              } else if (collisionDistance < circle.radius * 0.8) {
                // Very limited space, shrink slightly
                const newRadius = Math.max(this.minCircleSize, circle.radius * 0.95)
                circle.radius = newRadius
                circle.mass = Math.PI * circle.radius * circle.radius
                console.log(`Circle moved ${moveDistance.toFixed(1)}px and shrunk to radius ${circle.radius.toFixed(2)}`)
              } else {
                // Moderate space, just move without size change
                console.log(`Circle moved ${moveDistance.toFixed(1)}px, radius unchanged`)
              }
              
              needsUpdate = true
            }
            
            // End adaptation cycle
            circle.isAdapting = false
            circle.adaptationPhase = undefined
            circle.targetX = undefined
            circle.targetY = undefined
            circle.targetColor = undefined
          }
          break
      }
    }
    
    if (needsUpdate) {
      this.updateCircleDataInShader()
    }
  }
  
  // Start expanding a circle until it hits another circle
  private startExpansionUntilCollision(circle: CircleData): void {
    // Start with just a small increment - we'll check collision on each frame
    const smallIncrement = 0.5 // Start with tiny expansion
    circle.colorTargetRadius = circle.radius + smallIncrement
    circle.radiusAnimationStartTime = performance.now()
    circle.radiusAnimationStartRadius = circle.radius
    
    // Mark that this circle is in gradual expansion mode
    circle.isGradualExpanding = true
  }
  
  // Update gradual expansion - add small increments until collision
  private updateGradualExpansion(circle: CircleData, currentTime: number): void {
    // Check if current expansion animation is complete
    if (circle.radiusAnimationStartTime && circle.radiusAnimationStartRadius !== undefined) {
      const elapsedTime = currentTime - circle.radiusAnimationStartTime
      const animationDuration = this.expansionDuration
      const progress = elapsedTime / animationDuration
      
      // If animation is complete, set next small increment
      if (progress >= 1.0) {
        const increment = 0.2 // Very small increments for gradual growth
        const maxRadius = Math.min(this.maxCircleSize, 30) // Reasonable cap
        
        // Don't expand beyond maximum
        if (circle.radius >= maxRadius) {
          circle.isAdapting = false
          circle.adaptationPhase = undefined
          circle.isGradualExpanding = false
          console.log(`Circle reached maximum expansion at radius ${circle.radius.toFixed(2)}`)
          return
        }
        
        // Set next small target
        circle.colorTargetRadius = circle.radius + increment
        circle.radiusAnimationStartTime = currentTime
        circle.radiusAnimationStartRadius = circle.radius
      }
    }
  }
  
  // Start color fade animation (no size change)
  private startColorFade(circle: CircleData, currentTime: number): void {
    // Mark as fading and set end time
    circle.adaptationPhase = 'growing' // Reuse growing phase for fade completion tracking
    circle.adaptationStartTime = currentTime
    
    // No radius animation needed - just wait for fade to complete
    // The new color is already set in the circle.color during resampling
    
    // Set a timer to end the adaptation after fade duration
    setTimeout(() => {
      if (circle.isAdapting && circle.adaptationPhase === 'growing') {
        circle.isAdapting = false
        circle.adaptationPhase = undefined
        console.log('Color fade completed')
      }
    }, this.colorUpdateInterval * 2) // Fade duration = 2x color update interval
  }
  
  // Check if circle is colliding during expansion
  private checkCollisionDuringExpansion(circle: CircleData): boolean {
    if (!this.spatialStructure) return false
    
    // Check for collision with any other circle
    for (const other of this.circles) {
      if (other === circle) continue
      
      const dx = circle.x - other.x
      const dy = circle.y - other.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const minDistance = circle.radius + other.radius + (this.circleSpacing * 2) // Larger spacing for collision detection
      
      if (distance < minDistance) {
        return true // Collision detected
      }
    }
    
    return false // No collision
  }
  
  // Sample in a wider area to find best color match direction
  private async findBestColorPosition(circle: CircleData): Promise<{bestPosition?: {x: number, y: number, color: [number, number, number]}}> {
    if (!this.currentInputTexture || !this.imageData) {
      throw new Error('No texture or image data available')
    }
    
    const searchRadius = 20 // Search within 20 pixels for better color matches
    const numDirections = 16 // Sample in 16 directions around the circle
    
    let bestSimilarity = 0
    let bestPosition: {x: number, y: number, color: [number, number, number]} | undefined
    
    // Sample in radial directions around the circle
    for (let i = 0; i < numDirections; i++) {
      const angle = (i / numDirections) * 2 * Math.PI
      const testX = circle.x + Math.cos(angle) * searchRadius
      const testY = circle.y + Math.sin(angle) * searchRadius
      
      // Ensure position is within bounds
      if (testX < 0 || testX >= this.imageData.width || testY < 0 || testY >= this.imageData.height) {
        continue
      }
      
      try {
        const pixelColor = this.samplePixelColor(testX, testY)
        const similarity = this.calculateColorSimilarity(circle.color, pixelColor)
        
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity
          bestPosition = {x: testX, y: testY, color: pixelColor}
        }
      } catch (error) {
        console.warn(`Failed to sample position (${testX.toFixed(1)}, ${testY.toFixed(1)}):`, error)
      }
    }
    
    // Only return a position if it's significantly better than current
    if (bestPosition && bestSimilarity > this.colorSimilarityThreshold) {
      return {bestPosition}
    }
    
    return {}
  }
  
  // Sample a single pixel color from image data
  private samplePixelColor(x: number, y: number): [number, number, number] {
    if (!this.imageData) {
      throw new Error('No image data available')
    }
    
    const clampedX = Math.floor(Math.max(0, Math.min(this.imageData.width - 1, x)))
    const clampedY = Math.floor(Math.max(0, Math.min(this.imageData.height - 1, y)))
    const index = (clampedY * this.imageData.width + clampedX) * 4
    
    return [
      this.imageData.data[index] / 255,     // R
      this.imageData.data[index + 1] / 255, // G
      this.imageData.data[index + 2] / 255  // B
    ]
  }
  
  // Cast a ray from circle in given direction to find collision distance
  private castRayToCollision(circle: CircleData, dirX: number, dirY: number): number {
    const maxDistance = 30 // Reduced maximum ray distance
    const stepSize = 1.0 // Larger step size for efficiency
    
    let currentDistance = 0
    
    // Step along the ray until we hit something or reach max distance
    while (currentDistance < maxDistance) {
      currentDistance += stepSize
      
      const testX = circle.x + dirX * currentDistance
      const testY = circle.y + dirY * currentDistance
      
      // Check screen boundaries with margin
      const margin = circle.radius + 2
      if (testX - margin < 0 || testX + margin >= (this.imageData?.width || 1920) || 
          testY - margin < 0 || testY + margin >= (this.imageData?.height || 1080)) {
        return Math.max(0, currentDistance - stepSize) // Return distance just before boundary
      }
      
      // Check collision with other circles using proper spacing
      for (const other of this.circles) {
        if (other === circle) continue
        
        const dx = testX - other.x
        const dy = testY - other.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const minDistance = circle.radius + other.radius + (this.circleSpacing * 3) // More conservative spacing
        
        if (distance < minDistance) {
          return Math.max(0, currentDistance - stepSize) // Return distance just before collision
        }
      }
    }
    
    return maxDistance // No collision found within max distance
  }
  
  // Blend two colors by a given factor (0 = color1, 1 = color2)
  private blendColors(color1: [number, number, number], color2: [number, number, number], factor: number): [number, number, number] {
    return [
      color1[0] + (color2[0] - color1[0]) * factor,
      color1[1] + (color2[1] - color1[1]) * factor,
      color1[2] + (color2[2] - color1[2]) * factor
    ]
  }
  
  // Update color change detection map
  private updateColorChangeDetection(currentTime: number): void {
    if (!this.imageData || currentTime - this.lastColorChangeUpdate < 100) { // Update every 100ms
      return
    }
    
    this.lastColorChangeUpdate = currentTime
    
    // Initialize color change map if needed
    if (!this.colorChangeMap) {
      this.colorChangeMap = new Float32Array(this.imageData.width * this.imageData.height)
    }
    
    const width = this.imageData.width
    const height = this.imageData.height
    
    // Calculate spatial color gradients (edge detection) for current frame
    this.calculateSpatialColorGradients(width, height)
    
    // If we have previous frame data, also add temporal changes
    if (this.previousImageData && 
        this.previousImageData.width === this.imageData.width && 
        this.previousImageData.height === this.imageData.height) {
      
      // Add temporal changes to spatial gradients
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x
          const pixelIndex = index * 4
          
          // Get current and previous colors
          const currentR = this.imageData.data[pixelIndex] / 255
          const currentG = this.imageData.data[pixelIndex + 1] / 255
          const currentB = this.imageData.data[pixelIndex + 2] / 255
          
          const prevR = this.previousImageData.data[pixelIndex] / 255
          const prevG = this.previousImageData.data[pixelIndex + 1] / 255
          const prevB = this.previousImageData.data[pixelIndex + 2] / 255
          
          // Calculate temporal color change magnitude
          const temporalChange = Math.sqrt(
            Math.pow(currentR - prevR, 2) +
            Math.pow(currentG - prevG, 2) +
            Math.pow(currentB - prevB, 2)
          )
          
          // Combine spatial and temporal changes (weighted average)
          const spatialChange = this.colorChangeMap[index]
          const combinedChange = spatialChange * 0.7 + (temporalChange / Math.sqrt(3)) * 0.3
          
          this.colorChangeMap[index] = Math.min(1.0, combinedChange)
        }
      }
    }
    
    // Store current frame as previous for next comparison
    this.previousImageData = new ImageData(
      new Uint8ClampedArray(this.imageData.data),
      this.imageData.width,
      this.imageData.height
    )
  }
  
  // Calculate spatial color gradients using Sobel edge detection
  private calculateSpatialColorGradients(width: number, height: number): void {
    if (!this.imageData || !this.colorChangeMap) return
    
    // Sobel X and Y kernels for edge detection
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gradientXR = 0, gradientXG = 0, gradientXB = 0
        let gradientYR = 0, gradientYG = 0, gradientYB = 0
        
        // Apply Sobel kernels to 3x3 neighborhood
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4
            const r = this.imageData.data[pixelIndex] / 255
            const g = this.imageData.data[pixelIndex + 1] / 255
            const b = this.imageData.data[pixelIndex + 2] / 255
            
            const kernelX = sobelX[ky + 1][kx + 1]
            const kernelY = sobelY[ky + 1][kx + 1]
            
            gradientXR += r * kernelX
            gradientXG += g * kernelX
            gradientXB += b * kernelX
            
            gradientYR += r * kernelY
            gradientYG += g * kernelY
            gradientYB += b * kernelY
          }
        }
        
        // Calculate gradient magnitude for each channel
        const gradientMagnitudeR = Math.sqrt(gradientXR * gradientXR + gradientYR * gradientYR)
        const gradientMagnitudeG = Math.sqrt(gradientXG * gradientXG + gradientYG * gradientYG)
        const gradientMagnitudeB = Math.sqrt(gradientXB * gradientXB + gradientYB * gradientYB)
        
        // Combine RGB gradients into single intensity
        const overallGradient = (gradientMagnitudeR + gradientMagnitudeG + gradientMagnitudeB) / 3
        
        // Store normalized gradient value (0-1)
        const index = y * width + x
        this.colorChangeMap[index] = Math.min(1.0, overallGradient * 2.0) // Scale up for visibility
      }
    }
    
    // Handle edges (copy from nearest interior pixel)
    for (let x = 0; x < width; x++) {
      this.colorChangeMap[x] = this.colorChangeMap[width + x] // Top edge
      this.colorChangeMap[(height - 1) * width + x] = this.colorChangeMap[(height - 2) * width + x] // Bottom edge
    }
    for (let y = 0; y < height; y++) {
      this.colorChangeMap[y * width] = this.colorChangeMap[y * width + 1] // Left edge
      this.colorChangeMap[y * width + (width - 1)] = this.colorChangeMap[y * width + (width - 2)] // Right edge
    }
  }
  
  // Get color change intensity at a position (0 = no change, 1 = maximum change)
  private getColorChangeIntensity(x: number, y: number): number {
    if (!this.colorChangeMap || !this.imageData) {
      return 0
    }
    
    const clampedX = Math.floor(Math.max(0, Math.min(this.imageData.width - 1, x)))
    const clampedY = Math.floor(Math.max(0, Math.min(this.imageData.height - 1, y)))
    const index = clampedY * this.imageData.width + clampedX
    
    return this.colorChangeMap[index] || 0
  }
  
  // Sample a position weighted by color change intensity (more likely to pick high-change areas)
  private sampleWeightedPosition(width: number, height: number): {x: number, y: number} {
    if (!this.colorChangeMap || !this.imageData) {
      // Fallback to random if no color change data
      return {
        x: Math.random() * width,
        y: Math.random() * height
      }
    }
    
    // Rejection sampling: try random positions and accept based on change intensity
    const maxAttempts = 20
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.random() * width
      const y = Math.random() * height
      const changeIntensity = this.getColorChangeIntensity(x, y)
      
      // Higher change intensity = higher acceptance probability
      // Base acceptance: 0.3, max acceptance: 1.0
      const acceptanceProbability = 0.3 + (changeIntensity * 0.7)
      
      if (Math.random() < acceptanceProbability) {
        return {x, y}
      }
    }
    
    // Fallback to random position if rejection sampling fails
    return {
      x: Math.random() * width,
      y: Math.random() * height
    }
  }
  
  // Resample circle color based on current size and position
  private resampleCircleColor(circle: CircleData): void {
    if (!this.imageData) return
    
    const width = this.imageData.width
    const height = this.imageData.height
    
    // Sample multiple points within the circle area for better color averaging
    const sampleCount = Math.max(4, Math.min(16, Math.floor(circle.radius / 2))) // More samples for larger circles
    let totalR = 0, totalG = 0, totalB = 0
    let validSamples = 0
    
    for (let i = 0; i < sampleCount; i++) {
      // Generate random point within circle
      const angle = Math.random() * Math.PI * 2
      const distance = Math.random() * circle.radius * 0.8 // Stay within 80% of radius for better averaging
      
      const sampleX = circle.x + Math.cos(angle) * distance
      const sampleY = circle.y + Math.sin(angle) * distance
      
      // Clamp to image bounds
      const pixelX = Math.max(0, Math.min(width - 1, Math.floor(sampleX)))
      const pixelY = Math.max(0, Math.min(height - 1, Math.floor(sampleY)))
      const pixelIndex = (pixelY * width + pixelX) * 4
      
      // Accumulate color values
      totalR += this.imageData.data[pixelIndex]
      totalG += this.imageData.data[pixelIndex + 1]
      totalB += this.imageData.data[pixelIndex + 2]
      validSamples++
    }
    
    if (validSamples > 0) {
      // Calculate average color
      let avgR = (totalR / validSamples) / 255
      let avgG = (totalG / validSamples) / 255
      let avgB = (totalB / validSamples) / 255
      
      // Prevent pure black circles
      const brightness = avgR * 0.299 + avgG * 0.587 + avgB * 0.114
      if (brightness < 0.1) {
        const factor = 0.1 / Math.max(brightness, 0.001)
        avgR = Math.min(1.0, avgR * factor + 0.05)
        avgG = Math.min(1.0, avgG * factor + 0.05)
        avgB = Math.min(1.0, avgB * factor + 0.05)
      }
      
      // Smooth transition to new color (blend with existing color)
      const blendFactor = 0.7 // 70% new color, 30% old color for smooth transition
      circle.color = [
        circle.color[0] * (1 - blendFactor) + avgR * blendFactor,
        circle.color[1] * (1 - blendFactor) + avgG * blendFactor,
        circle.color[2] * (1 - blendFactor) + avgB * blendFactor
      ]
    }
  }

  // Sample the average color under a circle area
  private async sampleCircleAreaColor(circle: CircleData, inputTexture: THREE.Texture): Promise<[number, number, number]> {
    // Create a temporary render target to sample the texture
    const tempRT = new THREE.WebGLRenderTarget(1, 1)
    const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const tempScene = new THREE.Scene()
    
    // Create sampling material that averages colors within the circle area
    const samplingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: inputTexture },
        circleCenter: { value: new THREE.Vector2(circle.x, circle.y) },
        circleRadius: { value: circle.radius },
        resolution: { value: new THREE.Vector2(this.imageData?.width || 1920, this.imageData?.height || 1080) }
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
        uniform vec2 circleCenter;
        uniform float circleRadius;
        uniform vec2 resolution;
        varying vec2 vUv;
        
        void main() {
          vec2 coord = vUv * resolution;
          vec2 center = circleCenter;
          float radius = circleRadius;
          
          // Sample multiple points within the circle
          vec3 colorSum = vec3(0.0);
          float sampleCount = 0.0;
          
          for (float x = -radius; x <= radius; x += radius * 0.2) {
            for (float y = -radius; y <= radius; y += radius * 0.2) {
              vec2 samplePos = center + vec2(x, y);
              float dist = length(vec2(x, y));
              
              if (dist <= radius && samplePos.x >= 0.0 && samplePos.x < resolution.x && 
                  samplePos.y >= 0.0 && samplePos.y < resolution.y) {
                vec2 sampleUv = samplePos / resolution;
                colorSum += texture2D(tDiffuse, sampleUv).rgb;
                sampleCount += 1.0;
              }
            }
          }
          
          if (sampleCount > 0.0) {
            gl_FragColor = vec4(colorSum / sampleCount, 1.0);
          } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          }
        }
      `
    })
    
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), samplingMaterial)
    tempScene.add(quad)
    
    // Render and read the pixel
    const renderer = this.getRenderer() // We'll need to add this method
    if (renderer) {
      renderer.setRenderTarget(tempRT)
      renderer.render(tempScene, tempCamera)
      
      // Read the pixel
      const pixel = new Uint8Array(4)
      renderer.readRenderTargetPixels(tempRT, 0, 0, 1, 1, pixel)
      
      renderer.setRenderTarget(null)
      
      // Clean up
      tempRT.dispose()
      samplingMaterial.dispose()
      
      return [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255]
    }
    
    // Fallback to circle's current color
    return [...circle.color]
  }

  // Calculate color similarity between two RGB colors
  private calculateColorSimilarity(color1: [number, number, number], color2: [number, number, number]): number {
    // Use Euclidean distance in RGB space
    const dr = color1[0] - color2[0]
    const dg = color1[1] - color2[1]
    const db = color1[2] - color2[2]
    const distance = Math.sqrt(dr * dr + dg * dg + db * db)
    
    // Convert distance to similarity (0 = no similarity, 1 = identical)
    const maxDistance = Math.sqrt(3) // Maximum possible RGB distance
    return 1.0 - (distance / maxDistance)
  }

  // Get the current renderer
  private getRenderer(): THREE.WebGLRenderer | null {
    return this.currentRenderer
  }

  // Dynamic Circle Spawning System
  // ===============================
  
  // Update dynamic spawning (called every frame when enabled)
  private updateDynamicSpawning(currentTime: number): void {
    if (!this.enableDynamicSpawning || !this.spatialStructure) {
      return
    }
    
    // Convert QuadTree to SpatialHashGrid if needed for dynamic spawning
    if (!(this.spatialStructure instanceof SpatialHashGrid)) {
      console.log('Dynamic spawning: Converting QuadTree to SpatialHashGrid for empty area detection')
      this.convertToSpatialHashGrid()
      return // Wait for next frame after conversion
    }
    
    // Throttle spawn checks based on spawn interval
    if (currentTime - this.lastSpawnCheck < this.spawnInterval) {
      return
    }
    
    this.lastSpawnCheck = currentTime
    console.log('Dynamic spawning: Starting spawn check...')
    
    // Find empty areas in the current spatial structure
    const emptyAreas = this.spatialStructure.findEmptyAreas(this.minEmptyAreaSize)
    
    // Debug grid stats
    const stats = this.spatialStructure.getStats()
    
    if (emptyAreas.length === 0) {
      // Fallback: If grid method fails, try random placement
      console.log(`Dynamic spawning: Grid method found no areas, trying random placement fallback`)
      this.tryRandomSpawning()
      return
    }
    
    console.log(`Dynamic spawning: Found ${emptyAreas.length} empty areas`)
    
    // Process the largest empty areas first
    let spawnedThisCheck = 0
    
    for (const area of emptyAreas.slice(0, 3)) { // Limit to top 3 areas
      if (spawnedThisCheck >= this.maxSpawnsPerCheck) break
      
      // Get optimal spawn points within this area
      const spawnPoints = this.spatialStructure.getSpawnPointsInArea(area, 2)
      
      for (const spawnPoint of spawnPoints) {
        if (spawnedThisCheck >= this.maxSpawnsPerCheck) break
        
        // Create new circle at spawn point
        const newCircle = this.createDynamicCircle(spawnPoint.x, spawnPoint.y, spawnPoint.maxRadius)
        
        if (newCircle) {
          this.circles.push(newCircle)
          this.spatialStructure.insert(newCircle)
          spawnedThisCheck++
          this.totalSpawnedCircles++
          
          console.log(`Spawned circle ${this.totalSpawnedCircles} at (${spawnPoint.x.toFixed(1)}, ${spawnPoint.y.toFixed(1)}) with radius ${spawnPoint.maxRadius.toFixed(1)}`)
        }
      }
    }
    
    if (spawnedThisCheck > 0) {
      // Update circle data in shader to include new circles
      this.updateCircleDataInShader()
      console.log(`Dynamic spawning: Added ${spawnedThisCheck} new circles (total: ${this.circles.length})`)
    }
  }
  
  // Create a new circle for dynamic spawning
  private createDynamicCircle(x: number, y: number, maxRadius: number): CircleData | null {
    if (!this.imageData) {
      console.warn('Dynamic spawning: No imageData available for color sampling')
      return null
    }
    
    // More aggressive sizing for dynamic spawns - they should fill available space
    const constrainedMaxRadius = Math.min(maxRadius, this.maxCircleSize)
    // Use more of available space (30-80% instead of 10-30%)
    const sizeFactor = 0.3 + Math.random() * 0.5 // Random between 30-80%
    const conservativeRadius = Math.max(this.minCircleSize, constrainedMaxRadius * sizeFactor)
    
    // Sample color from the image at this position
    const pixelX = Math.floor(Math.max(0, Math.min(this.imageData.width - 1, x)))
    const pixelY = Math.floor(Math.max(0, Math.min(this.imageData.height - 1, y)))
    const pixelIndex = (pixelY * this.imageData.width + pixelX) * 4
    
    const r = this.imageData.data[pixelIndex] / 255
    const g = this.imageData.data[pixelIndex + 1] / 255
    const b = this.imageData.data[pixelIndex + 2] / 255
    
    // Create circle data with physics properties
    const startRadius = Math.max(this.minCircleSize, 5.0) // Start much more visible
    const circle: CircleData = {
      x,
      y,
      radius: startRadius, // Start much more visible than minimum
      color: [r, g, b],
      // Physics properties for Verlet integration
      prevX: x,
      prevY: y,
      mass: Math.PI * startRadius * startRadius,
      pinned: false,
      // Progressive growth properties - will grow until collision
      targetRadius: conservativeRadius, // Use the calculated target size
      currentRadius: startRadius,
      growthStartTime: performance.now(),
      // Adaptive color monitoring properties
      originalColor: [r, g, b],
      isAdapting: false,
      // Mark as dynamic spawn for special growth behavior
      isDynamicSpawn: true,
      // Protect from color monitoring for 2 seconds to allow initial growth
      spawnProtectionTime: performance.now() + 2000
    }
    
    return circle
  }
  
  // Check if a circle would collide with others at a given radius
  private wouldCollideAtRadius(circle: CircleData, testRadius: number): boolean {
    if (!this.spatialStructure) return false
    
    // Get nearby circles
    const nearby = this.spatialStructure.getNearbyCircles(circle.x, circle.y, testRadius + this.circleSpacing)
    
    // Check collision with each nearby circle
    for (const other of nearby) {
      if (other === circle) continue // Skip self
      
      const dx = circle.x - other.x
      const dy = circle.y - other.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const minDistance = testRadius + other.radius + this.circleSpacing
      
      if (distance < minDistance) {
        return true // Collision detected
      }
    }
    
    // Check boundary collision
    const margin = testRadius
    if (circle.x < margin || 
        circle.x > this.renderTarget.width - margin ||
        circle.y < margin || 
        circle.y > this.renderTarget.height - margin) {
      return true // Boundary collision
    }
    
    return false // No collision
  }
  
  // Convert QuadTree to SpatialHashGrid for dynamic spawning
  private convertToSpatialHashGrid(): void {
    if (!this.spatialStructure || this.spatialStructure instanceof SpatialHashGrid) {
      return
    }
    
    // Calculate average circle radius for optimal grid sizing
    const totalRadius = this.circles.reduce((sum, circle) => sum + circle.radius, 0)
    const averageRadius = this.circles.length > 0 ? totalRadius / this.circles.length : 10
    
    // Get render target dimensions
    const width = this.renderTarget.width
    const height = this.renderTarget.height
    
    // Create new SpatialHashGrid
    this.spatialStructure = new SpatialHashGrid(width, height, averageRadius)
    
    // Re-insert all existing circles
    for (const circle of this.circles) {
      this.spatialStructure.insert(circle)
    }
    
    console.log(`Converted to SpatialHashGrid: ${this.circles.length} circles re-inserted`)
  }
  
  // Fallback spawning when grid method fails
  private tryRandomSpawning(): void {
    if (!this.spatialStructure) return
    
    const width = this.renderTarget.width
    const height = this.renderTarget.height
    let spawnedThisCheck = 0
    const maxAttempts = 50 // Try 50 random positions
    
    for (let attempt = 0; attempt < maxAttempts && spawnedThisCheck < this.maxSpawnsPerCheck; attempt++) {
      // Random position
      const x = Math.random() * width
      const y = Math.random() * height
      const testRadius = this.minCircleSize + Math.random() * (this.maxCircleSize - this.minCircleSize) * 0.3
      
      // Check if this position would collide
      if (!this.wouldCollideAtRadius({ x, y, radius: testRadius } as CircleData, testRadius)) {
        // Create new circle at this position
        const newCircle = this.createDynamicCircle(x, y, testRadius * 2)
        
        if (newCircle) {
          this.circles.push(newCircle)
          this.spatialStructure.insert(newCircle)
          spawnedThisCheck++
          this.totalSpawnedCircles++
          
          console.log(`Random spawn: Added circle at (${x.toFixed(1)}, ${y.toFixed(1)}) with radius ${testRadius.toFixed(1)}`)
        }
      }
    }
    
    if (spawnedThisCheck > 0) {
      // Update circle data in shader to include new circles
      this.updateCircleDataInShader()
      console.log(`Random spawning: Added ${spawnedThisCheck} new circles (total: ${this.circles.length})`)
    } else {
      console.log(`Random spawning: Failed to place any circles after ${maxAttempts} attempts`)
    }
  }

  // Check if dynamic spawning should be enabled
  private shouldEnableDynamicSpawning(): boolean {
    const enabled = this.enableDynamicSpawning && 
           this.circles.length > 0 && 
           this.spatialStructure !== null &&
           this.totalSpawnedCircles < 2000 // Allow up to 2000 spawned circles
    
    if (!enabled && this.enableDynamicSpawning) {
      console.log('Dynamic spawning disabled:', {
        enableDynamicSpawning: this.enableDynamicSpawning,
        circlesLength: this.circles.length,
        spatialStructureType: this.spatialStructure?.constructor.name,
        totalSpawned: this.totalSpawnedCircles,
        spawnLimit: 2000
      })
    }
    
    return enabled
  }
  
  // Find optimal squares within color blocks with collision detection
  private findOptimalSquaresInBlockWithCollision(block: {centerX: number, centerY: number, width: number, height: number, color: [number, number, number], edgeStrength: number}, maxCircleSize: number, quadTree: QuadTree): Array<{centerX: number, centerY: number, size: number}> {
    const squares: Array<{centerX: number, centerY: number, size: number}> = []
    
    // Calculate the bounds of the block
    const minX = block.centerX - block.width / 2
    const maxX = block.centerX + block.width / 2
    const minY = block.centerY - block.height / 2
    const maxY = block.centerY + block.height / 2
    
    // Use intelligent placement with collision detection
    const maxAttempts = Math.max(1, Math.floor(block.width * block.height / (maxCircleSize * maxCircleSize / 4)))
    
    for (let attempt = 0; attempt < maxAttempts && squares.length < 3; attempt++) {
      // Strategic placement: center first, then random within bounds
      let x, y
      if (attempt === 0) {
        // First attempt: place at block center
        x = block.centerX
        y = block.centerY
      } else {
        // Subsequent attempts: random placement within block
        x = minX + Math.random() * (maxX - minX)
        y = minY + Math.random() * (maxY - minY)
      }
      
      // Calculate max radius with collision detection
      const maxRadiusFromBounds = Math.min(
        Math.abs(x - minX),
        Math.abs(maxX - x),
        Math.abs(y - minY),
        Math.abs(maxY - y)
      ) * 0.9 // Safety margin
      
      const maxRadiusFromCollision = this.getMaxRadiusWithQuadTree(x, y, quadTree, maxX - minX, maxY - minY, this.circleSpacing)
      
      const finalRadius = Math.min(maxRadiusFromBounds, maxRadiusFromCollision, maxCircleSize * 0.8)
      
      if (finalRadius >= this.minCircleSize) {
        squares.push({
          centerX: x,
          centerY: y,
          size: finalRadius * 2
        })
      }
    }
    
    return squares
  }

  // Legacy method for compatibility - simplified approach  
  // @ts-ignore - Legacy method kept for potential fallback
  private findOptimalSquaresInBlock(block: {centerX: number, centerY: number, width: number, height: number, color: [number, number, number]}, maxCircleSize: number): Array<{centerX: number, centerY: number, size: number}> {
    const squares: Array<{centerX: number, centerY: number, size: number}> = []
    
    // Calculate the bounds of the block
    const minX = block.centerX - block.width / 2
    const maxX = block.centerX + block.width / 2
    const minY = block.centerY - block.height / 2
    const maxY = block.centerY + block.height / 2
    
    // Determine how many circles we can fit based on block size
    const blockArea = block.width * block.height
    const maxCircleArea = Math.PI * (maxCircleSize) ** 2
    const estimatedCircles = Math.max(1, Math.floor(blockArea / (maxCircleArea * 2))) // Conservative estimate
    
    // Use random placement within the block instead of rigid grid
    const maxAttempts = estimatedCircles * 10
    const placedSquares: Array<{x: number, y: number, size: number}> = []
    
    for (let attempt = 0; attempt < maxAttempts && placedSquares.length < estimatedCircles; attempt++) {
      // Random position within block bounds
      const x = minX + Math.random() * (maxX - minX)
      const y = minY + Math.random() * (maxY - minY)
      
      // Calculate largest circle that fits at this position
      const distToEdge = Math.min(
        x - minX,
        maxX - x,
        y - minY,
        maxY - y
      )
      
      // Distance to existing circles
      let maxRadiusFromOthers = Infinity
      for (const existing of placedSquares) {
        const distance = Math.sqrt((x - existing.x) ** 2 + (y - existing.y) ** 2)
        const requiredRadius = existing.size / 2 + this.circleSpacing * 5 // Use spacing parameter
        maxRadiusFromOthers = Math.min(maxRadiusFromOthers, distance - requiredRadius)
      }
      
      const maxPossibleRadius = Math.min(distToEdge, maxRadiusFromOthers, maxCircleSize)
      
      // Only place if it's reasonably sized
      if (maxPossibleRadius >= this.minCircleSize) {
        const size = maxPossibleRadius * 2 // diameter
        placedSquares.push({x, y, size})
        squares.push({
          centerX: x,
          centerY: y,
          size: size
        })
      }
    }
    
    // If no squares fit, at least place one circle at the block center
    if (squares.length === 0) {
      const centerRadius = Math.min(
        block.width / 2,
        block.height / 2,
        maxCircleSize
      ) * 0.8 // Conservative sizing
      
      if (centerRadius >= this.minCircleSize) {
        squares.push({
          centerX: block.centerX,
          centerY: block.centerY,
          size: centerRadius * 2
        })
      }
    }
    
    return squares
  }
  
  // Pixelate image to create larger uniform blocks
  private pixelateImage(imageData: ImageData, width: number, height: number, pixelSize: number): ImageData {
    const pixelatedData = new ImageData(width, height)
    
    for (let y = 0; y < height; y += pixelSize) {
      for (let x = 0; x < width; x += pixelSize) {
        // Sample color from center of pixel block
        const centerX = Math.min(x + Math.floor(pixelSize / 2), width - 1)
        const centerY = Math.min(y + Math.floor(pixelSize / 2), height - 1)
        const centerIndex = (centerY * width + centerX) * 4
        
        const blockColor = [
          imageData.data[centerIndex],
          imageData.data[centerIndex + 1],
          imageData.data[centerIndex + 2],
          imageData.data[centerIndex + 3]
        ]
        
        // Fill entire pixel block with this color
        for (let py = y; py < Math.min(y + pixelSize, height); py++) {
          for (let px = x; px < Math.min(x + pixelSize, width); px++) {
            const index = (py * width + px) * 4
            pixelatedData.data[index] = blockColor[0]
            pixelatedData.data[index + 1] = blockColor[1]
            pixelatedData.data[index + 2] = blockColor[2]
            pixelatedData.data[index + 3] = blockColor[3]
          }
        }
      }
    }
    
    return pixelatedData
  }
  
  // Enhanced edge detection using Sobel operator
  private calculateEdgeStrength(imageData: ImageData, x: number, y: number, width: number, height: number): number {
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) return 0
    
    // Sobel X kernel: [-1, 0, 1; -2, 0, 2; -1, 0, 1]
    // Sobel Y kernel: [-1, -2, -1; 0, 0, 0; 1, 2, 1]
    
    const getGrayscale = (px: number, py: number) => {
      const idx = (py * width + px) * 4
      return (imageData.data[idx] * 0.299 + imageData.data[idx + 1] * 0.587 + imageData.data[idx + 2] * 0.114) / 255
    }
    
    const gx = 
      -1 * getGrayscale(x - 1, y - 1) + 1 * getGrayscale(x + 1, y - 1) +
      -2 * getGrayscale(x - 1, y) + 2 * getGrayscale(x + 1, y) +
      -1 * getGrayscale(x - 1, y + 1) + 1 * getGrayscale(x + 1, y + 1)
    
    const gy = 
      -1 * getGrayscale(x - 1, y - 1) + -2 * getGrayscale(x, y - 1) + -1 * getGrayscale(x + 1, y - 1) +
      1 * getGrayscale(x - 1, y + 1) + 2 * getGrayscale(x, y + 1) + 1 * getGrayscale(x + 1, y + 1)
    
    return Math.sqrt(gx * gx + gy * gy)
  }

  // Find uniform color blocks with edge awareness
  private findUniformColorBlocks(posterizedData: ImageData, width: number, height: number, pixelSize: number): Array<{centerX: number, centerY: number, width: number, height: number, color: [number, number, number], edgeStrength: number}> {
    const blocks: Array<{centerX: number, centerY: number, width: number, height: number, color: [number, number, number], edgeStrength: number}> = []
    const visited = new Set<string>()
    
    for (let y = 0; y < height; y += pixelSize) {
      for (let x = 0; x < width; x += pixelSize) {
        const key = `${x},${y}`
        if (visited.has(key)) continue
        
        const pixelIndex = (y * width + x) * 4
        const color: [number, number, number] = [
          posterizedData.data[pixelIndex],
          posterizedData.data[pixelIndex + 1], 
          posterizedData.data[pixelIndex + 2]
        ]
        
        // Flood fill to find the size of this uniform color block
        const blockInfo = this.floodFillColorBlock(posterizedData, width, height, x, y, color, pixelSize, visited)
        
        if (blockInfo) {
          // Calculate average edge strength for this block
          const edgeStrength = this.calculateEdgeStrength(posterizedData, blockInfo.centerX, blockInfo.centerY, width, height)
          blocks.push({
            ...blockInfo,
            edgeStrength
          })
        }
      }
    }
    
    // Sort by area (largest first) to prioritize large circles
    return blocks.sort((a, b) => (b.width * b.height) - (a.width * a.height))
  }
  
  // Flood fill to measure uniform color block size
  private floodFillColorBlock(
    data: ImageData, 
    width: number, 
    height: number, 
    startX: number, 
    startY: number, 
    targetColor: [number, number, number],
    pixelSize: number,
    visited: Set<string>
  ): {centerX: number, centerY: number, width: number, height: number, color: [number, number, number]} | null {
    
    const queue: Array<{x: number, y: number}> = [{x: startX, y: startY}]
    const blockPixels: Array<{x: number, y: number}> = []
    let minX = startX, maxX = startX, minY = startY, maxY = startY
    
    while (queue.length > 0) {
      const {x, y} = queue.shift()!
      const key = `${x},${y}`
      
      if (visited.has(key) || x < 0 || x >= width || y < 0 || y >= height) continue
      
      const pixelIndex = (y * width + x) * 4
      const pixelColor: [number, number, number] = [
        data.data[pixelIndex],
        data.data[pixelIndex + 1],
        data.data[pixelIndex + 2]
      ]
      
      // Check if color matches
      if (pixelColor[0] !== targetColor[0] || pixelColor[1] !== targetColor[1] || pixelColor[2] !== targetColor[2]) {
        continue
      }
      
      visited.add(key)
      blockPixels.push({x, y})
      
      // Update bounds
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      
      // Add neighbors (in pixelSize steps)
      queue.push({x: x - pixelSize, y})
      queue.push({x: x + pixelSize, y})
      queue.push({x, y: y - pixelSize})
      queue.push({x, y: y + pixelSize})
    }
    
    // Only return blocks with minimum size
    const blockWidth = maxX - minX + pixelSize
    const blockHeight = maxY - minY + pixelSize
    
    if (blockWidth >= pixelSize * 2 && blockHeight >= pixelSize * 2) {
      return {
        centerX: minX + blockWidth / 2,
        centerY: minY + blockHeight / 2,
        width: blockWidth,
        height: blockHeight,
        color: [targetColor[0] / 255, targetColor[1] / 255, targetColor[2] / 255]
      }
    }
    
    return null
  }
  
  // Enhanced radius calculation with proper collision detection
  // @ts-ignore - Legacy method kept for potential fallback
  private getMaxRadius(x: number, y: number, existingCircles: CircleData[], width: number, height: number, spacing: number): number {
    // Distance to edges with safety margin
    const edgeDistance = Math.min(x, y, width - x, height - y) * 0.95
    
    // Distance to existing circles with proper spacing calculation
    let minDistanceToCircles = Infinity
    for (const circle of existingCircles) {
      const distance = Math.sqrt((x - circle.x) ** 2 + (y - circle.y) ** 2)
      // New circle radius + existing circle radius + spacing must be <= distance
      // So: newRadius <= distance - existingRadius - spacing
      const maxRadiusFromThisCircle = distance - circle.radius - spacing
      minDistanceToCircles = Math.min(minDistanceToCircles, maxRadiusFromThisCircle)
    }
    
    // If no existing circles, use edge distance
    if (minDistanceToCircles === Infinity) {
      return Math.max(0, edgeDistance)
    }
    
    // Take the minimum of edge constraint and circle constraints, with safety factor
    const maxRadius = Math.min(edgeDistance, minDistanceToCircles) * 0.8 // 20% safety margin
    return Math.max(0, maxRadius)
  }

  // Fast radius calculation using QuadTree (O(log n) instead of O(n))
  private getMaxRadiusWithQuadTree(x: number, y: number, quadTree: QuadTree, width: number, height: number, spacing: number): number {
    // Distance to edges with safety margin
    const edgeDistance = Math.min(x, y, width - x, height - y) * 0.95
    
    // Get only nearby circles using QuadTree - much more efficient
    const estimatedRadius = Math.min(edgeDistance, this.maxCircleSize)
    const nearbyCircles = quadTree.getNearbyCircles(x, y, estimatedRadius)
    
    // Distance to nearby circles with proper spacing calculation
    let minDistanceToCircles = Infinity
    for (const circle of nearbyCircles) {
      const distance = Math.sqrt((x - circle.x) ** 2 + (y - circle.y) ** 2)
      // New circle radius + existing circle radius + spacing must be <= distance
      // So: newRadius <= distance - existingRadius - spacing
      const maxRadiusFromThisCircle = distance - circle.radius - spacing
      minDistanceToCircles = Math.min(minDistanceToCircles, maxRadiusFromThisCircle)
    }
    
    // If no nearby circles, use edge distance
    if (minDistanceToCircles === Infinity) {
      return Math.max(0, edgeDistance)
    }
    
    // Take the minimum of edge constraint and circle constraints, with safety factor
    const maxRadius = Math.min(edgeDistance, minDistanceToCircles) * 0.8 // 20% safety margin
    return Math.max(0, maxRadius)
  }
  
  private posterizeImageData(imageData: ImageData): ImageData {
    const posterizedData = new ImageData(imageData.width, imageData.height)
    const levels = this.posterizeLevels
    
    for (let i = 0; i < imageData.data.length; i += 4) {
      // Posterize RGB channels
      posterizedData.data[i] = Math.floor(imageData.data[i] / 255 * levels) / levels * 255     // R
      posterizedData.data[i + 1] = Math.floor(imageData.data[i + 1] / 255 * levels) / levels * 255 // G
      posterizedData.data[i + 2] = Math.floor(imageData.data[i + 2] / 255 * levels) / levels * 255 // B
      posterizedData.data[i + 3] = imageData.data[i + 3] // Alpha
      
      // Prevent pure black
      const brightness = (posterizedData.data[i] * 0.299 + posterizedData.data[i + 1] * 0.587 + posterizedData.data[i + 2] * 0.114) / 255
      if (brightness < 0.05) {
        posterizedData.data[i] = Math.max(posterizedData.data[i], 25)
        posterizedData.data[i + 1] = Math.max(posterizedData.data[i + 1], 25)
        posterizedData.data[i + 2] = Math.max(posterizedData.data[i + 2], 25)
      }
    }
    
    return posterizedData
  }
  
  // @ts-ignore - Legacy method kept for fallback
  private findUniformRegions(posterizedData: Uint8ClampedArray, originalData: ImageData, width: number, height: number): Array<{points: Array<{x: number, y: number}>, avgX: number, avgY: number, area: number}> {
    void originalData; // Suppress unused warning
    const regionMap = new Map<string, Array<{x: number, y: number}>>()
    
    // Group pixels by posterized color (for placement analysis only)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const r = posterizedData[i]
        const g = posterizedData[i + 1] 
        const b = posterizedData[i + 2]
        const colorKey = `${r},${g},${b}`
        
        if (!regionMap.has(colorKey)) {
          regionMap.set(colorKey, [])
        }
        
        regionMap.get(colorKey)!.push({x, y})
      }
    }
    
    // Convert to regions with centroids and areas (no color stored - we'll sample original later)
    const regions = Array.from(regionMap.values()).map(points => {
      const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length
      const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length
      const area = points.length
      
      return {
        points,
        avgX,
        avgY,
        area
      }
    })
    
    // Sort by area (largest first) for better packing
    return regions.sort((a, b) => b.area - a.area)
  }
  
  // @ts-ignore - Legacy method kept for fallback  
  private packCirclesInRegion(region: {points: Array<{x: number, y: number}>, avgX: number, avgY: number, area: number}, originalImageData: ImageData, width: number, height: number): CircleData[] {
    const circles: CircleData[] = []
    
    // Screen-aware circle generation for better packing
    const screenArea = width * height
    const baseArea = 1920 * 1080 // Reference resolution (Full HD)
    const areaRatio = screenArea / baseArea
    const maxCircles = Math.min(Math.floor(this.packingDensity * Math.sqrt(region.area) / 10 * areaRatio), 200) // Screen-aware with area ratio
    
    // Larger base radius for better screen filling
    const baseRadius = Math.sqrt(region.area / Math.PI) * 0.8 // Increased from 0.3 to 0.8
    const radiusRange: [number, number] = [
      Math.max(this.minCircleSize, baseRadius * 0.1), // Reduced min multiplier for more size variety
      Math.min(this.maxCircleSize, baseRadius * 3.0)  // Increased max multiplier
    ]
    
    // More attempts for better packing
    for (let attempt = 0; attempt < maxCircles; attempt++) {
      const candidate = this.findBestCirclePosition(region, circles, radiusRange, originalImageData, width, height)
      if (candidate) {
        circles.push(candidate)
      }
      
      // If we haven't found a circle in a while, try smaller sizes
      if (attempt > 0 && attempt % 20 === 0 && circles.length < attempt / 4) {
        radiusRange[0] = Math.max(this.minCircleSize, radiusRange[0] * 0.8) // Reduce min size
        radiusRange[1] = Math.max(radiusRange[0] * 1.5, radiusRange[1] * 0.9) // Slightly reduce max size
      }
    }
    
    return circles
  }
  
  private findBestCirclePosition(region: {points: Array<{x: number, y: number}>, avgX: number, avgY: number, area: number}, existingCircles: CircleData[], radiusRange: [number, number], originalImageData: ImageData, width: number, height: number): CircleData | null {
    const maxAttempts = 200 // Increased attempts for better packing
    let bestCandidate: CircleData | null = null
    let bestScore = -1
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let x: number, y: number
      
      if (attempt < 50) {
        // First 50 attempts: try region centroid area for large circles
        const spread = Math.sqrt(region.area) * 0.3
        x = region.avgX + (Math.random() - 0.5) * spread
        y = region.avgY + (Math.random() - 0.5) * spread
      } else {
        // Remaining attempts: random positions in region for gap filling
        const randomPoint = region.points[Math.floor(Math.random() * region.points.length)]
        x = randomPoint.x + (Math.random() - 0.5) * 40 // Larger random offset
        y = randomPoint.y + (Math.random() - 0.5) * 40
      }
      
      // Clamp to image bounds with smaller margin
      const margin = Math.min(radiusRange[1], 10)
      const clampedX = Math.max(margin, Math.min(width - margin, x))
      const clampedY = Math.max(margin, Math.min(height - margin, y))
      
      // Calculate maximum possible radius without collision
      let maxRadius = this.getMaxRadiusWithoutCollision(clampedX, clampedY, existingCircles, width, height)
      maxRadius = Math.min(maxRadius, radiusRange[1])
      
      if (maxRadius < radiusRange[0]) continue // Too small
      
      // Double-check: validate this circle won't overlap with existing ones
      const wouldOverlap = existingCircles.some(circle => {
        const distance = Math.sqrt((clampedX - circle.x) ** 2 + (clampedY - circle.y) ** 2)
        const fixedSpacing = this.circleSpacing * 5.0 // Same user-controllable spacing
        const minRequiredDistance = maxRadius + circle.radius + fixedSpacing
        return distance < minRequiredDistance
      })
      
      if (wouldOverlap) continue // Skip this position
      
      // Sample ORIGINAL color at this position (with bounds checking)
      const pixelX = Math.max(0, Math.min(width - 1, Math.floor(clampedX)))
      const pixelY = Math.max(0, Math.min(height - 1, Math.floor(clampedY)))
      const pixelIndex = (pixelY * width + pixelX) * 4
      
      const originalColor: [number, number, number] = [
        originalImageData.data[pixelIndex] / 255,
        originalImageData.data[pixelIndex + 1] / 255,
        originalImageData.data[pixelIndex + 2] / 255
      ]
      
      // Score based on radius (prefer larger circles)
      const score = maxRadius
      
      if (score > bestScore) {
        bestScore = score
        bestCandidate = {
          x: clampedX,
          y: clampedY,
          radius: maxRadius,
          color: originalColor  // Use original color, not posterized
        }
      }
    }
    
    return bestCandidate
  }
  
  private getMaxRadiusWithoutCollision(x: number, y: number, existingCircles: CircleData[], width: number, height: number): number {
    // Distance to image edges
    const edgeDistance = Math.min(x, y, width - x, height - y)
    
    // Distance to existing circles - use simple fixed spacing approach
    let minDistanceToCircles = Infinity
    for (const circle of existingCircles) {
      const distance = Math.sqrt((x - circle.x) ** 2 + (y - circle.y) ** 2)
      // Simple approach: distance between centers = radius1 + radius2 + fixed_spacing
      // So: new_radius <= distance - existing_radius - fixed_spacing
      const fixedSpacing = this.circleSpacing * 5.0 // User-controllable spacing (1.2 * 5 = 6 pixels default)
      const maxRadiusForThisCircle = distance - circle.radius - fixedSpacing
      minDistanceToCircles = Math.min(minDistanceToCircles, maxRadiusForThisCircle)
    }
    
    // If no existing circles, use edge distance
    if (minDistanceToCircles === Infinity) {
      minDistanceToCircles = edgeDistance
    }
    
    return Math.max(0, Math.min(edgeDistance, minDistanceToCircles))
  }

  private async getImageDataFromTexture(renderer: THREE.WebGLRenderer, texture: THREE.Texture, width: number, height: number): Promise<ImageData> {
    // Create a temporary render target to read the texture data
    const tempTarget = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Render texture to temp target
    const tempMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: texture } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `
    })
    
    const tempQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tempMaterial)
    const tempScene = new THREE.Scene()
    tempScene.add(tempQuad)
    
    renderer.setRenderTarget(tempTarget)
    renderer.render(tempScene, this.camera)
    
    // Read pixels
    const buffer = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(tempTarget, 0, 0, width, height, buffer)
    
    // Clean up
    tempTarget.dispose()
    tempMaterial.dispose()
    tempQuad.geometry.dispose()
    
    return new ImageData(new Uint8ClampedArray(buffer), width, height)
  }

  private checkParameterChanges(): boolean {
    const currentParams = {
      packingDensity: this.packingDensity,
      minCircleSize: this.minCircleSize,
      maxCircleSize: this.maxCircleSize,
      circleSpacing: this.circleSpacing,
      randomSeed: this.randomSeed,
      useVerletPhysics: this.useVerletPhysics,
      gravity: this.gravity,
      damping: this.damping,
      substeps: this.substeps,
      physicsIterations: this.physicsIterations,
      usePhysicsPlacement: this.usePhysicsPlacement,
      animatePhysics: this.animatePhysics,
      animationSpeed: this.animationSpeed
    }
    
    const changed = Object.keys(currentParams).some(key => 
      currentParams[key as keyof typeof currentParams] !== this.lastParameters[key as keyof typeof this.lastParameters]
    )
    
    if (changed) {
      this.lastParameters = { ...currentParams }
      return true
    }
    
    return false
  }

  private getGlobalBackgroundColor(renderer: THREE.WebGLRenderer): [number, number, number] {
    // Use the user-selected background color if available
    if (this.backgroundColorR !== undefined && this.backgroundColorG !== undefined && this.backgroundColorB !== undefined) {
      return [this.backgroundColorR, this.backgroundColorG, this.backgroundColorB]
    }
    
    // Fallback: Try to get the global scene background color
    const domElement = renderer.domElement
    const canvas = domElement
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl')
    void context; // Context available for future use
    
    // Try to get background color from the renderer or scene
    // Fall back to a default if we can't access it
    try {
      // Check if we can access the current clear color
      const clearColor = new THREE.Color()
      renderer.getClearColor(clearColor)
      return [clearColor.r, clearColor.g, clearColor.b]
    } catch (e) {
      // Fallback to a dark gray if we can't get the actual background
      return [0.08, 0.08, 0.08] // Equivalent to 0x151515
    }
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null, deltaTime: number = 16) {
    // Store renderer reference for color monitoring
    this.currentRenderer = renderer
    if (!this.enabled) {
      // If disabled, just copy input to output
      if (outputTarget) {
        renderer.setRenderTarget(outputTarget || null)
        renderer.clear()
        // Simple blit operation - copy input to output
        const copyMaterial = new THREE.ShaderMaterial({
          uniforms: { tDiffuse: { value: inputTexture } },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            varying vec2 vUv;
            void main() {
              gl_FragColor = texture2D(tDiffuse, vUv);
            }
          `
        })
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial)
        const copyScene = new THREE.Scene()
        copyScene.add(quad)
        renderer.render(copyScene, this.camera)
        copyMaterial.dispose()
        quad.geometry.dispose()
      }
      return
    }
    
    // Update adaptive color monitoring (independent of physics)
    if (this.enableColorMonitoring && this.circles.length > 0) {
      // Refresh imageData more frequently to handle camera movement
      const targetWidth = this.renderTarget.width
      const targetHeight = this.renderTarget.height
      
      // Update imageData every few frames to keep it current with camera movement
      const shouldRefreshImageData = !this.imageData || Math.random() < 0.1 // 10% chance per frame
      
      if (shouldRefreshImageData) {
        this.getImageDataFromTexture(renderer, inputTexture, targetWidth, targetHeight)
          .then(imageData => {
            this.imageData = imageData
            this.updateColorMonitoring(inputTexture, deltaTime)
          })
          .catch(console.error)
      } else {
        this.updateColorMonitoring(inputTexture, deltaTime)
      }
    }
    
    // Handle real-time physics animation
    if (this.animatePhysics && this.usePhysicsPlacement) {
      const targetWidth = this.renderTarget.width
      const targetHeight = this.renderTarget.height
      
      // Start animation if not already running and we need to recompute
      if (!this.isAnimating && this.needsRecompute) {
        this.getImageDataFromTexture(renderer, inputTexture, targetWidth, targetHeight)
          .then(imageData => {
            // Store imageData for color monitoring coordinate mapping
            this.imageData = imageData
            this.startPhysicsAnimation(imageData, imageData.width, imageData.height)
            this.needsRecompute = false
          })
          .catch(console.error)
      }
      
      // Start or update physics animation when enabled
      if (this.animatePhysics && this.useVerletPhysics && this.circles.length > 0) {
        // Start animation if not already running
        if (!this.isAnimating) {
          this.isAnimating = true
          this.animationStartTime = performance.now()
          console.log(`Continuous physics animation started with ${this.circles.length} circles`)
        }
        this.updatePhysicsAnimation(deltaTime, targetWidth, targetHeight)
      } else if (this.isAnimating && !this.animatePhysics) {
        // Stop animation if animatePhysics was disabled
        this.isAnimating = false
        console.log('Physics animation stopped - animatePhysics disabled')
      }
      
      // Update progressive growth if enabled
      if (this.enableProgressiveGrowth) {
        this.updateProgressiveGrowth(deltaTime)
      }
      
      // Update dynamic spawning if enabled
      // Dynamic spawning disabled - no longer calling updateDynamicSpawning
    }
    
    // Check if parameters changed and trigger recompute
    const parametersChanged = this.checkParameterChanges()
    if (parametersChanged) {
      this.needsRecompute = true
    }
    
    // Recompute circles if needed (async but cache results)
    if (this.needsRecompute && !this.isGenerating) {
      // Reset effect start time for new relaxation delay period
      this.effectStartTime = 0
      
      // Use current render target size for ImageData to ensure full screen coverage
      const targetWidth = this.renderTarget.width
      const targetHeight = this.renderTarget.height
      
      this.getImageDataFromTexture(renderer, inputTexture, targetWidth, targetHeight)
        .then(imageData => {
          // Store imageData for color monitoring coordinate mapping
          this.imageData = imageData
          // CRITICAL: Update resolution uniform to match ImageData dimensions for correct coordinate mapping
          this.material.uniforms.resolution.value.set(imageData.width, imageData.height)
          
          if (this.useWebWorker && this.worker) {
            // Use WebWorker for parallel processing
            this.generateCirclesWithWorker(imageData)
          } else {
            // Fallback to main thread
            this.circles = this.generateCirclePacking(imageData, imageData.width, imageData.height)
            this.needsRecompute = false
            
            // Set effect start time for relaxation delay
            this.effectStartTime = performance.now()
            
            // Initialize progressive growth for all circles
            this.initializeProgressiveGrowth()
            
            this.updateCircleDataInShader()
          }
        })
        .catch(console.error)
    }
    
    // Get current global background color
    const globalBgColor = this.getGlobalBackgroundColor(renderer)
    
    // Update color change map texture if available
    if (this.colorChangeMap && this.imageData) {
      // Create or update texture from color change map data
      if (!this.colorChangeTexture || 
          this.colorChangeTexture.image.width !== this.imageData.width ||
          this.colorChangeTexture.image.height !== this.imageData.height) {
        // Dispose old texture if it exists
        if (this.colorChangeTexture) {
          this.colorChangeTexture.dispose()
        }
        
        // Create new texture with correct dimensions
        this.colorChangeTexture = new THREE.DataTexture(
          this.colorChangeMap,
          this.imageData.width,
          this.imageData.height,
          THREE.RedFormat,
          THREE.FloatType
        )
        this.material.uniforms.colorChangeMap.value = this.colorChangeTexture
        
        // Debug logging
        console.log(`Color change texture created: ${this.imageData.width}×${this.imageData.height}, showToggle=${this.showColorChangeMap}, spatial gradients enabled`)
      } else {
        // Update existing texture data
        this.colorChangeTexture.image.data = this.colorChangeMap
      }
      
      this.colorChangeTexture.needsUpdate = true
      
      // Debug the toggle state occasionally
      if (Math.random() < 0.02) {
        const avgIntensity = this.colorChangeMap.reduce((sum, val) => sum + val, 0) / this.colorChangeMap.length
        console.log(`Color change map: toggle=${this.showColorChangeMap}, texture=${!!this.colorChangeTexture}, uniform=${this.material.uniforms.showColorChangeMap.value}, avgIntensity=${avgIntensity.toFixed(3)}`)
      }
    }
    
    // Update uniforms
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.blackBackground.value = this.blackBackground
    this.material.uniforms.globalBackgroundR.value = globalBgColor[0]
    this.material.uniforms.globalBackgroundG.value = globalBgColor[1]
    this.material.uniforms.globalBackgroundB.value = globalBgColor[2]
    this.material.uniforms.showColorChangeMap.value = this.showColorChangeMap ? 1.0 : 0.0
    
    // Render the effect
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  private updateCircleDataInShader(): void {
    if (!this.circleDataTexture) return
    
    const maxCircles = 300 // Increased from 200 to handle more circles
    const textureData = new Float32Array(maxCircles * 2 * 4) // 300 circles * 2 rows * 4 channels
    
    // Debug: Track radius values being sent to shader
    let radiusSum = 0
    let minRadius = Infinity
    let maxRadius = 0
    
    for (let i = 0; i < Math.min(this.circles.length, maxCircles); i++) {
      const circle = this.circles[i]
      
      // Row 0: position + radius + unused
      const posOffset = i * 4
      textureData[posOffset] = circle.x
      textureData[posOffset + 1] = circle.y
      textureData[posOffset + 2] = circle.radius
      textureData[posOffset + 3] = 0 // unused
      
      // Row 1: color + unused  
      const colorOffset = (maxCircles + i) * 4
      textureData[colorOffset] = circle.color[0]
      textureData[colorOffset + 1] = circle.color[1]
      textureData[colorOffset + 2] = circle.color[2]
      textureData[colorOffset + 3] = 0 // unused
      
      // Track radius stats
      radiusSum += circle.radius
      minRadius = Math.min(minRadius, circle.radius)
      maxRadius = Math.max(maxRadius, circle.radius)
    }
    
    this.circleDataTexture.image.data = textureData
    this.circleDataTexture.needsUpdate = true
    this.material.uniforms.numCircles.value = Math.min(this.circles.length, maxCircles)
    
    // Debug spawned circles (temporary)
    if (Math.random() < 0.1) {
      const spawnedCount = this.circles.filter(c => c.isDynamicSpawn).length
      const visibleSpawned = this.circles.filter(c => c.isDynamicSpawn && c.radius > 2).length
      const processedCount = Math.min(this.circles.length, maxCircles)
      const spawnedInRange = this.circles.slice(0, processedCount).filter(c => c.isDynamicSpawn).length
      console.log(`Shader: ${this.circles.length} total, ${processedCount} sent to GPU, ${spawnedCount} spawned total, ${spawnedInRange} spawned in GPU range`)
      
      // Debug a few spawned circles' data
      const recentSpawned = this.circles.filter(c => c.isDynamicSpawn).slice(-3)
      for (const circle of recentSpawned) {
        const index = this.circles.indexOf(circle)
        console.log(`Spawned circle ${index}: pos(${circle.x.toFixed(1)}, ${circle.y.toFixed(1)}), radius=${circle.radius.toFixed(1)}, color=[${circle.color.map(c => c.toFixed(2)).join(',')}]`)
      }
    }
  }
  
  setSize(width: number, height: number) {
    this.renderTarget.setSize(width, height)
    // Trigger recompute to use new screen dimensions
    this.needsRecompute = true
    // NOTE: Resolution uniform is updated in render method when ImageData is processed
  }
  
  dispose() {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    if (this.circleDataTexture) {
      this.circleDataTexture.dispose()
    }
    if (this.colorChangeTexture) {
      this.colorChangeTexture.dispose()
    }
    
    // Clean up WebWorker
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
  
  private getVertexShader(): string {
    return `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
  }
  
  private getFragmentShader(): string {
    return `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform float intensity;
      uniform float blackBackground;
      uniform float globalBackgroundR;
      uniform float globalBackgroundG;
      uniform float globalBackgroundB;
      uniform sampler2D circleDataTexture;
      uniform int numCircles;
      uniform sampler2D colorChangeMap;
      uniform float showColorChangeMap;
      
      varying vec2 vUv;
      
      // Sample circle data from texture
      vec4 getCircleData(int index, int component) {
        float u = (float(index) + 0.5) / 300.0; // Circle index
        float v = (float(component) + 0.5) / 2.0; // Component (0 = position+radius, 1 = color)
        return texture2D(circleDataTexture, vec2(u, v));
      }
      
      void main() {
        vec2 pixelCoord = vUv * resolution;
        
        // Sample original color
        vec4 originalColor = texture2D(tDiffuse, vUv);
        
        // Show color change gradient if enabled
        if (showColorChangeMap > 0.5) {
          vec4 changeMapSample = texture2D(colorChangeMap, vUv);
          float changeIntensity = changeMapSample.r;
          
          // Display as grayscale: white = high change, black = low change
          // Add slight blue tint to distinguish from pure grayscale
          gl_FragColor = vec4(changeIntensity, changeIntensity, changeIntensity + 0.1, 1.0);
          return;
        }
        
        // Find the top-most circle at this pixel
        vec3 circleColor = vec3(0.0);
        bool insideCircle = false;
        
        // Check all pre-computed circles
        for (int i = 0; i < 300; i++) {
          if (i >= numCircles) break;
          
          // Sample circle data from texture
          vec4 positionData = getCircleData(i, 0); // x, y, radius, unused
          vec4 colorData = getCircleData(i, 1);    // r, g, b, unused
          
          vec2 circlePos = positionData.xy;
          float radius = positionData.z;
          vec3 color = colorData.rgb;
          
          // Check if pixel is inside this circle
          float distance = length(pixelCoord - circlePos);
          if (distance <= radius) {
            // Smooth circle edge
            float circleMask = 1.0 - smoothstep(radius - 1.0, radius, distance);
            if (circleMask > 0.1) {
              circleColor = color;
              insideCircle = true;
              // Don't break - later circles can overlap (painter's algorithm)
            }
          }
        }
        
        // Blend between base and circles with background opacity
        vec3 finalColor;
        vec3 backgroundColorVec = vec3(globalBackgroundR, globalBackgroundG, globalBackgroundB);
        
        if (insideCircle) {
          // Circle is present - always show circle color
          finalColor = circleColor;
        } else {
          // No circle - blend between original image and selected background color based on opacity
          finalColor = mix(originalColor.rgb, backgroundColorVec, blackBackground);
        }
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  }
}