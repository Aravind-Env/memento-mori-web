/**
 * Nebula layer — the second GPU pass behind the life constellation.
 *
 * A full-screen fragment shader paints a slowly flowing, domain-warped fbm
 * "light field": warm ember currents, cool slate haze, a soft key light from
 * the upper right and a vignette for depth. It is rendered at a fraction of
 * screen resolution (it is all soft gradients) and upscaled by CSS, so it
 * costs very little. WebGPU when available, WebGL2 otherwise.
 *
 * Also exports the shared WebGPU device helper used by both layers, so the
 * (sometimes slow) device request happens once per page.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type GPUAny = any

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T | null = null): Promise<T | null> {
  return Promise.race([p, new Promise<T | null>((res) => setTimeout(() => res(fallback), ms))])
}

let devicePromise: Promise<{ gpu: GPUAny; device: GPUAny } | null> | null = null

/** One WebGPU device per page (or null), with timeouts for stalling drivers. */
export function acquireGpu(): Promise<{ gpu: GPUAny; device: GPUAny } | null> {
  if (devicePromise) return devicePromise
  devicePromise = (async () => {
    const gpu: GPUAny = (navigator as GPUAny).gpu
    if (!gpu) return null
    const adapter: GPUAny = await withTimeout(gpu.requestAdapter(), 1500)
    if (!adapter) return null
    const device: GPUAny = await withTimeout(adapter.requestDevice(), 1500)
    if (!device) return null
    device.lost?.then(() => {
      devicePromise = null
    })
    return { gpu, device }
  })().catch(() => null)
  return devicePromise
}

/** Uniform block: res.xy, time, dark | mouse.xy, pad, pad | base | warm | cool | hot */
export const NEBULA_FLOATS = 24

const NOISE_WGSL = /* wgsl */ `
fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2f(1.0, 0.0)), u.x),
             mix(h2(i + vec2f(0.0, 1.0)), h2(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  let rot = mat2x2f(0.8, -0.6, 0.6, 0.8);
  for (var k = 0; k < 5; k++) { s += a * vnoise(p); p = rot * p * 2.03 + vec2f(1.7, 9.2); a *= 0.5; }
  return s;
}`

const WGSL = /* wgsl */ `
struct U { a: vec4f, b: vec4f, base: vec4f, warm: vec4f, cool: vec4f, hot: vec4f };
@group(0) @binding(0) var<uniform> u: U;
${NOISE_WGSL}
@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = u.a.xy; let t = u.a.z * 0.035;
  let frag = vec2f(fc.x, res.y - fc.y);
  var uv = (frag - 0.5 * res) / res.y;
  uv += u.b.xy * 0.04;
  let q = vec2f(fbm(uv * 1.3 + vec2f(t, -t * 0.6)), fbm(uv * 1.3 + vec2f(5.2, 1.3) - t));
  let r = vec2f(fbm(uv * 1.7 + 3.6 * q + vec2f(1.7, 9.2) + t * 1.2),
                fbm(uv * 1.7 + 3.6 * q + vec2f(8.3, 2.8) - t * 0.8));
  let f = fbm(uv * 1.5 + 3.2 * r);
  var col = u.base.rgb;
  col = mix(col, u.cool.rgb, clamp(length(q) * 0.75 - 0.25, 0.0, 1.0) * u.cool.a);
  col = mix(col, u.warm.rgb, clamp(f * f * 2.6 - 0.5, 0.0, 1.0) * u.warm.a);
  col += u.hot.rgb * pow(clamp(r.x * 1.15 - 0.2, 0.0, 1.0), 4.0) * u.hot.a;
  // soft key light from the upper right
  let key = exp(-2.2 * length(uv - vec2f(0.65, 0.42)));
  col += u.warm.rgb * key * 0.22 * u.warm.a;
  // vignette for depth
  let vig = 1.0 - smoothstep(0.15, 1.35, length(uv * vec2f(0.75, 1.0)));
  col = mix(u.base.rgb * 0.55, col, mix(0.55, 1.0, vig));
  // tiny dither to avoid banding
  col += (h2(frag + t) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}`

const NOISE_GLSL = /* glsl */ `
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5; float s = 0.0;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int k = 0; k < 5; k++) { s += a * vnoise(p); p = rot * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}`

const GLSL_VS = /* glsl */ `#version 300 es
void main() {
  vec2 p[3] = vec2[3](vec2(-1.0, -3.0), vec2(3.0, 1.0), vec2(-1.0, 1.0));
  gl_Position = vec4(p[gl_VertexID], 0.0, 1.0);
}`

const GLSL_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 ua; uniform vec4 ub; uniform vec4 base; uniform vec4 warm; uniform vec4 cool; uniform vec4 hot;
out vec4 o;
${NOISE_GLSL}
void main() {
  vec2 res = ua.xy; float t = ua.z * 0.035;
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * res) / res.y;
  uv += ub.xy * 0.04;
  vec2 q = vec2(fbm(uv * 1.3 + vec2(t, -t * 0.6)), fbm(uv * 1.3 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv * 1.7 + 3.6 * q + vec2(1.7, 9.2) + t * 1.2), fbm(uv * 1.7 + 3.6 * q + vec2(8.3, 2.8) - t * 0.8));
  float f = fbm(uv * 1.5 + 3.2 * r);
  vec3 col = base.rgb;
  col = mix(col, cool.rgb, clamp(length(q) * 0.75 - 0.25, 0.0, 1.0) * cool.a);
  col = mix(col, warm.rgb, clamp(f * f * 2.6 - 0.5, 0.0, 1.0) * warm.a);
  col += hot.rgb * pow(clamp(r.x * 1.15 - 0.2, 0.0, 1.0), 4.0) * hot.a;
  float key = exp(-2.2 * length(uv - vec2(0.65, 0.42)));
  col += warm.rgb * key * 0.22 * warm.a;
  float vig = 1.0 - smoothstep(0.15, 1.35, length(uv * vec2(0.75, 1.0)));
  col = mix(base.rgb * 0.55, col, mix(0.55, 1.0, vig));
  col += (h2(frag + t) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`

export interface NebulaRenderer {
  kind: 'webgpu' | 'webgl2'
  draw(u: Float32Array): void
  destroy(): void
}

export async function createNebula(canvas: HTMLCanvasElement): Promise<NebulaRenderer | null> {
  const shared = await acquireGpu()
  if (shared) {
    try {
      const r = await nebulaWebGPU(canvas, shared.gpu, shared.device)
      if (r) return r
    } catch {
      /* fall through to WebGL2 */
    }
  }
  try {
    return nebulaWebGL2(canvas)
  } catch {
    return null
  }
}

async function nebulaWebGPU(canvas: HTMLCanvasElement, gpu: GPUAny, device: GPUAny): Promise<NebulaRenderer | null> {
  const format = gpu.getPreferredCanvasFormat()
  device.pushErrorScope('validation')
  const module = device.createShaderModule({ code: WGSL })
  const info = await withTimeout<GPUAny>(module.getCompilationInfo?.() ?? Promise.resolve(null), 1500)
  if (info?.messages?.some((m: GPUAny) => m.type === 'error')) {
    await device.popErrorScope()
    return null
  }
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  if (await withTimeout(device.popErrorScope(), 1500, 'timeout')) return null
  const ctx: GPUAny = canvas.getContext('webgpu')
  if (!ctx) return null
  ctx.configure({ device, format, alphaMode: 'opaque' })
  const ubo = device.createBuffer({ size: NEBULA_FLOATS * 4, usage: 0x40 | 0x08 })
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubo } }],
  })
  return {
    kind: 'webgpu',
    draw(u) {
      device.queue.writeBuffer(ubo, 0, u)
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bind)
      pass.draw(3)
      pass.end()
      device.queue.submit([enc.finish()])
    },
    destroy() {
      try {
        ctx.unconfigure?.()
        ubo.destroy?.()
      } catch {
        /* already gone */
      }
    },
  }
}

function nebulaWebGL2(canvas: HTMLCanvasElement): NebulaRenderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
  if (!gl) return null
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, GLSL_VS))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GLSL_FS))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  const vao = gl.createVertexArray()
  const names = ['ua', 'ub', 'base', 'warm', 'cool', 'hot'] as const
  const loc = names.map((n) => gl.getUniformLocation(prog, n))
  return {
    kind: 'webgl2',
    draw(u) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      for (let i = 0; i < names.length; i++) gl.uniform4fv(loc[i], u.subarray(i * 4, i * 4 + 4))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
