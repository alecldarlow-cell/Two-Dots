/**
 * Crater field seeder — shared geometry for the Skia production renderer
 * AND the HTML/SVG iteration tool.
 *
 * Craters are STATIC features of the regolith (round 6) — they don't drift
 * with scroll. Renderers ignore band.parallax for the craters branch.
 *
 * Power-law size distribution (75% small / 20% medium / 5% large) gives the
 * moon-realistic mix; 25-attempt overlap rejection with 10% buffer prevents
 * pile-ups. Each crater renders as two ellipses: outer rim (lighter, 1.08×,
 * sun-catch halo) + inner bowl (offset up by 15% of ry, darker, suggests
 * depth from above-light viewing angle).
 *
 * Returns pure data (Crater[]). Callers build their own primitives:
 *   - Skia: Skia.Path.Make().addOval({...rim/bowl bounds...})
 *   - SVG:  <ellipse cx={c.x} cy={c.y - ...} rx={...} ry={...} />
 */

import { mulberry32 } from './prng';

/**
 * Crater data — position, size, and per-crater opacity for depth variation.
 * Coordinates are in canvas/screen space (the seeder takes a yPx + heightPx
 * band region and places craters within it).
 */
export type Crater = {
  /** Crater center x in canvas coords (0..width). */
  x: number;
  /** Crater center y in canvas coords (within yPx..yPx+heightPx). */
  y: number;
  /** Horizontal radius in pixels. */
  rx: number;
  /** Vertical radius in pixels (smaller — gives the elliptical "viewed from
   *  above" look without a perspective transform). */
  ry: number;
  /** Per-crater alpha multiplier (0.55-0.90). Bowl uses opacity directly;
   *  rim uses opacity × 0.4 (subtle sun-catch halo). */
  opacity: number;
};

/**
 * Seed a static crater field within a band.
 *
 * @param width    canvas/screen width — craters are placed across [0, width]
 * @param yPx      band top in canvas coords (e.g. moon foreground band's yPx)
 * @param heightPx band height in pixels
 * @param seed     deterministic per-band seed
 *
 * Returns an array of up to 32 craters (some attempts may fail due to
 * overlap rejection; the actual count is typically 28-32 depending on seed).
 */
export function seedCraters(
  width: number,
  yPx: number,
  heightPx: number,
  seed: number,
): Crater[] {
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const out: Crater[] = [];
  const targetCount = 32;

  for (let i = 0; i < targetCount; i++) {
    const sizeRoll = rng();
    let rx: number;
    let ry: number;
    if (sizeRoll < 0.75) {
      rx = 6 + rng() * 8; // 6-14 (small)
      ry = 2 + rng() * 2; // 2-4
    } else if (sizeRoll < 0.95) {
      rx = 14 + rng() * 14; // 14-28 (medium)
      ry = 4 + rng() * 3; // 4-7
    } else {
      rx = 28 + rng() * 22; // 28-50 (large — rare)
      ry = 7 + rng() * 5; // 7-12
    }

    // Up to 25 placement attempts; skip if we can't avoid overlap (10% buffer
    // around existing crater bounds). Same per-attempt rng() consumption
    // pattern as the iteration tool — keeps placements deterministic.
    let placed = false;
    for (let attempt = 0; attempt < 25 && !placed; attempt++) {
      const cx = rng() * width;
      const cy = yPx + heightPx * 0.05 + rng() * heightPx * 0.9;
      let overlaps = false;
      for (const e of out) {
        const dxc = cx - e.x;
        const dyc = cy - e.y;
        const dist = Math.sqrt(dxc * dxc + dyc * dyc);
        const minDist = (rx + e.rx) * 1.1;
        if (dist < minDist) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        out.push({ x: cx, y: cy, rx, ry, opacity: 0.55 + rng() * 0.35 });
        placed = true;
      }
    }
  }
  return out;
}

/**
 * Compute the bounding rect for a crater's rim ellipse (outer halo, 1.08×
 * of crater rx/ry). Both renderers can pass this to their native primitive
 * (Skia.Path.addOval / SVG <ellipse>).
 */
export function craterRimBounds(c: Crater): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: c.x - c.rx * 1.08,
    y: c.y - c.ry * 1.08,
    width: c.rx * 1.08 * 2,
    height: c.ry * 1.08 * 2,
  };
}

/**
 * Compute the bounding rect for a crater's bowl ellipse (inner shadow,
 * offset upward by 15% of ry to suggest depth from above-light viewing).
 * Bowl is rx × 0.85, ry × 0.8 (slightly more flattened than the rim).
 */
export function craterBowlBounds(c: Crater): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: c.x - c.rx * 0.85,
    y: c.y - c.ry * 0.15 - c.ry * 0.8,
    width: c.rx * 0.85 * 2,
    height: c.ry * 0.8 * 2,
  };
}
