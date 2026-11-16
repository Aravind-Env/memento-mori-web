import { useEffect, useRef } from 'react'

import { NEBULA_FLOATS, acquireGpu, createNebula, withTimeout, type NebulaRenderer } from './NebulaLayer'

/**
 * "Life constellation" — a full-screen 3D backdrop where every week of a
 * life is one particle on a slowly turning Fibonacci sphere: lived weeks glow,
 * weeks ahead are faint, the current week pulses in the accent colour, and a
 * deep field of stars adds parallax. Pointer movement gently steers the view.
 *
 * Renders with WebGPU when available, falls back to WebGL2, and otherwise
 * leaves the CSS aurora behind it on its own. All geometry is generated in
 * the vertex shader from the instance index — there are no vertex buffers.
 * Pauses while the tab is hidden; with reduced motion a single still frame is
 * drawn.
 */

const STARS = 900
/** Floats in the uniform block — must match the WGSL/GLSL layouts below. */
const UNIFORM_FLOATS = 28

const WGSL = /* wgsl */ `
struct U {
  res: vec2f, time: f32, count: f32,
  lived: f32, dpr: f32, mouse: vec2f,
  cLived: vec4f, cAhead: vec4f, cAccent: vec4f, cStar: vec4f,
  place: vec4f, // centre.x, centre.y (clip space), radius scale, assembly 0..1
};
@group(0) @binding(0) var<uniform> u: U;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
};

fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let i = f32(ii);
  let aspect = u.res.x / u.res.y;
  var p: vec3f;
  var col: vec4f;
  var sizePx: f32;

  if (i < u.count) {
    // Fibonacci sphere: week 0 at the top pole, the last week at the bottom.
    let y = 1.0 - (i + 0.5) / u.count * 2.0;
    let r = sqrt(max(0.0, 1.0 - y * y));
    let phi = i * 2.39996323;
    p = vec3f(cos(phi) * r, y, sin(phi) * r);
    // A slow breathing wave runs down the sphere.
    p = p * (1.0 + 0.04 * sin(u.time * 0.7 - y * 7.0 + cos(phi) * 2.0));
    // Intro: every week flies in from a scattered cloud to its place.
    let scatter = vec3f(hash(i * 1.31) - 0.5, hash(i * 2.17) - 0.5, hash(i * 3.71) - 0.5) * 9.0;
    let w = clamp(u.place.w * (1.15 - 0.3 * hash(i * 0.73)), 0.0, 1.0);
    p = mix(scatter, p, w * w * (3.0 - 2.0 * w));
    let isNow = abs(i - u.lived) < 0.5;
    if (isNow) {
      let beat = 0.5 + 0.5 * sin(u.time * 3.0);
      col = vec4f(u.cAccent.rgb, 1.0);
      sizePx = 7.0 + 5.0 * beat;
    } else if (i < u.lived) {
      // Lived weeks shift from lived-colour to accent as they near today.
      let t = smoothstep(u.lived - u.count * 0.12, u.lived, i);
      col = vec4f(mix(u.cLived.rgb, u.cAccent.rgb, t * 0.85), u.cLived.a);
      sizePx = 3.1;
    } else {
      col = u.cAhead;
      sizePx = 2.3;
    }
  } else {
    // Deep-field stars on a much larger shell.
    let k = i - u.count;
    let y = hash(k * 1.7) * 2.0 - 1.0;
    let phi = hash(k * 3.1) * 6.2831853;
    let r = sqrt(1.0 - y * y);
    let dist = 3.5 + hash(k * 5.3) * 4.0;
    p = vec3f(cos(phi) * r, y, sin(phi) * r) * dist;
    let tw = 0.55 + 0.45 * sin(u.time * (0.6 + hash(k) * 1.6) + k);
    col = vec4f(u.cStar.rgb, u.cStar.a * tw);
    sizePx = 0.8 + hash(k * 7.7) * 1.4;
  }

  // Rotate: steady spin plus pointer steering.
  let a = u.time * 0.045 + u.mouse.x * 0.5 + (1.0 - u.place.w) * 2.4;
  let b = 0.32 + u.mouse.y * 0.3;
  p = vec3f(p.x * cos(a) + p.z * sin(a), p.y, -p.x * sin(a) + p.z * cos(a));
  p = vec3f(p.x, p.y * cos(b) - p.z * sin(b), p.y * sin(b) + p.z * cos(b));

  let z = p.z + 3.4;
  var o: VO;
  if (z < 0.2) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0);
    o.uv = c; o.col = vec4f(0.0); return o;
  }
  // Placement comes from the page (centred on the sidebar when there is one).
  let scale = 2.15 * u.place.z / z;
  let center = vec2f(p.x * scale / aspect + u.place.x, p.y * scale + u.place.y);
  // Depth cue: the far side of the sphere fades and shrinks.
  let depth = clamp((4.6 - z) / 2.4, 0.18, 1.0);
  let px = sizePx * u.dpr * (0.6 + 0.6 * depth) * (0.7 + 0.3 * u.place.z);
  // Quad is 2.4x the dot so the fragment shader can paint a soft halo.
  let off = c * px * 2.4 / u.res;
  o.pos = vec4f(center + off, 0.0, 1.0);
  o.uv = c;
  o.col = vec4f(col.rgb, col.a * depth);
  return o;
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.uv);
  if (d > 1.0) { discard; }
  let core = smoothstep(0.42, 0.0, d);
  let halo = pow(1.0 - d, 3.0) * 0.32;
  let a = v.col.a * min(1.0, core + halo);
  return vec4f(v.col.rgb * a, a);
}
`

const GLSL_VS = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 u0; // res.xy, time, count
uniform vec4 u1; // lived, dpr, mouse.xy
uniform vec4 cLived; uniform vec4 cAhead; uniform vec4 cAccent; uniform vec4 cStar;
uniform vec4 place; // centre.x, centre.y, radius scale, assembly 0..1
out vec2 vUv; out vec4 vCol;
float hash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  vec2 corners[6] = vec2[6](vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(-1,1), vec2(1,-1), vec2(1,1));
  vec2 c = corners[gl_VertexID];
  float i = float(gl_InstanceID);
  vec2 res = u0.xy; float time = u0.z; float count = u0.w;
  float lived = u1.x; float dpr = u1.y; vec2 mouse = u1.zw;
  float aspect = res.x / res.y;
  vec3 p; vec4 col; float sizePx;
  if (i < count) {
    float y = 1.0 - (i + 0.5) / count * 2.0;
    float r = sqrt(max(0.0, 1.0 - y * y));
    float phi = i * 2.39996323;
    p = vec3(cos(phi) * r, y, sin(phi) * r);
    p *= 1.0 + 0.04 * sin(time * 0.7 - y * 7.0 + cos(phi) * 2.0);
    vec3 scatter = vec3(hash(i * 1.31) - 0.5, hash(i * 2.17) - 0.5, hash(i * 3.71) - 0.5) * 9.0;
    float w = clamp(place.w * (1.15 - 0.3 * hash(i * 0.73)), 0.0, 1.0);
    p = mix(scatter, p, w * w * (3.0 - 2.0 * w));
    if (abs(i - lived) < 0.5) {
      float beat = 0.5 + 0.5 * sin(time * 3.0);
      col = vec4(cAccent.rgb, 1.0); sizePx = 7.0 + 5.0 * beat;
    } else if (i < lived) {
      float t = smoothstep(lived - count * 0.12, lived, i);
      col = vec4(mix(cLived.rgb, cAccent.rgb, t * 0.85), cLived.a); sizePx = 3.1;
    } else { col = cAhead; sizePx = 2.3; }
  } else {
    float k = i - count;
    float y = hash(k * 1.7) * 2.0 - 1.0;
    float phi = hash(k * 3.1) * 6.2831853;
    float r = sqrt(1.0 - y * y);
    float dist = 3.5 + hash(k * 5.3) * 4.0;
    p = vec3(cos(phi) * r, y, sin(phi) * r) * dist;
    float tw = 0.55 + 0.45 * sin(time * (0.6 + hash(k) * 1.6) + k);
    col = vec4(cStar.rgb, cStar.a * tw); sizePx = 0.8 + hash(k * 7.7) * 1.4;
  }
  float a = time * 0.045 + mouse.x * 0.5 + (1.0 - place.w) * 2.4;
  float b = 0.32 + mouse.y * 0.3;
  p = vec3(p.x * cos(a) + p.z * sin(a), p.y, -p.x * sin(a) + p.z * cos(a));
  p = vec3(p.x, p.y * cos(b) - p.z * sin(b), p.y * sin(b) + p.z * cos(b));
  float z = p.z + 3.4;
  if (z < 0.2) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); vUv = c; vCol = vec4(0.0); return; }
  float scale = 2.15 * place.z / z;
  vec2 center = vec2(p.x * scale / aspect + place.x, p.y * scale + place.y);
  float depth = clamp((4.6 - z) / 2.4, 0.18, 1.0);
  float px = sizePx * dpr * (0.6 + 0.6 * depth) * (0.7 + 0.3 * place.z);
  gl_Position = vec4(center + c * px * 2.4 / res, 0.0, 1.0);
  vUv = c; vCol = vec4(col.rgb, col.a * depth);
}`

const GLSL_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; out vec4 o;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float core = smoothstep(0.42, 0.0, d);
  float halo = pow(1.0 - d, 3.0) * 0.32;
  float a = vCol.a * min(1.0, core + halo);
  o = vec4(vCol.rgb * a, a);
}`

type RGBA = [number, number, number, number]

function cssColor(name: string, alpha: number, fallback: string): RGBA {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  const m = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return [1, 1, 1, alpha]
  let hex = m[1]
  if (hex.length === 3) hex = hex.replace(/./g, (ch) => ch + ch)
  const n = parseInt(hex, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha]
}

interface Renderer {
  draw(u: Float32Array, instances: number): void
  resize(w: number, h: number): void
  destroy(): void
}

/* Minimal structural types for the WebGPU surface we touch, so the project
   needs no extra type package. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type GPUAny = any

async function createWebGPU(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  const shared = await acquireGpu()
  if (!shared) return null
  const { gpu, device } = shared
  const format = gpu.getPreferredCanvasFormat()
  // Validate everything before claiming the canvas: once it holds a WebGPU
  // context it can no longer fall back to WebGL2.
  device.pushErrorScope('validation')
  const module = device.createShaderModule({ code: WGSL })
  const info = await withTimeout<GPUAny>(module.getCompilationInfo?.() ?? Promise.resolve(null), 1500)
  if (info?.messages?.some((m: GPUAny) => m.type === 'error')) {
    return null
  }
  const blend = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  }
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list' },
  })
  if (await withTimeout(device.popErrorScope(), 1500, 'timeout')) {
    return null
  }
  const ctx: GPUAny = canvas.getContext('webgpu')
  if (!ctx) {
    return null
  }
  ctx.configure({ device, format, alphaMode: 'premultiplied' })
  const ubo = device.createBuffer({
    size: UNIFORM_FLOATS * 4,
    usage: 0x40 /* UNIFORM */ | 0x08 /* COPY_DST */,
  })
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubo } }],
  })
  let lost = false
  device.lost?.then(() => {
    lost = true
  })
  return {
    draw(u, instances) {
      if (lost) return
      device.queue.writeBuffer(ubo, 0, u)
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bind)
      pass.draw(6, instances)
      pass.end()
      device.queue.submit([enc.finish()])
    },
    resize() {
      /* the swap chain follows canvas.width/height automatically */
    },
    destroy() {
      try {
        ctx.unconfigure?.()
      } catch {
        /* already gone */
      }
    },
  }
}

function createWebGL2(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  let prog: WebGLProgram
  try {
    prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, GLSL_VS))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GLSL_FS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  } catch {
    return null
  }
  const vao = gl.createVertexArray()
  const loc = (n: string) => gl.getUniformLocation(prog, n)
  const L = {
    u0: loc('u0'),
    u1: loc('u1'),
    cLived: loc('cLived'),
    cAhead: loc('cAhead'),
    cAccent: loc('cAccent'),
    cStar: loc('cStar'),
    place: loc('place'),
  }
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  return {
    draw(u, instances) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      gl.uniform4fv(L.u0, u.subarray(0, 4))
      gl.uniform4fv(L.u1, u.subarray(4, 8))
      gl.uniform4fv(L.cLived, u.subarray(8, 12))
      gl.uniform4fv(L.cAhead, u.subarray(12, 16))
      gl.uniform4fv(L.cAccent, u.subarray(16, 20))
      gl.uniform4fv(L.cStar, u.subarray(20, 24))
      gl.uniform4fv(L.place, u.subarray(24, 28))
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances)
    },
    resize() {},
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

export interface GpuBackdropProps {
  /** Total weeks on the sphere (life expectancy in weeks). */
  totalWeeks: number
  /** Weeks lived so far; the particle at this index pulses. */
  weeksLived: number
  reduceMotion: boolean
  /** Changes whenever the theme flips so colours are re-read. */
  themeKey: string
}

export function GpuBackdrop({ totalWeeks, weeksLived, reduceMotion, themeKey }: GpuBackdropProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Live values read by the frame loop without restarting the renderer.
  const live = useRef({ totalWeeks, weeksLived, reduceMotion, themeKey })
  live.current = { totalWeeks, weeksLived, reduceMotion, themeKey }
  const redraw = useRef<() => void>(() => {})

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // A fresh canvas per mount: a canvas hands out only one context type for
    // life, so a WebGPU context claimed by a torn-down mount (StrictMode
    // double-mount) would otherwise block the WebGL2 fallback forever.
    const canvas = document.createElement('canvas')
    canvas.className = 'mm-backdrop__gl'
    host.appendChild(canvas)
    // Second GPU layer: the flowing nebula, drawn at low resolution under
    // the particles (it is all soft gradients, so CSS upscaling is free).
    const neb = document.createElement('canvas')
    neb.className = 'mm-backdrop__neb'
    host.insertBefore(neb, canvas)
    let nebula: NebulaRenderer | null = null
    const nu = new Float32Array(NEBULA_FLOATS)
    let nebFrame = 0
    const NEB_SCALE = 0.42
    let renderer: Renderer | null = null
    let raf = 0
    let disposed = false
    const u = new Float32Array(UNIFORM_FLOATS)
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    // Intro clock starts when a renderer is actually drawing, so a slow
    // WebGPU→WebGL2 fallback still shows the full assembly.
    let start = performance.now()
    let colorsKey = ''

    const readColors = () => {
      const dark = document.documentElement.dataset.theme === 'dark'
      nu.set(cssColor('--neb-base', 1, dark ? '#141012' : '#f6f1ea'), 8)
      nu.set(cssColor('--neb-warm', dark ? 0.42 : 0.45, '#ee6c4d'), 12)
      nu.set(cssColor('--neb-cool', dark ? 0.85 : 0.55, '#3a3f5c'), 16)
      nu.set(cssColor('--neb-hot', dark ? 0.32 : 0.2, '#ffb08f'), 20)
      u.set(cssColor('--gl-lived', 1, '#c9c2ff'), 8)
      u.set(cssColor('--gl-ahead', dark ? 0.7 : 0.6, '#6c6590'), 12)
      u.set(cssColor('--gl-accent', 1, '#ab9ff2'), 16)
      u.set(cssColor('--gl-star', dark ? 0.75 : 0.45, '#ffffff'), 20)
    }

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        renderer?.resize(w, h)
      }
      return dpr
    }

    // Where the sphere sits: a [data-sphere-anchor] element (the welcome
    // stage) wins, then the dashboard sidebar when it is beside the grid,
    // else a default spot. Values glide, so switching screens becomes a
    // camera move rather than a jump.
    const place = { x: 0.42, y: 0, s: 1, init: false }
    const placeSphere = (still: boolean) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      let tx: number
      let ty: number
      let ts: number
      const anchor = document.querySelector('[data-sphere-anchor]')
      const side = document.querySelector('.mm-side')
      const ar = anchor?.getBoundingClientRect()
      const sr = side?.getBoundingClientRect()
      const fit = (r: DOMRect, yBias: number) => {
        tx = ((r.left + r.width / 2) / vw) * 2 - 1
        ty = 1 - ((r.top + r.height * yBias) / vh) * 2
        // sphere diameter ≈ 88% of the box's smaller side
        ts = Math.min(1.9, Math.max(0.55, (1.4 * Math.min(r.width, r.height * 0.95)) / vh))
      }
      tx = 0.42
      ty = -0.02
      ts = 1.15
      if (ar && ar.width > 0 && ar.bottom > 0 && ar.top < vh) fit(ar, 0.5)
      else if (sr && sr.width > 0 && sr.left > vw * 0.45) fit(sr, 0.46)
      else if (vw / vh <= 1.15) {
        tx = 0
        ty = 0.32
        ts = 0.85
      }
      if (!place.init || still) {
        Object.assign(place, { x: tx, y: ty, s: ts, init: true })
      } else {
        place.x += (tx - place.x) * 0.06
        place.y += (ty - place.y) * 0.06
        place.s += (ts - place.s) * 0.06
      }
      // Intro: a slow dolly-in while the particles assemble (first ~3.5s).
      const t = (performance.now() - start) / 1000
      const k = still ? 1 : Math.min(1, Math.max(0, (t - 0.15) / 3.4))
      const ease = 1 - Math.pow(1 - k, 3)
      u[24] = place.x
      u[25] = place.y
      u[26] = place.s * (0.78 + 0.22 * ease)
      u[27] = ease
    }

    const frame = () => {
      raf = 0
      if (!renderer || disposed) return
      const { totalWeeks: n, weeksLived: lived, reduceMotion: still, themeKey: key } = live.current
      if (key !== colorsKey) {
        colorsKey = key
        readColors()
      }
      const dpr = size()
      mouse.x += (mouse.tx - mouse.x) * 0.04
      mouse.y += (mouse.ty - mouse.y) * 0.04
      const count = Math.max(52, Math.min(n, 9000))
      u[0] = canvas.width
      u[1] = canvas.height
      u[2] = still ? 40 : (performance.now() - start) / 1000
      u[3] = count
      u[4] = Math.min(lived, count - 1)
      u[5] = dpr
      u[6] = still ? 0 : mouse.x
      u[7] = still ? 0 : mouse.y
      placeSphere(still)
      if (nebula && (still || nebFrame++ % 2 === 0)) {
        const w = Math.max(1, Math.round(neb.clientWidth * NEB_SCALE))
        const h = Math.max(1, Math.round(neb.clientHeight * NEB_SCALE))
        if (neb.width !== w || neb.height !== h) {
          neb.width = w
          neb.height = h
        }
        nu[0] = w
        nu[1] = h
        nu[2] = u[2]
        nu[4] = u[6]
        nu[5] = -u[7]
        nebula.draw(nu)
      }
      renderer.draw(u, count + STARS)
      if (!still && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    redraw.current = kick

    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1
    }
    const onVis = () => {
      if (!document.hidden) kick()
    }
    const ro = new ResizeObserver(kick)
    ro.observe(canvas)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVis)

    void (async () => {
      let r: Renderer | null = null
      let kind = 'webgpu'
      try {
        r = await createWebGPU(canvas)
      } catch (err) {
        console.warn('[backdrop] WebGPU unavailable, falling back to WebGL2', err)
        r = null
      }
      // An unmounted effect (StrictMode double-mount) must not claim the
      // canvas: a lost WebGL context would be handed to the next mount.
      if (disposed) {
        r?.destroy()
        return
      }
      if (!r) {
        kind = 'webgl2'
        try {
          r = createWebGL2(canvas)
        } catch (err) {
          console.warn('[backdrop] WebGL2 unavailable', err)
          r = null
        }
      }
      if (disposed) {
        r?.destroy()
        return
      }
      try {
        nebula = await createNebula(neb)
      } catch {
        nebula = null
      }
      if (disposed) {
        nebula?.destroy()
        r?.destroy()
        return
      }
      if (nebula) neb.classList.add('is-ready')
      renderer = r
      console.debug(`[backdrop] renderer: ${r ? kind : 'none (CSS aurora only)'}`)
      if (r) {
        canvas.dataset.renderer = kind
        start = performance.now()
        canvas.classList.add('is-ready')
        kick()
      }
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      renderer?.destroy()
      nebula?.destroy()
      canvas.remove()
      neb.remove()
    }
  }, [])

  // Prop changes (theme, lived weeks, motion setting) need a fresh frame when
  // the loop is idle (reduced motion draws on demand only).
  useEffect(() => {
    redraw.current()
  }, [totalWeeks, weeksLived, reduceMotion, themeKey])

  return (
    <div className="mm-backdrop" aria-hidden="true">
      <div className="mm-backdrop__aurora" />
      <div ref={hostRef} className="mm-backdrop__host" />
      <div className="mm-backdrop__grain" />
    </div>
  )
}
