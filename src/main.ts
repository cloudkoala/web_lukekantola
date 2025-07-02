import './style-simple.css' // TESTING WITH SIMPLE CSS
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ContentLoader } from './interface'
import { initializeSimpleBackground } from './simpleBackground'

// DOM elements
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!
const zoomSlider = document.querySelector<HTMLInputElement>('#zoom-slider')!

// Global state
let currentModel: THREE.Points | null = null
let controls: OrbitControls

// Three.js setup - RE-ENABLED
const scene = new THREE.Scene()
// Make scene transparent to show the blue div behind it
scene.background = null

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
renderer.setClearColor(0x000000, 0) // Transparent clear color
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
  cameraPosition: { x: -7.508, y: 3.544, z: 7.131 },
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
  
  // Add click handlers for home navigation
  const homeLink = document.querySelector('#home-path')
  if (homeLink) {
    homeLink.addEventListener('click', (e) => {
      e.preventDefault()
      // Scroll to top (hero section)
      window.scrollTo({ 
        top: 0, 
        behavior: 'smooth' 
      })
    })
  }
}

*/

// Animation loop with OrbitControls
function animate() {
  requestAnimationFrame(animate)
  
  // Update controls for damping
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
  
  // Hero navigation arrows
  const navIndicators = document.querySelectorAll('.nav-indicator')
  navIndicators.forEach(indicator => {
    indicator.addEventListener('click', () => {
      const target = indicator.getAttribute('data-target')
      if (target) {
        const targetId = target.replace('#', '')
        scrollToSection(targetId)
      }
    })
  })
}

// Section tracking for header updates
function updateCurrentSection() {
  const currentSection = document.getElementById('current-section')
  if (!currentSection) return

  const sections = ['hero', 'reel', 'projects', 'about', 'contact']
  
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
  controls.autoRotate = false
  
  // Set the target to match our Fisher model setup
  controls.target.set(
    FISHER_CONFIG.target.x,
    FISHER_CONFIG.target.y,
    FISHER_CONFIG.target.z
  )
  controls.update() // Apply the target
  
  // Setup navigation
  setupNavigation()
  
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
    zoomSlider.value = "100" // Default zoom
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
  
  // Load Fisher model
  await loadFisherModel()
  
  console.log('Fisher model loaded with zoom controls - scrolling should still work')
}

// Start the application
init()