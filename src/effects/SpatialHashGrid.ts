// Spatial Hash Grid for O(1) collision detection
// Inspired by sphere-drawings physics optimization techniques

interface CircleData {
  x: number
  y: number
  radius: number
  color: [number, number, number]
  prevX?: number
  prevY?: number
  mass?: number
  pinned?: boolean
}

interface GridCell {
  circles: CircleData[]
}

export class SpatialHashGrid {
  private cellSize: number
  private cols: number
  private rows: number
  private grid: GridCell[]
  
  constructor(width: number, height: number, averageCircleRadius: number) {
    // Optimize cell size based on average circle radius
    // Ideal cell size is 2-3x the average radius for best performance
    this.cellSize = Math.max(10, averageCircleRadius * 2.5)
    this.cols = Math.ceil(width / this.cellSize)
    this.rows = Math.ceil(height / this.cellSize)
    
    // Pre-allocate grid cells for better performance
    this.grid = new Array(this.cols * this.rows)
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = { circles: [] }
    }
    
    console.log(`SpatialHashGrid: ${this.cols}×${this.rows} grid, cellSize=${this.cellSize.toFixed(1)}`)
  }
  
  // Clear all grid cells (faster than recreating)
  clear(): void {
    for (const cell of this.grid) {
      cell.circles.length = 0 // Clear array without reallocation
    }
  }
  
  // Hash function: convert world coordinates to grid index
  private hash(x: number, y: number): number {
    const col = Math.floor(x / this.cellSize)
    const row = Math.floor(y / this.cellSize)
    
    // Clamp to grid bounds
    const clampedCol = Math.max(0, Math.min(this.cols - 1, col))
    const clampedRow = Math.max(0, Math.min(this.rows - 1, row))
    
    return clampedRow * this.cols + clampedCol
  }
  
  // Insert circle into appropriate grid cells
  // Large circles may span multiple cells
  insert(circle: CircleData): void {
    const minX = circle.x - circle.radius
    const maxX = circle.x + circle.radius
    const minY = circle.y - circle.radius
    const maxY = circle.y + circle.radius
    
    const startCol = Math.max(0, Math.floor(minX / this.cellSize))
    const endCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize))
    const startRow = Math.max(0, Math.floor(minY / this.cellSize))
    const endRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize))
    
    // Insert into all cells that the circle overlaps
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const index = row * this.cols + col
        this.grid[index].circles.push(circle)
      }
    }
  }
  
  // Get all circles near a point within a given radius
  // This is the O(1) operation that replaces O(n) linear search
  getNearbyCircles(x: number, y: number, radius: number): CircleData[] {
    const nearbyCircles: Set<CircleData> = new Set() // Use Set to avoid duplicates
    
    const minX = x - radius
    const maxX = x + radius
    const minY = y - radius
    const maxY = y + radius
    
    const startCol = Math.max(0, Math.floor(minX / this.cellSize))
    const endCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize))
    const startRow = Math.max(0, Math.floor(minY / this.cellSize))
    const endRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize))
    
    // Check all relevant grid cells
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const index = row * this.cols + col
        const cell = this.grid[index]
        
        // Add all circles from this cell
        for (const circle of cell.circles) {
          nearbyCircles.add(circle)
        }
      }
    }
    
    return Array.from(nearbyCircles)
  }
  
  // Optimized collision check using spatial hashing
  checkCollision(circle: CircleData, spacing: number): CircleData | null {
    const nearby = this.getNearbyCircles(circle.x, circle.y, circle.radius + spacing)
    
    for (const other of nearby) {
      if (other === circle) continue
      
      const dx = circle.x - other.x
      const dy = circle.y - other.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const minDistance = circle.radius + other.radius + spacing
      
      if (distance < minDistance) {
        return other // Return first collision found
      }
    }
    
    return null // No collision
  }
  
  // Calculate maximum possible radius at a position without collision
  getMaxRadiusAt(x: number, y: number, spacing: number, bounds: {width: number, height: number}): number {
    // Distance to edges
    const edgeDistance = Math.min(x, y, bounds.width - x, bounds.height - y)
    
    // Get nearby circles in a large search radius
    const searchRadius = Math.min(edgeDistance, 100) // Reasonable search limit
    const nearby = this.getNearbyCircles(x, y, searchRadius)
    
    let minDistanceToCircles = Infinity
    for (const circle of nearby) {
      const distance = Math.sqrt((x - circle.x) ** 2 + (y - circle.y) ** 2)
      const maxRadiusFromThisCircle = distance - circle.radius - spacing
      minDistanceToCircles = Math.min(minDistanceToCircles, maxRadiusFromThisCircle)
    }
    
    // If no nearby circles, use edge distance
    if (minDistanceToCircles === Infinity) {
      return Math.max(0, edgeDistance * 0.95) // 5% safety margin
    }
    
    // Take minimum of edge and circle constraints
    return Math.max(0, Math.min(edgeDistance, minDistanceToCircles) * 0.8) // 20% safety margin
  }
  
  // Get statistics for performance monitoring
  getStats(): {totalCells: number, occupiedCells: number, averageCirclesPerCell: number, maxCirclesInCell: number} {
    let occupiedCells = 0
    let totalCircles = 0
    let maxCirclesInCell = 0
    
    for (const cell of this.grid) {
      if (cell.circles.length > 0) {
        occupiedCells++
        totalCircles += cell.circles.length
        maxCirclesInCell = Math.max(maxCirclesInCell, cell.circles.length)
      }
    }
    
    return {
      totalCells: this.grid.length,
      occupiedCells,
      averageCirclesPerCell: occupiedCells > 0 ? totalCircles / occupiedCells : 0,
      maxCirclesInCell
    }
  }
  
  // Find large empty areas for dynamic circle spawning
  findEmptyAreas(minAreaSize: number = 3): Array<{centerX: number, centerY: number, width: number, height: number, score: number}> {
    const emptyAreas: Array<{centerX: number, centerY: number, width: number, height: number, score: number}> = []
    const visited = new Set<number>()
    let totalEmptyCells = 0
    let totalRegionsFound = 0
    
    // Scan grid for connected empty regions
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const index = row * this.cols + col
        
        if (visited.has(index)) continue
        
        const cell = this.grid[index]
        
        // Only consider truly empty cells (no circles)
        if (cell.circles.length === 0) {
          totalEmptyCells++
          const emptyRegion = this.floodFillEmptyRegion(col, row, visited)
          totalRegionsFound++
          
          // Only keep regions that meet minimum size threshold
          if (emptyRegion.cellCount >= minAreaSize) {
            const worldX = emptyRegion.centerCol * this.cellSize + this.cellSize / 2
            const worldY = emptyRegion.centerRow * this.cellSize + this.cellSize / 2
            const worldWidth = emptyRegion.width * this.cellSize
            const worldHeight = emptyRegion.height * this.cellSize
            
            // Calculate score based on area size (larger = better)
            const score = emptyRegion.cellCount / (this.cols * this.rows)
            
            emptyAreas.push({
              centerX: worldX,
              centerY: worldY,
              width: worldWidth,
              height: worldHeight,
              score
            })
          }
        }
      }
    }
    
    console.log(`Empty area scan: Found ${totalEmptyCells} total empty cells, ${totalRegionsFound} regions, ${emptyAreas.length} areas meeting minSize=${minAreaSize}`)
    
    // Sort by score (largest areas first)
    return emptyAreas.sort((a, b) => b.score - a.score)
  }
  
  // Flood fill algorithm to find connected empty regions
  private floodFillEmptyRegion(startCol: number, startRow: number, visited: Set<number>): {
    cellCount: number,
    centerCol: number,
    centerRow: number,
    width: number,
    height: number
  } {
    const stack: Array<{col: number, row: number}> = [{col: startCol, row: startRow}]
    const regionCells: Array<{col: number, row: number}> = []
    
    let minCol = startCol, maxCol = startCol
    let minRow = startRow, maxRow = startRow
    
    while (stack.length > 0) {
      const {col, row} = stack.pop()!
      const index = row * this.cols + col
      
      // Skip if already visited or out of bounds
      if (visited.has(index) || col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
        continue
      }
      
      const cell = this.grid[index]
      
      // Skip if cell is not empty
      if (cell.circles.length > 0) {
        continue
      }
      
      // Mark as visited and add to region
      visited.add(index)
      regionCells.push({col, row})
      
      // Update bounding box
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      
      // Add neighbors to stack (4-connected)
      stack.push(
        {col: col - 1, row},
        {col: col + 1, row},
        {col, row: row - 1},
        {col, row: row + 1}
      )
    }
    
    return {
      cellCount: regionCells.length,
      centerCol: (minCol + maxCol) / 2,
      centerRow: (minRow + maxRow) / 2,
      width: maxCol - minCol + 1,
      height: maxRow - minRow + 1
    }
  }
  
  // Find optimal spawn points within an empty area
  getSpawnPointsInArea(area: {centerX: number, centerY: number, width: number, height: number}, maxPoints: number = 5): Array<{x: number, y: number, maxRadius: number}> {
    const spawnPoints: Array<{x: number, y: number, maxRadius: number}> = []
    const attempts = maxPoints * 20 // Multiple attempts per desired point
    
    for (let i = 0; i < attempts && spawnPoints.length < maxPoints; i++) {
      // Generate random point within the area (with 20% margin)
      const margin = 0.2
      const x = area.centerX + (Math.random() - 0.5) * area.width * (1 - margin)
      const y = area.centerY + (Math.random() - 0.5) * area.height * (1 - margin)
      
      // Calculate maximum possible radius at this point
      const maxRadius = this.getMaxRadiusAt(x, y, 2.0, {
        width: area.centerX + area.width / 2,
        height: area.centerY + area.height / 2
      })
      
      // Only accept points where we can place a meaningful circle
      if (maxRadius >= 2.0) {
        // Ensure minimum distance between spawn points
        const tooClose = spawnPoints.some(point => {
          const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2)
          return distance < Math.max(maxRadius, point.maxRadius) * 3
        })
        
        if (!tooClose) {
          spawnPoints.push({x, y, maxRadius})
        }
      }
    }
    
    return spawnPoints
  }
}