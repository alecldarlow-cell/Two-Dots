/**
 * 7-tier progression — each tier is exactly 5 gates, then Survival holds.
 *
 *   Tier 1  (0–4):   Warmup   — big gaps, centred, slow
 *   Tier 2  (5–9):   Drift    — generous gap, gentle alternating rhythm
 *   Tier 3  (10–14): Swing    — clear alternating pattern, comfortable gap
 *   Tier 4  (15–19): Push     — same rhythm, modest tightening
 *   Tier 5  (20–24): Shift    — pattern breaks down, biased random
 *   Tier 6  (25–29): Rush     — fully random, gap tightens
 *   Tier 7  (30–34): Chaos    — hard
 *   Tier 8  (35+):   Survival — endless, gradual speed creep
 *
 * Ported 1:1 from prototype TwoDots.html lines 97-268. Values MUST NOT be
 * changed without updating the corresponding tests — the Phase 1 retry-rate
 * gate is measured against this exact difficulty curve.
 */

export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Start-of-tier score boundaries, 1-indexed by tier. Tier 8 (Survival) starts at 35. */
export const TIER_STARTS: readonly number[] = [0, 5, 10, 15, 20, 25, 30, 35] as const;

export function tierFor(score: number): Tier {
  if (score < 5) return 1;
  if (score < 10) return 2;
  if (score < 15) return 3;
  if (score < 20) return 4;
  if (score < 25) return 5;
  if (score < 30) return 6;
  if (score < 35) return 7;
  return 8;
}

export function tierName(score: number): string {
  const t = tierFor(score);
  return t === 8 ? 'LVL 8' : 'LVL ' + t;
}

/**
 * Gap size in pixels. Flat per tier — gap only steps down at tier boundaries,
 * never mid-tier. Survival creeps from 165 toward a 140 floor over 20 gates.
 */
export function gapSize(score: number): number {
  const tier = tierFor(score);
  switch (tier) {
    case 1:
      return 480;
    case 2:
      return 400;
    case 3:
      return 340;
    case 4:
      return 290;
    case 5:
      return 245;
    case 6:
      return 210;
    case 7:
      return 185;
    default: {
      // Survival (35+): slow creep from 165 toward 140 floor over 20 gates.
      const t = Math.min(1, (score - 35) / 20);
      return Math.max(140, 165 - t * 25);
    }
  }
}

/**
 * Pipe scroll speed in pixels per frame. Speed steps up only at tiers 3, 5, 7.
 * Flat within each tier. Survival adds a slow per-5-gate creep.
 */
export function pipeSpeed(score: number): number {
  const tier = tierFor(score);
  switch (tier) {
    case 1:
      return 1.8;
    case 2:
      return 1.8;
    case 3:
      return 2.0;
    case 4:
      return 2.0;
    case 5:
      return 2.2;
    case 6:
      return 2.2;
    case 7:
      return 2.5;
    default:
      return 2.5 + Math.floor((score - 35) / 5) * 0.1; // slow creep
  }
}

/**
 * Pause window at spawn in milliseconds — the time a newly spawned pipe waits
 * before starting to scroll. Pause reduces evenly across all 8 tiers, providing
 * consistent reduction in orientation time as difficulty climbs.
 * ~28% of cycle in Warmup, ~11% in Survival.
 */
export function pipePauseMs(score: number): number {
  const tier = tierFor(score);
  switch (tier) {
    case 1:
      return 1000;
    case 2:
      return 850;
    case 3:
      return 700;
    case 4:
      return 560;
    case 5:
      return 430;
    case 6:
      return 320;
    case 7:
      return 270;
    default:
      return 230;
  }
}

/**
 * Gate number within the current tier (1-indexed). Used by the death screen
 * to show "Tier 4, Gate 3 of 5". Tier 8 (Survival) just counts from 35.
 */
export function gateInTier(score: number): number {
  const t = tierFor(score);
  if (t === 8) return score - 35;
  const tierStart = TIER_STARTS[t - 1] ?? 0;
  return score - tierStart + 1;
}
