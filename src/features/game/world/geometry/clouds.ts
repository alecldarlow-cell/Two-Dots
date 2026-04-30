/**
 * Cloud bubble layout seeder — shared geometry for the Skia production
 * renderer AND the HTML/SVG iteration tool.
 *
 * Each cloud = 6-8 heavily-overlapping circles, clipped to y ≤ 0 in
 * cloud-local coords so all bubble bottoms truncate at the same line
 * (round 6: clip-path flat-bottom). Without the clip, the envelope between
 * adjacent bubbles dips upward and the cloud bottom reads as scalloped.
 *
 * Returns pure data (CloudSeed[]). Callers position with their own drift
 * math and render bubbles via native primitives:
 *   - Skia: <Group clip={CLOUD_CLIP_PATH}>{bubbles.map(b => <Circle .../>)}</Group>
 *   - SVG:  <g clipPath="url(#cloud-clip)">{bubbles.map(b => <circle .../>)}</g>
 *
 * The shared clip rectangle is provided as CLOUD_CLIP_RECT for callers that
 * want the same rect dimensions on both sides.
 */

import { mulberry32 } from './prng';

export type CloudBubble = {
  /** Bubble center x in cloud-local coords (cloud center ~= 0). */
  bx: number;
  /** Bubble center y in cloud-local coords (always negative; cloud baseline
   *  is y=0, bubble bottoms sit at +0.12br just below). */
  by: number;
  /** Bubble radius in pixels. */
  br: number;
};

export type CloudSeed = {
  /** Cloud's seed x position before drift wrap (passed to drift formula). */
  baseX: number;
  /** Cloud's anchor y in canvas coords. */
  baseY: number;
  /** Per-cloud scale (0.85-1.4) — multiplies bubble radii. */
  scale: number;
  /** Drift phase offset for time-based wrap (each cloud at a unique phase). */
  driftPhase: number;
  /** 6-8 overlapping bubbles forming the cumulus silhouette. */
  bubbles: CloudBubble[];
  /** Per-cloud alpha (0.75-0.95). Multiplied with density at render time. */
  alpha: number;
};

/**
 * Seed a flock of clouds for the upper sky region.
 *
 * @param width   canvas width
 * @param visH    visible canvas height (the cloud anchor region is ~6-34% of this)
 * @param count   number of clouds to seed
 * @param seed    deterministic seed
 */
export function seedClouds(
  width: number,
  visH: number,
  count: number,
  seed: number,
): CloudSeed[] {
  const rng = mulberry32(seed ^ 0x33333333);
  const out: CloudSeed[] = [];

  for (let i = 0; i < count; i++) {
    const baseX = rng() * width * 1.4;
    const baseY = 0.06 * visH + rng() * 0.28 * visH;
    const driftPhase = rng() * 1000;
    const scale = 0.85 + rng() * 0.55;
    const alpha = 0.75 + rng() * 0.2;

    // 6-8 bubbles, base radius ~18-26 × scale, tight overlap (≈0.42× radius)
    // so they fuse into one continuous silhouette.
    const bubbleCount = 6 + Math.floor(rng() * 3);
    const baseR = (18 + rng() * 8) * scale;
    const stepX = baseR * 0.42;
    const totalSpan = stepX * (bubbleCount - 1);

    const bubbles: CloudBubble[] = [];
    for (let b = 0; b < bubbleCount; b++) {
      const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.3;
      // Bigger in the middle, smaller at edges — classic cumulus dome.
      const distFromCenter =
        Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.3 + (rng() - 0.5) * 0.15;
      const br = baseR * sizeFactor;
      // ALL bubbles share the same bottom: center at y = -br + 0.12br, so
      // bottom sits at y = 0.12br (slightly below cloud-local y=0). The
      // clip-path then uniformly truncates every bubble at y=0.
      const by = -br + br * 0.12;
      bubbles.push({ bx, by, br });
    }
    out.push({ baseX, baseY, scale, driftPhase, bubbles, alpha });
  }
  return out;
}

/**
 * Shared clip rectangle dimensions for the cloud flat-bottom clip. Both
 * renderers should use these values (or build their native clip path from
 * them) to ensure identical truncation.
 *
 * Coords are in cloud-local space (origin = cloud anchor, y=0 = baseline).
 * Keeps everything with y ≤ 0 visible.
 */
export const CLOUD_CLIP_RECT = {
  x: -300,
  y: -300,
  width: 600,
  height: 300,
} as const;
