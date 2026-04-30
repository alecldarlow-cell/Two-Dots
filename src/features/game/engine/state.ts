/**
 * Game state.
 *
 * Ported from prototype TwoDots.html lines 288-318, reorganised into logical
 * groups. Everything that was a module-level global in the prototype lives
 * here instead so a run can be fully reset without touching the module.
 */

import { H_REF } from './constants';
import type { Pipe, SpawnerState } from './spawn';
import { initSpawnerState } from './spawn';

export type Phase = 'idle' | 'playing' | 'dead';
export type DeathSide = '' | 'L' | 'R' | 'both';

export interface Particle {
  x: number;
  y: number;
  col: string;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
}

export interface GameState {
  // Phase and control flags
  phase: Phase;
  paused: boolean;

  // Dot positions and velocities
  dotLY: number;
  dotRY: number;
  vyL: number;
  vyR: number;

  // Per-dot animation pulses — frames remaining after a tap
  pulseL: number;
  pulseR: number;

  // Pipes in flight
  pipes: Pipe[];
  lastSpawn: number;

  // Score
  score: number;

  // Visual flash frames
  flash: number;
  scorePop: number;
  milestonePop: number;
  closeL: number;
  closeR: number;

  // Death sequence
  deathSide: DeathSide;
  deathFlashL: number;
  deathFlashR: number;
  deathParticles: Particle[];
  deathTierName: string;
  deathGateInTier: number;
  deathCountFrames: number;
  scoreCountFrames: number;
  scoreDisplay: number;

  // Spawner state — previously module-level globals in the prototype
  spawner: SpawnerState;
}

/**
 * Create a fresh game state. Phase starts as 'idle' — waiting for the first tap.
 * Dot Y positions are seeded against `H_REF` and reconciled to runtime `visH` on
 * the first frame via `centreDotsForIdle`.
 */
export function initState(): GameState {
  return {
    phase: 'idle',
    paused: false,

    dotLY: H_REF * 0.45,
    dotRY: H_REF * 0.45,
    vyL: 0,
    vyR: 0,

    pulseL: 0,
    pulseR: 0,

    pipes: [],
    lastSpawn: 0,

    score: 0,

    flash: 0,
    scorePop: 0,
    milestonePop: 0,
    closeL: 0,
    closeR: 0,

    deathSide: '',
    deathFlashL: 0,
    deathFlashR: 0,
    deathParticles: [],
    deathTierName: '',
    deathGateInTier: 0,
    deathCountFrames: 0,
    scoreCountFrames: 0,
    scoreDisplay: 0,

    spawner: initSpawnerState(),
  };
}
