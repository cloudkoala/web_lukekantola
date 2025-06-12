declare module '@mkkellogg/gaussian-splats-3d' {
  interface ViewerOptions {
    cameraUp?: number[]
    initialCameraPosition?: number[]
    initialCameraLookAt?: number[]
    canvas?: HTMLCanvasElement
    renderer?: any
    camera?: any
    useBuiltInControls?: boolean
    enableThreeJSRendering?: boolean
    gpuAcceleratedSort?: boolean
    integerBasedSort?: boolean
    halfPrecisionCovariancesOnGPU?: boolean
    enableSplatSorting?: boolean
  }
  
  interface SplatSceneOptions {
    showLoadingUI?: boolean
    progressiveLoad?: boolean
  }
  
  interface DropInViewerOptions {
    selfDrivenMode?: boolean
    useBuiltInControls?: boolean
    rootElement?: HTMLElement
    ignoreDevicePixelRatio?: boolean
    enableThreeJSRendering?: boolean
    cameraUp?: number[]
    initialCameraPosition?: number[]
    initialCameraLookAt?: number[]
  }

  export class Viewer {
    constructor(options?: ViewerOptions)
    splatMesh: any
    start(): void
    addSplatScene(url: string, options?: SplatSceneOptions): Promise<void>
    dispose(): void
  }
  
  export class DropInViewer {
    constructor(options?: DropInViewerOptions)
    splatMesh: any
    addSplatScene(url: string, options?: SplatSceneOptions): Promise<void>
    dispose(): void
  }
}