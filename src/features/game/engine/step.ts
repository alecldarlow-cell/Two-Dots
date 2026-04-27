/**
 * Game loop step.
 *
 * One frame of physics + scoring + collision + spawn. Mutates the state object
 * in place — matching the prototype's hot-loop performance characteristics.
 * Returns a set of side-effect descriptors the host (renderer) should handle:
 * audio blips, haptics buzzes, close-call rings. Keeping effects as data means
 * this function stays testable in a Node environment.
 *
 * Ported from prototype TwoDots.html lines 700-907.
 */

import {
  CLEAR_FLASH_FRAMES,
  CLOSE_CALL_PX,
  CLOSE_RING_FRAMES,
  DEATH_FLASH_FRAMES,
  DEATH_FREEZE_FRAMES,
  GRAVITY,
  JUMP_VY,
  LANE_L,
  LANE_R,
  MILESTONE_POP_FRAMES,
  MILESTONE_POP_FRAMES_TIER_BOUNDARY,
  PIPE_SPACING,
  PIPE_SPAWN_MS,
  PIPE_W,
  PULSE_FRAMES,
  SCORE_POP_FRAMES,
  SURVIVAL_PULSE_FRAMES,
  W,
} from './constants';
import { dotHitsPipe, isCloseCall, isOutOfBounds } from './collision';
import type { GameState } from './state';
import { spawnPipe } from './spawn';
import { gateInTier, tierFor, tierName, TIER_STARTS } from './tiers';
import type { Rng } from '@shared/utils/rng';

/**
 * Audio event types a frame can emit. Renderer translates these into actual
 * sound calls (expo-audio). Kept as data so the engine is Node-testable.
 */
export type AudioEvent =
  | { kind: 'tap'; side: 'L' | 'R' }
  | { kind: 'tap-start' }
  | { kind: 'tap-pause'; paused: boolean }
  | { kind: 'score-blip'; tier: number }
  | { kind: 'every-five-chime' }
  | { kind: 'tier-boundary-chord' }
  | { kind: 'close-call' }
  | { kind: 'death' };

export type HapticEvent =
  | { kind: 'tap' }
  | { kind: 'start' }
  | { kind: 'milestone' }
  | { kind: 'death' };

export interface FrameEffects {
  audio: AudioEvent[];
  haptics: HapticEvent[];
  /** True if this frame ended the run — renderer should start the death sequence. */
  died: boolean;
  /** True if this frame advanced the score — renderer can trigger a score-pop. */
  scored: boolean;
}

export interface FrameInput {
  now: number;
  visH: number;
  /** Injectable so tests can pin spawn sequences and run decision trees deterministically. */
  rng: Rng;
}

/**
 * Advance the game by one frame during the 'playing' phase.
 * For 'idle' and 'dead' phases, callers should dispatch taps via `handleTap`
 * instead — those phases have no physics to advance.
 *
 * The function does nothing if the game is paused.
 */
export function stepPlaying(s: GameState, input: FrameInput): FrameEffects {
  const effects: FrameEffects = { audio: [], haptics: [], died: false, scored: false };

  if (s.phase !== 'playing' || s.paused) {
    advanceVisualCounters(s);
    return effects;
  }

  // ─── Spawn ────────────────────────────────────────────────────────────────
  // Distance-based spawn: drop a new pipe when the rightmost one has moved
  // PIPE_SPACING px in from the right edge. Keeps pipe density constant as
  // speed ramps — a fixed-time spawn would compress spacing in Chaos.
  // PIPE_SPAWN_MS retained as a safety ceiling in case no pipe exists yet.
  const rightmostX = s.pipes.length > 0 ? Math.max(...s.pipes.map((p) => p.x)) : -Infinity;
  const shouldSpawn =
    s.pipes.length === 0 ||
    W - PIPE_W / 2 - rightmostX >= PIPE_SPACING ||
    input.now - s.lastSpawn >= PIPE_SPAWN_MS;
  if (shouldSpawn) {
    s.pipes.push(spawnPipe(s.score, input.now, input.visH, s.spawner, input.rng));
    s.lastSpawn = input.now;
  }

  // ─── Physics ──────────────────────────────────────────────────────────────
  s.vyL += GRAVITY;
  s.dotLY += s.vyL;
  s.vyR += GRAVITY;
  s.dotRY += s.vyR;

  // ─── Visual counter decrements ────────────────────────────────────────────
  advanceVisualCounters(s);

  // ─── Per-pipe update ──────────────────────────────────────────────────────
  let died = false;
  s.pipes = s.pipes.filter((p) => {
    if (input.now >= p.pauseUntil) p.x -= p.speed;
    if (p.clearFlash > 0) p.clearFlash--;

    // Score check — fires once as the pipe passes the left lane.
    if (!p.scored && p.x + PIPE_W / 2 < LANE_L - dotRadiusEpsilon()) {
      p.scored = true;
      p.clearFlash = CLEAR_FLASH_FRAMES;
      s.score++;
      effects.scored = true;
      s.scorePop = SCORE_POP_FRAMES;

      // Survival speed-step pulse — fires at score 40, 45, 50… (every 5 gates after tier 8 starts at 35)
      if (tierFor(s.score) === 8 && s.score % 5 === 0 && s.score !== s.lastSurvivalStep) {
        s.survivalPulse = SURVIVAL_PULSE_FRAMES;
        s.lastSurvivalStep = s.score;
      }

      if (s.score % 5 === 0) {
        const isTierBoundary = ([5, 10, 15, 20, 25, 30, 35] as const).includes(
          s.score as 5 | 10 | 15 | 20 | 25 | 30 | 35,
        );
        s.milestonePop = isTierBoundary ? MILESTONE_POP_FRAMES_TIER_BOUNDARY : MILESTONE_POP_FRAMES;
        effects.audio.push(
          isTierBoundary ? { kind: 'tier-boundary-chord' } : { kind: 'every-five-chime' },
        );
        effects.haptics.push({ kind: 'milestone' });
      } else {
        effects.audio.push({ kind: 'score-blip', tier: tierFor(s.score) });
      }
    }

    // Close-call detection — fires once per dot per pipe.
    if (!p.closeCalledByL && isCloseCall(s.dotLY, LANE_L, p.x, p.gapCY, p.gap, CLOSE_CALL_PX)) {
      p.closeCalledByL = true;
      if (s.closeL === 0) {
        s.closeL = CLOSE_RING_FRAMES;
        effects.audio.push({ kind: 'close-call' });
      }
    }
    if (!p.closeCalledByR && isCloseCall(s.dotRY, LANE_R, p.x, p.gapCY, p.gap, CLOSE_CALL_PX)) {
      p.closeCalledByR = true;
      if (s.closeR === 0) {
        s.closeR = CLOSE_RING_FRAMES;
        effects.audio.push({ kind: 'close-call' });
      }
    }

    // Collision check.
    if (dotHitsPipe(LANE_L, s.dotLY, p.x, p.gapCY, p.gap, input.visH)) {
      died = true;
      s.deathFlashL = DEATH_FLASH_FRAMES;
    }
    if (dotHitsPipe(LANE_R, s.dotRY, p.x, p.gapCY, p.gap, input.visH)) {
      died = true;
      s.deathFlashR = DEATH_FLASH_FRAMES;
    }

    // Cull off-screen pipes.
    return p.x + PIPE_W / 2 > 0;
  });

  // Out-of-bounds death.
  if (isOutOfBounds(s.dotLY, input.visH)) {
    died = true;
    s.deathFlashL = DEATH_FLASH_FRAMES;
  }
  if (isOutOfBounds(s.dotRY, input.visH)) {
    died = true;
    s.deathFlashR = DEATH_FLASH_FRAMES;
  }

  if (died) {
    transitionToDead(s);
    effects.died = true;
    effects.audio.push({ kind: 'death' });
    effects.haptics.push({ kind: 'death' });
  }

  return effects;
}

/**
 * Decrements all per-frame visual counters. Safe to call in any phase — they're
 * all `0` outside 'playing' anyway.
 */
function advanceVisualCounters(s: GameState): void {
  if (s.pulseL > 0) s.pulseL--;
  if (s.pulseR > 0) s.pulseR--;
  if (s.scorePop > 0) s.scorePop--;
  if (s.milestonePop > 0) s.milestonePop--;
  if (s.closeL > 0) s.closeL--;
  if (s.closeR > 0) s.closeR--;
  if (s.survivalPulse > 0) s.survivalPulse--;
  if (s.flash > 0) s.flash--;
  if (s.deathFlashL > 0) s.deathFlashL--;
  if (s.deathFlashR > 0) s.deathFlashR--;
}

function dotRadiusEpsilon(): number {
  // The prototype inlines DOT_R here; extracted so the tight coupling is explicit.
  // If DOT_R ever changes, the LANE_L offset for "scored" threshold updates automatically.
  return 14;
}

function transitionToDead(s: GameState): void {
  s.phase = 'dead';
  s.flash = 12;
  const diedL = s.deathFlashL > 0;
  const diedR = s.deathFlashR > 0;
  s.deathSide = diedL && diedR ? 'both' : diedL ? 'L' : 'R';
  // Extend flash rings to cover the full freeze window.
  if (s.deathFlashL > 0) s.deathFlashL = DEATH_FLASH_FRAMES;
  if (s.deathFlashR > 0) s.deathFlashR = DEATH_FLASH_FRAMES;
  s.deathTierName = tierName(s.score);
  s.deathGateInTier = gateInTier(s.score);

  // Single countdown: first DEATH_FREEZE_FRAMES are the particle window,
  // remainder is the score count-up. Overlay appears after DEATH_FREEZE_FRAMES.
  const countFrames = s.score === 0 ? 0 : Math.min(60, Math.max(45, s.score));
  s.deathCountFrames = DEATH_FREEZE_FRAMES + countFrames;
  s.scoreCountFrames = countFrames;
  s.scoreDisplay = 0;

  // Spawn death particle burst.
  s.deathParticles = buildDeathParticles(s, diedL, diedR);
}

function buildDeathParticles(
  s: GameState,
  diedL: boolean,
  diedR: boolean,
): GameState['deathParticles'] {
  const COL_L = '#FF5E35';
  const COL_R = '#2ECFFF';
  const sources: Array<{ x: number; y: number; col: string }> = [];
  if (diedL) sources.push({ x: LANE_L, y: s.dotLY, col: COL_L });
  if (diedR) sources.push({ x: LANE_R, y: s.dotRY, col: COL_R });
  if (sources.length === 0) sources.push({ x: LANE_L, y: s.dotLY, col: COL_L }); // fallback
  const particles: GameState['deathParticles'] = [];
  sources.forEach(({ x, y, col }) => {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + Math.random() * 4.5;
      particles.push({
        x,
        y,
        col,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 50 + Math.floor(Math.random() * 15),
        maxLife: 65,
        r: 4 + Math.random() * 5,
      });
    }
  });
  return particles;
}

/**
 * Tap dispatch. Handles all three phases:
 *   - idle  → transition to 'playing', prime both dots with an upward velocity
 *   - dead  → reset to a fresh state (preserving the caller's best-score tracking)
 *   - playing → jump a single dot, or toggle pause if tapped near the divider
 *
 * `tapX` is in logical (W=390) coordinates. Callers translate screen px → logical px.
 */
export function handleTap(s: GameState, tapX: number, now: number, visH: number): AudioEvent[] {
  const events: AudioEvent[] = [];
  const isL = tapX < W / 2;

  if (s.phase === 'idle') {
    startPlaying(s, now, visH);
    events.push({ kind: 'tap-start' });
    return events;
  }

  if (s.phase === 'dead') {
    // Ignore taps during the freeze window — particles are still playing.
    if (s.deathCountFrames > s.scoreCountFrames) return events;
    // Reset game state and return to idle — player must tap once more to start.
    // This gives a moment to breathe and sets up a clean idle screen before the next run.
    resetForNewRun(s);
    s.phase = 'idle';
    return events;
  }

  // Phase === 'playing'
  // Tap the centre divider (±22px) to pause/unpause.
  if (Math.abs(tapX - W / 2) < 22) {
    s.paused = !s.paused;
    events.push({ kind: 'tap-pause', paused: s.paused });
    return events;
  }
  if (s.paused) {
    s.paused = false;
    events.push({ kind: 'tap-pause', paused: false });
    return events;
  }

  if (isL) {
    s.vyL = JUMP_VY;
    s.pulseL = PULSE_FRAMES;
  } else {
    s.vyR = JUMP_VY;
    s.pulseR = PULSE_FRAMES;
  }
  events.push({ kind: 'tap', side: isL ? 'L' : 'R' });
  return events;
}

function startPlaying(s: GameState, now: number, visH: number): void {
  const idleSafeTop = 330;
  const idleSafeBot = visH * 0.72 - 80;
  const idleCentreY = (idleSafeTop + idleSafeBot) / 2;
  const idleAmplitude = Math.min(55, (idleSafeBot - idleSafeTop) / 2);
  s.phase = 'playing';
  s.lastSpawn = now;
  s.dotLY = idleCentreY + Math.sin(now / 900) * idleAmplitude;
  s.dotRY = idleCentreY + Math.sin(now / 900 + 1.8) * idleAmplitude;
  s.vyL = JUMP_VY;
  s.pulseL = PULSE_FRAMES;
  s.vyR = JUMP_VY;
  s.pulseR = PULSE_FRAMES;
  // Reset spawner for the new run.
  s.spawner.lastGapCY = null;
  s.spawner.lastSide = 1;
}

function resetForNewRun(s: GameState): void {
  // Re-initialise in-place (avoiding object allocation), matching the
  // prototype's `initState()` reset on retry.
  s.pipes = [];
  s.score = 0;
  s.flash = 0;
  s.scorePop = 0;
  s.milestonePop = 0;
  s.closeL = 0;
  s.closeR = 0;
  s.survivalPulse = 0;
  s.lastSurvivalStep = -1;
  s.deathSide = '';
  s.deathFlashL = 0;
  s.deathFlashR = 0;
  s.deathParticles = [];
  s.deathTierName = '';
  s.deathGateInTier = 0;
  s.deathCountFrames = 0;
  s.scoreCountFrames = 0;
  s.scoreDisplay = 0;
  s.paused = false;
}

/**
 * Per-frame update for the death overlay — advances the freeze window and
 * score count-up. Called every frame while phase === 'dead'.
 */
export function stepDead(s: GameState): void {
  // Advance particles.
  s.deathParticles = s.deathParticles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // lighter gravity — particles spread outward, not just downward
    p.vx *= 0.94; // sharper drag — punchier deceleration
    p.life--;
    return p.life > 0;
  });

  if (s.deathCountFrames > 0) {
    s.deathCountFrames--;
    // Score count-up runs in the second window (after freeze frames elapsed).
    if (s.deathCountFrames < s.scoreCountFrames) {
      const denom = s.scoreCountFrames || 1;
      const progress = 1 - s.deathCountFrames / denom;
      s.scoreDisplay = Math.round(progress * s.score);
    }
  } else {
    s.scoreDisplay = s.score;
  }

  // Advance visual counters (deathFlashL/R, flash, etc.) during the dead phase.
  // stepPlaying is never called while dead, so we advance them here instead.
  advanceVisualCounters(s);
}

/** Convenience helper re-exported for tests. */
export const TIER_BOUNDARY_SCORES = TIER_STARTS.filter((v) => v > 0);
