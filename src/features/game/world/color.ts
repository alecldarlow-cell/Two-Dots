/**
 * Colour-space utilities for the world renderer.
 *
 * Why oklch: gradients authored as sRGB hex don't interpolate cleanly in
 * sRGB space — long sky gradients band visibly through muddy mid-tones,
 * and the HTML mockup will diverge from a Skia-on-srgb render. OKLCh is
 * perceptually uniform; interpolating L/C/H gives the smooth dawn↔dusk
 * transitions the schema designer authored.
 *
 * Pipeline:
 *   sRGB hex → linear RGB → OKLab → OKLCh   (preprocessing, once at
 *                                             module load)
 *   OKLCh ──lerp── OKLCh  → OKLab → linear RGB → sRGB hex
 *                                             (per ToD step)
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 *
 * Performance posture (v0.3 first pass): interpolation runs in JS at React
 * render time. The schema mandates worklet-side interpolation; that move
 * is a follow-up commit once `t` is wired to a Reanimated SharedValue
 * driven from the game clock. The math here is worklet-safe (pure number
 * ops, no closures over state) so the migration is a `'worklet'` directive
 * away.
 */

export type Oklch = readonly [number, number, number]; // [L, C, H_deg]

// ─── sRGB ↔ linear RGB ──────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ─── linear RGB ↔ OKLab (Björn Ottosson's matrices) ────────────────────────

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lc = Math.cbrt(l);
  const mc = Math.cbrt(m);
  const sc = Math.cbrt(s);

  return [
    0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc,
    1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc,
    0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc,
  ];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const lc = L + 0.3963377774 * a + 0.2158037573 * b;
  const mc = L - 0.1055613458 * a - 0.0638541728 * b;
  const sc = L - 0.0894841775 * a - 1.291485548 * b;

  const l = lc * lc * lc;
  const m = mc * mc * mc;
  const s = sc * sc * sc;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// ─── OKLab ↔ OKLCh ─────────────────────────────────────────────────────────

function oklabToOklch(L: number, a: number, b: number): Oklch {
  const C = Math.hypot(a, b);
  const H = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, C, H < 0 ? H + 360 : H];
}

function oklchToOklab(L: number, C: number, H: number): [number, number, number] {
  const r = (H * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

// ─── public API: hex ↔ oklch ───────────────────────────────────────────────

function hexToOklch(hex: string): Oklch {
  // Strip leading #, support #rgb and #rrggbb.
  let h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r8 = parseInt(h.slice(0, 2), 16);
  const g8 = parseInt(h.slice(2, 4), 16);
  const b8 = parseInt(h.slice(4, 6), 16);
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);
  const [L, A, B] = linearRgbToOklab(r, g, b);
  return oklabToOklch(L, A, B);
}

export function oklchToHex(o: Oklch): string {
  const [L, C, H] = o;
  const [oa, ob] = oklchToOklab(L, C, H).slice(1) as [number, number];
  const [r, g, b] = oklabToLinearRgb(L, oa, ob);
  // Clamp into sRGB gamut. OKLCh can produce out-of-gamut colours; for
  // display we accept the desaturation.
  const cl = (c: number): number => Math.max(0, Math.min(1, linearToSrgb(c)));
  const r8 = Math.round(cl(r) * 255);
  const g8 = Math.round(cl(g) * 255);
  const b8 = Math.round(cl(b) * 255);
  const toHex = (n: number): string => n.toString(16).padStart(2, '0');
  return `#${toHex(r8)}${toHex(g8)}${toHex(b8)}`;
}

// ─── interpolation primitives ──────────────────────────────────────────────

/**
 * Lerp two OKLCh tuples. Hue is interpolated along the shortest arc.
 * Pure number ops — safe to re-tag `'worklet'` later.
 */
export function lerpOklch(a: Oklch, b: Oklch, t: number): Oklch {
  const L = a[0] + (b[0] - a[0]) * t;
  const C = a[1] + (b[1] - a[1]) * t;

  // Shortest-arc hue lerp
  const h0 = a[2];
  let h1 = b[2];
  const dh = h1 - h0;
  if (dh > 180) h1 -= 360;
  else if (dh < -180) h1 += 360;
  let H = h0 + (h1 - h0) * t;
  if (H < 0) H += 360;
  else if (H >= 360) H -= 360;

  return [L, C, H];
}

// ─── ToD curve sampling ────────────────────────────────────────────────────

/**
 * Stops are at t = 0.00, 0.25, 0.50, 0.75. Convention: at t=1 we wrap to t=0.
 * Sample by finding the segment [t_i, t_{i+1}] containing t, then lerp.
 */
export function sampleOklchCurve(stops: ReadonlyArray<readonly [number, Oklch]>, t: number): Oklch {
  // Wrap t into [0, 1)
  const tt = t - Math.floor(t);
  // Build wrapping segment list: append [stops[0][0]+1, stops[0][1]] virtually.
  for (let i = 0; i < stops.length; i++) {
    const cur = stops[i]!;
    const next = stops[i + 1] ?? ([stops[0]![0] + 1, stops[0]![1]] as const);
    if (tt >= cur[0] && tt < next[0]) {
      const local = (tt - cur[0]) / (next[0] - cur[0]);
      return lerpOklch(cur[1], next[1], local);
    }
  }
  // tt landed past the last segment (e.g. stops only cover up to 0.75 and t=0.9):
  // wrap around — interpolate from last stop to first stop+1.
  const last = stops[stops.length - 1]!;
  const first = stops[0]!;
  const local = (tt - last[0]) / (first[0] + 1 - last[0]);
  return lerpOklch(last[1], first[1], local);
}

export function sampleScalarCurve(
  stops: ReadonlyArray<{ t: number; value: number }>,
  t: number,
): number {
  const tt = t - Math.floor(t);
  for (let i = 0; i < stops.length; i++) {
    const cur = stops[i]!;
    const next = stops[i + 1] ?? { t: stops[0]!.t + 1, value: stops[0]!.value };
    if (tt >= cur.t && tt < next.t) {
      const local = (tt - cur.t) / (next.t - cur.t);
      return cur.value + (next.value - cur.value) * local;
    }
  }
  const last = stops[stops.length - 1]!;
  const first = stops[0]!;
  const local = (tt - last.t) / (first.t + 1 - last.t);
  return last.value + (first.value - last.value) * local;
}

/** Preprocess hex stops to oklch tuples. Frozen (`as const`) safe. */
export function preprocessHexCurve(
  stops: ReadonlyArray<{ t: number; color: string }>,
): ReadonlyArray<readonly [number, Oklch]> {
  return stops.map((s) => [s.t, hexToOklch(s.color)] as const);
}
