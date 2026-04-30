/**
 * PlayingHUD — the bundle of overlays shown during the 'playing' phase:
 *   1. Live score — single gold Text, scale-pop animated. Shadows dropped
 *      in v0.3-worlds redesign (matches death-screen treatment).
 *   2. World progress dots — three dots, first N filled by current world
 *      (Moon=1 / Earth=2 / Jupiter=3). Replaced the prior tier-based 1–7
 *      dot ramp + survival pulsing dot once the world progression became
 *      the primary UX.
 *   3. Milestone pop overlay — "★ N ★" star+score and (on tier boundaries)
 *      the tier name. Drifts upward over the milestone window.
 *   4. Pause overlay — full-screen "PAUSED / tap to resume" modal when
 *      display.paused is true.
 *
 * All four sub-overlays are gated by display.phase === 'playing' (and pause
 * additionally by display.paused, milestone by display.milestonePop > 0).
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 7.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { GAME_H, SCALE } from '../_shared/constants';
import type { DisplaySnapshot } from '../_shared/snapshot';
import { styles } from '../_shared/styles';

export interface PlayingHUDProps {
  display: DisplaySnapshot;
  notchOffset: number;
  scoreScale: number;
  scoreColor: string;
  mAlpha: number;
  mDriftY: number;
  pauseSubOpacity: number;
}

export function PlayingHUD({
  display,
  notchOffset,
  scoreScale,
  scoreColor,
  mAlpha,
  mDriftY,
  pauseSubOpacity,
}: PlayingHUDProps): React.ReactElement {
  // Worlds reached — 1 (Moon) at score 0–9, 2 (Earth) at 10–19, 3 (Jupiter) at 20+.
  // Drives the in-game progression dots (replaces the old tier-based 1–7 ramp).
  const worldsReached = display.score >= 20 ? 3 : display.score >= 10 ? 2 : 1;

  return (
    <>
      {/* ── Live score — gold only, no shadows. scoreScale animates the
       *  size pop on each gate clear; scoreColor flashes white briefly
       *  during the pop window then returns to gold. */}
      <View
        pointerEvents="none"
        style={[
          styles.scoreContainer,
          { top: notchOffset + Math.max(38 * SCALE, GAME_H * 0.06) },
          { transform: [{ scale: scoreScale }] },
        ]}
      >
        <Text style={[styles.scoreLive, { color: scoreColor }]}>{display.score}</Text>
      </View>

      {/* ── World progress dots — three dots, first N filled by world. */}
      <View
        pointerEvents="none"
        style={[
          styles.progressDotsContainer,
          { top: notchOffset + Math.max(38 * SCALE, GAME_H * 0.06) + 56 },
        ]}
      >
        {Array.from({ length: 3 }, (_, i) => (
          <View
            key={i}
            style={[styles.progressDot, { opacity: i < worldsReached ? 0.85 : 0.25 }]}
          />
        ))}
      </View>

      {/* ── Milestone pop overlay ──
       *  v0.3-worlds: tier-name reveal ("Drift" / "Swing" / "Push" …) at
       *  every-5-gate boundaries replaced with a world-transition reveal at
       *  the two world-swap gates (10 → EARTH, 20 → JUPITER). Other gate
       *  milestones (5, 15, 25, 30, 35) still get the extended celebratory
       *  pop and the ★ N ★ headline, just no name reveal. */}
      {display.milestonePop > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.milestoneContainer,
            { top: notchOffset + 110 - mDriftY, opacity: mAlpha },
          ]}
        >
          <Text style={styles.milestoneText}>★ {display.score} ★</Text>
          {(display.score === 10 || display.score === 20) && (
            <Text style={styles.milestoneTierName}>
              {display.score === 10 ? 'EARTH' : 'JUPITER'}
            </Text>
          )}
        </View>
      )}

      {/* ── Pause overlay ── */}
      {display.paused && (
        <View style={[styles.overlay, { backgroundColor: '#07070faa' }]}>
          <Text style={styles.pauseTitle}>PAUSED</Text>
          <Text style={[styles.sub, { opacity: pauseSubOpacity }]}>tap to resume</Text>
        </View>
      )}
    </>
  );
}
