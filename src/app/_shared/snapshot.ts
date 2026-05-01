/**
 * DisplaySnapshot — the per-frame projection of GameState that React state
 * actually consumes.
 *
 * The game loop mutates `gsRef.current` in place at 60 Hz (see _hooks/
 * useGameLoop.ts), but React only re-renders when `setDisplay(snap(s))` is
 * called. Decoupling the snapshot type from the engine state lets us:
 *
 * - Re-render at half rate without losing data (every other frame).
 * - Pass plain immutable values to memoizable child components.
 * - Stop the React tree mutating the engine's live GameState directly.
 *
 * Note: the snapshot still references engine sub-types (`Pipe[]`,
 * `Particle[]`) via `GameState['pipes']` / `GameState['deathParticles']`,
 * so it isn't a fully-decoupled DTO — engine schema changes to those
 * collections still ripple through the renderer. That coupling is
 * accepted; defining parallel snapshot-only shapes would force every
 * engine collection-shape change to be mirrored in two places.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 2.
 */

import type { GameState } from '@features/game/engine';

export interface DisplaySnapshot {
  phase: GameState['phase'];
  dotLY: number;
  dotRY: number;
  pipes: GameState['pipes'];
  score: number;
  scoreDisplay: number;
  deathSide: GameState['deathSide'];
  deathParticles: GameState['deathParticles'];
  deathCountFrames: number;
  scoreCountFrames: number;
  deathGateInTier: number;
  paused: boolean;
  pulseL: number;
  pulseR: number;
  closeL: number;
  closeR: number;
  deathFlashL: number;
  deathFlashR: number;
  flash: number;
  scorePop: number;
  milestonePop: number;
}

export function snap(s: GameState): DisplaySnapshot {
  return {
    phase: s.phase,
    dotLY: s.dotLY,
    dotRY: s.dotRY,
    pipes: s.pipes.map((p) => ({ ...p })),
    score: s.score,
    scoreDisplay: s.scoreDisplay,
    deathSide: s.deathSide,
    deathParticles: s.deathParticles.map((p) => ({ ...p })),
    deathCountFrames: s.deathCountFrames,
    scoreCountFrames: s.scoreCountFrames,
    deathGateInTier: s.deathGateInTier,
    paused: s.paused,
    pulseL: s.pulseL,
    pulseR: s.pulseR,
    closeL: s.closeL,
    closeR: s.closeR,
    deathFlashL: s.deathFlashL,
    deathFlashR: s.deathFlashR,
    flash: s.flash,
    scorePop: s.scorePop,
    milestonePop: s.milestonePop,
  };
}
