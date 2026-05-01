/**
 * useWorldTod — gate-anchored adaptive ToD tween.
 *
 * Drives the world's day/night cycle from the player's progression rather
 * than wall-clock time. One full cycle spans 10 gates, so:
 *   - Moon   (gates  0–9):  one cycle dawn → night
 *   - Earth  (gates 10–19): one cycle
 *   - Jupiter (gates 20+):  one cycle every 10 gates, repeating
 *
 * The world swap (theme change) and the ToD wrap line up at gates 10 and
 * 20 — Moon ends in deep night and Earth opens at dawn, etc. From gate 30
 * onward Jupiter cycles repeatedly.
 *
 * Between gate clears, ToD eases smoothly toward the next anchor over the
 * player's recent gate-clear interval (EMA, clamped 0.8–4 s). No snap on
 * clear; no frozen mid-window. The natural tier ramp accelerates the cycle
 * automatically — Moon feels dreamy, Jupiter frantic.
 *
 * Pause / idle / dead freezes ToD at 0 (dawn). Every run begins at dawn.
 *
 * Locked behaviour:
 *   - ToD = ((score % 10) + tween) / 10, with tween ∈ [0, 1].
 *   - Tween advances using ACTIVE-PLAY ms only (paused/idle don't tick).
 *   - Per-frame dt is capped at 100 ms so a backgrounded tab can't shove
 *     the cycle forward on resume.
 *   - EMA over recent gate-clear intervals provides the tween-duration
 *     target. Default 2500 ms before the first interval is observed.
 */

import { useRef } from 'react';

import type { DisplaySnapshot } from '../_shared/snapshot';

const TWEEN_MIN_MS = 800;
const TWEEN_MAX_MS = 4000;
const EMA_ALPHA = 0.3; // weight on the newest sample
const DEFAULT_INTERVAL_MS = 2500;
const FRAME_DT_CAP_MS = 100;

export function useWorldTod(display: DisplaySnapshot, nowMs: number): number {
  const lastScoreRef = useRef<number>(display.score);
  const lastFrameMsRef = useRef<number>(nowMs);
  const activeMsRef = useRef<number>(0);
  const lastClearActiveMsRef = useRef<number>(0);
  const emaIntervalRef = useRef<number>(DEFAULT_INTERVAL_MS);

  // Frame delta in wall-clock ms, capped so a backgrounded app doesn't
  // teleport the cycle on resume.
  const rawDt = nowMs - lastFrameMsRef.current;
  const dt = Math.max(0, Math.min(rawDt, FRAME_DT_CAP_MS));
  lastFrameMsRef.current = nowMs;

  // New run — score has reset to a lower value (death → idle → playing).
  // Reset all derived state so the next run starts cleanly at dawn.
  if (display.score < lastScoreRef.current) {
    activeMsRef.current = 0;
    lastClearActiveMsRef.current = 0;
    emaIntervalRef.current = DEFAULT_INTERVAL_MS;
  }

  // Active-play clock — only ticks during live gameplay.
  if (display.phase === 'playing' && !display.paused) {
    activeMsRef.current += dt;
  }

  // Gate clear detected — fold the observed interval into the EMA and
  // re-anchor the tween.
  if (display.score > lastScoreRef.current) {
    const interval = activeMsRef.current - lastClearActiveMsRef.current;
    if (interval > 0) {
      emaIntervalRef.current = EMA_ALPHA * interval + (1 - EMA_ALPHA) * emaIntervalRef.current;
    }
    lastClearActiveMsRef.current = activeMsRef.current;
  }
  lastScoreRef.current = display.score;

  // Idle / dead / paused freeze ToD at dawn. Pause is included implicitly
  // because activeMs hasn't advanced; we still drop to 0 on idle/dead so
  // the death and idle screens don't carry the run's ToD into the next.
  if (display.phase !== 'playing') {
    return 0;
  }

  // Tween from current anchor toward next, capped at 1 if the player
  // stalls. Tween duration tracks the player's actual pacing.
  const tweenDuration = Math.max(TWEEN_MIN_MS, Math.min(emaIntervalRef.current, TWEEN_MAX_MS));
  const msSinceClear = activeMsRef.current - lastClearActiveMsRef.current;
  const tween = Math.min(msSinceClear / tweenDuration, 1);

  return ((display.score % 10) + tween) / 10;
}
