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