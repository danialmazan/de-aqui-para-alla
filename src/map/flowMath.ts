// Pure maths behind the flow encoding. Kept free of WebGL so it can be tested.
//
// Encoding (plan §5): dots move at one uniform screen speed; their spacing
// along a connection is SPACING_PX · U / v, so dot density — and the number of
// dots passing any point per second — is proportional to v, the estimated trips
// per hour. U ("trips per hour per dot") comes from a fixed ladder and stays
// fixed through the 24-hour cycle so every hour is comparable.

export const SPACING_PX = 24;
/** Shortest on-screen arc worth drawing: two dot gaps. Shorter ones fold into halos. */
export const MIN_ARC_PX = 2 * SPACING_PX;
export const HOLD = 0.65; // share of each hour shown unchanged before morphing

export const UNIT_LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

export type Vec2 = [number, number];

export function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Weight of the next hour for a continuous clock value in [0, 24). */
export function hourBlend(hourFloat: number): { h0: number; h1: number; w: number } {
  const wrapped = ((hourFloat % 24) + 24) % 24;
  const h0 = Math.floor(wrapped);
  const f = wrapped - h0;
  const w = f <= HOLD ? 0 : smoothstep((f - HOLD) / (1 - HOLD));
  return { h0, h1: (h0 + 1) % 24, w };
}

export function valueAt(hours: ArrayLike<number>, hourFloat: number): number {
  const { h0, h1, w } = hourBlend(hourFloat);
  return hours[h0] * (1 - w) + hours[h1] * w;
}

/**
 * Smallest unit from the ladder whose total dot count stays within budget.
 * `demand` is Σ over arcs of (max hourly trips × screen length in px) / SPACING_PX,
 * i.e. the dot count the scope would need at U = 1.
 */
export function chooseUnit(demand: number, budget: number): number {
  for (const u of UNIT_LADDER) if (demand / u <= budget) return u;
  return UNIT_LADDER[UNIT_LADDER.length - 1];
}

/** Dots visible on an arc of `lengthPx` carrying `v` trips/hour at unit `unit`. */
export function dotsFor(v: number, lengthPx: number, unit: number): number {
  return (v * lengthPx) / (SPACING_PX * unit);
}

/** Van der Corput radical inverse (base 2): a stratified rank in [0, 1). */
export function radicalInverse(k: number): number {
  let x = 0;
  let f = 0.5;
  let n = k;
  while (n > 0) {
    if (n & 1) x += f;
    n >>= 1;
    f *= 0.5;
  }
  return x;
}

/**
 * Quadratic Bézier control point: the chord's midpoint pushed to the right of
 * travel (screen/mercator y points down), so A→B and B→A form two lanes.
 */
export function controlPoint(a: Vec2, b: Vec2, bend = 0.18): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend];
}

export function bezier(a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

export function bezierLength(a: Vec2, c: Vec2, b: Vec2, segments = 16): number {
  let len = 0;
  let prev = a;
  for (let i = 1; i <= segments; i++) {
    const p = bezier(a, c, b, i / segments);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}
