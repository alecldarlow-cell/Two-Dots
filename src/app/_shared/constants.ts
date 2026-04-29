/**
 * Module-level constants and tiny helpers shared across the game screen,
 * canvas components, overlays, and the game-loop hook.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 1.
 * Pure data + pure functions — no React, no Skia, no engine state.
 *
 * Anything that would require a hook (e.g. useSafeAreaInsets) does NOT
 * belong here — keep this module synchronous and side-effect-free so it
 * can be imported from any layer.
 */

import { Dimensions } from 'react-native';

import { W, VIS_H_MIN, VIS_H_MAX } from '@features/game/engine';

// ─── Colours ──────────────────────────────────────────────────────────────────
export const COL_L = '#FF5E35';
export const COL_R = '#2ECFFF';
export const COL_BG = '#07070f';
export const COL_BG_FLASH = '#1c0404'; // brief reddish bg on death
// Pipe wall colour — both halves use WALL_R; the prototype briefly draws a
// WALL_L underlay before overwriting with WALL_R on the right half, but the RN
// port skips the underlay since it's never visible.
export const WALL_R = '#10355c';
// Pipe gap edge — bright sky blue, deliberately not COL_R (cyan) so it doesn't
// claim the right lane semantically. Stage 2.2 redesign: orange/cyan are now
// reserved for "left dot / right dot"; pipes live in their own blue family.
export const PIPE_EDGE = '#7ac0e8';
export const GOLD = '#FFD046';

// ─── Physics ──────────────────────────────────────────────────────────────────
// Fixed physics timestep — matches 60fps HTML prototype regardless of display
// refresh rate.
export const PHYSICS_STEP_MS = 1000 / 60; // 16.667ms per step

// ─── Layout (computed once at module load) ────────────────────────────────────
export const SCREEN_W = Dimensions.get('window').width;
export const SCREEN_H = Dimensions.get('window').height;
export const SCALE = SCREEN_W / W;
export const VIS_H = Math.min(VIS_H_MAX, Math.max(VIS_H_MIN, SCREEN_H / SCALE));
export const GAME_H = VIS_H * SCALE;

// ─── Idle bob geometry — matches prototype exactly ────────────────────────────
export const IDLE_SAFE_TOP = 330;
export const IDLE_SAFE_BOT = VIS_H * 0.72 - 80;
export const IDLE_CENTRE_Y = (IDLE_SAFE_TOP + IDLE_SAFE_BOT) / 2;
export const IDLE_AMPLITUDE = Math.min(55, (IDLE_SAFE_BOT - IDLE_SAFE_TOP) / 2);

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Scale a logical-px value to screen pixels. */
export const sx = (n: number): number => n * SCALE;

/** Convert a 0–255 integer alpha to a two-char hex string. */
export function alphaHex(a: number): string {
  return Math.round(a).toString(16).padStart(2, '0');
}
