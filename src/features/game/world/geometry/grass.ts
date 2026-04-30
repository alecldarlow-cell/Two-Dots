/**
 * Grass tuft seeder — shared geometry for the Skia production renderer
 * AND the HTML/SVG iteration tool. Round 6 addition.
 *
 * Three-blade clumps with curl on the singleHill silhouette top edge.
 * Two-tone (lighter front blade over darker side blades) for depth.
 * ToD-aware colours (curves provided here as constants for convenience —
 * each renderer interpolates them through its own colour pipeline).
 *
 * Per-clump scale + position jitter; ~18% gap probability creates visible
 * clusters and gaps. Optional 4th rogue blade per clump (20%) breaks the
 * symmetric 3-blade pattern.
 *
 * Returns blade specs split into LIGHT (center + occasional rogue) and
 * DARK (left + right) lists. Each blade renders as a closed two-Q-curve
 * leaf shape — math computed in `computeBladePoints` for both renderers.
 */

import { mulberry32 } from './prng';

export type BladeSpec = {
  /** Blade attachment x in canvas coords. */
  xBase: number;
  /** Blade attachment y in canvas coords (sits on the silhouette top edge). */
  yBase: number;
  /** Tilt from vertical, in radians. 0 = straight up; positive = lean right. */
  angle: number;
  /** Blade length in pixels. */
  length: number;
  /** Half-width of blade base (controls thickness). */
  baseWidth: number;
  /** Bend direction along the blade (-1..+1). Positive = curl right. */
  curlDir: number;
};

/**
 * Two-tone grass colour curves — vivid in day, muted dawn/dusk, near-black
 * at night. Both renderers should interpolate these against ToD `t` via
 * their own colour pipeline. Provided here as the source of truth so the
 * tones stay in sync across renderers.
 */
export const GRASS_LIGHT_STOPS = [
  { t: 0.0, color: '#6a8458' }, // dawn — cool muted green
  { t: 0.25, color: '#5aa040' }, // day  — vivid grass green
  { t: 0.5, color: '#7a8038' }, // dusk — warm olive
  { t: 0.75, color: '#0a1410' }, // night — near-black green
] as const;

export const GRASS_DARK_STOPS = [
  { t: 0.0, color: '#3e5430' }, // dawn — deep moss
  { t: 0.25, color: '#356528' }, // day  — saturated forest
  { t: 0.5, color: '#4f5020' }, // dusk — dark olive
  { t: 0.75, color: '#050a08' }, // night — almost black
] as const;

/**
 * Seed grass blades for a singleHill band. Returns two arrays so renderers
 * can render the dark layer first, then the light layer on top (depth).
 *
 * @param width    canvas width
 * @param heightPx band height in pixels (singleHill bell math depends on this)
 * @param seed     deterministic seed
 *
 * Blade coordinates are BAND-LOCAL (y=0 at top of band, y=heightPx at bottom).
 * Both renderers wrap the resulting paths in a translateY = yPx group:
 *   - Skia:    <Group transform={[{ translateX }, { translateY: yPx }]}>
 *   - SVG/HTML: <g transform={`translate(0, ${yPx})`}>
 *
 * The bell curve placement matches `singleHillSvgPath` — blade bases sit
 * exactly on the silhouette top edge.
 */
export function seedGrassBlades(
  width: number,
  heightPx: number,
  seed: number,
): { light: BladeSpec[]; dark: BladeSpec[] } {
  const rng = mulberry32(seed ^ 0x60ad60ad);
  const span = width * 2.0;
  const peakX = span * 0.42;
  const peakY = heightPx * 0.55; // matches singleHillSvgPath
  const clumpSpacing = 22;

  const light: BladeSpec[] = [];
  const dark: BladeSpec[] = [];

  for (let x = 0; x <= span; x += clumpSpacing) {
    if (rng() < 0.18) continue; // ~18% gaps
    const dx = (x - peakX) / (span * 0.55);
    const bell = 1 / (1 + dx * dx);
    const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
    const yEdge = heightPx - (heightPx - peakY) * bell + tilt;
    const xJitter = (rng() - 0.5) * clumpSpacing * 0.4;
    const xPos = x + xJitter;
    const clumpScale = 0.7 + rng() * 0.7; // 0.7-1.4

    // Center blade — tallest, mostly vertical, lighter shade.
    light.push({
      xBase: xPos,
      yBase: yEdge,
      angle: (rng() - 0.5) * 0.5, // ±~14° wobble
      length: (16 + rng() * 10) * clumpScale,
      baseWidth: (1.8 + rng() * 0.6) * clumpScale,
      curlDir: (rng() - 0.5) * 1.2,
    });

    // Left blade — angled out left, shorter, darker.
    dark.push({
      xBase: xPos - 2,
      yBase: yEdge,
      angle: -0.45 + (rng() - 0.5) * 0.45,
      length: (12 + rng() * 5) * clumpScale,
      baseWidth: (1.3 + rng() * 0.4) * clumpScale,
      curlDir: 0.5 + rng() * 0.5,
    });

    // Right blade — angled out right, shorter, darker.
    dark.push({
      xBase: xPos + 2,
      yBase: yEdge,
      angle: 0.45 + (rng() - 0.5) * 0.45,
      length: (12 + rng() * 5) * clumpScale,
      baseWidth: (1.3 + rng() * 0.4) * clumpScale,
      curlDir: -(0.5 + rng() * 0.5),
    });

    // Occasional rogue 4th blade — random angle, lighter, breaks pattern.
    if (rng() < 0.2) {
      light.push({
        xBase: xPos + (rng() - 0.5) * 4,
        yBase: yEdge,
        angle: (rng() - 0.5) * 1.0,
        length: (10 + rng() * 6) * clumpScale,
        baseWidth: (1.2 + rng() * 0.4) * clumpScale,
        curlDir: (rng() - 0.5) * 1.5,
      });
    }
  }

  return { light, dark };
}

/**
 * Compute the 4 control/anchor points needed to draw a single curved blade
 * as a closed two-Q-curve shape:
 *
 *   M (baseLeft)
 *   Q (ctrl1) (tip)
 *   Q (ctrl2) (baseRight)  Z
 *
 * Returns the points so each renderer can build its native primitive
 * (Skia.Path.quadTo / SVG `Q`).
 */
export function computeBladePoints(blade: BladeSpec): {
  baseLeft: readonly [number, number];
  ctrl1: readonly [number, number];
  tip: readonly [number, number];
  ctrl2: readonly [number, number];
  baseRight: readonly [number, number];
} {
  const { xBase, yBase, angle, length, baseWidth, curlDir } = blade;
  const tipX = xBase + Math.sin(angle) * length;
  const tipY = yBase - Math.cos(angle) * length;
  const midX = xBase + Math.sin(angle) * length * 0.5;
  const midY = yBase - Math.cos(angle) * length * 0.5;
  const curlAmount = length * 0.15 * curlDir;
  const curlX = Math.cos(angle) * curlAmount;
  const curlY = Math.sin(angle) * curlAmount;
  const perpX = Math.cos(angle) * baseWidth * 0.5;
  const perpY = Math.sin(angle) * baseWidth * 0.5;

  return {
    baseLeft: [xBase - baseWidth, yBase],
    ctrl1: [midX + curlX - perpX, midY + curlY - perpY],
    tip: [tipX, tipY],
    ctrl2: [midX + curlX + perpX, midY + curlY + perpY],
    baseRight: [xBase + baseWidth, yBase],
  };
}
