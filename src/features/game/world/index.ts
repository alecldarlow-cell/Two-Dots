/**
 * World system — barrel export.
 *
 * Public surface for the renderer and app shell:
 *   - WorldTheme + sub-types (the locked schema)
 *   - Theme registry (`themes`, `getTheme`)
 *   - Concrete themes by name (moonTheme; earthTheme + jupiterTheme TBD)
 */

export type {
  ColorStop,
  ScalarStop,
  ToD,
  CycleProfile,
  SkyGradient,
  SilhouetteProfile,
  Band,
  ParticleSpec,
  Celestial,
  WorldTheme,
} from './types';

export { themes, getTheme, moonTheme, earthTheme, type ThemeId } from './themes';
export { applyCycleProfile, cyclePhaseLabel, cycleProfileWeights } from './cycle';
export type { CyclePhaseLabel } from './cycle';
