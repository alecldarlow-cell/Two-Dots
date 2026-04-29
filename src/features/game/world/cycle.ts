/**
 * Cycle profile mapping — raw player time → curve-sample t.
 *
 * Real worlds spend most of their time in DAY or NIGHT, with brief DAWN/DUSK
 * transitions in between. Schema authors anchor 4 keyframes at curve-t =
 * 0 / 0.25 / 0.5 / 0.75 (dawn/day/dusk/night). This file provides the
 * mapping that converts the player's continuous clock g∈[0,1] into the
 * curve-sample t∈[0,1] the colour/scalar samplers use, weighting plateaus
 * vs transitions per the world's `cycleProfile`.
 *
 * Layout (g axis):  [dawn-trans] [day-plateau] [dusk-trans] [night-plateau]
 * Curve t targets:    0 → 0.25      0.25         0.25 → 0.5    0.5 → 0.75 → 0
 *
 * Renderer rule: position curves (xCurve/yCurve) sample RAW g so celestials
 * arc continuously even during plateaus. Colour/glow/phase curves sample
 * eased t so the body's tint stays in sync with the sky.
 *
 * Ported from world/theme-schema.js (the design-iteration tool's runtime).
 * Pure number ops — worklet-safe.
 */

import type { CycleProfile } from './types';

type Weights = { dawn: number; day: number; dusk: number; night: number };

export function cycleProfileWeights(profile: CycleProfile): Weights {
  if (profile === 'airless') return { dawn: 0.03, day: 0.47, dusk: 0.03, night: 0.47 };
  return { dawn: 0.1, day: 0.4, dusk: 0.1, night: 0.4 }; // 'atmospheric'
}

/**
 * Map global cycle position g∈[0,1] to a curve-sample t∈[0,1].
 * Plateaus held at their keyframe; transitions interpolate linearly across
 * the next keyframe pair. Night drifts 0.5 → 0.75 over its first 30% so
 * the band doesn't feel frozen.
 */
export function applyCycleProfile(g: number, profile: CycleProfile): number {
  const w = cycleProfileWeights(profile);
  const eDawn = w.dawn;
  const eDay = eDawn + w.day;
  const eDusk = eDay + w.dusk;
  // const eNight = eDusk + w.night; // = 1 by construction; kept for clarity

  if (g < eDawn) {
    // dawn transition: curve t goes 0 → 0.25
    return (g / eDawn) * 0.25;
  }
  if (g < eDay) {
    // day plateau: hold t = 0.25
    return 0.25;
  }
  if (g < eDusk) {
    // dusk transition: curve t goes 0.25 → 0.5
    return 0.25 + ((g - eDay) / w.dusk) * 0.25;
  }
  if (g < 1) {
    // night plateau: drift 0.5 → 0.75 over first 30%, then hold at 0.75.
    const np = (g - eDusk) / w.night;
    if (np < 0.3) return 0.5 + (np / 0.3) * 0.25;
    return 0.75;
  }
  // wrap (defensive — eNight = 1 normally)
  return 0;
}

export type CyclePhaseLabel = 'Dawn' | 'Day' | 'Dusk' | 'Night';

export function cyclePhaseLabel(g: number, profile: CycleProfile): CyclePhaseLabel {
  const w = cycleProfileWeights(profile);
  const eDawn = w.dawn;
  const eDay = eDawn + w.day;
  const eDusk = eDay + w.dusk;
  if (g < eDawn) return 'Dawn';
  if (g < eDay) return 'Day';
  if (g < eDusk) return 'Dusk';
  return 'Night';
}
