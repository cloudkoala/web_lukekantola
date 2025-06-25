import * as THREE from 'three'
import { QuadTree } from './QuadTree'

interface CircleData {
  x: number
  y: number
  radius: number
  color: [number, number, number]
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
  public packingDensity: number = 18 // Number of circles per color region
  public colorLevels: number = 8 // Posterization levels
  public minCircleSize: number = 0.3 // Minimum circle radius (0-1)
  public maxCircleSize: number = 8.0 // Maximum circle radius
  public circleSpacing: number = 1.2 // Spacing multiplier between circles
  public colorTolerance: number = 0.15 // How similar colors need to be to group (0-1)
  public randomSeed: number = 42 // For consistent random circle placement
  public blackBackground: number = 1 // Whether to use black background
  public backgroundColorR: number = 0.0 // Custom background red component (0-1)
  public backgroundColorG: number = 0.0 // Custom background green component (0-1)
  public backgroundColorB: number = 0.0 // Custom background blue component (0-1)
  public pixelateSize: number = 8 // Size of pixelation blocks (2-50)
  public posterizeLevels: number = 8 // Number of posterization levels (2-32)
  
  // Pre-computed circle data
  private circles: CircleData[] = []
  private needsRecompute: boolean = true
  private circleDataTexture: THREE.DataTexture | null = null
  
  // WebWorker support for parallel processing
  private worker: Worker | null = null
  private isGenerating: boolean = false
  private generationProgress: number = 0
  private useWebWorker: boolean = true // Can be disabled for debugging
  
  // Track parameter changes to trigger recompute
  private lastParameters = {
    packingDensity: this.packingDensity,
    colorLevels: this.colorLevels,
    minCircleSize: this.minCircleSize,
    maxCircleSize: this.maxCircleSize,
    circleSpacing: this.circleSpacing,
    colorTolerance: this.colorTolerance,
    randomSeed: this.randomSeed,
    pixelateSize: this.pixelateSize,
    posterizeLevels: this.posterizeLevels
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
    // Use 200x2 texture: row 0 = position+radius, row 1 = color
    this.circleDataTexture = new THREE.DataTexture(
      new Float32Array(200 * 2 * 4), // 200 circles * 2 rows * 4 channels (RGBA)
      200, 2, // 200x2 texture
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
        numCircles: { value: 0 }
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
      randomSeed: this.randomSeed
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
  
  // Smart circle packing with progressive rendering support
  private generateCirclePacking(originalImageData: ImageData, width: number, height: number): CircleData[] {
    const circles: CircleData[] = []
    const quadTree = new QuadTree({ x: 0, y: 0, width, height }, 15)
    const spacing = this.circleSpacing * 2.0
    
    const startTime = performance.now()
    
    // Multi-scale hierarchical placement: Large → Medium → Small
    
    // Phase 1: Generate large circles from uniform color blocks (backgrounds)
    console.log('Phase 1: Generating large circles from color blocks...')
    const largeCircles = this.generateLargeCirclesFromColorBlocks(originalImageData, width, height, quadTree)
    console.log('Generated large circles:', largeCircles.length, `(${Math.round(performance.now() - startTime)}ms)`)
    
    for (const circle of largeCircles) {
      circles.push(circle)
      quadTree.insert(circle)
    }
    
    // Phase 2: Generate medium circles for feature areas
    console.log('Phase 2: Generating medium circles for features...')
    const phase2StartTime = performance.now()
    const mediumCircles = this.generateMediumCircles(originalImageData, width, height, quadTree, spacing)
    console.log('Generated medium circles:', mediumCircles.length, `(${Math.round(performance.now() - phase2StartTime)}ms)`)
    
    for (const circle of mediumCircles) {
      circles.push(circle)
      quadTree.insert(circle)
    }
    
    // Phase 3: Generate medium-small circles for intermediate gaps
    console.log('Phase 3: Generating medium-small circles for intermediate gaps...')
    const phase3StartTime = performance.now()
    const mediumSmallCircles = this.generateMediumSmallCircles(originalImageData, width, height, quadTree, spacing)
    console.log('Generated medium-small circles:', mediumSmallCircles.length, `(${Math.round(performance.now() - phase3StartTime)}ms)`)
    
    for (const circle of mediumSmallCircles) {
      circles.push(circle)
      quadTree.insert(circle)
    }
    
    // Phase 4: Fill remaining space with small detail circles using Poisson sampling
    console.log('Phase 4: Filling final gaps with small detail circles...')
    const phase4StartTime = performance.now()
    const smallCircles = this.generateSmallCircles(originalImageData, width, height, quadTree, spacing)
    console.log('Generated small circles:', smallCircles.length, `(${Math.round(performance.now() - phase4StartTime)}ms)`)
    
    for (const circle of smallCircles) {
      circles.push(circle)
      quadTree.insert(circle)
    }
    
    // Phase 5: Apply force-based relaxation to eliminate micro-overlaps
    console.log('Phase 5: Applying force-based relaxation...')
    const phase5StartTime = performance.now()
    const relaxedCircles = this.applyForceBasedRelaxation(circles, width, height)
    console.log('Force relaxation completed:', `(${Math.round(performance.now() - phase5StartTime)}ms)`)
    
    const totalTime = Math.round(performance.now() - startTime)
    console.log(`Circle packing complete: ${relaxedCircles.length} circles in ${totalTime}ms`)
    console.log(`Performance: ${Math.round(relaxedCircles.length / (totalTime / 1000))} circles/second`)
    
    return relaxedCircles
  }
  
  // Your brilliant idea: pixelate → posterize → detect uniform blocks → place large circles
  private generateLargeCirclesFromColorBlocks(imageData: ImageData, width: number, height: number, quadTree: QuadTree): CircleData[] {
    // Use quadTree parameter to avoid TypeScript warning
    void quadTree;
    const circles: CircleData[] = []
    
    try {
      // Step 1: Create pixelated version using user-controlled pixel size
      console.log('Pixelating with pixel size:', this.pixelateSize)
      const pixelatedData = this.pixelateImage(imageData, width, height, this.pixelateSize)
      
      // Step 2: Posterize to create distinct color regions using user-controlled levels
      console.log('Posterizing with', this.posterizeLevels, 'levels')
      const posterizedData = this.posterizeImageData(pixelatedData)
      
      // Step 3: Find uniform color blocks and their sizes
      console.log('Finding uniform color blocks')
      const colorBlocks = this.findUniformColorBlocks(posterizedData, width, height, this.pixelateSize)
      console.log('Found color blocks:', colorBlocks.length)
      
      // Step 4: Extract optimal squares from color blocks with collision-aware placement
      // Sort blocks by area and edge strength for better placement priority
      const sortedBlocks = colorBlocks.sort((a, b) => {
        const areaCompare = (b.width * b.height) - (a.width * a.height)
        if (Math.abs(areaCompare) > 100) return areaCompare
        return a.edgeStrength - b.edgeStrength // Lower edge strength = more uniform = higher priority
      })
      
      for (const block of sortedBlocks) {
        // Skip tiny blocks that can't fit meaningful circles
        const blockArea = block.width * block.height
        if (blockArea < this.minCircleSize * this.minCircleSize * 4) continue
        
        // Adaptive sizing based on block characteristics and edge strength
        const baseSize = Math.min(block.width, block.height) * 0.8
        const edgeFactor = Math.max(0.3, 1.0 - block.edgeStrength * 2)
        const adaptiveMaxSize = Math.min(this.maxCircleSize, baseSize * edgeFactor)
        
        const squares = this.findOptimalSquaresInBlockWithCollision(block, adaptiveMaxSize, quadTree)
        console.log(`Block at (${Math.floor(block.centerX)},${Math.floor(block.centerY)}) size ${Math.floor(block.width)}x${Math.floor(block.height)} edge:${block.edgeStrength.toFixed(2)} → ${squares.length} squares`)
        
        for (const square of squares) {
          const radius = Math.min(square.size / 2, adaptiveMaxSize)
          
          // Sample original color at square center for natural color
          const centerX = Math.max(0, Math.min(width - 1, Math.floor(square.centerX)))
          const centerY = Math.max(0, Math.min(height - 1, Math.floor(square.centerY)))
          const pixelIndex = (centerY * width + centerX) * 4
          
          // Bounds check for imageData access
          if (pixelIndex >= 0 && pixelIndex + 3 < imageData.data.length) {
            let color: [number, number, number] = [
              imageData.data[pixelIndex] / 255,
              imageData.data[pixelIndex + 1] / 255,
              imageData.data[pixelIndex + 2] / 255
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
            
            const newCircle = {
              x: square.centerX,
              y: square.centerY,
              radius: radius,
              color: color
            }
            
            circles.push(newCircle)
            quadTree.insert(newCircle) // Add to spatial grid for collision detection
          }
        }
      }
    } catch (error) {
      console.error('Error in generateLargeCirclesFromColorBlocks:', error)
      // Fall back to empty array if there's an error
    }
    
    return circles
  }

  // Generate medium-sized circles for feature areas (intermediate scale)
  private generateMediumCircles(originalImageData: ImageData, width: number, height: number, quadTree: QuadTree, spacing: number): CircleData[] {
    void spacing; // Currently unused but reserved for future enhancement
    const circles: CircleData[] = []
    
    // Create a coarser pixelation for medium-scale features
    const mediumPixelSize = Math.max(this.pixelateSize * 2, 16)
    const mediumPosterizeLevels = Math.max(this.posterizeLevels / 2, 4)
    
    console.log(`Medium circles: pixelSize=${mediumPixelSize}, posterizeLevels=${mediumPosterizeLevels}`)
    
    try {
      // Step 1: Create medium-scale pixelated version
      const pixelatedData = this.pixelateImage(originalImageData, width, height, mediumPixelSize)
      
      // Step 2: Posterize with fewer levels for broader color grouping
      const posterizedData = this.posterizeImageDataWithLevels(pixelatedData, mediumPosterizeLevels)
      
      // Step 3: Find medium-scale color blocks
      const colorBlocks = this.findUniformColorBlocks(posterizedData, width, height, mediumPixelSize)
      
      // Filter blocks by size - medium blocks only (not too large, not too small)
      const mediumBlocks = colorBlocks.filter(block => {
        const blockArea = block.width * block.height
        const minArea = (this.maxCircleSize * 0.5) ** 2 * Math.PI * 4 // Min area for medium circles
        const maxArea = (this.maxCircleSize * 0.8) ** 2 * Math.PI * 16 // Max area for medium circles
        return blockArea >= minArea && blockArea <= maxArea
      })
      
      console.log(`Found ${mediumBlocks.length} medium-scale blocks from ${colorBlocks.length} total blocks`)
      
      // Sort by edge strength - prioritize moderately complex areas
      const sortedBlocks = mediumBlocks.sort((a, b) => {
        // Target moderate edge strength (0.2-0.6 range)
        const aScore = Math.abs(a.edgeStrength - 0.4)
        const bScore = Math.abs(b.edgeStrength - 0.4)
        return aScore - bScore
      })
      
      // Generate circles from medium blocks
      for (const block of sortedBlocks.slice(0, Math.floor(this.packingDensity / 4))) {
        const baseSize = Math.min(block.width, block.height) * 0.6
        const edgeFactor = Math.max(0.4, 1.0 - Math.abs(block.edgeStrength - 0.4))
        const adaptiveMaxSize = Math.min(this.maxCircleSize * 0.7, baseSize * edgeFactor)
        
        // Use simplified placement for medium circles
        const squares = this.generateMediumSquaresInBlock(block, adaptiveMaxSize, quadTree)
        
        for (const square of squares) {
          const radius = square.size / 2
          
          // Sample color with area averaging
          const color = this.sampleAreaColor(originalImageData, square.centerX, square.centerY, radius, width, height)
          
          const newCircle = {
            x: square.centerX,
            y: square.centerY,
            radius: radius,
            color: color
          }
          
          circles.push(newCircle)
          quadTree.insert(newCircle)
        }
      }
    } catch (error) {
      console.error('Error in generateMediumCircles:', error)
    }
    
    return circles
  }

  // Generate squares for medium circles with simpler placement strategy
  private generateMediumSquaresInBlock(block: {centerX: number, centerY: number, width: number, height: number, color: [number, number, number], edgeStrength: number}, maxCircleSize: number, quadTree: QuadTree): Array<{centerX: number, centerY: number, size: number}> {
    const squares: Array<{centerX: number, centerY: number, size: number}> = []
    
    // Try center placement first
    const maxRadiusFromCollision = this.getMaxRadiusWithQuadTree(
      block.centerX, 
      block.centerY, 
      quadTree, 
      block.width, 
      block.height, 
      this.circleSpacing
    )
    
    const maxRadiusFromBounds = Math.min(block.width, block.height) * 0.4
    const finalRadius = Math.min(maxRadiusFromBounds, maxRadiusFromCollision, maxCircleSize)
    
    if (finalRadius >= this.minCircleSize * 2) { // Medium circles should be at least 2x minimum
      squares.push({
        centerX: block.centerX,
        centerY: block.centerY,
        size: finalRadius * 2
      })
    }
    
    return squares
  }

  // Posterize with custom levels (separate from instance variable)
  private posterizeImageDataWithLevels(imageData: ImageData, levels: number): ImageData {
    const posterizedData = new ImageData(imageData.width, imageData.height)
    
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

  // Generate medium-small circles to fill intermediate gaps (Phase 3)
  private generateMediumSmallCircles(originalImageData: ImageData, width: number, height: number, quadTree: QuadTree, spacing: number): CircleData[] {
    // Use quadTree parameter to avoid TypeScript warning  
    void quadTree;
    const circles: CircleData[] = []
    
    console.log('Starting medium-small circle generation with targeted gap filling')
    
    // Use a hybrid approach: structured sampling + Poisson for better coverage
    const targetDensity = Math.floor(this.packingDensity * 0.4) // 40% of total density for this phase
    const minDistance = spacing * 1.5 // Less strict than small circles
    const maxAttempts = targetDensity * 30
    void maxAttempts; // Reserved for future enhancement
    
    // Phase 3A: Grid-based sampling for systematic coverage
    const gridSpacing = Math.max(20, this.minCircleSize * 3)
    
    for (let y = gridSpacing; y < height - gridSpacing; y += gridSpacing) {
      for (let x = gridSpacing; x < width - gridSpacing; x += gridSpacing) {
        // Add some randomness to grid positions to avoid rigid patterns
        const jitterX = (Math.random() - 0.5) * gridSpacing * 0.6
        const jitterY = (Math.random() - 0.5) * gridSpacing * 0.6
        const candidateX = x + jitterX
        const candidateY = y + jitterY
        
        // Ensure position is within bounds
        if (candidateX < 0 || candidateX >= width || candidateY < 0 || candidateY >= height) continue
        
        // Check collision with existing circles
        const maxPossibleRadius = this.getMaxRadiusWithQuadTree(candidateX, candidateY, quadTree, width, height, spacing)
        
        // Use strict collision detection to prevent overlaps
        if (maxPossibleRadius < this.minCircleSize) continue
        
        // Size for medium-small circles: 50-80% of max circle size
        const localComplexity = this.calculateLocalComplexity(originalImageData, candidateX, candidateY, width, height)
        const complexityFactor = Math.max(0.4, 1.0 - localComplexity * 0.8)
        
        const targetRadius = Math.min(
          maxPossibleRadius,
          this.maxCircleSize * 0.65 * complexityFactor // Medium-small range
        )
        
        if (targetRadius >= this.minCircleSize) {
          const color = this.sampleAreaColor(originalImageData, candidateX, candidateY, targetRadius, width, height)
          
          const newCircle = {
            x: candidateX,
            y: candidateY,
            radius: targetRadius,
            color: color
          }
          
          circles.push(newCircle)
          quadTree.insert(newCircle)
        }
      }
    }
    
    // Phase 3B: Poisson sampling for remaining gaps
    const remainingTarget = Math.max(0, targetDensity - circles.length)
    if (remainingTarget > 0) {
      const sampler = new PoissonDiskSampler(width, height, minDistance, 20)
      const candidatePoints = sampler.generatePoints()
      
      let poissonCount = 0
      for (const point of candidatePoints) {
        if (poissonCount >= remainingTarget) break
        
        const x = point[0]
        const y = point[1]
        
        const maxPossibleRadius = this.getMaxRadiusWithQuadTree(x, y, quadTree, width, height, spacing)
        // Use strict collision detection to prevent overlaps
        if (maxPossibleRadius < this.minCircleSize) continue
        
        const localComplexity = this.calculateLocalComplexity(originalImageData, x, y, width, height)
        const complexityFactor = Math.max(0.4, 1.0 - localComplexity * 0.8)
        
        const radius = Math.min(
          maxPossibleRadius,
          this.maxCircleSize * 0.65 * complexityFactor
        )
        
        if (radius >= this.minCircleSize) {
          // Double-check for overlaps before adding
          const nearbyCircles = quadTree.getNearbyCircles(x, y, radius)
          let hasOverlap = false
          for (const existing of nearbyCircles) {
            const distance = Math.sqrt((x - existing.x) ** 2 + (y - existing.y) ** 2)
            if (distance < radius + existing.radius + spacing * 0.1) { // Small buffer
              hasOverlap = true
              break
            }
          }
          
          if (!hasOverlap) {
            const color = this.sampleAreaColor(originalImageData, x, y, radius, width, height)
            
            const newCircle = { x, y, radius, color }
            circles.push(newCircle)
            quadTree.insert(newCircle)
            poissonCount++
          }
        }
      }
    }
    
    console.log(`Created ${circles.length} medium-small circles (grid: ${circles.length - (circles.length - targetDensity)}, poisson: ${Math.min(circles.length, targetDensity)})`)
    return circles
  }
  
  // Fill remaining space with Poisson Disk Sampling for natural distribution
  private generateSmallCircles(originalImageData: ImageData, width: number, height: number, quadTree: QuadTree, spacing: number): CircleData[] {
    const circles: CircleData[] = []
    
    console.log('Starting small circle generation with Poisson Disk Sampling')
    
    // Calculate minimum distance based on density and spacing (smaller circles, tighter packing)
    const densityFactor = Math.max(0.1, (101 - this.packingDensity) / 100)
    const minDistance = Math.max(this.minCircleSize * 1.5, spacing * densityFactor * 0.8)
    
    // Generate Poisson-distributed candidate points (more attempts for final details)
    // Increase attempts for smaller circles to ensure better coverage
    const attemptMultiplier = Math.max(1, Math.floor(10 / Math.max(this.minCircleSize, 1)))
    const maxAttempts = Math.min(80, 40 * attemptMultiplier)
    const sampler = new PoissonDiskSampler(width, height, minDistance, maxAttempts)
    const candidatePoints = sampler.generatePoints()
    
    // Limit to remaining density budget (30% of total for final small circles)
    const maxSmallCircles = Math.floor(this.packingDensity * 0.3)
    
    console.log(`Generated ${candidatePoints.length} Poisson candidate points`)
    
    // Convert valid candidate points to circles (limited count for final details)
    let smallCircleCount = 0
    for (const point of candidatePoints) {
      if (smallCircleCount >= maxSmallCircles) break
      
      const x = point[0]
      const y = point[1]
      
      // Check collision with existing circles using spatial grid
      // Use tighter spacing for small circles to allow better packing
      const smallCircleSpacing = spacing * 0.5
      const maxPossibleRadius = this.getMaxRadiusWithQuadTree(x, y, quadTree, width, height, smallCircleSpacing)
      
      // Use strict collision detection to prevent overlaps
      if (maxPossibleRadius < this.minCircleSize) continue
      
      // Size circles based on local image complexity (smaller range for detail preservation)
      const localComplexity = this.calculateLocalComplexity(originalImageData, x, y, width, height)
      const complexityFactor = Math.max(0.2, 1.0 - localComplexity * 1.2)
      
      const radius = Math.min(
        maxPossibleRadius, 
        this.maxCircleSize * 0.35 * complexityFactor // Smaller circles for final details
      )
      
      if (radius >= this.minCircleSize) {
        // Double-check for overlaps before adding
        const nearbyCircles = quadTree.getNearbyCircles(x, y, radius)
        let hasOverlap = false
        for (const existing of nearbyCircles) {
          const distance = Math.sqrt((x - existing.x) ** 2 + (y - existing.y) ** 2)
          if (distance < radius + existing.radius + smallCircleSpacing * 0.1) { // Small buffer
            hasOverlap = true
            break
          }
        }
        
        if (!hasOverlap) {
          // Sample color from original image with area averaging for better color representation
          const color = this.sampleAreaColor(originalImageData, x, y, radius, width, height)
          
          const newCircle = { x, y, radius, color }
          circles.push(newCircle)
          quadTree.insert(newCircle) // Update spatial grid for collision detection
          smallCircleCount++
        }
      }
    }
    
    console.log(`Created ${circles.length} small circles from ${candidatePoints.length} candidates`)
    return circles
  }

  // Calculate local image complexity using edge density and saliency
  private calculateLocalComplexity(imageData: ImageData, centerX: number, centerY: number, width: number, height: number): number {
    const sampleRadius = 10 // Sample area around point
    let edgeStrengthSum = 0
    let saliencySum = 0
    let sampleCount = 0
    
    for (let dy = -sampleRadius; dy <= sampleRadius; dy += 2) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx += 2) {
        const x = Math.round(centerX + dx)
        const y = Math.round(centerY + dy)
        
        if (x >= 1 && x < width - 1 && y >= 1 && y < height - 1) {
          edgeStrengthSum += this.calculateEdgeStrength(imageData, x, y, width, height)
          saliencySum += this.calculateSaliency(imageData, x, y, width, height)
          sampleCount++
        }
      }
    }
    
    if (sampleCount === 0) return 0
    
    const edgeComplexity = edgeStrengthSum / sampleCount
    const saliencyScore = saliencySum / sampleCount
    
    // Combine edge complexity and saliency (higher saliency = more complex)
    return (edgeComplexity * 0.7) + (saliencyScore * 0.3)
  }

  // Simple saliency detection based on color contrast and local features
  private calculateSaliency(imageData: ImageData, x: number, y: number, width: number, height: number): number {
    if (x <= 2 || x >= width - 3 || y <= 2 || y >= height - 3) return 0
    
    const centerIdx = (y * width + x) * 4
    const centerColor = [
      imageData.data[centerIdx],
      imageData.data[centerIdx + 1], 
      imageData.data[centerIdx + 2]
    ]
    
    // Calculate contrast with surrounding areas
    let totalContrast = 0
    let sampleCount = 0
    const radius = 3
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue // Skip center
        
        const sx = x + dx
        const sy = y + dy
        
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const sampleIdx = (sy * width + sx) * 4
          const sampleColor = [
            imageData.data[sampleIdx],
            imageData.data[sampleIdx + 1],
            imageData.data[sampleIdx + 2]
          ]
          
          // Calculate perceptual color difference (simplified CIE76)
          const deltaE = Math.sqrt(
            Math.pow(centerColor[0] - sampleColor[0], 2) +
            Math.pow(centerColor[1] - sampleColor[1], 2) +
            Math.pow(centerColor[2] - sampleColor[2], 2)
          )
          
          totalContrast += deltaE / 255 // Normalize to 0-1 range
          sampleCount++
        }
      }
    }
    
    if (sampleCount === 0) return 0
    
    const avgContrast = totalContrast / sampleCount
    
    // Add brightness-based saliency (very bright or very dark areas are salient)
    const brightness = (centerColor[0] * 0.299 + centerColor[1] * 0.587 + centerColor[2] * 0.114) / 255
    const brightnessSaliency = Math.abs(brightness - 0.5) * 2 // 0 at middle gray, 1 at extremes
    
    // Combine contrast and brightness saliency
    return Math.min(1.0, (avgContrast * 0.8) + (brightnessSaliency * 0.2))
  }

  // Sample color from an area around the point for better color representation
  private sampleAreaColor(imageData: ImageData, centerX: number, centerY: number, radius: number, width: number, height: number): [number, number, number] {
    const sampleRadius = Math.max(1, Math.floor(radius * 0.5))
    let r = 0, g = 0, b = 0, count = 0
    
    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        const x = Math.max(0, Math.min(width - 1, Math.floor(centerX + dx)))
        const y = Math.max(0, Math.min(height - 1, Math.floor(centerY + dy)))
        const pixelIndex = (y * width + x) * 4
        
        r += imageData.data[pixelIndex]
        g += imageData.data[pixelIndex + 1]
        b += imageData.data[pixelIndex + 2]
        count++
      }
    }
    
    if (count === 0) {
      // Fallback to center pixel
      const pixelX = Math.max(0, Math.min(width - 1, Math.floor(centerX)))
      const pixelY = Math.max(0, Math.min(height - 1, Math.floor(centerY)))
      const pixelIndex = (pixelY * width + pixelX) * 4
      return [
        imageData.data[pixelIndex] / 255,
        imageData.data[pixelIndex + 1] / 255,
        imageData.data[pixelIndex + 2] / 255
      ]
    }
    
    let color: [number, number, number] = [r / count / 255, g / count / 255, b / count / 255]
    
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
    
    return color
  }

  // Apply force-based relaxation to eliminate overlaps and improve distribution
  private applyForceBasedRelaxation(circles: CircleData[], width: number, height: number): CircleData[] {
    const relaxedCircles = circles.map(circle => ({ ...circle })) // Deep copy
    const iterations = Math.min(10, Math.max(3, Math.floor(circles.length / 50))) // Adaptive iterations
    const dampingFactor = 0.5 // Reduce movement over time
    
    console.log(`Applying ${iterations} relaxation iterations to ${circles.length} circles`)
    
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
    
    // Much more aggressive circle generation for better packing
    const maxCircles = Math.min(Math.floor(this.packingDensity * Math.sqrt(region.area) / 10), 200) // Increased from /100 to /10, max from 50 to 200
    
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
      colorLevels: this.colorLevels,
      minCircleSize: this.minCircleSize,
      maxCircleSize: this.maxCircleSize,
      circleSpacing: this.circleSpacing,
      colorTolerance: this.colorTolerance,
      randomSeed: this.randomSeed,
      pixelateSize: this.pixelateSize,
      posterizeLevels: this.posterizeLevels
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
    // Try to get the global scene background color
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

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, outputTarget?: THREE.WebGLRenderTarget | null) {
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
    
    // Check if parameters changed and trigger recompute
    const parametersChanged = this.checkParameterChanges()
    if (parametersChanged) {
      this.needsRecompute = true
    }
    
    // Recompute circles if needed (async but cache results)
    if (this.needsRecompute && !this.isGenerating) {
      // Use current render target size for ImageData to ensure full screen coverage
      const targetWidth = this.renderTarget.width
      const targetHeight = this.renderTarget.height
      
      this.getImageDataFromTexture(renderer, inputTexture, targetWidth, targetHeight)
        .then(imageData => {
          // CRITICAL: Update resolution uniform to match ImageData dimensions for correct coordinate mapping
          this.material.uniforms.resolution.value.set(imageData.width, imageData.height)
          
          if (this.useWebWorker && this.worker) {
            // Use WebWorker for parallel processing
            this.generateCirclesWithWorker(imageData)
          } else {
            // Fallback to main thread
            this.circles = this.generateCirclePacking(imageData, imageData.width, imageData.height)
            this.needsRecompute = false
            this.updateCircleDataInShader()
          }
        })
        .catch(console.error)
    }
    
    // Get current global background color
    const globalBgColor = this.getGlobalBackgroundColor(renderer)
    
    // Update uniforms
    this.material.uniforms.tDiffuse.value = inputTexture
    this.material.uniforms.intensity.value = this.intensity
    this.material.uniforms.blackBackground.value = this.blackBackground
    this.material.uniforms.globalBackgroundR.value = globalBgColor[0]
    this.material.uniforms.globalBackgroundG.value = globalBgColor[1]
    this.material.uniforms.globalBackgroundB.value = globalBgColor[2]
    
    // Render the effect
    renderer.setRenderTarget(outputTarget || null)
    renderer.clear()
    renderer.render(this.scene, this.camera)
  }
  
  private updateCircleDataInShader(): void {
    if (!this.circleDataTexture) return
    
    const maxCircles = 200
    const textureData = new Float32Array(maxCircles * 2 * 4) // 200 circles * 2 rows * 4 channels
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
    }
    
    this.circleDataTexture.image.data = textureData
    this.circleDataTexture.needsUpdate = true
    this.material.uniforms.numCircles.value = Math.min(this.circles.length, maxCircles)
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
      
      varying vec2 vUv;
      
      // Sample circle data from texture
      vec4 getCircleData(int index, int component) {
        float u = (float(index) + 0.5) / 200.0; // Circle index
        float v = (float(component) + 0.5) / 2.0; // Component (0 = position+radius, 1 = color)
        return texture2D(circleDataTexture, vec2(u, v));
      }
      
      void main() {
        vec2 pixelCoord = vUv * resolution;
        
        // Sample original color
        vec4 originalColor = texture2D(tDiffuse, vUv);
        
        // Find the top-most circle at this pixel
        vec3 circleColor = vec3(0.0);
        bool insideCircle = false;
        
        // Check all pre-computed circles
        for (int i = 0; i < 200; i++) {
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
        
        // Blend between base and circles
        vec3 finalColor;
        if (blackBackground > 0.5) {
          // Background mode: solid circles on solid global background color
          if (insideCircle) {
            finalColor = circleColor;
          } else {
            // Use the global scene background color as solid background
            finalColor = vec3(globalBackgroundR, globalBackgroundG, globalBackgroundB);
          }
        } else {
          // Normal mode: solid circles over original image
          if (insideCircle) {
            finalColor = mix(originalColor.rgb, circleColor, intensity);
          } else {
            finalColor = originalColor.rgb;
          }
        }
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  }
}