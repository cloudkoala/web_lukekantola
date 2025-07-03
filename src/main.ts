import './style-simple.css' // TESTING WITH SIMPLE CSS
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ContentLoader } from './interface'
import { initializeSimpleBackground, updateBackgroundScroll } from './simpleBackground'
import { CursorSobelEffect } from './CursorSobelEffect'

// DOM elements
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!
const zoomSlider = document.querySelector<HTMLInputElement>('#zoom-slider')!

// Global state
let currentModel: THREE.Points | null = null
let controls: OrbitControls
let cursorEffect: CursorSobelEffect | null = null

// Mouse position for cursor-based rotation
let mousePosition = { x: 0, y: 0 }
let isMouseOverCanvas = false

// Three.js setup - RE-ENABLED
const scene = new THREE.Scene()
// Set solid background color instead of transparent to prevent noise showing through 3D model
scene.background = new THREE.Color(0x5d5fa2) // Blue background color (matches hero section)

// Remove fog since we want transparency
// scene.fog = new THREE.FogExp2(backgroundColor.getHex(), 0.003)

const camera = new THREE.PerspectiveCamera(
  75, 
  window.innerWidth / window.innerHeight, 
  0.01,
  500
)

const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas,
  antialias: true,
  alpha: true
})
renderer.setClearColor(0x5d5fa2, 1) // Solid blue clear color (matches background)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// OrbitControls will be initialized after camera positioning

// Basic lighting - RE-ENABLED
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
directionalLight.position.set(5, 5, 5)
scene.add(directionalLight)

// ALL THREE.JS AND EVENT LISTENERS DISABLED FOR TESTING
/*
// COMPLETELY DISABLE OrbitControls for now to test scrolling
// const controls = new OrbitControls(camera, canvas)

// Temporary simple auto-rotation without controls
let autoRotationAngle = 0

// Section tracking for header updates
function updateCurrentSection() {
  const currentSection = document.getElementById('current-section')
  if (!currentSection) return

  const sections = ['hero', 'reel', 'projects', 'about', 'contact']
  const scrollPosition = window.scrollY
  
  // Find which section is currently in view
  for (const sectionId of sections) {
    const section = document.getElementById(sectionId)
    if (section) {
      const rect = section.getBoundingClientRect()
      const isInView = rect.top <= 100 && rect.bottom >= 100
      
      if (isInView) {
        if (sectionId === 'hero') {
          currentSection.innerHTML = ''
        } else {
          currentSection.innerHTML = `<span class="green-text">/</span>${sectionId}`
        }
        break
      }
    }
  }
}

// Listen for scroll events to update current section
window.addEventListener('scroll', updateCurrentSection)
*/

// Fisher model configuration - RE-ENABLED
const FISHER_CONFIG = {
  fileName: "Fisher_001_6.ply",
  displayName: "Fisher Towers",
  defaultPointSize: 0.01,
  defaultFocalLength: 152, // Focal length in mm (from PNG metadata)
  cameraPosition: { x: 0, y: 3.544, z: 7.131 }, // Changed x from -7.508 to 0
  target: { x: 0.3, y: 0.8, z: 0.4 }
}

// Store initial camera data for zoom calculations
let initialCameraDistance: number
let initialCameraPosition: THREE.Vector3
let cameraTarget: THREE.Vector3
let cameraDirection: THREE.Vector3

// Simple Fisher model loading
async function loadFisherModel() {
  try {
    console.log('Loading Fisher model...')
    
    const loader = new PLYLoader()
    const geometry = await loader.loadAsync(`models/base/pointcloud/${FISHER_CONFIG.fileName}`)
    
    // Enhance vertex colors
    if (geometry.attributes.color) {
      const colors = geometry.attributes.color.array as Float32Array
      for (let i = 0; i < colors.length; i += 3) {
        let r = colors[i] * 1.8
        let g = colors[i + 1] * 1.8
        let b = colors[i + 2] * 1.8
        
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        const saturationBoost = 1.2
        r = gray + saturationBoost * (r - gray)
        g = gray + saturationBoost * (g - gray)
        b = gray + saturationBoost * (b - gray)
        
        colors[i] = Math.min(1.0, r)
        colors[i + 1] = Math.min(1.0, g)
        colors[i + 2] = Math.min(1.0, b)
      }
      geometry.attributes.color.needsUpdate = true
    }
    
    const material = new THREE.PointsMaterial({
      size: FISHER_CONFIG.defaultPointSize,
      vertexColors: true,
      sizeAttenuation: true
    })
    
    currentModel = new THREE.Points(geometry, material)
    scene.add(currentModel)
    
    console.log('Fisher model loaded successfully')
    
  } catch (error) {
    console.error('Error loading Fisher model:', error)
  }
}

/*
// Load Fisher model
async function loadFisherModel() {
  try {
    progressEl.style.display = 'flex'
    
    const loader = new PLYLoader()
    const geometry = await loader.loadAsync(`models/base/pointcloud/${FISHER_CONFIG.fileName}`)
    
    // Enhance vertex colors for better saturation and brightness
    if (geometry.attributes.color) {
      const colors = geometry.attributes.color.array as Float32Array
      for (let i = 0; i < colors.length; i += 3) {
        // Increase brightness (multiply by 1.8 like sandbox)
        let r = colors[i] * 1.8
        let g = colors[i + 1] * 1.8
        let b = colors[i + 2] * 1.8
        
        // Increase saturation
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        const saturationBoost = 1.2
        r = gray + saturationBoost * (r - gray)
        g = gray + saturationBoost * (g - gray)
        b = gray + saturationBoost * (b - gray)
        
        // Clamp to prevent oversaturation
        colors[i] = Math.min(1.0, r)
        colors[i + 1] = Math.min(1.0, g)
        colors[i + 2] = Math.min(1.0, b)
      }
      geometry.attributes.color.needsUpdate = true
    }
    
    // Create material for points
    const material = new THREE.PointsMaterial({
      size: FISHER_CONFIG.defaultPointSize,
      vertexColors: true,
      sizeAttenuation: true
    })
    
    // Create points mesh
    currentModel = new THREE.Points(geometry, material)
    scene.add(currentModel)
    
    // Don't center the model to match sandbox behavior
    
    // Position camera
    camera.position.set(
      FISHER_CONFIG.cameraPosition.x,
      FISHER_CONFIG.cameraPosition.y,
      FISHER_CONFIG.cameraPosition.z
    )
    
    // Set camera to look at target (no controls for now)
    camera.lookAt(
      FISHER_CONFIG.target.x,
      FISHER_CONFIG.target.y,
      FISHER_CONFIG.target.z
    )
    
    // Convert focal length to FOV (same as sandbox)
    const sensorWidth = 36 // mm (35mm film standard)
    const fovRadians = 2 * Math.atan(sensorWidth / (2 * FISHER_CONFIG.defaultFocalLength))
    const fovDegrees = fovRadians * (180 / Math.PI)
    
    camera.fov = fovDegrees
    camera.updateProjectionMatrix()
    
    console.log(`Focal length: ${FISHER_CONFIG.defaultFocalLength}mm, FOV: ${fovDegrees.toFixed(1)}°`)
    
    // Initialize camera data for zoom functionality
    initialCameraPosition = new THREE.Vector3(FISHER_CONFIG.cameraPosition.x, FISHER_CONFIG.cameraPosition.y, FISHER_CONFIG.cameraPosition.z)
    cameraTarget = new THREE.Vector3(FISHER_CONFIG.target.x, FISHER_CONFIG.target.y, FISHER_CONFIG.target.z)
    initialCameraDistance = initialCameraPosition.distanceTo(cameraTarget)
    cameraDirection = initialCameraPosition.clone().sub(cameraTarget).normalize()
    
    // Update zoom slider to default (100% = original distance)
    zoomSlider.value = "100"
    
    // Camera setup complete (no controls for now)
    
    console.log('Fisher model loaded successfully')
    
  } catch (error) {
    console.error('Error loading Fisher model:', error)
  } finally {
    progressEl.style.display = 'none'
  }
}

// Store initial camera data for zoom calculations
let initialCameraDistance: number
let initialCameraPosition: THREE.Vector3
let cameraTarget: THREE.Vector3
let cameraDirection: THREE.Vector3

// Store initial camera data for zoom calculations

// Zoom slider event listener
zoomSlider.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement
  const zoomFactor = parseFloat(target.value) / 100 // Convert percentage to factor
  
  // Use current camera position and direction for zoom
  const currentDirection = camera.position.clone().sub(cameraTarget).normalize()
  
  // Always use the initial distance as reference for consistent zoom levels
  const newDistance = initialCameraDistance * zoomFactor
  const newCameraPos = cameraTarget.clone().add(currentDirection.multiplyScalar(newDistance))
  
  // Update camera position
  camera.position.copy(newCameraPos)
  // No controls to update - using direct camera positioning
})


// Hide immediate loading screen
function hideLoadingScreen() {
  const immediateLoading = document.getElementById('immediate-loading')
  if (immediateLoading) {
    immediateLoading.style.opacity = '0'
    setTimeout(() => {
      immediateLoading.style.display = 'none'
    }, 500)
  }
}

// Window resize handler
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

window.addEventListener('resize', onWindowResize)

// Animation loop
function animate() {
  requestAnimationFrame(animate)
  
  // Simple auto-rotation for testing (no controls)
  autoRotationAngle += 0.001
  if (currentModel) {
    currentModel.rotation.y = autoRotationAngle
  }
  
  renderer.render(scene, camera)
}

// Setup navigation event listeners
function setupNavigation() {
  // Hamburger menu toggle
  const hamburgerButton = document.getElementById('hamburger-button')
  const hamburgerDropdown = document.getElementById('hamburger-dropdown')
  
  if (hamburgerButton && hamburgerDropdown) {
    hamburgerButton.addEventListener('click', (e) => {
      e.stopPropagation()
      const isOpen = hamburgerDropdown.classList.contains('open')
      if (isOpen) {
        hamburgerDropdown.classList.remove('open')
        hamburgerButton.classList.remove('active')
      } else {
        hamburgerDropdown.classList.add('open')
        hamburgerButton.classList.add('active')
      }
    })
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!hamburgerButton.contains(e.target as Node) && !hamburgerDropdown.contains(e.target as Node)) {
        hamburgerDropdown.classList.remove('open')
        hamburgerButton.classList.remove('active')
      }
    })
  }
  
  // Smooth scroll navigation function
  function scrollToSection(targetId: string) {
    const targetElement = document.getElementById(targetId)
    if (targetElement) {
      targetElement.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      })
    }
    
    // Close hamburger menu
    if (hamburgerDropdown) {
      hamburgerDropdown.classList.remove('open')
      hamburgerButton?.classList.remove('active')
    }
  }

  // Hamburger menu navigation with smooth scrolling
  const hamburgerReel = document.getElementById('hamburger-reel')
  const hamburgerProjects = document.getElementById('hamburger-projects')
  const hamburgerAbout = document.getElementById('hamburger-about')
  const hamburgerContact = document.getElementById('hamburger-contact')
  
  if (hamburgerReel) {
    hamburgerReel.addEventListener('click', (e) => {
      e.preventDefault()
      scrollToSection('reel')
    })
  }
  
  if (hamburgerProjects) {
    hamburgerProjects.addEventListener('click', (e) => {
      e.preventDefault()
      scrollToSection('projects')
    })
  }
  
  if (hamburgerAbout) {
    hamburgerAbout.addEventListener('click', (e) => {
      e.preventDefault()
      scrollToSection('about')
    })
  }
  
  if (hamburgerContact) {
    hamburgerContact.addEventListener('click', (e) => {
      e.preventDefault()
      scrollToSection('contact')
    })
  }
  
  // Hero navigation arrows
  const navIndicators = document.querySelectorAll('.nav-indicator')
  navIndicators.forEach(indicator => {
    indicator.addEventListener('click', () => {
      const target = indicator.getAttribute('data-target')
      if (target) {
        // Remove the # from target (e.g., "#reel" -> "reel")
        const targetId = target.replace('#', '')
        scrollToSection(targetId)
      }
    })
  })
  
}

*/

// Add click handler for home navigation on subpages only
function setupHomeNavigation() {
  const titleElement = document.querySelector('.title-header h1')
  if (titleElement) {
    titleElement.addEventListener('click', (e) => {
      // Only navigate home if we're on a subpage (scrolling-section is visible)
      const scrollingSection = document.getElementById('scrolling-section')
      if (scrollingSection && scrollingSection.style.display !== 'none') {
        e.preventDefault()
        // Scroll to top (hero section)
        window.scrollTo({ 
          top: 0, 
          behavior: 'smooth' 
        })
      }
    })
  }
}

// Setup mouse tracking for cursor-based rotation
function setupMouseTracking() {
  // Track mouse globally, not just on canvas
  document.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect()
    
    // Check if mouse is over the canvas area
    const isOverCanvas = event.clientX >= rect.left && 
                        event.clientX <= rect.right && 
                        event.clientY >= rect.top && 
                        event.clientY <= rect.bottom
    
    if (isOverCanvas) {
      isMouseOverCanvas = true
      // Normalize mouse position to -1 to 1 range
      mousePosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mousePosition.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    } else {
      isMouseOverCanvas = false
      // Reset to center when mouse is outside canvas
      mousePosition.x = 0
      mousePosition.y = 0
    }
  })
}

// Animation loop with OrbitControls and cursor-based rotation
function animate() {
  requestAnimationFrame(animate)
  
  // Apply subtle cursor-based rotation influence
  if (controls && isMouseOverCanvas) {
    // Calculate target angles based on mouse position
    const mouseInfluence = 0.16 // Strength of mouse influence (0-1) - reduced by 60% from 0.4
    const maxAngleOffset = 7 * Math.PI / 180 // 7 degrees max offset - reduced by 60% from 17.5
    
    // Apply plateau sensitivity: max speed at certain radius, then falloff to edges
    const maxSpeedRadius = 0.6 // Radius where max speed is reached
    const falloffRadius = 0.9 // Radius where speed starts falling off to zero
    
    const distanceFromCenter = Math.sqrt(mousePosition.x * mousePosition.x + mousePosition.y * mousePosition.y)
    
    let speedMultiplier = 1.0
    if (distanceFromCenter <= maxSpeedRadius) {
      // Linear ramp up to max speed
      speedMultiplier = distanceFromCenter / maxSpeedRadius
    } else if (distanceFromCenter <= falloffRadius) {
      // Plateau at max speed
      speedMultiplier = 1.0
    } else {
      // Falloff to zero at canvas edges
      const falloffProgress = (distanceFromCenter - falloffRadius) / (1.0 - falloffRadius)
      speedMultiplier = 1.0 - falloffProgress
      speedMultiplier = Math.max(0, speedMultiplier)
    }
    
    const sensitivityX = mousePosition.x * speedMultiplier
    const sensitivityY = mousePosition.y * speedMultiplier
    
    // Calculate desired azimuth and polar angles based on mouse (inverted with exponential sensitivity)
    const mouseAzimuth = -sensitivityX * maxAngleOffset * mouseInfluence
    const mousePolar = -sensitivityY * maxAngleOffset * mouseInfluence
    
    // Get current camera position relative to target
    const offset = camera.position.clone().sub(controls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    
    // Blend current angles with mouse-influenced angles
    const blendFactor = 0.05 // How quickly to blend (lower = smoother) - increased from 0.02
    const targetAzimuth = spherical.theta + mouseAzimuth
    const targetPolar = spherical.phi + mousePolar
    
    // Apply smooth interpolation
    spherical.theta += (targetAzimuth - spherical.theta) * blendFactor
    spherical.phi += (targetPolar - spherical.phi) * blendFactor
    
    // Respect the existing angle limits
    spherical.theta = Math.max(controls.minAzimuthAngle, Math.min(controls.maxAzimuthAngle, spherical.theta))
    spherical.phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, spherical.phi))
    
    // Update camera position
    offset.setFromSpherical(spherical)
    camera.position.copy(controls.target).add(offset)
  }
  
  // Update controls for damping and auto-rotation
  controls.update()
  
  renderer.render(scene, camera)
}

// Window resize handler
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

window.addEventListener('resize', onWindowResize)

// Setup navigation
function setupNavigation() {
  // Hamburger menu toggle
  const hamburgerButton = document.getElementById('hamburger-button')
  const hamburgerDropdown = document.getElementById('hamburger-dropdown')
  
  if (hamburgerButton && hamburgerDropdown) {
    hamburgerButton.addEventListener('click', (e) => {
      e.stopPropagation()
      hamburgerDropdown.classList.toggle('open')
      hamburgerButton.classList.toggle('active')
    })
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!hamburgerButton.contains(e.target as Node) && !hamburgerDropdown.contains(e.target as Node)) {
        hamburgerDropdown.classList.remove('open')
        hamburgerButton.classList.remove('active')
      }
    })
  }
  
  // Smooth scroll navigation function
  function scrollToSection(targetId: string) {
    const targetElement = document.getElementById(targetId)
    if (targetElement) {
      targetElement.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      })
    }
    
    // Close hamburger menu
    if (hamburgerDropdown) {
      hamburgerDropdown.classList.remove('open')
      hamburgerButton?.classList.remove('active')
    }
  }

  // Navigation button click handlers
  const navButtons = [
    { id: 'hamburger-reel', target: 'reel' },
    { id: 'hamburger-projects', target: 'projects' },
    { id: 'hamburger-about', target: 'about' },
    { id: 'hamburger-contact', target: 'contact' }
  ]
  
  navButtons.forEach(({ id, target }) => {
    const button = document.getElementById(id)
    if (button) {
      button.addEventListener('click', (e) => {
        e.preventDefault()
        scrollToSection(target)
      })
    }
  })
  
}

// Wave-based Section Scroll Indicator
class WaveScrollIndicator {
  private container: HTMLElement
  private scale: HTMLElement
  private sections: string[] = ['hero', 'reel', 'projects', 'about', 'contact']
  private sectionElements: NodeListOf<HTMLElement>
  private markers: HTMLElement[] = []
  private labels: HTMLElement[] = []
  private isHovering: boolean = false
  private hoverStartTime: number = 0
  private lastUpdateTime: number = 0
  
  // Wave travel animation - smoothly interpolated wave center
  private currentWaveCenter: number = 0
  private targetWaveCenter: number = 0
  
  constructor(container: HTMLElement) {
    this.container = container
    this.scale = container.querySelector('.scroll-indicator__scale')!
    this.sectionElements = document.querySelectorAll('section')
    
    this.createSectionIndicators()
    this.setupMouseInteraction()
    
    // Initialize wave center to hero position (0%)
    this.currentWaveCenter = 0
    this.targetWaveCenter = 0
    
    // Initial update to show correct state
    this.updateFromScroll()
  }
  
  private setupMouseInteraction() {
    let isMouseOver = false
    
    this.container.addEventListener('mouseenter', (e) => {
      isMouseOver = true
      const rect = this.container.getBoundingClientRect()
      const mouseY = e.clientY - rect.top
      const mouseX = e.clientX - rect.left
      const mouseProgress = (mouseY / rect.height) * 100
      this.updateFromMouse(mouseProgress, mouseX)
    })
    
    this.container.addEventListener('mouseleave', () => {
      isMouseOver = false
      // Clear all hover styles and restore scroll-based state
      this.clearHoverStyles()
      this.updateFromScroll()
    })
    
    this.container.addEventListener('mousemove', (e) => {
      if (isMouseOver) {
        const rect = this.container.getBoundingClientRect()
        const mouseY = e.clientY - rect.top
        const mouseX = e.clientX - rect.left
        const mouseProgress = (mouseY / rect.height) * 100
        this.updateFromMouse(mouseProgress, mouseX)
      }
    })
    
    // Also listen on the scale element to ensure we catch all mouse events
    this.scale.addEventListener('mouseenter', (e) => {
      isMouseOver = true
      const containerRect = this.container.getBoundingClientRect()
      const mouseY = e.clientY - containerRect.top
      const mouseX = e.clientX - containerRect.left
      const mouseProgress = (mouseY / containerRect.height) * 100
      this.updateFromMouse(mouseProgress, mouseX)
    })
    
    this.scale.addEventListener('mousemove', (e) => {
      if (isMouseOver) {
        const containerRect = this.container.getBoundingClientRect()
        const mouseY = e.clientY - containerRect.top
        const mouseX = e.clientX - containerRect.left
        const mouseProgress = (mouseY / containerRect.height) * 100
        this.updateFromMouse(mouseProgress, mouseX)
      }
    })
    
    this.scale.addEventListener('mouseleave', () => {
      isMouseOver = false
      // Clear all hover styles and restore scroll-based state
      this.clearHoverStyles()
      this.updateFromScroll()
    })
  }
  
  private clearHoverStyles() {
    // Clear hover styles without transitions for instant reset
    this.markers.forEach(marker => {
      marker.style.transition = 'none' // No transition for instant reset
      // Clear stroke styling that was applied during hover
      marker.style.background = 'var(--marker-active)'
      marker.style.border = 'none'
      // Clear stored base width so it gets recalculated fresh next time
      delete marker.dataset.baseWidth
      // Clear hover transition flag
      delete marker.dataset.hoverTransition
    })
    
    // Also clear any text hover styles instantly
    this.labels.forEach(label => {
      if (!label) return // Skip null placeholders
      label.style.transition = 'none' // No transition for instant reset
      // Reset to transparent state - scroll events will set proper values
      label.style.borderColor = `rgba(0, 255, 0, 0)`
      label.style.backgroundColor = `rgba(0, 0, 0, 0)`
    })
    
    // Restore normal transitions after one frame
    requestAnimationFrame(() => {
      this.markers.forEach(marker => {
        marker.style.transition = ''  // Use CSS default
      })
      this.labels.forEach(label => {
        if (!label) return // Skip null placeholders
        label.style.transition = '' // Use CSS default
      })
    })
  }
  
  private createSectionIndicators() {
    // Create evenly spaced pips across the entire height
    const totalPips = 100 // One pip per 1% of height for uniform distribution
    for (let i = 0; i <= totalPips; i++) {
      const position = (i / totalPips) * 100
      const marker = document.createElement('div')
      marker.classList.add('scroll-indicator__marker')
      
      // Find the closest section to this position
      let closestSection = 'hero'
      let minDistance = Infinity
      this.sections.forEach((section, sectionIndex) => {
        const sectionPosition = (sectionIndex / (this.sections.length - 1)) * 100
        const distance = Math.abs(position - sectionPosition)
        if (distance < minDistance) {
          minDistance = distance
          closestSection = section
        }
      })
      
      // Mark as major if this pip is exactly on a section position
      const isOnSection = this.sections.some((section, sectionIndex) => {
        const sectionPosition = (sectionIndex / (this.sections.length - 1)) * 100
        return Math.abs(position - sectionPosition) < 0.5
      })
      
      if (isOnSection) marker.classList.add('scroll-indicator__marker--major')
      
      marker.style.top = `${position}%`
      marker.dataset.section = closestSection
      marker.dataset.offset = '0' // All pips are now at their natural position
      this.scale.appendChild(marker)
      this.markers.push(marker)
    }
    
    // Create section labels at their exact positions (skip hero section)
    this.sections.forEach((section, index) => {
      const position = (index / (this.sections.length - 1)) * 100
      
      if (section === 'hero') {
        // Create a placeholder for hero section to maintain array alignment
        this.labels.push(null)
        return
      }
      
      const label = document.createElement('div')
      label.classList.add('scroll-indicator__section-label')
      label.textContent = section
      label.style.top = `${position}%`
      label.dataset.section = section
      
      // Add click handler for navigation
      label.addEventListener('click', () => {
        this.navigateToSection(section)
      })
      
      this.scale.appendChild(label)
      this.labels.push(label)
    })
  }
  
  private navigateToSection(sectionId: string) {
    const targetElement = document.getElementById(sectionId)
    if (targetElement) {
      targetElement.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      })
    }
  }
  
  private updateFromMouse(mouseProgress: number, mouseX: number) {
    // Hard boundary at 230px (180px + 50px extension)
    const hoverBoundary = 230
    const isInsideHoverArea = mouseX <= hoverBoundary
    
    // Track hover state for scroll conflict resolution
    if (isInsideHoverArea && !this.isHovering) {
      this.isHovering = true
    } else if (!isInsideHoverArea && this.isHovering) {
      this.isHovering = false
      this.clearHoverStyles()
      return
    }
    
    // Simple hover system: if mouse is in the area, apply hover effects
    if (isInsideHoverArea) {
      // Apply simple hover effect to all pips
      this.markers.forEach((marker) => {
        // Get the base width (store if not already stored)
        if (!marker.dataset.baseWidth) {
          marker.dataset.baseWidth = marker.style.width || '4'
        }
        const baseWidth = parseFloat(marker.dataset.baseWidth)
        
        // Simple rules: 
        // 1. If at minimum width (4px), grow by 2px
        // 2. All pips get 15% more opacity
        let newWidth = baseWidth
        if (baseWidth <= 4) {
          newWidth = baseWidth + 2 // Grow by 2px if at minimum
        }
        
        // Apply width change
        marker.style.width = `${newWidth}px`
        
        // Increase opacity by 15% (0.15)
        const currentOpacity = parseFloat(marker.style.opacity || '0.4')
        const newOpacity = Math.min(1.0, currentOpacity + 0.15)
        marker.style.opacity = newOpacity.toString()
      })
    }
  }
  
  private updateFromScroll() {
    // Get current scroll state and update normally
    const sections = ['hero', 'reel', 'projects', 'about', 'contact']
    let activeSection = 'hero'
    
    for (const sectionId of sections) {
      const section = document.getElementById(sectionId)
      if (section) {
        const rect = section.getBoundingClientRect()
        const isInView = rect.top <= 100 && rect.bottom >= 100
        if (isInView) {
          activeSection = sectionId
          break
        }
      }
    }
    
    const scrollProgress = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)
    this.update(activeSection, scrollProgress)
  }

  update(currentSection: string, scrollProgress: number) {
    const currentSectionIndex = this.sections.indexOf(currentSection)
    
    // Calculate detailed scroll position within sections
    let detailedProgress = 0
    if (this.sectionElements.length > 0) {
      const currentSectionEl = document.getElementById(currentSection)
      if (currentSectionEl) {
        const rect = currentSectionEl.getBoundingClientRect()
        const sectionProgress = Math.max(0, Math.min(1, -rect.top / window.innerHeight))
        detailedProgress = (currentSectionIndex + sectionProgress) / (this.sections.length - 1) * 100
      }
    }
    
    // Update target wave center based on scroll
    this.targetWaveCenter = detailedProgress
    
    // Initialize wave center to first scroll position if not set
    if (this.currentWaveCenter === 0 && this.targetWaveCenter > 0) {
      this.currentWaveCenter = this.targetWaveCenter
    }
    
    // Smoothly interpolate current wave center toward target  
    const lerpFactor = 0.1 // Interpolation speed
    const scrollDelta = this.targetWaveCenter - this.currentWaveCenter
    const amplifiedDelta = scrollDelta * 5 // 5x more movement per scroll
    this.currentWaveCenter += amplifiedDelta * lerpFactor
    
    // Update markers with wave effect - use interpolated wave center
    this.markers.forEach(marker => {
      const markerActualPosition = parseFloat(marker.style.top) // Use the actual pip position
      
      // Calculate distance from CURRENT wave center (not target)
      const distance = Math.abs(this.currentWaveCenter - markerActualPosition)
      
      // Wave effect: closer to wave center = higher opacity and bigger
      const waveInfluence = Math.max(0, 25 - distance) / 25
      const baseOpacity = 0.4
      const maxOpacity = 1.0
      const opacity = baseOpacity + (maxOpacity - baseOpacity) * waveInfluence
      
      // Height effect for wave
      const baseHeight = 1
      const maxHeight = 4
      const height = baseHeight + (maxHeight - baseHeight) * waveInfluence
      
      // Width effect for wave  
      const baseWidth = marker.classList.contains('scroll-indicator__marker--major') ? 4 : 4
      const maxWidth = marker.classList.contains('scroll-indicator__marker--major') ? 30 : 26
      const width = baseWidth + (maxWidth - baseWidth) * waveInfluence
      
      marker.style.opacity = opacity.toString()
      marker.style.height = `${height}px`
      marker.style.width = `${width}px`
      
      // Always clear any stored base width so hover recalculates from current scroll state
      delete marker.dataset.baseWidth
    })
    
    // Update section labels with fade effect and position
    this.labels.forEach((label, index) => {
      if (!label) return // Skip null placeholders (hero section)
      
      const labelPosition = (index / (this.sections.length - 1)) * 100
      const distance = Math.abs(this.currentWaveCenter - labelPosition) // Use current wave center for consistency
      
      let opacity = 0.2 // Base opacity
      let isSelected = false
      
      if (distance <= 30) { // Increased from 20 to 30 to include adjacent sections
        // Use a simple continuous function instead of two separate ones
        // Peak at distance=0 (opacity=0.8), fade to base (opacity=0.2) at distance=30
        const normalizedDistance = distance / 30 // 0 to 1
        opacity = 0.2 + (0.6 * (1 - normalizedDistance))
        isSelected = distance <= 5 // Consider "selected" when very close
      }
      
      // Calculate wave influence for this label position using current wave center
      const waveInfluence = Math.max(0, 25 - distance) / 25 // Quicker falloff (30->25)
      
      // Calculate text position based on pip extension with proper wave influence
      const baseTextPosition = 10 // Base position when pip is small
      const maxTextPosition = 32 // Extended position when pip is large (22px further right)
      const textPosition = baseTextPosition + (maxTextPosition - baseTextPosition) * waveInfluence
      
      label.style.opacity = opacity.toString()
      label.style.left = `${textPosition}px`
      
      
      // Add gradual border styling based on wave influence (not just selection)
      if (distance <= 30) { // Increased from 20 to 30
        // Apply border effects gradually across the wave range
        let borderIntensity = 0
        if (isSelected) {
          // Strong border for selected (distance <= 5)
          borderIntensity = Math.max(0, (5 - distance) / 5) * 0.15
        } else if (distance <= 25) { // Increased from 15 to 25 to catch adjacent sections
          // Subtle border for nearby items (distance 5-25)
          borderIntensity = Math.max(0, (25 - distance) / 20) * 0.05
        }
        
        label.style.borderColor = `rgba(0, 255, 0, ${borderIntensity})`
        label.style.backgroundColor = `rgba(0, 0, 0, 0)`
      } else {
        label.style.borderColor = `rgba(0, 255, 0, 0)`
        label.style.backgroundColor = `rgba(0, 0, 0, 0)`
      }
    })
  }
}

// Custom Zoom Slider styled like scroll indicator
class CustomZoomSlider {
  private container: HTMLElement
  private scale: HTMLElement
  private pips: HTMLElement[] = []
  private handlePip: HTMLElement | null = null
  private currentValue: number = 130
  private minValue: number = 60
  private maxValue: number = 200
  private isDragging: boolean = false
  
  constructor(container: HTMLElement) {
    this.container = container
    this.scale = container.querySelector('.zoom-slider-scale')!
    
    this.createPips()
    this.setupInteraction()
  }
  
  private createPips() {
    // Create 15 pips distributed across the width (horizontal)
    const totalPips = 15
    for (let i = 0; i <= totalPips; i++) {
      const position = (i / totalPips) * 100
      const pip = document.createElement('div')
      pip.classList.add('zoom-pip')
      pip.style.left = `${position}%`
      
      this.scale.appendChild(pip)
      this.pips.push(pip)
    }
    
    // Set initial handle position
    this.updateHandle()
  }
  
  private setupInteraction() {
    this.container.addEventListener('mousedown', (e) => {
      this.isDragging = true
      this.updateValueFromMouse(e)
      document.addEventListener('mousemove', this.handleMouseMove)
      document.addEventListener('mouseup', this.handleMouseUp)
    })
  }
  
  private handleMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      this.updateValueFromMouse(e)
    }
  }
  
  private handleMouseUp = () => {
    this.isDragging = false
    document.removeEventListener('mousemove', this.handleMouseMove)
    document.removeEventListener('mouseup', this.handleMouseUp)
  }
  
  private updateValueFromMouse(e: MouseEvent) {
    const rect = this.container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const percentage = mouseX / rect.width // Left = min, right = max
    const clampedPercentage = Math.max(0, Math.min(1, percentage))
    
    this.currentValue = this.minValue + (this.maxValue - this.minValue) * clampedPercentage
    this.updateHandle()
    this.triggerZoomChange()
  }
  
  private updateHandle() {
    // Calculate position
    const percentage = (this.currentValue - this.minValue) / (this.maxValue - this.minValue)
    const targetPosition = percentage * 100 // Left = min, right = max
    
    // Update all pips with falloff effect
    this.pips.forEach(pip => {
      // Clear handle class
      pip.classList.remove('zoom-pip--handle')
      
      const pipPosition = parseFloat(pip.style.left)
      const distance = Math.abs(targetPosition - pipPosition)
      
      // Falloff effect: closer to target = bigger and more opaque
      const falloffRadius = 25 // Distance for falloff effect
      const influence = Math.max(0, falloffRadius - distance) / falloffRadius
      
      const baseOpacity = 0.4
      const maxOpacity = 1.0
      const opacity = baseOpacity + (maxOpacity - baseOpacity) * influence
      
      const baseHeight = 4
      const maxHeight = 20
      const height = baseHeight + (maxHeight - baseHeight) * influence
      
      const baseWidth = 1
      const maxWidth = 3
      const width = baseWidth + (maxWidth - baseWidth) * influence
      
      pip.style.opacity = opacity.toString()
      pip.style.height = `${height}px`
      pip.style.width = `${width}px`
    })
    
    // Find closest pip and set as handle
    let closestPip = this.pips[0]
    let minDistance = Infinity
    
    this.pips.forEach(pip => {
      const pipPosition = parseFloat(pip.style.left)
      const distance = Math.abs(targetPosition - pipPosition)
      if (distance < minDistance) {
        minDistance = distance
        closestPip = pip
      }
    })
    
    // Set as handle
    this.handlePip = closestPip
    this.handlePip.classList.add('zoom-pip--handle')
  }
  
  private triggerZoomChange() {
    // Update the hidden range slider to trigger existing zoom logic
    const originalSlider = document.querySelector<HTMLInputElement>('#zoom-slider')
    if (originalSlider) {
      originalSlider.value = this.currentValue.toString()
      originalSlider.dispatchEvent(new Event('input'))
    }
  }
  
  setValue(value: number) {
    this.currentValue = Math.max(this.minValue, Math.min(this.maxValue, value))
    this.updateHandle()
  }
}

// Initialize scroll indicator
let scrollIndicator: WaveScrollIndicator
let zoomSliderCustom: CustomZoomSlider

// Section tracking with smooth scroll-based animation
function updateCurrentSection() {
  const scrollingSection = document.getElementById('scrolling-section')
  const sectionList = document.getElementById('section-list')
  const titleHeader = document.querySelector('.title-header')
  if (!scrollingSection || !sectionList || !titleHeader) return

  const sections = ['hero', 'reel', 'projects', 'about', 'contact']
  const sectionTitles = ['', 'reel', 'projects', 'about', 'contact'] // Empty string for hero position
  
  // Calculate scroll progress through all sections
  const totalHeight = document.documentElement.scrollHeight - window.innerHeight
  const scrollProgress = window.scrollY / totalHeight
  
  // Find current section and calculate precise position within sections
  let activeSection = 'hero'
  let sectionProgress = 0
  
  for (let i = 0; i < sections.length; i++) {
    const section = document.getElementById(sections[i])
    if (section) {
      const rect = section.getBoundingClientRect()
      const isInView = rect.top <= 100 && rect.bottom >= 100
      
      if (isInView) {
        activeSection = sections[i]
        // Calculate progress within this section (0 to 1)
        const sectionTop = rect.top
        const sectionHeight = rect.height
        sectionProgress = Math.max(0, Math.min(1, (100 - sectionTop) / sectionHeight))
        break
      }
    }
  }
  
  // Always show the scrolling section and position based on scroll
  scrollingSection.style.display = 'inline-block'
  
  // Calculate smooth position based on scroll
  const currentSectionIndex = sections.indexOf(activeSection)
  
  // Update header styling based on section
  if (activeSection === 'hero') {
    titleHeader.classList.remove('on-subpage')
  } else {
    titleHeader.classList.add('on-subpage')
  }
  
  // Now the arrays are aligned, so we can use the section index directly
  // Smooth interpolation: combine section index with progress within section
  const smoothPosition = currentSectionIndex + sectionProgress
  const translateY = -(smoothPosition * 1.45) + 0.1 // 1.45rem per section + small offset
  
  // Remove transitions for smooth scroll-based movement
  sectionList.style.transition = 'none'
  sectionList.style.transform = `translateY(${translateY}rem)`
  
  // Update scroll indicator
  if (scrollIndicator) {
    scrollIndicator.update(activeSection, scrollProgress)
  }
  
  // Update background scroll with normalized progress (0 to 1)
  updateBackgroundScroll(scrollProgress)
  
  // Update cursor effect intensity and scroll offset based on scroll position
  if (cursorEffect) {
    cursorEffect.updateScrollIntensity(scrollProgress)
    cursorEffect.updateScrollOffset(scrollProgress)
  }
}

// Initialize application
async function init() {
  console.log('Initializing Three.js with Fisher model...')
  
  // Position camera
  camera.position.set(
    FISHER_CONFIG.cameraPosition.x,
    FISHER_CONFIG.cameraPosition.y,
    FISHER_CONFIG.cameraPosition.z
  )
  camera.lookAt(
    FISHER_CONFIG.target.x,
    FISHER_CONFIG.target.y,
    FISHER_CONFIG.target.z
  )
  
  // Convert focal length to FOV
  const sensorWidth = 36
  const fovRadians = 2 * Math.atan(sensorWidth / (2 * FISHER_CONFIG.defaultFocalLength))
  const fovDegrees = fovRadians * (180 / Math.PI)
  camera.fov = fovDegrees
  camera.updateProjectionMatrix()
  
  // Initialize OrbitControls after camera positioning
  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.enableZoom = false // Disable zoom to use our slider
  controls.enablePan = false // Disable panning to avoid conflicts with scrolling
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.001 // Much slower rotation
  
  // Set the target to match our Fisher model setup
  controls.target.set(
    FISHER_CONFIG.target.x,
    FISHER_CONFIG.target.y,
    FISHER_CONFIG.target.z
  )
  
  // Limit rotation to prevent camera going into -z territory
  controls.minAzimuthAngle = -Math.PI / 2 // -90 degrees
  controls.maxAzimuthAngle = Math.PI / 2   // +90 degrees
  
  // Limit vertical rotation (polar angle) - allow looking straight down, but limit upward view
  controls.minPolarAngle = 0 // Allow looking straight down (0 degrees)
  controls.maxPolarAngle = Math.PI / 2 + (15 * Math.PI / 180) // Limit upward view to 15 degrees below horizontal
  
  controls.update() // Apply the target
  
  // Setup mouse tracking for cursor-based rotation
  setupMouseTracking()
  
  // Setup navigation
  setupNavigation()
  
  // Setup home navigation
  setupHomeNavigation()
  
  // Initialize scroll indicator
  const indicatorElement = document.getElementById('sectionIndicator')
  if (indicatorElement) {
    scrollIndicator = new WaveScrollIndicator(indicatorElement)
  }
  
  // Initialize custom zoom slider
  const zoomSliderElement = document.getElementById('zoom-slider-container')
  if (zoomSliderElement) {
    zoomSliderCustom = new CustomZoomSlider(zoomSliderElement)
  }
  
  // Listen for scroll events to update current section
  window.addEventListener('scroll', updateCurrentSection)
  updateCurrentSection() // Initial call
  
  // Initialize simple WebGL background renderer
  try {
    initializeSimpleBackground()
    console.log('Simple background renderer initialized')
  } catch (error) {
    console.warn('Background renderer failed to initialize:', error)
  }

  // Initialize cursor sobel effect on homepage
  try {
    cursorEffect = new CursorSobelEffect(document.body)
    console.log('Cursor sobel effect active on homepage')
  } catch (error) {
    console.warn('Cursor sobel effect failed to initialize:', error)
  }
  
  // Start animation loop
  animate()
  
  // Initialize camera data for zoom functionality
  initialCameraPosition = new THREE.Vector3(
    FISHER_CONFIG.cameraPosition.x,
    FISHER_CONFIG.cameraPosition.y,
    FISHER_CONFIG.cameraPosition.z
  )
  cameraTarget = new THREE.Vector3(
    FISHER_CONFIG.target.x,
    FISHER_CONFIG.target.y,
    FISHER_CONFIG.target.z
  )
  initialCameraDistance = initialCameraPosition.distanceTo(cameraTarget)
  cameraDirection = initialCameraPosition.clone().sub(cameraTarget).normalize()
  
  // Setup zoom slider
  const zoomSlider = document.querySelector<HTMLInputElement>('#zoom-slider')
  if (zoomSlider) {
    zoomSlider.value = "130" // Default zoom at 50% (130 is 50% between 60-200)
    zoomSlider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement
      const zoomFactor = parseFloat(target.value) / 100
      
      // Calculate new camera position based on zoom
      const currentDirection = camera.position.clone().sub(cameraTarget).normalize()
      const newDistance = initialCameraDistance * zoomFactor
      const newCameraPos = cameraTarget.clone().add(currentDirection.multiplyScalar(newDistance))
      
      camera.position.copy(newCameraPos)
    })
  }

  // Cursor effect is now always enabled at max settings
  
  // Load Fisher model
  await loadFisherModel()
  
  console.log('Fisher model loaded with zoom controls - scrolling should still work')
}

// Start the application
init()