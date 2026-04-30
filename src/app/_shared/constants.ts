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
// v0.3-worlds: dot palette softened from the prototype's vivid orange-red /
// cyan to the theme palette's amber / ice. Affects everywhere COL_L /
// COL_R is consumed — dots themselves, pulse rings, particles on death,
// close-call rings, etc. Single-source change so the warm/cool identity
// stays consistent across all surfaces.
export const COL_L = '#FFB13B';
export const COL_R = '#7FE5E8';
export const COL_BG = '#07070f';
// Legacy hardcoded death bg flash. v0.3-worlds: bg flash now driven by
// the active world's theme.palette.bgFlash (Moon #1c0418, Earth #2a0814,
// Jupiter #3a1408) — this constant is kept as a safety fallback for any
// pre-worlds code path that might still reference it.
export const COL_BG_FLASH = '#1c0404';
// Pipe body colour — v0.3-worlds redesign: dark desaturated navy. Sits in
// the same hue family as Moon's mid-sky and Earth's night sky, so the pipe
// reads as a foreground silhouette without the brutalist hardness of pure
// black. Softer than the prototype's WALL_R = '#10355c' (which felt over-
// saturated against the new painterly worlds), darker than that and lower-
// chroma so it recedes properly against any sky. Name retained for minimal
// call-site diff; consider renaming to PIPE_BODY in a future pass.
export const WALL_R = '#0a2c44';
// Pipe inner-edge highlight — 1px pinstripe just inside the body's left and
// right edges. Warm-neutral so it ties subtly to the gold gap-cap (warm
// family) and reads as "edge lit by the threshold" against any world.
export const PIPE_INNER_EDGE = '#2a2620';
// Legacy sky-blue tone — kept for back-compat in case anything references it,
// but the v0.3 pipe redesign no longer uses it (gap caps now use GOLD; body
// has no scanline overlay).
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
