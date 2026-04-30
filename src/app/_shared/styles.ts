/**
 * Shared StyleSheet for the game screen, overlays, and HUD.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 3.
 * Pure data — no React, no Skia.
 *
 * Style entries depend on layout / colour constants from ./constants. If a
 * style needs a runtime value (e.g. an inset that requires a hook), keep the
 * inline override at the call site and leave the static base here.
 */

import { StyleSheet } from 'react-native';

import { GAME_H, GOLD, SCALE, sx } from './constants';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Live score ──────────────────────────────────────────────────────────────
  scoreContainer: {
    position: 'absolute',
    // Adaptive Y: prototype uses Math.max(58, visH*0.09) in logical px
    top: Math.max(58 * SCALE, GAME_H * 0.09),
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  scoreLive: {
    textAlign: 'center',
    fontFamily: 'Fraunces-Bold',
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 4,
  },

  // ── Progress dots ───────────────────────────────────────────────────────────
  progressDotsContainer: {
    position: 'absolute',
    // P1-15: clear the 42px-tall score text. Prototype used `+ 22 * SCALE` —
    // that worked because the prototype's score was rendered at scaled size,
    // but here `scoreLive.fontSize` is fixed at 42 (unscaled). Hardcode 56px
    // gap so dots sit cleanly below the score on every device width.
    top: Math.max(58 * SCALE, GAME_H * 0.09) + 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
    opacity: 0.85,
  },

  // ── Milestone pop ───────────────────────────────────────────────────────────
  milestoneContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  milestoneText: {
    color: GOLD,
    fontFamily: 'Fraunces-Bold',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  milestoneTierName: {
    color: GOLD,
    fontFamily: 'Fraunces-Bold',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 8,
  },

  // ── Idle screen — Phase 3 ───────────────────────────────────────────────────
  idleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  idleWord: {
    fontFamily: 'Fraunces-Bold',
    // P1-14: was sx(68); reduced to sx(60) so "DOTS" fits the right lane
    // (Space Mono Bold ~0.65 char-width × 4 chars × 60 + spacing fits inside
    // SCREEN_W/2 with margin on both Pixel 7 and narrower iOS screens).
    fontSize: sx(60),
    fontWeight: 'bold',
    // P1-14 polish (Stage 2.2): letterSpacing 4 → 2. The wider kerning made
    // each character read independently; tightening groups TWO and DOTS so
    // each word reads as a single unit. Cross-lane shadow ghost retained.
    letterSpacing: 2,
    textAlign: 'center',
  },
  idleInstruction: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(18),
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  idleHintsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleHintL: {
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'right',
    paddingRight: 10,
  },
  idleHintR: {
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'left',
    paddingLeft: 10,
  },
  thumbLabel: {
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 2,
  },

  // ── Pause ───────────────────────────────────────────────────────────────────
  pauseTitle: {
    color: '#ffffff',
    fontFamily: 'Fraunces-Bold',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  sub: {
    color: '#ffffff',
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 3,
    marginTop: 14,
  },

  // ── Death screen — Phase 2 ──────────────────────────────────────────────────
  deathScoreBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    // Padding to ensure shadows (offset ±6 logical) aren't clipped
    paddingHorizontal: 20,
  },
  deathScoreBig: {
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(150),
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
  },
  deathNewBest: {
    color: GOLD,
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(20),
    fontWeight: 'bold',
    letterSpacing: 3,
    marginTop: sx(8),
  },
  // Prototype: DIMMED (#2a2a3a) at globalAlpha 0.75 — very dark and muted,
  // intentionally de-emphasised so the score stays dominant.
  deathBestLine: {
    color: 'rgba(42,42,58,0.75)',
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(20),
    fontWeight: 'bold',
    letterSpacing: 3,
    marginTop: sx(8),
  },
  deathTierInfo: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(13),
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: sx(4),
  },
  retryPill: {
    marginTop: sx(20),
    paddingHorizontal: sx(28),
    paddingVertical: sx(10),
    borderRadius: sx(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#ffffff',
    fontFamily: 'Fraunces-Bold',
    fontSize: sx(18),
    fontWeight: 'bold',
    letterSpacing: 2,
  },
});
