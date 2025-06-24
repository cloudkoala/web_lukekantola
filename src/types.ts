// Shared type definitions

export interface ModelConfig {
  fileName: string
  gaussianSplatFile?: string
  displayName: string
  renderType: 'point-cloud' | 'gaussian-splat'
  defaultPointSize: number
  defaultFocalLength: number
  rotation?: {
    x: number
    y: number
    z: number
  }
  highQualityPosition?: {
    cameraPosition: { x: number, y: number, z: number }
    target: { x: number, y: number, z: number }
    focalLength: number
  }
  loadingAnimation: {
    startPosition: { x: number, y: number, z: number }
    endPosition: { x: number, y: number, z: number }
    target: { x: number, y: number, z: number }
    duration: number
  }
  footerPosition: {
    cameraPosition: { x: number, y: number, z: number }
    target: { x: number, y: number, z: number }
    duration: number
  }
  idleRotation: {
    speed: number
    direction: number
  }
  autoRotationSpeed?: number
}

export interface ModelsConfig {
  basePaths: {
    pointcloud: string
    gsplat: string
  }
  models: { [key: string]: ModelConfig }
  currentModel: string
}

export interface ProjectData {
  title: string
  description: string
  image: string
  content: string
  tech: string[]
  year: string
  status: string
}

export interface ProjectsConfig {
  projects: { [key: string]: ProjectData }
}

export const InterfaceMode = {
  HOME: 'home',
  REEL: 'reel',
  PROJECTS: 'projects',
  PROJECT_DETAIL: 'project-detail',
  ABOUT: 'about',
  CONTACT: 'contact'
} as const

export type InterfaceMode = typeof InterfaceMode[keyof typeof InterfaceMode]

// Scene sharing and state management
export interface Vector3State {
  x: number
  y: number
  z: number
}

export interface EffectInstanceState {
  id: string
  type: string
  enabled: boolean
  parameters: { [key: string]: number }
  blendMode?: 'normal' | 'add' | 'multiply'
}

export interface SceneState {
  // Core model and quality
  modelKey: string
  quality: 'low' | 'high'
  
  // Camera state
  cameraPosition: Vector3State
  cameraTarget: Vector3State
  focalLength: number
  
  // Effects chain and UI state
  effectsChain: EffectInstanceState[]
  effectsDropdownValue: string // The value shown in the effects dropdown (preset name or "none")
  
  // Scene settings
  pointSize: number
  sphereMode: boolean
  sphereRadius?: number
  fogDensity: number
  autoRotation: boolean
  autoRotationSpeed: number
  autoRotationDirection: number
  
  // Metadata
  timestamp: number
  version: string
}

export interface SceneCollection {
  scenes: { [key: string]: SceneDefinition }
  randomScenes: string[]
  defaultScene?: string
}

export interface SceneDefinition extends SceneState {
  name: string
  description?: string
  thumbnail?: string
  tags?: string[]
  creator?: string
}