/**
 * PlayingHUD — the bundle of overlays shown during the 'playing' phase:
 *   1. Live score (3 stacked Texts: orange shadow, cyan shadow, GOLD core).
 *      The shadows fade in only during a score-pop window (popT > 0).
 *   2. Tier progress dots — N gold dots for tiers 1-7, a single pulsing
 *      gold dot for the survival tier (8).
 *   3. Milestone pop overlay — "★ N ★" star+score and (on tier boundaries)
 *      the tier name. Drifts upward over the milestone window.
 *   4. Pause overlay — full-screen "PAUSED / tap to resume" modal when
 *      display.paused is true.
 *
 * All four sub-overlays are gated by display.phase === 'playing' (and pause
 * additionally by display.paused, milestone by display.milestonePop > 0).
 *
 * Derived animation values (popT, scoreScale, mAlpha, etc.) are computed
 * by the parent GameScreen each frame and passed in as props. nowMs is only
 * needed for the inline survival-dot pulse.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 7.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { tierName } from '@features/game/engine';
import { COL_L, COL_R, GAME_H, GOLD, SCALE } from '../_shared/constants';
import type { DisplaySnapshot } from '../_shared/snapshot';
import { styles } from '../_shared/styles';

export interface PlayingHUDProps {
  display: DisplaySnapshot;
  nowMs: number;
  notchOffset: number;
  popT: number;
  scoreScale: number;
  scoreColor: string;
  shadowOff: number;
  tier: number;
  isSurvival: boolean;
  mAlpha: number;
  mDriftY: number;
  isTierBoundary: boolean;
  pauseSubOpacity: number;
}

export function PlayingHUD({
  display,
  nowMs,
  notchOffset,
  popT,
  scoreScale,
  scoreColor,
  shadowOff,
  tier,
  isSurvival,
  mAlpha,
  mDriftY,
  isTierBoundary,
  pauseSubOpacity,
}: PlayingHUDProps): React.ReactElement {
  return (
    <>
      {/* ── Live score with pop animation ── */}
      <View
        pointerEvents="none"
        style={[
          styles.scoreContainer,
          { top: notchOffset + Math.max(58 * SCALE, GAME_H * 0.09) },
          { transform: [{ scale: scoreScale }] },
        ]}
      >
        {/* Orange shadow — invisible at rest, flashes up on each score pop */}
        <Text
          style={[
            styles.scoreLive,
            {
              color: COL_L,
              opacity: popT * 0.65,
              position: 'absolute',
              left: 0,
              right: 0,
              transform: [{ translateX: shadowOff }, { translateY: shadowOff }],
            },
          ]}
        >
          {display.score}
        </Text>
        {/* Cyan shadow */}
        <Text
          style={[
            styles.scoreLive,
            {
              color: COL_R,
              opacity: popT * 0.65,
              position: 'absolute',
              left: 0,
              right: 0,
              transform: [{ translateX: -shadowOff }, { translateY: -shadowOff }],
            },
          ]}
        >
          {display.score}
        </Text>
        {/* Core */}
        <Text style={[styles.scoreLive, { color: scoreColor }]}>{display.score}</Text>
      </View>

      {/* ── Tier progress dots ── */}
      <View
        pointerEvents="none"
        style={[
          styles.progressDotsContainer,
          { top: notchOffset + Math.max(58 * SCALE, GAME_H * 0.09) + 56 },
        ]}
      >
        {isSurvival
          ? (() => {
              const ps = 6 + 3 * Math.sin(nowMs / 300);
              return (
                <View
                  style={{
                    width: ps,
                    height: ps,
                    borderRadius: ps / 2,
                    backgroundColor: GOLD,
                    opacity: 0.9,
                  }}
                />
              );
            })()
          : Array.from({ length: tier }, (_, i) => <View key={i} style={styles.progressDot} />)}
      </View>

      {/* ── Milestone pop overlay ── */}
      {display.milestonePop > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.milestoneContainer,
            { top: notchOffset + 110 - mDriftY, opacity: mAlpha },
          ]}
        >
          <Text style={styles.milestoneText}>★ {display.score} ★</Text>
          {isTierBoundary && (
            <Text style={styles.milestoneTierName}>{tierName(display.score)}</Text>
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
