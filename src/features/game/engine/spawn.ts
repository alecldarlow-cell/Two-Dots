/**
 * Pipe spawn logic.
 *
 * Ported from prototype TwoDots.html lines 179-286.
 *
 * One meaningful refactor from the prototype: the prototype uses module-level
 * globals (`lastGapCY`, `lastSide`) to track the previous spawn's position and
 * the alternating side pattern. That is unsafe across runs and untestable.
 * Here those values live on a `SpawnerState` object that is reset at the start
 * of every run (see `initSpawnerState`) and passed through pure functions.
 */

import { GRAVITY, JUMP_VY, PIPE_SPACING, PIPE_W, W } from './constants';
import type { Rng } from '@shared/utils/rng';
import { gapSize, pipePauseMs, pipeSpeed, tierFor } from './tiers';

export interface Pipe {
  id: number;
  x: number;
  pauseUntil: number;
  gapCY: number;
  gap: number;
  speed: number;
  scored: boolean;
  clearFlash: number;
  /** Dot IDs that have already triggered a close-call on this pipe — prevents repeat firings. */
  closeCalledByL: boolean;
  closeCalledByR: boolean;
}

export interface SpawnerState {
  /** Previous pipe's gapCY, null on first spawn. Drives the reachability clamp. */
  lastGapCY: number | null;
  /** Last alternating side (-1 = up, +1 = down). Drives the tier 2-5 pattern. */
  lastSide: -1 | 1;
  /** Monotonically increasing counter used to assign unique pipe IDs. */
  pipeCount: number;
}

export function initSpawnerState(): SpawnerState {
  return {
    lastGapCY: null,
    // Start neutral — first gate goes up (side = -1 after the first `-lastSide` flip).
    lastSide: 1,
    pipeCount: 0,
  };
}

/**
 * Maximum upward displacement a dot can achieve between two consecutive gates.
 * Based on total frames between pipe centres at this score's speed. The pause
 * window is intentionally NOT subtracted — it is visible orientation time for
 * the player, not dead time. Subtracting it produces budgets that are too tight
 * in early tiers (where pauses are longest) and inverts the difficulty curve.
 *
 * Assumes the player re-jumps the instant the dot starts falling (vy >= 0).
 */
export function maxUpReach(score: number): number {
  const speed = pipeSpeed(score);
  const frames = Math.round(PIPE_SPACING / speed);
  let y = 0;
  let vy = JUMP_VY;
  let best = 0;
  for (let f = 0; f < frames; f++) {
    vy += GRAVITY;
    y += vy;
    if (vy >= 0) vy = JUMP_VY; // re-jump the instant the dot starts falling
    if (y < best) best = y;
  }
  return Math.abs(best);
}

/**
 * Pick a gap-centre Y for the next pipe. Tier-specific patterns:
 *   Tier 1: centred with tiny jitter
 *   Tier 2: gentle alternating, small amplitude
 *   Tier 3: clear alternating, readable amplitude
 *   Tier 4: same rhythm, wider amplitude
 *   Tier 5: biased alternating — jitter can override the pattern
 *   Tier 6-8: fully random within bounds
 *
 * MUTATES `spawner.lastSide` for tiers 2-5 — the alternating pattern needs to
 * persist across calls. Callers should not rely on the input state being
 * unchanged.
 */
export function pipeGapCY(
  score: number,
  gap: number,
  visH: number,
  spawner: SpawnerState,
  rng: Rng,
): number {
  const minY = gap / 2 + 60;
  const maxY = visH - gap / 2 - 60;
  const centreY = visH / 2;
  const tier = tierFor(score);

  const clamp = (y: number): number => Math.max(minY, Math.min(maxY, y));

  switch (tier) {
    case 1: {
      // Warmup — centred with tiny jitter only.
      const jitter = (rng() - 0.5) * 40;
      return clamp(centreY + jitter);
    }
    case 2: {
      // Drift — gentle alternating, small amplitude.
      const side = -spawner.lastSide as -1 | 1;
      const jitter = (rng() - 0.5) * 30;
      spawner.lastSide = side;
      return clamp(centreY + side * 40 + jitter);
    }
    case 3: {
      // Swing — clear alternating, readable amplitude, light jitter.
      const side = -spawner.lastSide as -1 | 1;
      const amplitude = 60 + rng() * 20; // 60–80px
      const jitter = (rng() - 0.5) * 30;
      spawner.lastSide = side;
      return clamp(centreY + side * amplitude + jitter);
    }
    case 4: {
      // Push — same rhythm, slightly wider amplitude.
      const side = -spawner.lastSide as -1 | 1;
      const amplitude = 70 + rng() * 20; // 70–90px
      const jitter = (rng() - 0.5) * 40;
      spawner.lastSide = side;
      return clamp(centreY + side * amplitude + jitter);
    }
    case 5: {
      // Shift — biased alternating: still tends to alternate but jitter can override.
      const side = -spawner.lastSide as -1 | 1;
      const amplitude = 80 + rng() * 30; // 80–110px
      const jitter = (rng() - 0.5) * 70; // wider jitter breaks the pattern
      spawner.lastSide = side;
      return clamp(centreY + side * amplitude + jitter);
    }
    case 6:
    case 7:
    default: {
      // Rush / Chaos / Survival — fully random within bounds.
      return minY + rng() * (maxY - minY);
    }
  }
}

/**
 * Gate-to-gate reachability clamp.
 * Applied after the tier pattern picks a candidate Y — ensures no pipe is
 * placed so far above the previous one that a dot centred in the last gap
 * cannot physically reach it, regardless of how optimally it jumps.
 */
export function clampToReachable(
  candidateY: number,
  score: number,
  minY: number,
  maxY: number,
  lastGapCY: number | null,
): number {
  if (lastGapCY === null) return candidateY; // first pipe of the run — no constraint.
  const reach = maxUpReach(score);
  const lowestReachable = lastGapCY - reach; // candidate cannot be higher than this
  return Math.max(minY, Math.min(maxY, Math.max(candidateY, lowestReachable)));
}

/**
 * Spawn a new pipe. MUTATES `spawner` — updates `lastGapCY` (and `lastSide` via
 * `pipeGapCY`) so the next call produces a valid follow-on.
 */
export function spawnPipe(
  score: number,
  now: number,
  visH: number,
  spawner: SpawnerState,
  rng: Rng,
): Pipe {
  const gap = gapSize(score);
  const minY = gap / 2 + 60;
  const maxY = visH - gap / 2 - 60;
  const rawCY = pipeGapCY(score, gap, visH, spawner, rng);
  const safeCY = clampToReachable(rawCY, score, minY, maxY, spawner.lastGapCY);
  spawner.lastGapCY = safeCY;
  return {
    id: spawner.pipeCount++,
    x: W - PIPE_W / 2,
    pauseUntil: now + pipePauseMs(score),
    gapCY: safeCY,
    gap,
    speed: pipeSpeed(score),
    scored: false,
    clearFlash: 0,
    closeCalledByL: false,
    closeCalledByR: false,
  };
}
