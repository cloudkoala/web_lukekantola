import type { SceneState } from '../types'

/**
 * PNG Metadata Utilities for Scene Gallery System
 * 
 * This module provides functionality to embed and extract scene state data
 * in PNG files using PNG text chunks (tEXt). This allows PNG images to carry
 * complete scene configuration as metadata.
 */

// Constants for PNG metadata
const SCENE_METADATA_KEY = 'SceneState'
const VERSION_KEY = 'SceneVersion'
const CURRENT_VERSION = '1.0'

/**
 * Interface for PNG metadata
 */
export interface PngMetadata {
  sceneState: SceneState
  version: string
  timestamp: number
}

/**
 * PNG file signature and chunk type constants
 */
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const TEXT_CHUNK_TYPE = 'tEXt'

/**
 * Creates a PNG tEXt chunk containing scene metadata
 */
function createTextChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword)
  const textBytes = new TextEncoder().encode(text)
  const dataLength = keywordBytes.length + 1 + textBytes.length // +1 for null separator
  
  // Create chunk
  const chunk = new Uint8Array(4 + 4 + dataLength + 4) // length + type + data + CRC
  const view = new DataView(chunk.buffer)
  
  // Write length (big-endian)
  view.setUint32(0, dataLength, false)
  
  // Write chunk type
  chunk.set(new TextEncoder().encode(TEXT_CHUNK_TYPE), 4)
  
  // Write data (keyword + null + text)
  let offset = 8
  chunk.set(keywordBytes, offset)
  offset += keywordBytes.length
  chunk[offset] = 0 // null separator
  offset += 1
  chunk.set(textBytes, offset)
  
  // Calculate and write CRC32
  const crc = calculateCRC32(chunk.slice(4, 4 + 4 + dataLength))
  view.setUint32(4 + 4 + dataLength, crc, false)
  
  return chunk
}

/**
 * Simple CRC32 implementation for PNG chunks
 */
function calculateCRC32(data: Uint8Array): number {
  const crcTable = new Array(256)
  
  // Build CRC table
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1)
      } else {
        c = c >>> 1
      }
    }
    crcTable[i] = c
  }
  
  let crc = 0 ^ (-1)
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF]
  }
  return (crc ^ (-1)) >>> 0
}

/**
 * Embeds scene state metadata into a PNG file
 */
export function embedSceneMetadata(pngBuffer: ArrayBuffer, sceneState: SceneState): ArrayBuffer {
  const originalData = new Uint8Array(pngBuffer)
  
  // Verify PNG signature
  if (!isPngFile(originalData)) {
    throw new Error('Invalid PNG file format')
  }
  
  // Create metadata chunks
  const sceneDataChunk = createTextChunk(
    SCENE_METADATA_KEY, 
    JSON.stringify(sceneState)
  )
  const versionChunk = createTextChunk(VERSION_KEY, CURRENT_VERSION)
  
  // Find IEND chunk position (last chunk in PNG)
  const iendPosition = findIENDChunk(originalData)
  if (iendPosition === -1) {
    throw new Error('Invalid PNG file: IEND chunk not found')
  }
  
  // Create new PNG with embedded metadata
  const newSize = originalData.length + sceneDataChunk.length + versionChunk.length
  const newData = new Uint8Array(newSize)
  
  // Copy original data up to IEND chunk
  newData.set(originalData.slice(0, iendPosition))
  
  // Insert metadata chunks before IEND
  let offset = iendPosition
  newData.set(sceneDataChunk, offset)
  offset += sceneDataChunk.length
  newData.set(versionChunk, offset)
  offset += versionChunk.length
  
  // Copy IEND chunk
  newData.set(originalData.slice(iendPosition), offset)
  
  return newData.buffer
}

/**
 * Extracts scene state metadata from a PNG file
 */
export function extractSceneMetadata(pngBuffer: ArrayBuffer): PngMetadata | null {
  const data = new Uint8Array(pngBuffer)
  
  // Verify PNG signature
  if (!isPngFile(data)) {
    return null
  }
  
  const chunks = parseTextChunks(data)
  const sceneData = chunks[SCENE_METADATA_KEY]
  const version = chunks[VERSION_KEY] || '1.0'
  
  if (!sceneData) {
    return null
  }
  
  try {
    const sceneState = JSON.parse(sceneData) as SceneState
    
    // Validate required fields
    if (!sceneState.modelKey || !sceneState.cameraPosition || !sceneState.cameraTarget) {
      console.warn('Invalid scene state in PNG metadata')
      return null
    }
    
    return {
      sceneState,
      version,
      timestamp: sceneState.timestamp || Date.now()
    }
  } catch (error) {
    console.error('Error parsing scene metadata from PNG:', error)
    return null
  }
}

/**
 * Checks if a file is a valid PNG
 */
function isPngFile(data: Uint8Array): boolean {
  if (data.length < 8) return false
  
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (data[i] !== PNG_SIGNATURE[i]) {
      return false
    }
  }
  return true
}

/**
 * Finds the position of the IEND chunk in a PNG file
 */
function findIENDChunk(data: Uint8Array): number {
  let offset = 8 // Skip PNG signature
  
  while (offset < data.length - 8) {
    const view = new DataView(data.buffer, offset)
    const chunkLength = view.getUint32(0, false) // big-endian
    const chunkType = new TextDecoder().decode(data.slice(offset + 4, offset + 8))
    
    if (chunkType === 'IEND') {
      return offset
    }
    
    // Move to next chunk
    offset += 4 + 4 + chunkLength + 4 // length + type + data + CRC
  }
  
  return -1
}

/**
 * Parses all tEXt chunks from a PNG file
 */
function parseTextChunks(data: Uint8Array): Record<string, string> {
  const chunks: Record<string, string> = {}
  let offset = 8 // Skip PNG signature
  
  while (offset < data.length - 8) {
    const view = new DataView(data.buffer, offset)
    const chunkLength = view.getUint32(0, false)
    const chunkType = new TextDecoder().decode(data.slice(offset + 4, offset + 8))
    
    if (chunkType === TEXT_CHUNK_TYPE) {
      const chunkData = data.slice(offset + 8, offset + 8 + chunkLength)
      const nullIndex = chunkData.indexOf(0)
      
      if (nullIndex !== -1) {
        const keyword = new TextDecoder().decode(chunkData.slice(0, nullIndex))
        const text = new TextDecoder().decode(chunkData.slice(nullIndex + 1))
        chunks[keyword] = text
      }
    }
    
    if (chunkType === 'IEND') {
      break
    }
    
    // Move to next chunk
    offset += 4 + 4 + chunkLength + 4
  }
  
  return chunks
}

/**
 * Validates that a file appears to be a PNG with valid scene metadata
 */
export function validateScenePng(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer
        if (!buffer) {
          resolve(false)
          return
        }
        
        const metadata = extractSceneMetadata(buffer)
        resolve(metadata !== null)
      } catch (error) {
        console.error('Error validating PNG file:', error)
        resolve(false)
      }
    }
    
    reader.onerror = () => resolve(false)
    reader.readAsArrayBuffer(file.slice(0, 64 * 1024)) // Read first 64KB for validation
  })
}

/**
 * Creates a filename for a scene PNG based on metadata
 */
export function generateSceneFilename(sceneState: SceneState, customName?: string): string {
  if (customName) {
    // Sanitize custom name
    const sanitized = customName.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${sanitized}.png`
  }
  
  // Auto-generate filename
  const timestamp = Date.now()
  const modelKey = sceneState.modelKey || 'unknown'
  return `scene_${timestamp}_${modelKey}.png`
}

/**
 * Gets scene info for display purposes
 */
export function getSceneInfo(metadata: PngMetadata): {
  name: string
  model: string
  effects: number
  timestamp: Date
} {
  const { sceneState } = metadata
  
  return {
    name: sceneState.name || 'Untitled Scene',
    model: sceneState.modelKey || 'Unknown Model',
    effects: sceneState.effectsChain?.length || 0,
    timestamp: new Date(metadata.timestamp)
  }
}