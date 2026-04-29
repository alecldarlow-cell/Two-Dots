/**
 * World geometry — shared procedural geometry for the Skia production
 * renderer AND the HTML/SVG iteration tool.
 *
 * This module is the single source of truth for:
 *   - Silhouette path generators (mountains, hills, singleHill, cratered-
 *     horizon, soft-craters, storm-bands)
 *   - Crater field placement (power-law sizing, overlap rejection, two-shade)
 *   - Cloud bubble layout (clip-path flat-bottom)
 *   - Bird wing geometry (signed wingtip oscillation + perpendicular curl)
 *   - Grass blade clumps (three-blade + occasional rogue, two-tone)
 *   - Earth-from-Moon continent paths and feature dimensions
 *   - Deterministic per-theme/per-band PRNG (mulberry32 + themeSeed)
 *
 * All functions are pure (no side effects, deterministic on seed) and
 * environment-agnostic (no Skia, no DOM). Rendering primitives — Skia.Path,
 * SVG <path>, <ellipse>, etc. — are the consumer's responsibility.
 *
 * Drift mitigation: any change to a coefficient or formula here propagates
 * to BOTH renderers automatically. See tools/handoff-shipwork.md "Drift
 * mitigation — architectural intent" for context.
 */

export { mulberry32, themeSeed } from './prng';

export {
  mountainsSvgPath,
  hillsSvgPath,
  singleHillSvgPath,
  crateredHorizonSvgPath,
  softCratersSvgPath,
  stormBandsSvgPath,
  SILHOUETTE_PATH_BUILDERS,
} from './paths';

export type { Crater } from './craters';
export { seedCraters, craterRimBounds, craterBowlBounds } from './craters';

export type { CloudBubble, CloudSeed } from './clouds';
export { seedClouds, CLOUD_CLIP_RECT } from './clouds';

export type { BirdSeed } from './birds';
export { seedBirds, birdScreenX, computeBirdWingPoints, birdStrokeWidth } from './birds';

export type { BladeSpec } from './grass';
export {
  seedGrassBlades,
  computeBladePoints,
  GRASS_LIGHT_STOPS,
  GRASS_DARK_STOPS,
} from './grass';

export {
  continentsSvgPath,
  madagascarBounds,
  northIceCapBounds,
  southIceCapBounds,
  TERMINATOR_OFFSET_FRAC,
  TERMINATOR_OPACITY,
  TERMINATOR_COLOR,
  EARTH_HALO_RADIUS_MUL,
  EARTH_HALO_COLOR,
  EARTH_CONTINENT_COLOR,
  EARTH_ICE_COLOR,
  EARTH_ICE_OPACITY,
} from './continents';
