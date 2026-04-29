/**
 * Silhouette path generators — shared geometry for the Skia production
 * renderer AND the HTML/SVG iteration tool.
 *
 * Each function returns an SVG path `d` string in BAND-LOCAL coordinates:
 *   x ∈ [0, span]      where span depends on the profile (typically 2-2.5× width)
 *   y ∈ [0, heightPx]  where y=0 is the top of the band, y=heightPx is the bottom
 *
 * Callers translate the path into canvas position via a wrapper:
 *   - Skia:    <Group transform={[{ translateX }, { translateY: yPx }]}>
 *   - SVG/HTML: <g transform={`translate(0, ${yPx})`}>
 *
 * SVG path strings are consumed in production via Skia.Path.MakeFromSVGString
 * (Skia's parser accepts comma-separated coordinates per W3C spec — verified
 * against @shopify/react-native-skia's own Path.spec.ts).
 *
 * ROUND 6 STATE — the iteration tool and production renderer must produce
 * identical visual output from these functions. Any change here propagates
 * to both renderers. That's the point.
 */

import { mulberry32 } from './prng';

/**
 * 'mountains' — Earth peaked Bezier ridge with random peak/valley nodes.
 * Round 6: peaks lowered (0.65-0.95 → 0.45-0.75 of band height) for gentler
 * slopes, less aggressive silhouette.
 */
export function mountainsSvgPath(width: number, heightPx: number, seed: number): string {
  const rng = mulberry32(seed);
  const span = width * 2.5;
  const numNodes = 5;
  const nodes: Array<readonly [number, number]> = [];
  for (let i = 0; i <= numNodes; i++) {
    const x = (i / numNodes) * span;
    const isPeak = i % 2 === 1;
    const heightFrac = isPeak ? 0.45 + rng() * 0.3 : 0.15 + rng() * 0.2;
    nodes.push([x, heightPx * (1 - heightFrac)]);
  }

  let d = `M ${nodes[0]![0]},${heightPx} L ${nodes[0]![0]},${nodes[0]![1]}`;
  for (let i = 1; i < nodes.length; i++) {
    const p0 = nodes[i - 1]!;
    const p1 = nodes[i]!;
    const dx = p1[0] - p0[0];
    const c1x = p0[0] + dx * 0.4;
    const c1y = p0[1];
    const c2x = p1[0] - dx * 0.4;
    const c2y = p1[1];
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p1[0]},${p1[1]}`;
  }
  const last = nodes[nodes.length - 1]!;
  d += ` L ${last[0]},${heightPx} Z`;
  return d;
}

/**
 * 'hills' — Earth gentle low-frequency rolling sine. Soft, broad shoulders,
 * no peaks. Anchored to bottom of band; top edge undulates ~25-50% of band
 * height.
 *
 * Currently unused by any band (Earth's rollingHills band was removed in
 * round 6) but the profile is preserved for potential future use.
 */
export function hillsSvgPath(width: number, heightPx: number, seed: number): string {
  const rng = mulberry32(seed);
  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const points = 60;
  const span = width * 2.4;
  let d = `M 0,${heightPx}`;
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const y =
      Math.sin(x * 0.0035 + j1) * heightPx * 0.3 +
      Math.sin(x * 0.011 + j2) * heightPx * 0.13 +
      Math.sin(x * 0.045 + rng() * 6) * heightPx * 0.04 +
      heightPx * 0.55;
    d += ` L ${x},${y}`;
  }
  d += ` L ${span},${heightPx} Z`;
  return d;
}

/**
 * 'singleHill' — Earth flat foreground rise. Round 6: bell curve with peak
 * lowered (h*0.05 → h*0.55), surface ripple removed, 120 points for smoother
 * lines. Pairs with the singleHill band's slowed parallax (0.30) so the peak
 * sits low on screen.
 */
export function singleHillSvgPath(width: number, heightPx: number): string {
  const span = width * 2.0;
  const peakX = span * 0.42;
  const peakY = heightPx * 0.55;
  const points = 120;
  let d = `M 0,${heightPx}`;
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const dx = (x - peakX) / (span * 0.55);
    const bell = 1 / (1 + dx * dx);
    const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
    const y = heightPx - (heightPx - peakY) * bell + tilt;
    d += ` L ${x},${y}`;
  }
  d += ` L ${span},${heightPx} Z`;
  return d;
}

/**
 * 'cratered-horizon' — Moon mid ridge. Round 6: 96 points across 2.4× width.
 * Three-octave silhouette: large primary peaks (sin × 0.018, h × 0.55) +
 * medium variation (sin × 0.07, h × 0.20) + fine surface detail (sin × 0.18,
 * h × 0.06). Base shifted up (h × 0.40) so peaks reach higher. Wider crater
 * dip events (~every 200x) for sharper foreground crater feel.
 */
export function crateredHorizonSvgPath(width: number, heightPx: number, seed: number): string {
  const rng = mulberry32(seed);
  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const j3 = rng() * 6;
  const points = 96;
  const span = width * 2.4;
  let d = `M 0,${heightPx}`;
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const base =
      Math.sin(x * 0.018 + j1) * heightPx * 0.55 +
      Math.sin(x * 0.07 + j2) * heightPx * 0.2 +
      Math.sin(x * 0.18 + j3) * heightPx * 0.06 +
      heightPx * 0.4;
    const crater = Math.sin(x * 0.005) > 0.85 ? -heightPx * 0.12 : 0;
    d += ` L ${x},${base + crater}`;
  }
  d += ` L ${span},${heightPx} Z`;
  return d;
}

/**
 * 'soft-craters' — Moon far ridge — single low-frequency octave, capped at
 * 55% band height.
 *
 * Currently unused (Moon's farRidge band was removed in round 6) but
 * preserved for potential future use.
 */
export function softCratersSvgPath(width: number, heightPx: number, seed: number): string {
  const tileW = width * 2;
  const step = 4;
  let d = `M 0,${heightPx}`;
  for (let x = 0; x <= tileW; x += step) {
    const base = Math.sin(x * 0.012 + seed) * 0.5;
    const wobble = Math.sin(x * 0.04 + seed * 1.7) * 0.15;
    const yLocal = (0.5 + (base + wobble) * 0.5) * heightPx * 0.55;
    d += ` L ${x},${yLocal}`;
  }
  d += ` L ${tileW},${heightPx} Z`;
  return d;
}

/**
 * 'storm-bands' — Jupiter atmospheric ribbon with subtle flow undulation
 * along the top edge. Amplitude is intentionally small (~6% of band height)
 * so each band reads as a horizontal stripe, not a wave.
 *
 * NOTE: This module reflects production's current storm-bands implementation,
 * which is round-6 vintage. The iteration tool's storm-bands has diverged
 * (round-7 Jupiter Claude Design merge in flight). Do NOT update this
 * function from the iteration tool until Jupiter design locks. See
 * tools/handoff-shipwork.md.
 */
export function stormBandsSvgPath(width: number, heightPx: number, seed: number): string {
  const tileW = width * 2;
  const step = 6;
  let d = `M 0,${heightPx}`;
  for (let x = 0; x <= tileW; x += step) {
    const flow =
      Math.sin(x * 0.008 + seed) * 0.05 + Math.sin(x * 0.025 + seed * 1.4) * 0.025;
    const yLocal = flow * heightPx;
    d += ` L ${x},${yLocal}`;
  }
  d += ` L ${tileW},${heightPx} Z`;
  return d;
}

/** Dispatch table — pick a path generator by SilhouetteProfile name. */
export const SILHOUETTE_PATH_BUILDERS = {
  mountains: mountainsSvgPath,
  hills: hillsSvgPath,
  singleHill: (width: number, heightPx: number, _seed: number) =>
    singleHillSvgPath(width, heightPx),
  'cratered-horizon': crateredHorizonSvgPath,
  'soft-craters': softCratersSvgPath,
  'storm-bands': stormBandsSvgPath,
} as const;
