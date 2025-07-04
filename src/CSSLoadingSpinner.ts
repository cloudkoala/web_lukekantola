export class CSSLoadingSpinner {
  private container: HTMLElement
  private spinnerElement: HTMLElement
  private isVisible = false

  constructor(container: HTMLElement) {
    this.container = container
    this.createSpinner()
  }

  private createSpinner() {
    // Create main spinner container
    this.spinnerElement = document.createElement('div')
    this.spinnerElement.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100px;
      height: 100px;
      z-index: 10;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
    `

    // Add CSS keyframes for animations
    this.addKeyframes()

    // Create nucleus (center circle)
    const nucleus = this.createNucleus()
    this.spinnerElement.appendChild(nucleus)

    // Create crests (rings) - precise positioning for inner ring
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

    this.container.appendChild(this.spinnerElement)
  }

  private addKeyframes() {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes crest-wave {
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
      width: 4px;
      height: 4px;
      background: #ffffff;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: crest-wave 1s ease-in-out infinite;
      animation-delay: 0s;
      box-shadow: 0 0 1px rgba(255, 255, 255, 0.8);
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
      
      // More precise radius calculation
      const pixelRadius = radius * 0.4 // Scale within 100px container (40% of 50px = max 20px radius)
      const x = 50 + pixelRadius * Math.cos(angle)
      const y = 50 + pixelRadius * Math.sin(angle)

      const dot = document.createElement('div')
      dot.style.cssText = `
        position: absolute;
        width: 2px;
        height: 2px;
        background: #ffffff;
        border-radius: 50%;
        left: ${x}%;
        top: ${y}%;
        transform: translate(-50%, -50%);
        animation: crest-wave 1s ease-in-out infinite;
        animation-delay: ${delay}s;
        box-shadow: 0 0 1px rgba(255, 255, 255, 0.8);
      `
      crest.appendChild(dot)
    }

    return crest
  }

  show() {
    if (!this.isVisible) {
      this.isVisible = true
      this.spinnerElement.style.opacity = '1'
    }
  }

  hide() {
    if (this.isVisible) {
      this.isVisible = false
      this.spinnerElement.style.opacity = '0'
    }
  }

  destroy() {
    if (this.spinnerElement && this.spinnerElement.parentNode) {
      this.spinnerElement.parentNode.removeChild(this.spinnerElement)
    }
  }
}