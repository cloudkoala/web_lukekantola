/**
 * Gallery Module for Scene PNG System
 * 
 * This module provides a complete gallery system for managing, displaying,
 * and organizing scene PNG files with embedded metadata.
 */

export { GalleryManager } from './GalleryManager'
export { CameraCapture } from './CameraCapture'
export { 
  embedSceneMetadata,
  extractSceneMetadata,
  validateScenePng,
  generateSceneFilename,
  getSceneInfo
} from './PngMetadata'

export type {
  PngMetadata
} from './PngMetadata'

export type {
  GalleryItem,
  GalleryFilter,
  GalleryStats
} from './GalleryManager'

export type {
  CaptureOptions,
  CaptureProgress
} from './CameraCapture'