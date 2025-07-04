export class LoadingSpinner {
  private container: HTMLElement
  private svg: SVGElement
  private isVisible = false

  constructor(container: HTMLElement) {
    this.container = container
    this.createSpinner()
  }

  private createSpinner() {
    // Create SVG container
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.svg.setAttribute('viewBox', '0 0 200 200')
    this.svg.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100px;
      height: 100px;
      z-index: 10;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.3s ease;
    `
    
    // Start visible so animations begin immediately
    this.isVisible = true

    const center = { x: 100, y: 100 }
    const circleColor = '#ffffff'
    const circleSize = 3
    const amp = 12

    // Create nucleus (center circle)
    const nucleus = this.createNucleus(center.x, center.y, circleSize, circleColor)
    this.svg.appendChild(nucleus)

    // Create crests (animated rings)
    const crests = [
      { count: 8, offset: false },
      { count: 16, offset: false },
      { count: 16, offset: true },
      { count: 16, offset: false },
      { count: 16, offset: true },
      { count: 16, offset: false },
    ]

    crests.forEach(({ count, offset }, idx) => {
      const crest = this.createCrest(
        count,
        circleSize,
        amp + amp * idx,
        center,
        offset,
        0.8 * (idx + 1) / crests.length,
        circleColor
      )
      this.svg.appendChild(crest)
    })

    this.container.appendChild(this.svg)
  }

  private createNucleus(x: number, y: number, r: number, fill: string): SVGCircleElement {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', x.toString())
    circle.setAttribute('cy', y.toString())
    circle.setAttribute('r', r.toString())
    circle.setAttribute('fill', fill)

    // Animate nucleus
    this.animateElement(circle, {
      attributeName: 'r',
      values: `${r};${r/8};${r}`,
      dur: '1s',
      repeatCount: 'indefinite'
    })

    return circle
  }

  private createCrest(
    count: number,
    circleSize: number,
    radius: number,
    center: { x: number, y: number },
    offset: boolean,
    delay: number,
    fill: string
  ): SVGGElement {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    const theta = 2 * Math.PI / count
    const delta = offset ? theta / 2 : 0

    for (let i = 0; i < count; i++) {
      const startLocation = this.getLocation(theta, delta, i, radius, center)
      const endLocation = this.getLocation(theta, delta, i, radius * 0.5, center)
      
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('cx', startLocation.x.toString())
      circle.setAttribute('cy', startLocation.y.toString())
      circle.setAttribute('r', circleSize.toString())
      circle.setAttribute('fill', fill)
      circle.setAttribute('stroke-width', (circleSize * 0.2).toString())

      // Animate position and size
      this.animateElement(circle, {
        attributeName: 'cx',
        values: `${startLocation.x};${endLocation.x};${startLocation.x}`,
        dur: '1s',
        repeatCount: 'indefinite',
        begin: `${delay}s`
      })

      this.animateElement(circle, {
        attributeName: 'cy', 
        values: `${startLocation.y};${endLocation.y};${startLocation.y}`,
        dur: '1s',
        repeatCount: 'indefinite',
        begin: `${delay}s`
      })

      this.animateElement(circle, {
        attributeName: 'r',
        values: `${circleSize};${circleSize/8};${circleSize}`,
        dur: '1s',
        repeatCount: 'indefinite',
        begin: `${delay}s`
      })

      group.appendChild(circle)
    }

    return group
  }

  private getLocation(
    theta: number,
    delta: number,
    idx: number,
    r: number,
    center: { x: number, y: number }
  ): { x: number, y: number } {
    const angle = delta + theta * idx
    const x = r * Math.cos(angle)
    const y = r * Math.sin(angle)
    return {
      x: center.x + x,
      y: center.y - y
    }
  }

  private animateElement(element: SVGElement, attributes: {
    attributeName: string
    values: string
    dur: string
    repeatCount: string
    begin?: string
  }) {
    const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate')
    animate.setAttribute('attributeName', attributes.attributeName)
    animate.setAttribute('values', attributes.values)
    animate.setAttribute('dur', attributes.dur)
    animate.setAttribute('repeatCount', attributes.repeatCount)
    
    // Always start immediately, but use calcMode for delays
    if (attributes.begin) {
      animate.setAttribute('begin', `0s; ${attributes.begin}`)
    } else {
      animate.setAttribute('begin', '0s')
    }
    
    element.appendChild(animate)
    
    // Force animation to start by triggering the SVG
    requestAnimationFrame(() => {
      animate.beginElement()
    })
  }

  show() {
    if (!this.isVisible) {
      this.isVisible = true
      this.svg.style.opacity = '1'
      
      // Force all animations to restart immediately
      const animations = this.svg.querySelectorAll('animate')
      animations.forEach(anim => {
        anim.beginElement()
      })
    }
  }

  hide() {
    if (this.isVisible) {
      this.isVisible = false
      this.svg.style.opacity = '0'
    }
  }

  destroy() {
    if (this.svg && this.svg.parentNode) {
      this.svg.parentNode.removeChild(this.svg)
    }
  }
}