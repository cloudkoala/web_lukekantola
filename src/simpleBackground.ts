// Simple background renderer based on the working example
class SimpleBackgroundRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram | null = null
  private timeLocation: WebGLUniformLocation | null = null
  private resolutionLocation: WebGLUniformLocation | null = null
  private startTime: number

  private vertexShader = `#version 300 es
precision highp float;
in vec4 position;
void main() {
  gl_Position = position;
}`

  private fragmentShader = `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;
#define FC gl_FragCoord.xy
#define R resolution
#define T (time+660.)

float rnd(vec2 p) {
    p=fract(p*vec2(12.9898,78.233));
    p+=dot(p,p+34.56);
    return fract(p.x*p.y);
}

float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f), k=vec2(1,0);
    float
    a=rnd(i),
    b=rnd(i+k),
    c=rnd(i+k.yx),
    d=rnd(i+1.);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}

float fbm(vec2 p) {
    float t=.0, a=1., h=.0; 
    mat2 m=mat2(1.,-1.2,.2,1.2);
    for (float i=.0; i<5.; i++) {
        t+=a*noise(p);
        p*=2.*m;
        a*=.5;
        h+=a;
    }
    return t/h;
}

void main() {
    vec2 uv=(FC-.5*R)/R.y, k=vec2(0,T*.015); 
    vec3 col=vec3(1);
    uv.x+=.25;
    uv*=vec2(2,1);
    float n=fbm(uv*.28+vec2(-T*.01,0));
    n=noise(uv*3.+n*2.);
    col.r-=fbm(uv+k+n);
    col.g-=fbm(uv*1.003+k+n+.003);
    col.b-=fbm(uv*1.006+k+n+.006);
    col=mix(col,vec3(1),dot(col,vec3(.21,.71,.07)));
    // Mix with blue base color instead of black (0x5d5fa2 = rgb(93, 95, 162))
    vec3 blueBase = vec3(93.0/255.0, 95.0/255.0, 162.0/255.0);
    col=mix(blueBase, col, 0.2); // Mostly blue with subtle noise
    col=clamp(col,0.0,1.);
    
    // Output with blue background
    O=vec4(col, 1.0);
}`

  constructor(canvas: HTMLCanvasElement, private useBlueBackground: boolean = false) {
    this.canvas = canvas
    this.startTime = Date.now()
    
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      throw new Error('WebGL2 not supported')
    }
    this.gl = gl
    
    this.setupShaders()
    this.setupGeometry()
  }

  private getBlueFragmentShader(): string {
    return `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;
#define FC gl_FragCoord.xy
#define R resolution
#define T (time+660.)

float rnd(vec2 p) {
    p=fract(p*vec2(12.9898,78.233));
    p+=dot(p,p+34.56);
    return fract(p.x*p.y);
}

float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f), k=vec2(1,0);
    float
    a=rnd(i),
    b=rnd(i+k),
    c=rnd(i+k.yx),
    d=rnd(i+1.);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}

float fbm(vec2 p) {
    float t=.0, a=1., h=.0; 
    mat2 m=mat2(1.,-1.2,.2,1.2);
    for (float i=.0; i<5.; i++) {
        t+=a*noise(p);
        p*=2.*m;
        a*=.5;
        h+=a;
    }
    return t/h;
}

void main() {
    vec2 uv=(FC-.5*R)/R.y, k=vec2(0,T*.015); 
    vec3 col=vec3(1);
    uv.x+=.25;
    uv*=vec2(2,1);
    float n=fbm(uv*.28+vec2(-T*.01,0));
    n=noise(uv*3.+n*2.);
    col.r-=fbm(uv+k+n) * 0.5;
    col.g-=fbm(uv*1.003+k+n+.003) * 0.5;
    col.b-=fbm(uv*1.006+k+n+.006) * 0.5;
    col=mix(col,vec3(1),dot(col,vec3(.21,.71,.07)));
    // Mix with blue base color instead of black (0x5d5fa2 = rgb(93, 95, 162))
    vec3 blueBase = vec3(93.0/255.0, 95.0/255.0, 162.0/255.0);
    col=mix(blueBase, col, 0.2); // Mostly blue with subtle noise
    col=clamp(col,0.0,1.);
    
    O=vec4(col, 1.0);
}`
  }

  private getBlackFragmentShader(): string {
    return this.fragmentShader
  }

  private createShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)!
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader)
      this.gl.deleteShader(shader)
      throw new Error(`Shader compilation error: ${error}`)
    }
    
    return shader
  }

  private setupShaders() {
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, this.vertexShader)
    const shaderSource = this.useBlueBackground ? this.getBlueFragmentShader() : this.getBlackFragmentShader()
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, shaderSource)
    
    this.program = this.gl.createProgram()!
    this.gl.attachShader(this.program, vertexShader)
    this.gl.attachShader(this.program, fragmentShader)
    this.gl.linkProgram(this.program)
    
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(this.program)
      throw new Error(`Program linking error: ${error}`)
    }
    
    this.timeLocation = this.gl.getUniformLocation(this.program, 'time')
    this.resolutionLocation = this.gl.getUniformLocation(this.program, 'resolution')
  }

  private setupGeometry() {
    const vertices = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1
    ])
    
    const buffer = this.gl.createBuffer()
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW)
    
    const positionAttribute = this.gl.getAttribLocation(this.program!, 'position')
    this.gl.enableVertexAttribArray(positionAttribute)
    this.gl.vertexAttribPointer(positionAttribute, 2, this.gl.FLOAT, false, 0, 0)
  }

  resize() {
    const dpr = window.devicePixelRatio || 1
    const { innerWidth: width, innerHeight: height } = window
    
    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  render() {
    if (!this.program) return
    
    // Disable blending temporarily to debug
    this.gl.disable(this.gl.BLEND)
    
    this.gl.useProgram(this.program)
    
    const time = (Date.now() - this.startTime) / 1000
    
    this.gl.uniform1f(this.timeLocation, time)
    this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height)
    
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4)
  }
}

export function initializeSimpleBackground(): void {
  // Initialize black noise background for other sections
  const canvas = document.querySelector<HTMLCanvasElement>('#background-canvas')
  if (canvas) {
    initializeNoiseCanvas(canvas, false) // false = black background
  }

  // Initialize blue noise background for hero section
  const heroCanvas = document.querySelector<HTMLCanvasElement>('#hero-noise-canvas')
  if (heroCanvas) {
    initializeNoiseCanvas(heroCanvas, true) // true = blue background
  }
}

function initializeNoiseCanvas(canvas: HTMLCanvasElement, useBlueBackground: boolean): void {
  console.log('Initializing noise canvas:', canvas.id, 'blue:', useBlueBackground)

  // Position canvas 
  if (canvas.id === 'background-canvas') {
    canvas.style.position = 'fixed'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100vw'
    canvas.style.height = '100vh'
  }
  canvas.style.pointerEvents = 'none'

  try {
    const renderer = new SimpleBackgroundRenderer(canvas, useBlueBackground)
    
    const resize = () => {
      renderer.resize()
    }
    
    resize()
    window.addEventListener('resize', resize)
    
    const animate = () => {
      renderer.render()
      requestAnimationFrame(animate)
    }
    
    animate()
    
    console.log('Noise renderer started for:', canvas.id)
  } catch (error) {
    console.error('Failed to initialize noise canvas:', error)
    canvas.style.display = 'none'
  }
}