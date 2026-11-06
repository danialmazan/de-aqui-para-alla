// "Flow engine": a MapLibre custom WebGL2 layer that draws OD connections as
// faint Bézier underlays plus luminous dots whose density encodes trips/hour.
//
// All per-frame work on the CPU is O(arcs): interpolate each arc's hourly value
// and its phase, then upload one small texture row. Dots are positioned on the
// GPU. Instance buffers are rebuilt only when data, budget or zoom tier change.

import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl';
import {
  MIN_ARC_PX, SPACING_PX, bezierLength, chooseUnit, controlPoint, dotsFor, radicalInverse, valueAt, type Vec2,
} from './flowMath.ts';

/**
 * o/d as [lon, lat]; `from` is the halo index the arc folds into when too short to
 * draw. `dots: false` draws only the faint line (place mode's further partners).
 */
export type FlowArc = { o: Vec2; d: Vec2; hours: ArrayLike<number>; from?: number; dots?: boolean };
/** A breathing halo: trips that stay inside a place (or go somewhere too close to draw). */
export type FlowHalo = { at: Vec2; hours: ArrayLike<number> };

export type FlowStats = {
  arcs: number; drawn: number; dots: number; unit: number; layoutZoom: number;
  drawnDay: number; haloDay: number; // trips/day drawn as dots vs carried by halos
};

const SPEED_PX_S = 45;
const UNDERLAY_SEGMENTS = 24;
const AMBER = [1.0, 0.71, 0.28];
const AQUA = [0.31, 0.88, 0.82];
const LAVENDER = [0.78, 0.65, 1.0];
const BREATH_S = 4;

const DOT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_inst; // arc index, slot k, stratified rank
uniform sampler2D u_arcs;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_radius;
out vec2 v_uv;
out float v_alpha;
out float v_t;
void main() {
  int i = int(a_inst.x);
  vec4 r0 = texelFetch(u_arcs, ivec2(i, 0), 0);
  vec4 r1 = texelFetch(u_arcs, ivec2(i, 1), 0);
  vec4 r2 = texelFetch(u_arcs, ivec2(i, 2), 0);
  float slots = r1.w;
  float s = fract((a_inst.y + 0.5) / slots + r2.y);
  float u = 1.0 - s;
  vec2 pos = u * u * r0.xy + 2.0 * u * s * r1.xy + s * s * r0.zw;
  vec4 clip = u_matrix * vec4(pos, 0.0, 1.0);
  float shown = clamp(r2.x - a_inst.z * slots, 0.0, 1.0);
  float edge = smoothstep(0.0, 0.05, s) * smoothstep(1.0, 0.95, s);
  v_alpha = shown * edge;
  v_t = s;
  v_uv = a_corner;
  clip.xy += a_corner * u_radius * 2.0 / u_viewport * clip.w;
  gl_Position = v_alpha < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
}`;

const DOT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_alpha;
in float v_t;
uniform vec3 u_from;
uniform vec3 u_to;
uniform float u_core;
uniform float u_out;
out vec4 color;
void main() {
  float d = dot(v_uv, v_uv);
  if (d > 1.0) discard;
  // Translucent core plus a wide soft halo, summed additively into the
  // offscreen glow buffer (premultiplied colour + coverage).
  float core = (1.0 - smoothstep(0.06, 0.16, d)) * u_core;
  float halo = exp(-d * 6.0) * 0.12;
  float a = (core + halo) * v_alpha;
  vec3 c = mix(u_from, u_to, smoothstep(0.1, 0.9, v_t));
  color = vec4(c * a, a) * u_out;
}`;

// Composite: where dots crowd, their summed coverage becomes brightness through
// a soft exponential curve, while the hue stays the weighted average colour, so
// dense streams glow brighter without ever bleaching to white.
const GLOW_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 v_uv;
void main() {
  vec2 p = P[gl_VertexID];
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_accum;
uniform float u_scale;
uniform float u_gain;
out vec4 color;
void main() {
  vec4 s = texture(u_accum, v_uv) * u_scale;
  if (s.a < 0.003) discard;
  vec3 hue = s.rgb / s.a;
  float b = 1.0 - exp(-s.a * u_gain);
  color = vec4(hue * b, b);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner; // x: along segment (0/1), y: side (-1/1)
layout(location = 1) in vec2 a_inst;   // arc index, segment index
uniform sampler2D u_arcs;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_segments;
out float v_alpha;
out float v_side;
vec2 bez(vec2 a, vec2 c, vec2 b, float t) { float u = 1.0 - t; return u*u*a + 2.0*u*t*c + t*t*b; }
void main() {
  int i = int(a_inst.x);
  vec4 r0 = texelFetch(u_arcs, ivec2(i, 0), 0);
  vec4 r1 = texelFetch(u_arcs, ivec2(i, 1), 0);
  vec4 r2 = texelFetch(u_arcs, ivec2(i, 2), 0);
  float t0 = a_inst.y / u_segments;
  float t1 = (a_inst.y + 1.0) / u_segments;
  vec4 c0 = u_matrix * vec4(bez(r0.xy, r1.xy, r0.zw, t0), 0.0, 1.0);
  vec4 c1 = u_matrix * vec4(bez(r0.xy, r1.xy, r0.zw, t1), 0.0, 1.0);
  vec2 s0 = c0.xy / c0.w * u_viewport;
  vec2 s1 = c1.xy / c1.w * u_viewport;
  vec2 dir = normalize(s1 - s0 + 1e-6);
  vec2 n = vec2(-dir.y, dir.x);
  float width = r2.z; // px, from sqrt(v)
  vec4 c = a_corner.x < 0.5 ? c0 : c1;
  c.xy += n * a_corner.y * width / u_viewport * c.w;
  v_alpha = r2.w;
  v_side = a_corner.y;
  gl_Position = c;
}`;

const LINE_FS = `#version 300 es
precision mediump float;
in float v_alpha;
in float v_side;
out vec4 color;
void main() {
  float a = v_alpha * (1.0 - smoothstep(0.4, 1.0, abs(v_side)));
  vec3 c = vec3(0.62, 0.70, 0.78);
  color = vec4(c * a, a);
}`;

const HALO_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_halo; // mercator x, y, radius in px
uniform mat4 u_matrix;
uniform vec2 u_viewport;
out vec2 v_uv;
void main() {
  vec4 clip = u_matrix * vec4(a_halo.xy, 0.0, 1.0);
  clip.xy += a_corner * a_halo.z * 2.0 / u_viewport * clip.w;
  v_uv = a_corner;
  gl_Position = a_halo.z < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
}`;

const HALO_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform vec3 u_color;
uniform float u_gain;
out vec4 color;
void main() {
  float d = dot(v_uv, v_uv);
  if (d > 1.0) discard;
  // Soft fill plus a thin rim, so the halo's size (area ∝ trips) reads.
  float fill = 0.32 * (exp(-d * 2.2) - exp(-2.2)) / (1.0 - exp(-2.2));
  float rim = 0.42 * smoothstep(0.72, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
  float a = min(0.9, (fill + rim) * u_gain);
  color = vec4(u_color * a, a);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

type Prepared = {
  merc: Float64Array;      // per arc: ox, oy, dx, dy, cx, cy (mercator 0..1, double precision)
  worldLen: Float32Array;  // per arc: Bézier length in mercator units
  maxV: Float32Array;      // per arc: max hourly value
  hours: Float32Array;     // per arc × 24
};

export class FlowLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map?: MlMap;
  private gl?: WebGL2RenderingContext;
  private dotProgram?: WebGLProgram;
  private lineProgram?: WebGLProgram;
  private glowProgram?: WebGLProgram;
  private haloProgram?: WebGLProgram;
  private haloVao?: WebGLVertexArrayObject;
  private haloInst?: WebGLBuffer;
  private halos: { merc: Float64Array; hours: Float32Array; maxV: Float32Array } = {
    merc: new Float64Array(0), hours: new Float32Array(0), maxV: new Float32Array(0),
  };
  private haloK = 0;
  private haloBuf = new Float32Array(0);
  private fold = new Float32Array(0);
  private from = new Int32Array(0);
  private drawn = new Uint8Array(0);
  private lineOnly = new Uint8Array(0);
  private accumTex?: WebGLTexture;
  private accumFbo?: WebGLFramebuffer;
  private accumSize = [0, 0];
  private accumScale = 1; // 1 for half-float targets; 8 when falling back to RGBA8
  private arcTex?: WebGLTexture;
  private dotVao?: WebGLVertexArrayObject;
  private lineVao?: WebGLVertexArrayObject;
  private dotInst?: WebGLBuffer;
  private lineInst?: WebGLBuffer;
  private dotCount = 0;
  private lineCount = 0;

  private data?: Prepared;
  private arcRows = new Float32Array(0); // 3 rows × arcs × RGBA
  private lengthPx = new Float32Array(0);
  private slots = new Float32Array(0);
  private phase = new Float64Array(0);
  private unit = 1;
  private layoutZoom = -1;
  private vScale = 1;
  private lastT = performance.now();

  getHour: () => number = () => 8;
  /** Fixed dot budget; when 0, the budget follows the map's size (see `density`). */
  budget: number;
  /** Dots per CSS px² of map when `budget` is 0: smaller screens get fewer dots. */
  density = 0.008;
  paused = false;
  /** Opacity of a lone dot's core (0–1); lower lets dense streams glow rather than merge. */
  coreOpacity = 0.35;
  /** How fast summed coverage turns into brightness in the glow composite. */
  glowGain = 1.6;
  /** Dot radius in CSS px. */
  dotRadius = 4.2;
  /** Multiplies the halos' fill and rim. */
  haloGain = 1;
  onStats?: (s: FlowStats) => void;

  constructor(id: string, budget: number) {
    this.id = id;
    this.budget = budget;
  }

  /** Set connections and halos together (halo indices in `arc.from` refer to `halos`). */
  setFlows(arcs: FlowArc[], halos: FlowHalo[] = []) {
    const m = halos.length;
    const merc = new Float64Array(m * 2);
    const hours = new Float32Array(m * 24);
    const maxV = new Float32Array(m);
    halos.forEach((h, i) => {
      const p = MercatorCoordinate.fromLngLat(h.at);
      merc[i * 2] = p.x;
      merc[i * 2 + 1] = p.y;
      for (let k = 0; k < 24; k++) {
        hours[i * 24 + k] = h.hours[k];
        maxV[i] = Math.max(maxV[i], h.hours[k]);
      }
    });
    this.halos = { merc, hours, maxV };
    this.haloBuf = new Float32Array(m * 3);
    this.fold = new Float32Array(m);
    this.from = Int32Array.from(arcs, (a) => (a.from ?? -1) < m ? a.from ?? -1 : -1);
    this.setArcs(arcs);
  }

  setArcs(arcs: FlowArc[]) {
    const n = arcs.length;
    if (this.from.length !== n) this.from = new Int32Array(n).fill(-1);
    this.lineOnly = Uint8Array.from(arcs, (a) => (a.dots === false ? 1 : 0));
    const merc = new Float64Array(n * 6);
    const worldLen = new Float32Array(n);
    const maxV = new Float32Array(n);
    const hours = new Float32Array(n * 24);
    arcs.forEach((a, i) => {
      const o = MercatorCoordinate.fromLngLat(a.o);
      const d = MercatorCoordinate.fromLngLat(a.d);
      const c = controlPoint([o.x, o.y], [d.x, d.y]);
      merc.set([o.x, o.y, d.x, d.y, c[0], c[1]], i * 6);
      worldLen[i] = bezierLength([o.x, o.y], c, [d.x, d.y]);
      let m = 0;
      for (let h = 0; h < 24; h++) {
        hours[i * 24 + h] = a.hours[h];
        m = Math.max(m, a.hours[h]);
      }
      maxV[i] = m;
    });
    this.data = { merc, worldLen, maxV, hours };
    this.vScale = Math.max(1, ...maxV);
    this.phase = new Float64Array(n);
    this.layoutZoom = -1;
    this.map?.triggerRepaint();
  }

  onAdd(map: MlMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    this.dotProgram = compile(gl, DOT_VS, DOT_FS);
    this.lineProgram = compile(gl, LINE_VS, LINE_FS);
    this.glowProgram = compile(gl, GLOW_VS, GLOW_FS);
    this.haloProgram = compile(gl, HALO_VS, HALO_FS);
    this.haloInst = gl.createBuffer()!;
    this.haloVao = this.makeVao([-1, -1, 1, -1, -1, 1, 1, 1], this.haloInst, 3);
    this.arcTex = gl.createTexture()!;
    this.dotInst = gl.createBuffer()!;
    this.lineInst = gl.createBuffer()!;
    this.dotVao = this.makeVao([-1, -1, 1, -1, -1, 1, 1, 1], this.dotInst, 3);
    this.lineVao = this.makeVao([0, -1, 1, -1, 0, 1, 1, 1], this.lineInst, 2);
    map.on('zoomend', this.relayoutIfNeeded);
  }

  onRemove(map: MlMap, gl: WebGL2RenderingContext) {
    map.off('zoomend', this.relayoutIfNeeded);
    [this.dotInst, this.lineInst, this.haloInst].forEach((b) => b && gl.deleteBuffer(b));
    [this.dotProgram, this.lineProgram, this.glowProgram, this.haloProgram].forEach((p) => p && gl.deleteProgram(p));
    [this.arcTex, this.accumTex].forEach((t) => t && gl.deleteTexture(t));
    if (this.accumFbo) gl.deleteFramebuffer(this.accumFbo);
  }

  /** Offscreen buffer the dots sum into: RGBA16F where renderable, else RGBA8 scaled down. */
  private ensureAccum(gl: WebGL2RenderingContext, w: number, h: number) {
    if (this.accumFbo && this.accumSize[0] === w && this.accumSize[1] === h) return;
    this.accumTex ??= gl.createTexture()!;
    this.accumFbo ??= gl.createFramebuffer()!;
    const half = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    const alloc = (useHalf: boolean) => {
      gl.bindTexture(gl.TEXTURE_2D, this.accumTex!);
      if (useHalf) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo!);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accumTex!, 0);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    };
    const ok = half && alloc(true);
    if (!ok) alloc(false);
    this.accumScale = ok ? 1 : 8;
    this.accumSize = [w, h];
  }

  private makeVao(corners: number[], inst: WebGLBuffer, instSize: number) {
    const gl = this.gl!;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const cb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, instSize, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  private relayoutIfNeeded = () => {
    if (this.map && Math.abs(this.map.getZoom() - this.layoutZoom) >= 0.5) this.layoutZoom = -1;
  };

  /**
   * Allocate dot slots for the current zoom: lengths in px, which arcs are long
   * enough to draw (the rest fold into their origin's halo), unit U, instances.
   */
  private layout() {
    const gl = this.gl!;
    const data = this.data!;
    const n = data.maxV.length;
    const zoom = this.map!.getZoom();
    const worldPx = 512 * Math.pow(2, zoom);
    this.lengthPx = new Float32Array(n);
    this.drawn = new Uint8Array(n);
    const haloHours = Float32Array.from(this.halos.hours); // within + folded, per halo × hour
    let demand = 0;
    let drawnArcs = 0;
    let drawnDay = 0;
    let haloDay = this.halos.hours.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      this.lengthPx[i] = data.worldLen[i] * worldPx;
      const day = data.hours.subarray(i * 24, i * 24 + 24).reduce((a, b) => a + b, 0);
      if (this.lengthPx[i] >= MIN_ARC_PX) {
        this.drawn[i] = 1;
        drawnArcs++;
        drawnDay += day;
        if (!this.lineOnly[i]) demand += (data.maxV[i] * this.lengthPx[i]) / SPACING_PX;
      } else if (this.from[i] >= 0) {
        const f = this.from[i] * 24;
        for (let h = 0; h < 24; h++) haloHours[f + h] += data.hours[i * 24 + h];
        haloDay += day;
      }
    }
    const canvas = this.map!.getCanvas();
    const budget = this.budget || Math.max(2500, canvas.clientWidth * canvas.clientHeight * this.density);
    this.unit = chooseUnit(demand, budget);
    // Halo area ∝ trips; the largest possible halo in this scope gets R_MAX px.
    const rMax = Math.min(48, Math.max(18, 0.055 * Math.min(canvas.clientWidth, canvas.clientHeight)));
    let haloPeak = 1;
    for (let i = 0; i < haloHours.length; i++) haloPeak = Math.max(haloPeak, haloHours[i]);
    this.haloK = rMax / Math.sqrt(haloPeak);

    this.slots = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      this.slots[i] = this.drawn[i] && !this.lineOnly[i]
        ? Math.max(1, Math.ceil(dotsFor(data.maxV[i], this.lengthPx[i], this.unit))) : 0;
      total += this.slots[i];
    }
    const inst = new Float32Array(total * 3);
    let j = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < this.slots[i]; k++) {
        inst[j++] = i;
        inst[j++] = k;
        inst[j++] = radicalInverse(k);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dotInst!);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    this.dotCount = total;

    const lines = new Float32Array(drawnArcs * UNDERLAY_SEGMENTS * 2);
    j = 0;
    for (let i = 0; i < n; i++) {
      if (!this.drawn[i]) continue;
      for (let s = 0; s < UNDERLAY_SEGMENTS; s++) { lines[j++] = i; lines[j++] = s; }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineInst!);
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    this.lineCount = drawnArcs * UNDERLAY_SEGMENTS;

    this.arcRows = new Float32Array(Math.max(1, n) * 4 * 3);
    for (let i = 0; i < n; i++) {
      this.arcRows[(n + i) * 4 + 2] = this.lengthPx[i];
      this.arcRows[(n + i) * 4 + 3] = this.slots[i];
    }
    this.layoutZoom = zoom;
    this.onStats?.({ arcs: n, drawn: drawnArcs, dots: total, unit: this.unit, layoutZoom: zoom, drawnDay, haloDay });
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput) {
    if (!this.data || !this.dotProgram || !this.lineProgram) return;
    if (this.layoutZoom < 0) this.layout();
    const n = this.data.maxV.length;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;

    // Positions are sent relative to the map centre (computed in double
    // precision here), so dots stay on their curves at high zoom on GPUs whose
    // float maths would otherwise snap them to a coarse grid.
    const ref = MercatorCoordinate.fromLngLat(this.map!.getCenter());
    const rx = ref.x;
    const ry = ref.y;
    const merc = this.data.merc;
    // Per-frame rows: endpoints and control point (rows 0–1), then visible dots,
    // phase, underlay width and opacity (row 2).
    const hour = this.getHour();
    const row1 = n * 4;
    const row2 = 2 * n * 4;
    this.fold.fill(0);
    for (let i = 0; i < n; i++) {
      const m = i * 6;
      this.arcRows[i * 4] = merc[m] - rx;
      this.arcRows[i * 4 + 1] = merc[m + 1] - ry;
      this.arcRows[i * 4 + 2] = merc[m + 2] - rx;
      this.arcRows[i * 4 + 3] = merc[m + 3] - ry;
      this.arcRows[row1 + i * 4] = merc[m + 4] - rx;
      this.arcRows[row1 + i * 4 + 1] = merc[m + 5] - ry;
      const v = valueAt(this.data.hours.subarray(i * 24, i * 24 + 24), hour);
      if (!this.drawn[i] && this.from[i] >= 0) this.fold[this.from[i]] += v;
      if (!this.paused) this.phase[i] = (this.phase[i] + (dt * SPEED_PX_S) / this.lengthPx[i]) % 1;
      const rel = Math.sqrt(v / this.vScale);
      this.arcRows[row2 + i * 4] = dotsFor(v, this.lengthPx[i], this.unit);
      this.arcRows[row2 + i * 4 + 1] = this.phase[i];
      this.arcRows[row2 + i * 4 + 2] = 0.6 + 3.4 * rel;
      this.arcRows[row2 + i * 4 + 3] = v > 0 ? 0.03 + 0.3 * rel : 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.arcTex!);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, Math.max(1, n), 3, 0, gl.RGBA, gl.FLOAT, this.arcRows);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // The projection matrix, shifted so that the map centre is the origin.
    const M = options.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>;
    const matrix = Float32Array.from(M);
    for (let r = 0; r < 4; r++) matrix[12 + r] = M[r] * rx + M[4 + r] * ry + M[12 + r];
    const viewport: [number, number] = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    const dpr = window.devicePixelRatio || 1;
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);

    // Underlay: premultiplied alpha.
    gl.useProgram(this.lineProgram);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, 'u_matrix'), false, matrix);
    gl.uniform2f(gl.getUniformLocation(this.lineProgram, 'u_viewport'), viewport[0] / dpr, viewport[1] / dpr);
    gl.uniform1f(gl.getUniformLocation(this.lineProgram, 'u_segments'), UNDERLAY_SEGMENTS);
    gl.uniform1i(gl.getUniformLocation(this.lineProgram, 'u_arcs'), 0);
    gl.bindVertexArray(this.lineVao!);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.lineCount);

    // Dots: summed additively into the offscreen glow buffer…
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    this.ensureAccum(gl, viewport[0], viewport[1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo!);
    gl.viewport(0, 0, viewport[0], viewport[1]);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.dotProgram);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindTexture(gl.TEXTURE_2D, this.arcTex!);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.dotProgram, 'u_matrix'), false, matrix);
    gl.uniform2f(gl.getUniformLocation(this.dotProgram, 'u_viewport'), viewport[0] / dpr, viewport[1] / dpr);
    gl.uniform1f(gl.getUniformLocation(this.dotProgram, 'u_radius'), this.dotRadius);
    gl.uniform1f(gl.getUniformLocation(this.dotProgram, 'u_core'), this.coreOpacity);
    gl.uniform1f(gl.getUniformLocation(this.dotProgram, 'u_out'), 1 / this.accumScale);
    gl.uniform3fv(gl.getUniformLocation(this.dotProgram, 'u_from'), AMBER);
    gl.uniform3fv(gl.getUniformLocation(this.dotProgram, 'u_to'), AQUA);
    gl.uniform1i(gl.getUniformLocation(this.dotProgram, 'u_arcs'), 0);
    gl.bindVertexArray(this.dotVao!);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.dotCount);
    gl.bindVertexArray(null);

    // …then tone-mapped onto the map.
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    gl.useProgram(this.glowProgram!);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex!);
    gl.uniform1i(gl.getUniformLocation(this.glowProgram!, 'u_accum'), 0);
    gl.uniform1f(gl.getUniformLocation(this.glowProgram!, 'u_scale'), this.accumScale);
    gl.uniform1f(gl.getUniformLocation(this.glowProgram!, 'u_gain'), this.glowGain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Halos, on top: area ∝ trips inside (plus folded short trips), breathing slowly.
    const m = this.halos.maxV.length;
    if (m > 0) {
      const breath = this.paused ? 1 : 1 + 0.035 * Math.sin((now / 1000) * (2 * Math.PI / BREATH_S));
      for (let i = 0; i < m; i++) {
        const v = valueAt(this.halos.hours.subarray(i * 24, i * 24 + 24), hour) + this.fold[i];
        this.haloBuf[i * 3] = this.halos.merc[i * 2] - rx;
        this.haloBuf[i * 3 + 1] = this.halos.merc[i * 2 + 1] - ry;
        this.haloBuf[i * 3 + 2] = this.haloK * Math.sqrt(v) * breath;
      }
      gl.useProgram(this.haloProgram!);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.haloProgram!, 'u_matrix'), false, matrix);
      gl.uniform2f(gl.getUniformLocation(this.haloProgram!, 'u_viewport'), viewport[0] / dpr, viewport[1] / dpr);
      gl.uniform3fv(gl.getUniformLocation(this.haloProgram!, 'u_color'), LAVENDER);
      gl.uniform1f(gl.getUniformLocation(this.haloProgram!, 'u_gain'), this.haloGain);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.haloInst!);
      gl.bufferData(gl.ARRAY_BUFFER, this.haloBuf, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(this.haloVao!);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
      gl.bindVertexArray(null);
    }

    if (!this.paused) this.map!.triggerRepaint();
  }

  get currentUnit() {
    return this.unit;
  }
}
