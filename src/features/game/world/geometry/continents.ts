/**
 * Earth-from-Moon continents — shared geometry for the Skia production
 * renderer AND the HTML/SVG iteration tool.
 *
 * Round 6 addition: replaces the abstract-blob 'planet' rendering for the
 * Moon's earth-in-sky celestial. Africa-Europe view (the iconic Earth-from-
 * Moon angle): Africa, Europe, South America fragment, North America
 * fragment, Madagascar, polar ice caps, soft terminator on the lower-right.
 *
 * All paths are SVG path strings parameterised by (cx, cy, r) where (cx, cy)
 * is Earth's center and r is the body radius.
 *
 * Both renderers should clip the continents + ice caps + Madagascar +
 * terminator to the body circle (a circle path of radius r at cx, cy).
 */

/**
 * Combined continents path (Africa + Europe + S.America fragment + N.America
 * fragment) as one SVG path string. Each continent is a closed subpath, so
 * Skia parses them as four disjoint shapes and SVG renderers respect the
 * same. Madagascar is a separate `madagascarSvgPath` because it's a small
 * ellipse, not a Q-curve outline.
 */
export function continentsSvgPath(cx: number, cy: number, r: number): string {
  const x = cx;
  const y = cy;
  const parts = [
    // Africa — taller than wide, distinct horn east, narrow Cape south.
    `M ${x - r * 0.08},${y - r * 0.46}` +
      ` L ${x + r * 0.14},${y - r * 0.44}` +
      ` Q ${x + r * 0.22},${y - r * 0.36} ${x + r * 0.22},${y - r * 0.18}` +
      ` Q ${x + r * 0.3},${y - r * 0.02} ${x + r * 0.26},${y + r * 0.1}` +
      ` Q ${x + r * 0.14},${y + r * 0.2} ${x + r * 0.06},${y + r * 0.35}` +
      ` Q ${x - r * 0.02},${y + r * 0.5} ${x - r * 0.06},${y + r * 0.58}` +
      ` Q ${x - r * 0.18},${y + r * 0.48} ${x - r * 0.22},${y + r * 0.32}` +
      ` Q ${x - r * 0.27},${y + r * 0.1} ${x - r * 0.25},${y - r * 0.12}` +
      ` Q ${x - r * 0.22},${y - r * 0.32} ${x - r * 0.16},${y - r * 0.42}` +
      ` Q ${x - r * 0.12},${y - r * 0.46} ${x - r * 0.08},${y - r * 0.46} Z`,
    // Europe — Iberian bump west, Italian boot middle, eastward Eurasia.
    `M ${x - r * 0.22},${y - r * 0.5}` +
      ` Q ${x - r * 0.3},${y - r * 0.62} ${x - r * 0.15},${y - r * 0.66}` +
      ` Q ${x + r * 0.05},${y - r * 0.72} ${x + r * 0.25},${y - r * 0.66}` +
      ` Q ${x + r * 0.4},${y - r * 0.6} ${x + r * 0.42},${y - r * 0.5}` +
      ` Q ${x + r * 0.34},${y - r * 0.46} ${x + r * 0.2},${y - r * 0.48}` +
      ` L ${x + r * 0.08},${y - r * 0.44}` +
      ` Q ${x + r * 0.04},${y - r * 0.4} ${x + r * 0},${y - r * 0.45}` +
      ` L ${x - r * 0.1},${y - r * 0.46}` +
      ` Q ${x - r * 0.18},${y - r * 0.44} ${x - r * 0.22},${y - r * 0.5} Z`,
    // South America fragment — western limb, wider top → narrow Patagonia.
    `M ${x - r * 0.85},${y - r * 0.1}` +
      ` Q ${x - r * 0.55},${y - r * 0.05} ${x - r * 0.48},${y + r * 0.08}` +
      ` Q ${x - r * 0.5},${y + r * 0.25} ${x - r * 0.55},${y + r * 0.4}` +
      ` Q ${x - r * 0.6},${y + r * 0.5} ${x - r * 0.65},${y + r * 0.42}` +
      ` Q ${x - r * 0.62},${y + r * 0.25} ${x - r * 0.68},${y + r * 0.1}` +
      ` Q ${x - r * 0.78},${y + r * 0} ${x - r * 0.85},${y - r * 0.1} Z`,
    // North America fragment — upper-left, partial.
    `M ${x - r * 0.85},${y - r * 0.5}` +
      ` Q ${x - r * 0.55},${y - r * 0.45} ${x - r * 0.42},${y - r * 0.3}` +
      ` Q ${x - r * 0.4},${y - r * 0.18} ${x - r * 0.5},${y - r * 0.12}` +
      ` Q ${x - r * 0.65},${y - r * 0.18} ${x - r * 0.78},${y - r * 0.3}` +
      ` Q ${x - r * 0.88},${y - r * 0.4} ${x - r * 0.85},${y - r * 0.5} Z`,
  ];
  return parts.join(' ');
}

/**
 * Madagascar — small island east of southern Africa. Bounding rect for the
 * ellipse so Skia's addOval and SVG's <ellipse> can each consume it.
 */
export function madagascarBounds(cx: number, cy: number, r: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rx = r * 0.04;
  const ry = r * 0.1;
  return {
    x: cx + r * 0.34 - rx,
    y: cy + r * 0.22 - ry,
    width: rx * 2,
    height: ry * 2,
  };
}

/**
 * North polar ice cap — flattened ellipse near the top of the body circle.
 */
export function northIceCapBounds(cx: number, cy: number, r: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rx = r * 0.55;
  const ry = r * 0.18;
  return {
    x: cx - rx,
    y: cy - r * 0.95 - ry,
    width: rx * 2,
    height: ry * 2,
  };
}

/**
 * South polar ice cap — slightly smaller than the north cap.
 */
export function southIceCapBounds(cx: number, cy: number, r: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rx = r * 0.5;
  const ry = r * 0.15;
  return {
    x: cx - rx,
    y: cy + r * 0.95 - ry,
    width: rx * 2,
    height: ry * 2,
  };
}

/**
 * Soft terminator — dark crescent on the lower-right of the ocean body.
 * Implemented as an offset circle of the same radius as Earth, fill black,
 * opacity 0.22, clipped to the body. Renderer composes the actual Circle.
 */
export const TERMINATOR_OFFSET_FRAC = { x: 0.35, y: 0.05 } as const;
export const TERMINATOR_OPACITY = 0.22;
export const TERMINATOR_COLOR = '#000000';

/**
 * Fixed visual constants for the Earth body — kept here so the iteration
 * tool and production stay in sync if any of these change in a future round.
 */
export const EARTH_HALO_RADIUS_MUL = 1.8;
export const EARTH_HALO_COLOR = '#a8d0f0'; // light atmospheric blue
export const EARTH_CONTINENT_COLOR = '#3a7a3e'; // muted green
export const EARTH_ICE_COLOR = '#ffffff';
export const EARTH_ICE_OPACITY = 0.85;
