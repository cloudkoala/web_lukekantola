import * as THREE from 'three'

/**
 * CursorSobelEffect: Creates a circular cursor effect that applies Sobel edge detection
 * to the underlying background within a specified radius around the mouse cursor.
 */
export class CursorSobelEffect {
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private renderTarget: THREE.WebGLRenderTarget
  
  // Full page texture for sampling
  private pageTexture: THREE.Texture | null = null
  private captureCanvas: HTMLCanvasElement
  private captureContext: CanvasRenderingContext2D
  
  // Mouse tracking
  private mousePosition: THREE.Vector2 = new THREE.Vector2(-999, -999)
  private lastValidMousePosition: THREE.Vector2 = new THREE.Vector2(-999, -999)
  private enabled: boolean = true
  private radius: number = 300 // Max radius for optimal effect
  private intensity: number = 1.0 // Max intensity
  private baseRadius: number = 450 // Base radius value (increased by 1.5x from 300)
  private scrollRadius: number = 0.0 // Controlled by scroll position
  
  // Performance and mobile optimization
  private isMobile: boolean = false
  private lastUpdateTime: number = 0
  private updateThrottle: number = 16 // ~60fps
  private isScrolling: boolean = false
  private scrollTimeout: number | null = null
  private scrollOffset: number = 0
  private scrollStartTime: number = 0
  private scrollEndTime: number = 0
  private fadeOutDuration: number = 150 // 150ms fade out
  private fadeInDuration: number = 300 // 300ms fade in
  
  // Animation frame ID
  private animationId: number | null = null

  constructor(container: HTMLElement) {
    // Detect mobile devices
    this.isMobile = this.detectMobileDevice()
    
    // Disable on mobile by default (can be enabled manually)
    if (this.isMobile) {
      this.enabled = false
      this.updateThrottle = 100 // ~10fps on mobile for better performance
    } else {
      this.updateThrottle = 16 // ~60fps on desktop when not scrolling
    }

    // Create overlay canvas
    this.canvas = document.createElement('canvas')
    this.canvas.style.position = 'fixed'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.width = '100vw'
    this.canvas.style.height = '100vh'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.style.zIndex = '-1' // Behind everything - use blend mode to show through
    this.canvas.style.mixBlendMode = 'normal'
    this.canvas.style.display = this.enabled ? 'block' : 'none'
    container.appendChild(this.canvas)

    // Setup page capture canvas
    this.setupPageCapture()
    
    // Setup Three.js components
    this.setupRenderer()
    this.setupScene()
    this.setupShader()
    this.setupEventListeners()
    
    // Start animation loop
    this.animate()
  }

  /**
   * Setup canvas for capturing the full page content
   */
  private setupPageCapture(): void {
    this.captureCanvas = document.createElement('canvas')
    this.captureCanvas.width = window.innerWidth
    this.captureCanvas.height = window.innerHeight
    this.captureContext = this.captureCanvas.getContext('2d')!
  }

  /**
   * Detect if the device is mobile for performance optimization
   */
  private detectMobileDevice(): boolean {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth <= 768
    const hasLimitedPointer = window.matchMedia('(pointer: coarse)').matches
    const hasNoHover = window.matchMedia('(hover: none)').matches
    
    return isTouchDevice && (isSmallScreen || hasLimitedPointer || hasNoHover)
  }

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas, 
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false
    })
    this.renderer.setClearColor(0x000000, 0) // Transparent clear
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  private setupScene(): void {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    
    // Create render target for background sampling
    this.renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth, 
      window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      }
    )
  }

  private setupShader(): void {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uPageTexture: { value: null },
        uMousePosition: { value: this.mousePosition },
        uRadius: { value: this.radius },
        uIntensity: { value: this.intensity },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTime: { value: 0 },
        uScrollOffset: { value: 0 },
        uIsScrolling: { value: 0 },
        uCrossfadeProgress: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uPageTexture;
        uniform vec2 uMousePosition;
        uniform float uRadius;
        uniform float uIntensity;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform float uScrollOffset;
        uniform float uIsScrolling;
        uniform float uCrossfadeProgress;
        
        varying vec2 vUv;

        // Enhanced Sobel edge detection with better visibility
        vec3 sobelFromTexture(sampler2D tex, vec2 uv, vec2 resolution) {
          vec2 texelSize = 1.0 / resolution;
          
          // Use the UV coordinates as-is (assume they're already corrected)
          vec2 correctedUV = uv;
          
          // Sample the 3x3 neighborhood using luminance for better edge detection
          float tl = dot(texture2D(tex, correctedUV + vec2(-texelSize.x, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114)); // top left
          float tm = dot(texture2D(tex, correctedUV + vec2(0.0, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));         // top middle
          float tr = dot(texture2D(tex, correctedUV + vec2(texelSize.x, -texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));  // top right
          float ml = dot(texture2D(tex, correctedUV + vec2(-texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));         // middle left
          float mm = dot(texture2D(tex, correctedUV).rgb, vec3(0.299, 0.587, 0.114));                                   // center
          float mr = dot(texture2D(tex, correctedUV + vec2(texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));          // middle right
          float bl = dot(texture2D(tex, correctedUV + vec2(-texelSize.x, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114)); // bottom left
          float bm = dot(texture2D(tex, correctedUV + vec2(0.0, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));          // bottom middle
          float br = dot(texture2D(tex, correctedUV + vec2(texelSize.x, texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));  // bottom right
          
          // Apply Sobel kernels
          float sobelX = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
          float sobelY = (tl + 2.0 * tm + tr) - (bl + 2.0 * bm + br);
          
          // Calculate gradient magnitude with enhanced contrast
          float gradient = sqrt(sobelX * sobelX + sobelY * sobelY);
          
          // Amplify the gradient for better visibility
          gradient = pow(gradient * 4.0, 1.5);
          gradient = clamp(gradient, 0.0, 1.0);
          
          // Return high-contrast edge detection (bright edges)
          return vec3(gradient);
        }

        void main() {
          // Convert UV to screen coordinates (UV is 0-1, we need pixel coordinates)
          vec2 screenPos = vUv * uResolution;
          
          // Flip Y coordinate to match mouse coordinates (WebGL has Y=0 at bottom, mouse has Y=0 at top)
          screenPos.y = uResolution.y - screenPos.y;
          
          float distance = length(screenPos - uMousePosition);
          
          // Only apply effect within radius
          if (distance > uRadius) {
            discard; // Make transparent outside radius
          }
          
          // Sample full page texture with corrected UV coordinates
          vec2 correctedUV = vec2(vUv.x, 1.0 - vUv.y);
          vec3 pageSample = texture2D(uPageTexture, correctedUV).rgb;
          
          // Apply sobel edge detection with the same corrected UV coordinates
          vec3 edgeColor = sobelFromTexture(uPageTexture, correctedUV, uResolution);
          
          // Create smooth circular falloff with enhanced feathering and overshoot
          float innerRadius = uRadius * 0.35;  // Start feathering much earlier for softer edge (2.5x more feathering: 0.6 -> 0.35)
          float outerRadius = uRadius;
          
          // Create dramatic overshoot effect - extends beyond the main radius with visible bounce
          float overshootRadius = uRadius * 1.4;  // 40% overshoot (much bigger)
          float normalizedDistance = distance / uRadius;
          
          float falloff;
          if (distance <= innerRadius) {
            // Inner core - full intensity
            falloff = 1.0;
          } else if (distance <= outerRadius) {
            // Main feathering zone - smooth fade
            float t = (distance - innerRadius) / (outerRadius - innerRadius);
            falloff = 1.0 - (t * t * (3.0 - 2.0 * t));
          } else if (distance <= overshootRadius) {
            // Overshoot zone - strong reverse gradient ring
            float overshootT = (distance - outerRadius) / (overshootRadius - outerRadius);
            // Create a strong ring effect that peaks in the middle of the overshoot zone
            float ringIntensity = sin(overshootT * 3.14159); // Bell curve
            falloff = 0.4 * ringIntensity; // Much stronger effect (0.4 vs 0.05)
          } else {
            // Beyond overshoot - fully transparent
            falloff = 0.0;
          }
          
          falloff = clamp(falloff, 0.0, 1.0);
          
          // Only render the sobel effect, let the original content show through everywhere else
          vec3 finalColor = pageSample + (edgeColor * uIntensity * falloff * 2.0);
          finalColor = clamp(finalColor, 0.0, 1.0);
          
          // Use the falloff as alpha so areas outside the circle are fully transparent
          // uIsScrolling now contains the fade value (0-1)
          gl_FragColor = vec4(finalColor, falloff * uIsScrolling);
        }
      `
    })

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(this.mesh)
  }

  private setupEventListeners(): void {
    // Mouse movement tracking
    const updateMousePosition = (e: MouseEvent) => {
      // Use screen coordinates directly - let the shader handle the flip
      this.mousePosition.set(e.clientX, e.clientY)
      // Store as last valid position
      this.lastValidMousePosition.copy(this.mousePosition)
      this.material.uniforms.uMousePosition.value = this.mousePosition
    }

    document.addEventListener('mousemove', updateMousePosition)
    
    // Window resize handling
    const handleResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      
      this.renderer.setSize(width, height)
      this.material.uniforms.uResolution.value.set(width, height)
      
      // Update render target size
      this.renderTarget.setSize(width, height)
      
      // Update capture canvas size
      this.captureCanvas.width = width
      this.captureCanvas.height = height
    }

    window.addEventListener('resize', handleResize)

    // Keep cursor effect at last position when mouse leaves window
    document.addEventListener('mouseleave', () => {
      // Don't update mouse position - keep it at last valid location
      // The effect will stay visible at the last cursor position
    })
    
    // Restore cursor tracking when mouse enters window
    document.addEventListener('mouseenter', () => {
      // Effect will naturally update when mouse moves
    })
    
    // Detect scrolling to reduce update frequency during scroll
    window.addEventListener('scroll', () => {
      // If not already scrolling, mark scroll start time
      if (!this.isScrolling) {
        this.scrollStartTime = performance.now()
      }
      
      this.isScrolling = true
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout)
      }
      this.scrollTimeout = window.setTimeout(() => {
        this.isScrolling = false
        this.scrollEndTime = performance.now() // Start crossfade timer
      }, 150) // Consider scrolling finished after 150ms of no scroll events
    })
  }

  /**
   * Capture the full page content (including text and UI) using html2canvas approach
   */
  private async captureFullPage(): Promise<void> {
    try {
      // Get all elements we want to capture (skip our own canvas)
      const elementsToCapture = Array.from(document.body.children).filter(
        el => el !== this.canvas
      )
      
      // Clear the capture canvas
      this.captureContext.clearRect(0, 0, this.captureCanvas.width, this.captureCanvas.height)
      
      // Method 1: Use foreign object in SVG to capture DOM elements
      await this.captureDOMViaSVG()
      
      // Update the texture
      this.updatePageTexture()
      
    } catch (error) {
      console.warn('Page capture failed:', error)
    }
  }

  /**
   * Capture only the specific elements we want
   */
  private async captureDOMViaSVG(): Promise<void> {
    const ctx = this.captureContext
    const w = this.captureCanvas.width
    const h = this.captureCanvas.height
    
    // Clear the canvas first with black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)
    
    try {
      // Capture the background canvas (animated noise)
      const backgroundCanvas = document.querySelector<HTMLCanvasElement>('#background-canvas')
      if (backgroundCanvas) {
        ctx.drawImage(backgroundCanvas, 0, 0, w, h)
      }
      
      // Skip 3D canvas capture to keep Fisher model pristine
      // const mainCanvas = document.querySelector<HTMLCanvasElement>('#canvas')
      
    } catch (error) {
      console.warn('Canvas capture failed:', error)
      // Show clean test pattern
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, w, h)
      
      ctx.fillStyle = '#ffffff'
      ctx.font = '32px Space Mono'
      ctx.textAlign = 'center'
      ctx.fillText('BACKGROUND ONLY', w/2, h/2)
    }
  }
  
  /**
   * Manually render text elements from the DOM
   */
  private renderTextElements(ctx: CanvasRenderingContext2D): void {
    // Find and render the main title
    const titleElement = document.querySelector('.title-header h1')
    if (titleElement) {
      const rect = titleElement.getBoundingClientRect()
      const styles = window.getComputedStyle(titleElement)
      
      ctx.font = `${styles.fontSize} ${styles.fontFamily}`
      ctx.fillStyle = styles.color
      ctx.textAlign = 'left'
      ctx.fillText(titleElement.textContent || '', rect.left, rect.top + rect.height * 0.8)
    }
    
    // Find and render scroll indicator text
    const sectionLabels = document.querySelectorAll('.scroll-indicator__section-label')
    sectionLabels.forEach(label => {
      const rect = label.getBoundingClientRect()
      const styles = window.getComputedStyle(label)
      
      ctx.font = `${styles.fontSize} ${styles.fontFamily}`
      ctx.fillStyle = styles.color
      ctx.textAlign = 'left'
      ctx.fillText(label.textContent || '', rect.left, rect.top + rect.height * 0.8)
    })
  }
  
  /**
   * Render a fallback test pattern
   */
  private renderFallbackPattern(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Create a test gradient background
    const gradient = ctx.createLinearGradient(0, 0, w, h)
    gradient.addColorStop(0, '#1a1a2e')
    gradient.addColorStop(0.5, '#16213e') 
    gradient.addColorStop(1, '#0f3460')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    
    // Add test text
    ctx.fillStyle = '#ffffff'
    ctx.font = '48px Space Mono'
    ctx.textAlign = 'center'
    ctx.fillText('SOBEL ACTIVE', w/2, h/2)
  }

  /**
   * Update the page texture from the capture canvas
   */
  private updatePageTexture(): void {
    const texture = new THREE.CanvasTexture(this.captureCanvas)
    texture.flipY = false  // We handle UV flipping in the shader
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    
    this.pageTexture = texture
    this.material.uniforms.uPageTexture.value = texture
  }

  /**
   * Set the radius of the cursor effect
   */
  setRadius(radius: number): void {
    this.radius = Math.max(20, Math.min(400, radius)) // Clamp between 20-400px (doubled range)
    this.material.uniforms.uRadius.value = this.radius
  }

  /**
   * Set the intensity of the sobel effect
   */
  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity)) // Clamp between 0-1
    this.material.uniforms.uIntensity.value = this.intensity
  }

  /**
   * Update scroll offset for texture alignment
   */
  updateScrollOffset(scrollProgress: number): void {
    this.scrollOffset = scrollProgress
    this.material.uniforms.uScrollOffset.value = scrollProgress
  }

  /**
   * Update radius based on scroll position
   * Top of scroll (hero) = 0 radius, first section below (reel) = full radius
   */
  updateScrollIntensity(scrollProgress: number): void {
    // Convert scroll progress to section-based radius
    // Hero section (0-0.2) = 0 radius
    // Transition (0.2-0.25) = 0 to full radius
    // Reel and beyond (0.25+) = full radius
    
    if (scrollProgress <= 0.2) {
      // Hero section - no effect (0 radius)
      this.scrollRadius = 0.0
    } else if (scrollProgress <= 0.25) {
      // Quick transition from hero to reel - grow radius
      this.scrollRadius = (scrollProgress - 0.2) / 0.05 // 0 to 1 over smaller range
    } else {
      // Reel section and beyond - full radius
      this.scrollRadius = 1.0
    }
    
    this.updateEffectiveRadius()
  }

  /**
   * Update the shader with effective radius (base * scroll)
   */
  private updateEffectiveRadius(): void {
    const effectiveRadius = this.baseRadius * this.scrollRadius
    this.material.uniforms.uRadius.value = effectiveRadius
  }

  /**
   * Enable or disable the cursor effect
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.canvas.style.display = enabled ? 'block' : 'none'
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (!this.enabled) {
      this.animationId = requestAnimationFrame(this.animate)
      return
    }

    const now = performance.now()

    // Update time uniform for potential animations
    this.material.uniforms.uTime.value = now * 0.001
    
    // Update scrolling state in shader with fade transitions
    let scrollFade = 1.0
    
    if (this.isScrolling) {
      // Calculate fade-out progress
      const timeSinceScrollStart = now - this.scrollStartTime
      const fadeOutProgress = Math.min(1.0, timeSinceScrollStart / this.fadeOutDuration)
      scrollFade = 1.0 - fadeOutProgress
    } else if (this.scrollEndTime > 0) {
      // Calculate fade-in progress
      const timeSinceScrollEnd = now - this.scrollEndTime
      const fadeInProgress = Math.min(1.0, timeSinceScrollEnd / this.fadeInDuration)
      scrollFade = fadeInProgress
    }
    
    this.material.uniforms.uIsScrolling.value = scrollFade

    // Capture page content periodically (paused during scroll for performance)
    const scrollThrottle = this.isScrolling ? 500 : this.updateThrottle // Much slower during scroll
    if (now - this.lastUpdateTime > scrollThrottle) {
      this.captureFullPage()
      this.lastUpdateTime = now
    }

    // Render the effect
    this.renderer.render(this.scene, this.camera)
    
    this.animationId = requestAnimationFrame(this.animate)
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }
    
    this.material.dispose()
    this.mesh.geometry.dispose()
    this.renderTarget.dispose()
    this.renderer.dispose()
    
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas)
    }
  }
}