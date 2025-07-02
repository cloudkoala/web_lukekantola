export class BackgroundRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private scale: number
  private program: WebGLProgram | null = null
  private vs: WebGLShader | null = null
  private fs: WebGLShader | null = null
  private buffer: WebGLBuffer | null = null
  private shaderSource: string
  private mouseCoords: [number, number] = [0, 0]
  private pointerCoords: number[] = []
  private nbrOfPointers: number = 0

  private vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main(){
  gl_Position = position;
}`

  private defaultFragmentSrc = `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;
uniform vec2 touch;
uniform int pointerCount;
uniform vec2 pointers[10];

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  
  // Create animated gradient background
  float t = time * 0.5;
  vec3 color1 = vec3(0.36, 0.37, 0.64); // #5d5fa2 - from hologram metadata
  vec3 color2 = vec3(0.08, 0.08, 0.15); // darker variant
  
  // Add some movement
  float wave = sin(uv.x * 3.14159 + t) * 0.1;
  float gradient = uv.y + wave;
  
  // Mix colors
  vec3 color = mix(color2, color1, gradient);
  
  // Add subtle particle-like dots
  float dots = sin(uv.x * 50.0 + t) * sin(uv.y * 50.0 + t * 0.7);
  dots = smoothstep(0.8, 1.0, dots) * 0.1;
  color += vec3(dots);
  
  O = vec4(color, 1.0);
}`

  private vertices = [-1, 1, -1, -1, 1, 1, 1, -1]

  constructor(canvas: HTMLCanvasElement, scale: number = 1) {
    this.canvas = canvas
    this.scale = scale
    
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      throw new Error('WebGL2 not supported')
    }
    
    this.gl = gl
    this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale)
    this.shaderSource = this.defaultFragmentSrc
    
    console.log('BackgroundRenderer initialized')
  }

  get defaultSource(): string {
    return this.defaultFragmentSrc
  }

  updateShader(source: string): void {
    this.reset()
    this.shaderSource = source
    this.setup()
    this.init()
  }

  updateMouse(coords: [number, number]): void {
    this.mouseCoords = coords
  }

  updatePointerCoords(coords: number[]): void {
    this.pointerCoords = coords
  }

  updatePointerCount(nbr: number): void {
    this.nbrOfPointers = nbr
  }

  updateScale(scale: number): void {
    this.scale = scale
    this.gl.viewport(
      0,
      0,
      this.canvas.width * scale,
      this.canvas.height * scale
    )
  }

  private compile(shader: WebGLShader, source: string): void {
    const gl = this.gl
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader))
      this.canvas.dispatchEvent(
        new CustomEvent('shader-error', { detail: gl.getShaderInfoLog(shader) })
      )
    }
  }

  test(source: string): string | null {
    let result = null
    const gl = this.gl
    const shader = gl.createShader(gl.FRAGMENT_SHADER)
    
    if (!shader) return 'Failed to create shader'
    
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      result = gl.getShaderInfoLog(shader)
    }
    
    gl.deleteShader(shader)
    return result
  }

  private reset(): void {
    const { gl, program, vs, fs } = this
    
    if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return
    
    if (vs && !gl.getShaderParameter(vs, gl.DELETE_STATUS)) {
      gl.detachShader(program, vs)
      gl.deleteShader(vs)
    }
    
    if (fs && !gl.getShaderParameter(fs, gl.DELETE_STATUS)) {
      gl.detachShader(program, fs)
      gl.deleteShader(fs)
    }
    
    gl.deleteProgram(program)
  }

  setup(): void {
    const gl = this.gl
    
    this.vs = gl.createShader(gl.VERTEX_SHADER)
    this.fs = gl.createShader(gl.FRAGMENT_SHADER)
    
    if (!this.vs || !this.fs) {
      throw new Error('Failed to create shaders')
    }
    
    this.compile(this.vs, this.vertexSrc)
    this.compile(this.fs, this.shaderSource)
    
    this.program = gl.createProgram()
    if (!this.program) {
      throw new Error('Failed to create program')
    }
    
    gl.attachShader(this.program, this.vs)
    gl.attachShader(this.program, this.fs)
    gl.linkProgram(this.program)
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(this.program))
    }
  }

  init(): void {
    const { gl, program } = this
    if (!program) return
    
    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(this.vertices),
      gl.STATIC_DRAW
    )
    
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    
    // Store uniform locations
    ;(program as any).resolution = gl.getUniformLocation(program, 'resolution')
    ;(program as any).time = gl.getUniformLocation(program, 'time')
    ;(program as any).touch = gl.getUniformLocation(program, 'touch')
    ;(program as any).pointerCount = gl.getUniformLocation(program, 'pointerCount')
    ;(program as any).pointers = gl.getUniformLocation(program, 'pointers')
  }

  render(now: number = 0): void {
    const {
      gl,
      program,
      buffer,
      canvas,
      mouseCoords,
      pointerCoords,
      nbrOfPointers
    } = this

    if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return
    
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    
    // Set uniforms
    gl.uniform2f((program as any).resolution, canvas.width, canvas.height)
    gl.uniform1f((program as any).time, now * 1e-3)
    gl.uniform2f((program as any).touch, ...mouseCoords)
    gl.uniform1i((program as any).pointerCount, nbrOfPointers)
    
    // Only set pointer coords if we have valid data
    if (pointerCoords.length > 0) {
      gl.uniform2fv((program as any).pointers, new Float32Array(pointerCoords))
    } else {
      // Provide empty array with at least 2 elements for the uniform
      gl.uniform2fv((program as any).pointers, new Float32Array([0, 0]))
    }
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  destroy(): void {
    this.reset()
    if (this.buffer) {
      this.gl.deleteBuffer(this.buffer)
    }
  }
}