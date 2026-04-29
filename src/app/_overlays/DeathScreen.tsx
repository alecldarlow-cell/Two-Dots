/**
 * DeathScreen — the full-screen overlay shown after death, gated by the
 * deathCountFrames <= scoreCountFrames condition (see showDeathOverlay in the
 * parent).
 *
 * Layered (top to bottom):
 *   - Big score with orange/cyan offset shadows + GOLD core. Counts up from
 *     0 to final via display.scoreDisplay.
 *   - "★ NEW BEST ★" or "BEST N" line, only after the count-up finishes.
 *   - Tier + gate info: "<tier name> · gate N of 5" for tiers 1-7,
 *     "LVL 8 · gate N" for the survival tier.
 *   - Pulsing "tap to retry" pill in the killed dot's colour (with 0x2e
 *     alpha for the pill background).
 *
 * Styling lives in _shared/styles.ts (deathScoreBlock, deathScoreBig,
 * deathNewBest, deathBestLine, deathTierInfo, retryPill, retryText).
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 8.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { tierFor } from '@features/game/engine';
import { COL_L, COL_R, GOLD, VIS_H, sx } from '../_shared/constants';
import type { DisplaySnapshot } from '../_shared/snapshot';
import { styles } from '../_shared/styles';

export interface DeathScreenProps {
  display: DisplaySnapshot;
  countDone: boolean;
  wasNewBest: boolean;
  bestScore: number;
  retryPulse: number;
}

export function DeathScreen({
  display,
  countDone,
  wasNewBest,
  bestScore,
  retryPulse,
}: DeathScreenProps): React.ReactElement {
  return (
    <View
      style={[
        styles.overlay,
        {
          backgroundColor: 'rgba(0,0,0,0.57)',
          justifyContent: 'flex-start',
          paddingTop: sx(VIS_H / 2 - 30),
        },
      ]}
    >
      {/* Big score — count-up from 0 to final. Orange/cyan shadows + GOLD core. */}
      <View style={styles.deathScoreBlock}>
        {/* Orange shadow, +6/+6 */}
        <Text
          style={[
            styles.deathScoreBig,
            {
              color: COL_L,
              opacity: 0.5,
              position: 'absolute',
              left: 0,
              right: 0,
              transform: [{ translateX: sx(6) }, { translateY: sx(6) }],
            },
          ]}
        >
          {display.scoreDisplay}
        </Text>
        {/* Cyan shadow, -6/-6 */}
        <Text
          style={[
            styles.deathScoreBig,
            {
              color: COL_R,
              opacity: 0.5,
              position: 'absolute',
              left: 0,
              right: 0,
              transform: [{ translateX: -sx(6) }, { translateY: -sx(6) }],
            },
          ]}
        >
          {display.scoreDisplay}
        </Text>
        {/* GOLD core */}
        <Text style={[styles.deathScoreBig, { color: GOLD }]}>{display.scoreDisplay}</Text>
      </View>

      {/* Best score — shown once count-up finishes */}
      {countDone &&
        display.score > 0 &&
        (wasNewBest ? (
          <Text style={styles.deathNewBest}>★ NEW BEST ★</Text>
        ) : (
          <Text style={styles.deathBestLine}>BEST {bestScore}</Text>
        ))}

      {/* Tier + gate info */}
      {countDone && display.score > 0 && (
        <Text style={styles.deathTierInfo}>
          {tierFor(display.score) === 8
            ? `LVL 8 · gate ${display.score}`
            : `${display.deathTierName} · gate ${display.deathGateInTier} of 5`}
        </Text>
      )}

      {/* Tap-to-retry pill — pulsing text on coloured pill */}
      {countDone && (
        <View
          style={[
            styles.retryPill,
            {
              backgroundColor: (display.deathSide === 'R' ? COL_R : COL_L) + '2e',
            },
          ]}
        >
          <Text style={[styles.retryText, { opacity: retryPulse }]}>tap to retry</Text>
        </View>
      )}
    </View>
  );
}
