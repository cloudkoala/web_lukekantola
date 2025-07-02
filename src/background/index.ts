import { BackgroundRenderer } from './BackgroundRenderer'

let backgroundRenderer: BackgroundRenderer | null = null
let animationId: number | null = null

export function initializeBackground(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#background-canvas')
  if (!canvas) {
    console.warn('Background canvas not found')
    return
  }

  try {
    const dpr = Math.max(1, window.devicePixelRatio)
    
    // Setup canvas sizing
    const resize = () => {
      const { innerWidth: width, innerHeight: height } = window
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      
      if (backgroundRenderer) {
        backgroundRenderer.updateScale(dpr)
      }
    }

    // Initialize renderer
    backgroundRenderer = new BackgroundRenderer(canvas, dpr)
    backgroundRenderer.setup()
    backgroundRenderer.init()
    
    // Setup resize handling
    resize()
    window.addEventListener('resize', resize)
    
    // Test default shader and start rendering
    if (backgroundRenderer.test(backgroundRenderer.defaultSource) === null) {
      // Shader is valid, start render loop
      const loop = (now: number) => {
        if (backgroundRenderer) {
          backgroundRenderer.render(now)
        }
        animationId = requestAnimationFrame(loop)
      }
      loop(0)
      
      console.log('Background renderer started successfully')
    } else {
      console.error('Default background shader failed to compile')
    }
    
    // Setup mouse interaction (optional)
    setupMouseInteraction(canvas)
    
  } catch (error) {
    console.error('Failed to initialize background renderer:', error)
    // Fallback: hide the canvas if WebGL2 isn't supported
    canvas.style.display = 'none'
  }
}

export function destroyBackground(): void {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  
  if (backgroundRenderer) {
    backgroundRenderer.destroy()
    backgroundRenderer = null
  }
}

function setupMouseInteraction(canvas: HTMLCanvasElement): void {
  let isMouseDown = false
  let pointers: { x: number; y: number }[] = []
  
  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    isMouseDown = true
    updateMousePosition(e)
  })
  
  canvas.addEventListener('mouseup', () => {
    isMouseDown = false
    if (backgroundRenderer) {
      backgroundRenderer.updateMouse([0, 0])
    }
  })
  
  canvas.addEventListener('mousemove', (e) => {
    if (isMouseDown) {
      updateMousePosition(e)
    }
  })
  
  // Touch events
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault()
    updateTouchPositions(e)
  })
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault()
    updateTouchPositions(e)
  })
  
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault()
    updateTouchPositions(e)
  })
  
  function updateMousePosition(e: MouseEvent): void {
    if (!backgroundRenderer) return
    
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = 1.0 - (e.clientY - rect.top) / rect.height // Flip Y coordinate
    
    backgroundRenderer.updateMouse([x, y])
  }
  
  function updateTouchPositions(e: TouchEvent): void {
    if (!backgroundRenderer) return
    
    const rect = canvas.getBoundingClientRect()
    pointers = []
    
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i]
      const x = (touch.clientX - rect.left) / rect.width
      const y = 1.0 - (touch.clientY - rect.top) / rect.height // Flip Y coordinate
      pointers.push({ x, y })
    }
    
    // Update renderer with touch data
    const coords: number[] = []
    pointers.forEach(p => {
      coords.push(p.x, p.y)
    })
    
    backgroundRenderer.updatePointerCount(pointers.length)
    backgroundRenderer.updatePointerCoords(coords)
  }
}

// Export renderer for advanced usage
export function getBackgroundRenderer(): BackgroundRenderer | null {
  return backgroundRenderer
}