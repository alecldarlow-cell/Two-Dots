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
 * Pipe scroll speed in pixels per frame. Within each tier the speed is flat.
 *
 * v0.3 tester-data tweak: dampen post-T4 progression so the game has a
 * clear "near-maximal" plateau rather than escalating endlessly. Softening
 * starts at gate 15 (T4 entry — pause is the lever there since speed is
 * already shared with T3). Speed steps tiny: 2.0 → 2.05 (T5) → 2.1 (T7),
 * then flat from T7 onward. Survival creep removed — game holds at the
 * plateau forever, so deep runs become a battle of attention rather than
 * an unwinnable speed race.
 *   T5: 2.2 → 2.05, T6: 2.2 → 2.05, T7: 2.5 → 2.1, T8: 2.5+creep → 2.1 flat.
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
      return 2.05;
    case 6:
      return 2.05;
    case 7:
      return 2.05;
    default:
      return 2.05; // Survival plateau — flat, no creep.
  }
}

/**
 * Pause window at spawn in milliseconds — the time a newly spawned pipe waits
 * before starting to scroll. Pause is the dominant difficulty lever (T1
 * gives 1000ms reaction time, late tiers give a fraction of that).
 *
 * v0.3 tester-data tweak: softening starts at gate 15 (T4 entry) and decays
 * toward a near-maximal flat plateau by T6. Gate 20 (T5) and gate 30 (T7)
 * sit within ~7% of each other so they feel like the same difficulty zone
 * rather than distinct tiers — matches the design call to flatten the
 * post-Earth progression and keep deeper play accessible. T1-T3 untouched
 * so the early game plays exactly as before.
 *   T4: 560 → 600 (softening starts)
 *   T5: 430 → 540 (-60 from T4)
 *   T6: 320 → 510 (-30, deceleration begins)
 *   T7: 270 → 500 (-10, near-flat)
 *   T8: 230 → 490 (-10, plateau)
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
      return 600;
    case 5:
      return 540;
    case 6:
      return 510;
    case 7:
      return 500;
    default:
      return 490;
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
