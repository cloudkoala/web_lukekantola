// QuadTree implementation for efficient spatial collision detection
// Provides O(log n) circle collision queries instead of O(n) linear search

interface CircleData {
  x: number
  y: number
  radius: number
  color: [number, number, number]
}

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

export class QuadTree {
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
  
  // Insert a circle into the quadtree
  insert(circle: CircleData): boolean {
    // Check if circle intersects with this quadrant's boundary
    if (!this.intersects(circle, this.boundary)) {
      return false
    }
    
    // If we haven't reached capacity and haven't subdivided, add to this node
    if (this.circles.length < this.capacity && !this.divided) {
      this.circles.push(circle)
      return true
    }
    
    // If not divided yet, subdivide
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
  
  // Query for circles within a range
  query(range: Rectangle): CircleData[] {
    const found: CircleData[] = []
    
    // If range doesn't intersect boundary, return empty
    if (!this.rectangleIntersects(range, this.boundary)) {
      return found
    }
    
    // Check circles in this node
    for (const circle of this.circles) {
      if (this.circleIntersectsRectangle(circle, range)) {
        found.push(circle)
      }
    }
    
    // If divided, query child quadrants
    if (this.divided) {
      found.push(...this.northeast!.query(range))
      found.push(...this.northwest!.query(range))
      found.push(...this.southeast!.query(range))
      found.push(...this.southwest!.query(range))
    }
    
    return found
  }
  
  // Query for circles near a point within a radius
  queryCircle(center: Point, radius: number): CircleData[] {
    // Create a bounding rectangle for the circle query
    const range: Rectangle = {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2
    }
    
    const candidates = this.query(range)
    
    // Filter to only circles that actually intersect the query circle
    return candidates.filter(circle => {
      const distance = Math.sqrt(
        (circle.x - center.x) ** 2 + (circle.y - center.y) ** 2
      )
      return distance <= (radius + circle.radius)
    })
  }
  
  // Get all circles that could collide with a new circle at position (x, y) with given radius
  getNearbyCircles(x: number, y: number, radius: number): CircleData[] {
    // Use more conservative search radius to ensure we find all potential collisions
    const searchRadius = radius * 2.5 // Reduced from 3x to 2.5x for better performance
    return this.queryCircle({ x, y }, searchRadius)
  }
  
  // Calculate maximum radius for a circle at given position without collision
  getMaxRadiusWithoutCollision(x: number, y: number, width: number, height: number, minSpacing: number): number {
    // Distance to edges
    const edgeDistance = Math.min(x, y, width - x, height - y)
    
    // Get nearby circles
    const searchRadius = Math.min(edgeDistance, 100) // Reasonable search limit
    const nearbyCircles = this.queryCircle({ x, y }, searchRadius)
    
    let minDistanceToCircles = Infinity
    for (const circle of nearbyCircles) {
      const distance = Math.sqrt((x - circle.x) ** 2 + (y - circle.y) ** 2)
      const maxRadiusFromThisCircle = distance - circle.radius - minSpacing
      minDistanceToCircles = Math.min(minDistanceToCircles, maxRadiusFromThisCircle)
    }
    
    if (minDistanceToCircles === Infinity) {
      return edgeDistance * 0.95 // Safety margin for edges
    }
    
    return Math.max(0, Math.min(edgeDistance * 0.95, minDistanceToCircles * 0.9))
  }
  
  // Clear all circles from the quadtree
  clear(): void {
    this.circles = []
    this.divided = false
    this.northeast = undefined
    this.northwest = undefined
    this.southeast = undefined
    this.southwest = undefined
  }
  
  // Get total number of circles in the tree
  size(): number {
    let count = this.circles.length
    
    if (this.divided) {
      count += this.northeast!.size()
      count += this.northwest!.size()
      count += this.southeast!.size()
      count += this.southwest!.size()
    }
    
    return count
  }
  
  // Get depth of the tree (for performance monitoring)
  depth(): number {
    if (!this.divided) {
      return 1
    }
    
    return 1 + Math.max(
      this.northeast!.depth(),
      this.northwest!.depth(),
      this.southeast!.depth(),
      this.southwest!.depth()
    )
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
    
    // Redistribute existing circles to child quadrants
    const circlesToRedistribute = [...this.circles]
    this.circles = []
    
    for (const circle of circlesToRedistribute) {
      // Try to insert into child quadrants
      if (!(this.northeast!.insert(circle) ||
            this.northwest!.insert(circle) ||
            this.southeast!.insert(circle) ||
            this.southwest!.insert(circle))) {
        // If it doesn't fit in any child, keep it in this node
        this.circles.push(circle)
      }
    }
  }
  
  private intersects(circle: CircleData, rect: Rectangle): boolean {
    // Check if circle intersects with rectangle
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