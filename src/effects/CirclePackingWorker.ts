// Circle Packing Web Worker
// Handles heavy circle generation algorithms in a separate thread

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
}

interface WorkerMessage {
  type: 'generateCircles' | 'result' | 'progress' | 'error'
  data?: any
}

interface GenerateCirclesParams {
  imageData: ImageData
  width: number
  height: number
  packingDensity: number
  minCircleSize: number
  maxCircleSize: number
  circleSpacing: number
  pixelateSize: number
  posterizeLevels: number
  randomSeed: number
  // Physics simulation parameters
  useVerletPhysics: boolean
  gravity: number
  damping: number
  substeps: number
  physicsIterations: number
}

// QuadTree implementation for efficient spatial collision detection
interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

class QuadTree {
  private boundary: Rectangle
  private capacity: number
  private circles: CircleData[]
  private divided: boolean
  
  // Child quadrants
  private northeast?: QuadTree
  private northwest?: QuadTree
  private southeast?: QuadTree
  private southwest?: QuadTree
  
  constructor(boundary: Rectangle, capacity: number = 10) {
    this.boundary = boundary
    this.capacity = capacity
    this.circles = []
    this.divided = false
  }
  
  insert(circle: CircleData): boolean {
    if (!this.intersects(circle, this.boundary)) {
      return false
    }
    
    if (this.circles.length < this.capacity && !this.divided) {
      this.circles.push(circle)
      return true
    }
    
    if (!this.divided) {
      this.subdivide()
    }
    
    // Try to insert into child quadrants
    const inserted = (
      this.northeast!.insert(circle) ||
      this.northwest!.insert(circle) ||
      this.southeast!.insert(circle) ||
      this.southwest!.insert(circle)
    )
    
    // If circle doesn't fit in any child (spans multiple quadrants), keep it in this node
    if (!inserted) {
      this.circles.push(circle)
      return true
    }
    
    return true
  }
  
  query(range: Rectangle): CircleData[] {
    const found: CircleData[] = []
    
    if (!this.rectangleIntersects(range, this.boundary)) {
      return found
    }
    
    for (const circle of this.circles) {
      if (this.circleIntersectsRectangle(circle, range)) {
        found.push(circle)
      }
    }
    
    if (this.divided) {
      found.push(...this.northeast!.query(range))
      found.push(...this.northwest!.query(range))
      found.push(...this.southeast!.query(range))
      found.push(...this.southwest!.query(range))
    }
    
    return found
  }
  
  queryCircle(center: Point, radius: number): CircleData[] {
    const range: Rectangle = {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2
    }
    
    const candidates = this.query(range)
    
    return candidates.filter(circle => {
      const distance = Math.sqrt(
        (circle.x - center.x) ** 2 + (circle.y - center.y) ** 2
      )
      return distance <= (radius + circle.radius)
    })
  }
  
  getNearbyCircles(x: number, y: number, radius: number): CircleData[] {
    // Use more conservative search radius to ensure we find all potential collisions
    const searchRadius = radius * 2.5 // Reduced from 3x to 2.5x for better performance
    return this.queryCircle({ x, y }, searchRadius)
  }
  
  clear(): void {
    this.circles = []
    this.divided = false
    this.northeast = undefined
    this.northwest = undefined
    this.southeast = undefined
    this.southwest = undefined
  }
  
  private subdivide(): void {
    const x = this.boundary.x
    const y = this.boundary.y
    const w = this.boundary.width / 2
    const h = this.boundary.height / 2
    
    this.northeast = new QuadTree({ x: x + w, y: y, width: w, height: h }, this.capacity)
    this.northwest = new QuadTree({ x: x, y: y, width: w, height: h }, this.capacity)
    this.southeast = new QuadTree({ x: x + w, y: y + h, width: w, height: h }, this.capacity)
    this.southwest = new QuadTree({ x: x, y: y + h, width: w, height: h }, this.capacity)
    
    this.divided = true
    
    const circlesToRedistribute = [...this.circles]
    this.circles = []
    
    for (const circle of circlesToRedistribute) {
      if (!(this.northeast!.insert(circle) ||
            this.northwest!.insert(circle) ||
            this.southeast!.insert(circle) ||
            this.southwest!.insert(circle))) {
        this.circles.push(circle)
      }
    }
  }
  
  private intersects(circle: CircleData, rect: Rectangle): boolean {
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width))
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height))
    
    const distanceX = circle.x - closestX
    const distanceY = circle.y - closestY
    const distanceSquared = distanceX * distanceX + distanceY * distanceY
    
    return distanceSquared <= (circle.radius * circle.radius)
  }
  
  private rectangleIntersects(rect1: Rectangle, rect2: Rectangle): boolean {
    return !(rect1.x > rect2.x + rect2.width ||
             rect1.x + rect1.width < rect2.x ||
             rect1.y > rect2.y + rect2.height ||
             rect1.y + rect1.height < rect2.y)
  }
  
  private circleIntersectsRectangle(circle: CircleData, rect: Rectangle): boolean {
    return this.intersects(circle, rect)
  }
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
        
        if (checkX >= 0 && checkX < this.gridWidth && checkY >= 0 && checkY < this.gridHeight) {
          const neighborPoint = this.grid[checkY][checkX]
          if (neighborPoint) {
            const distance = Math.sqrt(
              (point[0] - neighborPoint[0]) ** 2 + (point[1] - neighborPoint[1]) ** 2
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

class CirclePackingWorkerImpl {
  private quadTree!: QuadTree
  
  generateCirclePacking(params: GenerateCirclesParams): CircleData[] {
    const {
      imageData,
      width,
      height,
      packingDensity,
      minCircleSize,
      maxCircleSize,
      circleSpacing,
      pixelateSize,
      posterizeLevels,
      useVerletPhysics,
      gravity,
      damping,
      substeps,
      physicsIterations
    } = params
    
    const circles: CircleData[] = []
    this.quadTree = new QuadTree({ x: 0, y: 0, width, height }, 15) // Optimal capacity for performance
    const spacing = circleSpacing * 2.0
    
    // Send progress update
    this.sendProgress('Starting circle generation...', 0)
    
    try {
      // Phase 1: Generate large circles from uniform color blocks
      this.sendProgress('Generating large circles from color blocks...', 10)
      const largeCircles = this.generateLargeCirclesFromColorBlocks(imageData, width, height, pixelateSize, posterizeLevels)
      
      for (const circle of largeCircles) {
        circles.push(circle)
        this.quadTree.insert(circle)
      }
      
      this.sendProgress(`Generated ${largeCircles.length} large circles`, 30)
      
      // Phase 2: Generate medium circles
      this.sendProgress('Generating medium circles...', 40)
      const mediumCircles = this.generateMediumCircles(imageData, width, height, spacing, maxCircleSize, minCircleSize, packingDensity)
      
      for (const circle of mediumCircles) {
        circles.push(circle)
        this.quadTree.insert(circle)
      }
      
      this.sendProgress(`Generated ${mediumCircles.length} medium circles`, 60)
      
      // Phase 3: Generate small circles using Poisson sampling
      this.sendProgress('Generating small circles...', 70)
      const smallCircles = this.generateSmallCircles(imageData, width, height, spacing, maxCircleSize, minCircleSize, packingDensity)
      
      for (const circle of smallCircles) {
        circles.push(circle)
        this.quadTree.insert(circle)
      }
      
      this.sendProgress(`Generated ${smallCircles.length} small circles`, 85)
      
      // Phase 4: Apply physics simulation
      let relaxedCircles: CircleData[]
      if (useVerletPhysics) {
        this.sendProgress('Applying Verlet physics simulation...', 90)
        relaxedCircles = this.applyVerletPhysicsSimulation(circles, width, height, circleSpacing, gravity, damping, substeps, physicsIterations)
      } else {
        this.sendProgress('Applying force-based relaxation...', 90)
        relaxedCircles = this.applyForceBasedRelaxation(circles, width, height, circleSpacing)
      }
      
      this.sendProgress('Circle generation complete!', 100)
      
      return relaxedCircles
      
    } catch (error) {
      this.sendError(`Error during circle generation: ${error}`)
      return []
    }
  }
  
  private sendProgress(message: string, progress: number): void {
    self.postMessage({
      type: 'progress',
      data: { message, progress }
    })
  }
  
  private sendError(message: string): void {
    self.postMessage({
      type: 'error',
      data: { message }
    })
  }
  
  // Simplified implementations of the circle generation methods
  // (These would be extracted from the main CirclePackingPass)
  
  private generateLargeCirclesFromColorBlocks(imageData: ImageData, width: number, height: number, pixelSize: number, posterizeLevels: number): CircleData[] {
    // Use parameters to avoid TypeScript warnings
    void pixelSize; void posterizeLevels;
    // Simplified implementation - this would contain the actual logic from the main class
    const circles: CircleData[] = []
    
    // Create a few large circles for demonstration
    for (let i = 0; i < Math.min(20, Math.floor(width * height / 10000)); i++) {
      const x = Math.random() * width
      const y = Math.random() * height
      const radius = Math.random() * 30 + 10
      
      const pixelIndex = Math.floor(y) * width + Math.floor(x)
      const r = imageData.data[pixelIndex * 4] / 255
      const g = imageData.data[pixelIndex * 4 + 1] / 255
      const b = imageData.data[pixelIndex * 4 + 2] / 255
      
      circles.push({ x, y, radius, color: [r, g, b] })
    }
    
    return circles
  }
  
  private generateMediumCircles(imageData: ImageData, width: number, height: number, spacing: number, maxCircleSize: number, minCircleSize: number, packingDensity: number): CircleData[] {
    const circles: CircleData[] = []
    const maxCircles = Math.floor(packingDensity * 0.4)
    
    for (let i = 0; i < maxCircles; i++) {
      const x = Math.random() * width
      const y = Math.random() * height
      const radius = Math.random() * (maxCircleSize * 0.5) + minCircleSize
      
      // Optimized collision check using QuadTree
      const nearbyCircles = this.quadTree.getNearbyCircles(x, y, radius + spacing)
      let collision = false
      for (const existing of nearbyCircles) {
        const distance = Math.sqrt((x - existing.x) ** 2 + (y - existing.y) ** 2)
        if (distance < radius + existing.radius + spacing) {
          collision = true
          break
        }
      }
      
      if (!collision) {
        // Double-check with a slightly larger buffer to prevent edge cases
        const finalCheck = nearbyCircles.every(existing => {
          const distance = Math.sqrt((x - existing.x) ** 2 + (y - existing.y) ** 2)
          return distance >= radius + existing.radius + spacing * 1.1
        })
        
        if (finalCheck) {
          const pixelIndex = Math.floor(y) * width + Math.floor(x)
          const r = imageData.data[pixelIndex * 4] / 255
          const g = imageData.data[pixelIndex * 4 + 1] / 255
          const b = imageData.data[pixelIndex * 4 + 2] / 255
          
          circles.push({ x, y, radius, color: [r, g, b] })
        }
      }
    }
    
    return circles
  }
  
  private generateSmallCircles(imageData: ImageData, width: number, height: number, spacing: number, maxCircleSize: number, minCircleSize: number, packingDensity: number): CircleData[] {
    const circles: CircleData[] = []
    
    // Use Poisson disk sampling for small circles
    const densityFactor = Math.max(0.1, (101 - packingDensity) / 100)
    const minDistance = Math.max(minCircleSize * 1.5, spacing * densityFactor * 0.8)
    
    const sampler = new PoissonDiskSampler(width, height, minDistance, 40)
    const candidatePoints = sampler.generatePoints()
    
    const maxSmallCircles = Math.floor(packingDensity * 0.3)
    
    for (let i = 0; i < Math.min(candidatePoints.length, maxSmallCircles); i++) {
      const point = candidatePoints[i]
      const x = point[0]
      const y = point[1]
      const radius = minCircleSize + Math.random() * (maxCircleSize * 0.3 - minCircleSize)
      
      const pixelIndex = Math.floor(y) * width + Math.floor(x)
      const r = imageData.data[pixelIndex * 4] / 255
      const g = imageData.data[pixelIndex * 4 + 1] / 255
      const b = imageData.data[pixelIndex * 4 + 2] / 255
      
      circles.push({ x, y, radius, color: [r, g, b] })
    }
    
    return circles
  }
  
  private applyForceBasedRelaxation(circles: CircleData[], width: number, height: number, circleSpacing: number): CircleData[] {
    const relaxedCircles = circles.map(circle => ({ ...circle }))
    const iterations = Math.min(10, Math.max(3, Math.floor(circles.length / 50)))
    const dampingFactor = 0.5
    
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
          const minDistance = (circle1.radius + circle2.radius) * circleSpacing
          
          if (distance < minDistance && distance > 0) {
            const overlap = minDistance - distance
            const forceStrength = overlap * 0.1
            const forceX = (dx / distance) * forceStrength
            const forceY = (dy / distance) * forceStrength
            
            forces[i].fx += forceX
            forces[i].fy += forceY
          }
        }
        
        // Boundary forces
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
          forces[i].fy -= distanceFromCenter * 0.05
        }
      }
      
      // Apply forces with damping
      const currentDamping = dampingFactor * (1 - iteration / iterations)
      
      for (let i = 0; i < relaxedCircles.length; i++) {
        const movement = Math.sqrt(forces[i].fx * forces[i].fx + forces[i].fy * forces[i].fy)
        const maxMovement = 5.0
        
        if (movement > maxMovement) {
          forces[i].fx = (forces[i].fx / movement) * maxMovement
          forces[i].fy = (forces[i].fy / movement) * maxMovement
        }
        
        relaxedCircles[i].x += forces[i].fx * currentDamping
        relaxedCircles[i].y += forces[i].fy * currentDamping
        
        // Clamp to boundaries
        relaxedCircles[i].x = Math.max(relaxedCircles[i].radius, Math.min(width - relaxedCircles[i].radius, relaxedCircles[i].x))
        relaxedCircles[i].y = Math.max(relaxedCircles[i].radius, Math.min(height - relaxedCircles[i].radius, relaxedCircles[i].y))
      }
    }
    
    return relaxedCircles
  }
  
  // Verlet integration physics simulation (adapted from sphere-drawings)
  private applyVerletPhysicsSimulation(circles: CircleData[], width: number, height: number, circleSpacing: number, gravity: number, damping: number, substeps: number, physicsIterations: number): CircleData[] {
    const physicsCircles = circles.map(circle => ({
      ...circle,
      prevX: circle.prevX ?? circle.x,
      prevY: circle.prevY ?? circle.y,
      mass: Math.PI * circle.radius * circle.radius, // mass = π × radius²
      pinned: false
    }))
    
    const fixedTimeStep = 0.016 // ~60 FPS timestep
    const substepDelta = fixedTimeStep / substeps
    
    for (let iteration = 0; iteration < physicsIterations; iteration++) {
      for (let substep = 0; substep < substeps; substep++) {
        this.verletIntegrationStep(physicsCircles, width, height, substepDelta, gravity, damping)
        this.resolveCollisions(physicsCircles, circleSpacing)
        this.constrainToBounds(physicsCircles, width, height)
      }
      
      // Send progress updates during physics simulation
      if (iteration % 3 === 0) {
        const progress = 90 + (iteration / physicsIterations) * 10
        this.sendProgress(`Physics iteration ${iteration + 1}/${physicsIterations}`, progress)
      }
    }
    
    return physicsCircles
  }
  
  // Verlet integration step: position = position + velocity + acceleration
  private verletIntegrationStep(circles: CircleData[], width: number, height: number, deltaTime: number, gravity: number, damping: number): void {
    for (const circle of circles) {
      if (circle.pinned) continue
      
      // Calculate current velocity from position difference
      const velocityX = circle.x - (circle.prevX ?? circle.x)
      const velocityY = circle.y - (circle.prevY ?? circle.y)
      
      // Store current position as previous
      circle.prevX = circle.x
      circle.prevY = circle.y
      
      // Apply gravity
      const gravityForce = gravity * deltaTime * deltaTime
      
      // Apply damping to velocity
      const dampedVelX = velocityX * damping
      const dampedVelY = velocityY * damping
      
      // Verlet integration: newPosition = currentPosition + velocity + acceleration
      circle.x += dampedVelX
      circle.y += dampedVelY + gravityForce
      
      // Add slight random force to prevent perfect symmetry
      circle.x += (Math.random() - 0.5) * 0.01
      circle.y += (Math.random() - 0.5) * 0.01
    }
  }
  
  // Mass-based collision resolution (from sphere-drawings physics)
  private resolveCollisions(circles: CircleData[], circleSpacing: number): void {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const circle1 = circles[i]
        const circle2 = circles[j]
        
        const dx = circle2.x - circle1.x
        const dy = circle2.y - circle1.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const minDistance = (circle1.radius + circle2.radius) * circleSpacing
        
        if (distance < minDistance && distance > 0) {
          // Calculate overlap
          const overlap = minDistance - distance
          
          // Normalize collision vector
          const normalX = dx / distance
          const normalY = dy / distance
          
          // Mass-based separation (heavier circles move less)
          const totalMass = (circle1.mass ?? 1) + (circle2.mass ?? 1)
          const mass1Ratio = (circle2.mass ?? 1) / totalMass
          const mass2Ratio = (circle1.mass ?? 1) / totalMass
          
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
  
  // Constrain circles to stay within bounds with bouncing
  private constrainToBounds(circles: CircleData[], width: number, height: number): void {
    for (const circle of circles) {
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
}

// Worker message handler
const workerImpl = new CirclePackingWorkerImpl()

self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data
  
  switch (type) {
    case 'generateCircles':
      try {
        const circles = workerImpl.generateCirclePacking(data as GenerateCirclesParams)
        self.postMessage({
          type: 'result',
          data: circles
        })
      } catch (error) {
        self.postMessage({
          type: 'error',
          data: { message: String(error) }
        })
      }
      break
      
    default:
      self.postMessage({
        type: 'error',
        data: { message: `Unknown message type: ${type}` }
      })
  }
})

// Export for TypeScript
export {}