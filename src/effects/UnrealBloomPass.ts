import * as THREE from 'three'

/**
 * UnrealBloomPass - A high-quality bloom effect inspired by Unreal Engine
 * 
 * This implementation creates a mip map chain of bloom textures and blurs them
 * with different radii. The weighted combination of mips and larger blurs on
 * higher mips provides excellent quality and performance.
 */
export class UnrealBloomPass {
  public strength: number
  public radius: number
  public threshold: number
  public resolution: THREE.Vector2
  public clearColor: THREE.Color
  
  // Render targets for mip chain
  private renderTargetsHorizontal: THREE.WebGLRenderTarget[] = []
  private renderTargetsVertical: THREE.WebGLRenderTarget[] = []
  private renderTargetBright: THREE.WebGLRenderTarget
  private nMips: number = 5
  
  // Materials
  private materialHighPassFilter: THREE.ShaderMaterial
  private separableBlurMaterials: THREE.ShaderMaterial[] = []
  private compositeMaterial: THREE.ShaderMaterial
  private blendMaterial: THREE.ShaderMaterial
  private copyMaterial: THREE.ShaderMaterial
  private copyUniforms: { [uniform: string]: { value: any } }
  private originalCopyUniforms: { [uniform: string]: { value: any } }
  private highPassUniforms: { [uniform: string]: { value: any } }
  
  // Mesh for full screen quad rendering
  private fsQuad: THREE.Mesh
  private quadGeometry: THREE.PlaneGeometry
  private quadCamera: THREE.OrthographicCamera
  private quadScene: THREE.Scene
  
  // Bloom factors for weighted combination of mips
  private bloomTintColors: THREE.Vector3[] = []
  
  // Store old renderer state for restoration
  private oldClearColor: THREE.Color = new THREE.Color()
  private oldClearAlpha: number = 1
  
  constructor(resolution?: THREE.Vector2, strength: number = 1, radius?: number, threshold?: number) {
    this.strength = strength
    this.radius = radius ?? 0.4
    this.threshold = threshold ?? 0.85
    this.resolution = resolution ? new THREE.Vector2(resolution.x, resolution.y) : new THREE.Vector2(256, 256)
    this.clearColor = new THREE.Color(0, 0, 0)
    
    // Initialize render targets
    this.initializeRenderTargets()
    
    // Initialize materials
    this.initializeMaterials()
    
    // Initialize full screen quad
    this.initializeQuad()
  }
  
  private initializeRenderTargets(): void {
    let resx = Math.round(this.resolution.x / 2)
    let resy = Math.round(this.resolution.y / 2)
    
    // Bright pass render target
    this.renderTargetBright = new THREE.WebGLRenderTarget(resx, resy, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    })
    this.renderTargetBright.texture.name = 'UnrealBloomPass.bright'
    
    // Create mip chain render targets
    for (let i = 0; i < this.nMips; i++) {
      const renderTargetHorizontal = new THREE.WebGLRenderTarget(resx, resy, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false
      })
      renderTargetHorizontal.texture.name = `UnrealBloomPass.h${i}`
      this.renderTargetsHorizontal.push(renderTargetHorizontal)
      
      const renderTargetVertical = new THREE.WebGLRenderTarget(resx, resy, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false
      })
      renderTargetVertical.texture.name = `UnrealBloomPass.v${i}`
      this.renderTargetsVertical.push(renderTargetVertical)
      
      resx = Math.round(resx / 2)
      resy = Math.round(resy / 2)
    }
  }
  
  private initializeMaterials(): void {
    // High pass filter material (luminosity threshold)
    this.highPassUniforms = {
      tDiffuse: { value: null },
      luminosityThreshold: { value: this.threshold },
      smoothWidth: { value: 0.01 }
    }
    
    this.materialHighPassFilter = new THREE.ShaderMaterial({
      uniforms: this.highPassUniforms,
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getLuminosityHighPassShader()
    })
    
    // Separable blur materials for different mip levels
    const kernelSizeArray = [3, 5, 7, 9, 11]
    let resx = Math.round(this.resolution.x / 2)
    let resy = Math.round(this.resolution.y / 2)
    
    for (let i = 0; i < this.nMips; i++) {
      this.separableBlurMaterials.push(this.getSeparableBlurMaterial(kernelSizeArray[i]))
      this.separableBlurMaterials[i].uniforms['invSize'].value = new THREE.Vector2(1 / resx, 1 / resy)
      
      resx = Math.round(resx / 2)
      resy = Math.round(resy / 2)
    }
    
    // Composite material for combining mips
    this.compositeMaterial = this.getCompositeMaterial(this.nMips)
    this.compositeMaterial.uniforms['blurTexture1'].value = this.renderTargetsVertical[0].texture
    this.compositeMaterial.uniforms['blurTexture2'].value = this.renderTargetsVertical[1].texture
    this.compositeMaterial.uniforms['blurTexture3'].value = this.renderTargetsVertical[2].texture
    this.compositeMaterial.uniforms['blurTexture4'].value = this.renderTargetsVertical[3].texture
    this.compositeMaterial.uniforms['blurTexture5'].value = this.renderTargetsVertical[4].texture
    this.compositeMaterial.uniforms['bloomStrength'].value = this.strength
    this.compositeMaterial.uniforms['bloomRadius'].value = 0.1
    
    const bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2]
    this.compositeMaterial.uniforms['bloomFactors'].value = bloomFactors
    this.bloomTintColors = [
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1)
    ]
    this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors
    
    // Blend material for additive blending
    this.copyUniforms = {
      tDiffuse: { value: null },
      opacity: { value: 1.0 }
    }
    
    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: this.copyUniforms,
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getCopyShader(),
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true
    })
    
    // Copy material for original image
    this.originalCopyUniforms = {
      tDiffuse: { value: null },
      opacity: { value: 1.0 }
    }
    
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: this.originalCopyUniforms,
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getCopyShader(),
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false
    })
  }
  
  private initializeQuad(): void {
    this.quadGeometry = new THREE.PlaneGeometry(2, 2)
    this.fsQuad = new THREE.Mesh(this.quadGeometry, null)
    
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.quadScene = new THREE.Scene()
    this.quadScene.add(this.fsQuad)
  }
  
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    // Store old renderer state
    renderer.getClearColor(this.oldClearColor)
    this.oldClearAlpha = renderer.getClearAlpha()
    const oldAutoClear = renderer.autoClear
    const oldRenderTarget = renderer.getRenderTarget()
    
    renderer.autoClear = false
    renderer.setClearColor(this.clearColor, 0)
    
    // 1. Extract bright areas with high pass filter
    this.highPassUniforms['tDiffuse'].value = readBuffer.texture
    this.highPassUniforms['luminosityThreshold'].value = this.threshold
    this.fsQuad.material = this.materialHighPassFilter
    
    renderer.setRenderTarget(this.renderTargetBright)
    renderer.clear()
    renderer.render(this.quadScene, this.quadCamera)
    
    // 2. Blur all mips progressively
    let inputRenderTarget = this.renderTargetBright
    
    for (let i = 0; i < this.nMips; i++) {
      this.fsQuad.material = this.separableBlurMaterials[i]
      
      // Horizontal blur
      this.separableBlurMaterials[i].uniforms['colorTexture'].value = inputRenderTarget.texture
      this.separableBlurMaterials[i].uniforms['direction'].value = new THREE.Vector2(1, 0)
      renderer.setRenderTarget(this.renderTargetsHorizontal[i])
      renderer.clear()
      renderer.render(this.quadScene, this.quadCamera)
      
      // Vertical blur
      this.separableBlurMaterials[i].uniforms['colorTexture'].value = this.renderTargetsHorizontal[i].texture
      this.separableBlurMaterials[i].uniforms['direction'].value = new THREE.Vector2(0, 1)
      renderer.setRenderTarget(this.renderTargetsVertical[i])
      renderer.clear()
      renderer.render(this.quadScene, this.quadCamera)
      
      inputRenderTarget = this.renderTargetsVertical[i]
    }
    
    // 3. Composite all mips
    this.fsQuad.material = this.compositeMaterial
    this.compositeMaterial.uniforms['bloomStrength'].value = this.strength
    this.compositeMaterial.uniforms['bloomRadius'].value = this.radius
    this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors
    
    renderer.setRenderTarget(this.renderTargetsHorizontal[0])
    renderer.clear()
    renderer.render(this.quadScene, this.quadCamera)
    
    // 4. Blend additively over the input texture
    this.fsQuad.material = this.blendMaterial
    this.copyUniforms['tDiffuse'].value = this.renderTargetsHorizontal[0].texture
    
    // First copy the original image to the write buffer
    this.originalCopyUniforms['tDiffuse'].value = readBuffer.texture
    this.fsQuad.material = this.copyMaterial
    renderer.setRenderTarget(writeBuffer)
    renderer.clear()
    renderer.render(this.quadScene, this.quadCamera)
    
    // Then additively blend the bloom on top
    this.fsQuad.material = this.blendMaterial
    renderer.render(this.quadScene, this.quadCamera)
    
    // Restore renderer state
    renderer.setClearColor(this.oldClearColor, this.oldClearAlpha)
    renderer.autoClear = oldAutoClear
    renderer.setRenderTarget(oldRenderTarget)
  }
  
  setSize(width: number, height: number): void {
    let resx = Math.round(width / 2)
    let resy = Math.round(height / 2)
    
    this.renderTargetBright.setSize(resx, resy)
    
    for (let i = 0; i < this.nMips; i++) {
      this.renderTargetsHorizontal[i].setSize(resx, resy)
      this.renderTargetsVertical[i].setSize(resx, resy)
      
      this.separableBlurMaterials[i].uniforms['invSize'].value = new THREE.Vector2(1 / resx, 1 / resy)
      
      resx = Math.round(resx / 2)
      resy = Math.round(resy / 2)
    }
  }
  
  dispose(): void {
    for (let i = 0; i < this.renderTargetsHorizontal.length; i++) {
      this.renderTargetsHorizontal[i].dispose()
    }
    
    for (let i = 0; i < this.renderTargetsVertical.length; i++) {
      this.renderTargetsVertical[i].dispose()
    }
    
    this.renderTargetBright.dispose()
    
    for (let i = 0; i < this.separableBlurMaterials.length; i++) {
      this.separableBlurMaterials[i].dispose()
    }
    
    this.compositeMaterial.dispose()
    this.blendMaterial.dispose()
    this.copyMaterial.dispose()
    this.materialHighPassFilter.dispose()
    
    this.quadGeometry.dispose()
  }
  
  private getVertexShader(): string {
    return `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
  }
  
  private getLuminosityHighPassShader(): string {
    return `
      uniform sampler2D tDiffuse;
      uniform float luminosityThreshold;
      uniform float smoothWidth;
      varying vec2 vUv;
      
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        vec3 luma = vec3(0.299, 0.587, 0.114);
        float v = dot(texel.xyz, luma);
        vec4 outputColor = vec4(0.0);
        float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
        outputColor = mix(outputColor, texel, alpha);
        gl_FragColor = outputColor;
      }
    `
  }
  
  private getCopyShader(): string {
    return `
      uniform sampler2D tDiffuse;
      uniform float opacity;
      varying vec2 vUv;
      
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        gl_FragColor = opacity * texel;
      }
    `
  }
  
  private getSeparableBlurMaterial(kernelRadius: number): THREE.ShaderMaterial {
    const coefficients = []
    
    for (let i = 0; i < kernelRadius; i++) {
      coefficients.push(0.39894 * Math.exp(-0.5 * i * i / (kernelRadius * kernelRadius)) / kernelRadius)
    }
    
    return new THREE.ShaderMaterial({
      defines: {
        'KERNEL_RADIUS': kernelRadius
      },
      uniforms: {
        'colorTexture': { value: null },
        'invSize': { value: new THREE.Vector2(0.5, 0.5) },
        'direction': { value: new THREE.Vector2(0.5, 0.5) },
        'gaussianCoefficients': { value: coefficients }
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: `
        #include <common>
        varying vec2 vUv;
        uniform sampler2D colorTexture;
        uniform vec2 invSize;
        uniform vec2 direction;
        uniform float gaussianCoefficients[KERNEL_RADIUS];
        
        void main() {
          float weightSum = gaussianCoefficients[0];
          vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * weightSum;
          
          for(int i = 1; i < KERNEL_RADIUS; i ++) {
            float weight = gaussianCoefficients[i];
            vec2 uvOffset = direction * invSize * float(i);
            vec3 sample1 = texture2D(colorTexture, vUv + uvOffset).rgb;
            vec3 sample2 = texture2D(colorTexture, vUv - uvOffset).rgb;
            diffuseSum += (sample1 + sample2) * weight;
            weightSum += 2.0 * weight;
          }
          
          gl_FragColor = vec4(diffuseSum / weightSum, 1.0);
        }
      `
    })
  }
  
  private getCompositeMaterial(nMips: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      defines: {
        'NUM_MIPS': nMips
      },
      uniforms: {
        'blurTexture1': { value: null },
        'blurTexture2': { value: null },
        'blurTexture3': { value: null },
        'blurTexture4': { value: null },
        'blurTexture5': { value: null },
        'bloomStrength': { value: 1.0 },
        'bloomFactors': { value: null },
        'bloomTintColors': { value: null },
        'bloomRadius': { value: 0.0 }
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D blurTexture1;
        uniform sampler2D blurTexture2;
        uniform sampler2D blurTexture3;
        uniform sampler2D blurTexture4;
        uniform sampler2D blurTexture5;
        uniform float bloomStrength;
        uniform float bloomFactors[NUM_MIPS];
        uniform vec3 bloomTintColors[NUM_MIPS];
        uniform float bloomRadius;
        
        float lerpBloomFactor(const in float factor) {
          float mirrorFactor = 1.2 - factor;
          return mix(factor, mirrorFactor, bloomRadius);
        }
        
        void main() {
          gl_FragColor = bloomStrength * (
            lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
            lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
            lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
            lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
            lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv)
          );
        }
      `
    })
  }
}