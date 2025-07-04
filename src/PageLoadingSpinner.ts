export class PageLoadingSpinner {
  private overlay: HTMLElement | null = null
  private spinnerElement: HTMLElement | null = null
  private isVisible = false

  constructor() {
    this.attachToExistingOverlay()
  }

  private attachToExistingOverlay() {
    // Find the existing overlay from HTML
    this.overlay = document.getElementById('page-loading-overlay')
    if (!this.overlay) {
      console.error('Page loading overlay not found in HTML')
      return
    }

    this.createCSSSpinner()
    this.isVisible = true
  }

  private createCSSSpinner() {
    if (!this.overlay) return

    // Create main spinner container
    this.spinnerElement = document.createElement('div')
    this.spinnerElement.style.cssText = `
      width: 150px;
      height: 150px;
      position: relative;
    `

    // Add CSS keyframes for animations
    this.addKeyframes()

    // Create nucleus (center circle)
    const nucleus = this.createNucleus()
    this.spinnerElement.appendChild(nucleus)

    // Create crests (rings) - scaled up for page loading
    const crests = [
      { count: 8, radius: 20, delay: 0.13 },
      { count: 16, radius: 32, delay: 0.26 },
      { count: 16, radius: 44, delay: 0.39, offset: true },
      { count: 16, radius: 56, delay: 0.52 },
      { count: 16, radius: 68, delay: 0.65, offset: true },
      { count: 16, radius: 80, delay: 0.78 }
    ]

    crests.forEach(({ count, radius, delay, offset }) => {
      const crest = this.createCrest(count, radius, delay, offset)
      this.spinnerElement.appendChild(crest)
    })

    // Add loading text
    const loadingText = document.createElement('div')
    loadingText.textContent = 'Loading...'
    loadingText.style.cssText = `
      position: absolute;
      bottom: -50px;
      left: 50%;
      transform: translateX(-50%);
      color: #ffffff;
      font-family: 'Space Mono', monospace;
      font-size: 14px;
      letter-spacing: 0.1em;
      opacity: 0.8;
    `
    this.spinnerElement.appendChild(loadingText)

    this.overlay.appendChild(this.spinnerElement)
  }

  private addKeyframes() {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes page-crest-wave {
        0%, 100% { 
          transform: scale(1) translate(-50%, -50%);
          opacity: 1;
        }
        50% { 
          transform: scale(0.5) translate(-50%, -50%);
          opacity: 0.3;
        }
      }
    `
    document.head.appendChild(style)
  }

  private createNucleus(): HTMLElement {
    const nucleus = document.createElement('div')
    nucleus.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 6px;
      height: 6px;
      background: #ffffff;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: page-crest-wave 1s ease-in-out infinite;
      animation-delay: 0s;
      box-shadow: 0 0 2px rgba(255, 255, 255, 0.8);
    `
    return nucleus
  }

  private createCrest(count: number, radius: number, delay: number, offset = false): HTMLElement {
    const crest = document.createElement('div')
    crest.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      height: 100%;
      transform: translate(-50%, -50%);
    `

    const angleStep = (2 * Math.PI) / count
    const offsetAngle = offset ? angleStep / 2 : 0

    for (let i = 0; i < count; i++) {
      // Start from top (0 degrees = 12 o'clock) for symmetry
      const angle = offsetAngle + angleStep * i - Math.PI / 2
      
      // Scale for larger page spinner
      const pixelRadius = radius * 0.4 
      const x = 50 + pixelRadius * Math.cos(angle)
      const y = 50 + pixelRadius * Math.sin(angle)

      const dot = document.createElement('div')
      dot.style.cssText = `
        position: absolute;
        width: 3px;
        height: 3px;
        background: #ffffff;
        border-radius: 50%;
        left: ${x}%;
        top: ${y}%;
        transform: translate(-50%, -50%);
        animation: page-crest-wave 1s ease-in-out infinite;
        animation-delay: ${delay}s;
        box-shadow: 0 0 1px rgba(255, 255, 255, 0.8);
      `
      crest.appendChild(dot)
    }

    return crest
  }

  hide() {
    if (this.isVisible && this.overlay) {
      this.isVisible = false
      this.overlay.style.opacity = '0'
      
      // Remove from DOM after transition
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay)
        }
      }, 500)
    }
  }

  destroy() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay)
    }
  }
}