/**
 * IdleScreen — the full-screen overlay shown during the 'idle' phase, before
 * the first tap of a run.
 *
 * Layered (top to bottom):
 *   - "TWO" on left lane / "DOTS" on right lane in lane colours, with a
 *     +3px cross-lane shadow ghost (opposite colour) on a slow opacity pulse.
 *   - "keep both dots alive" instruction.
 *   - "LEFT HALF" / "RIGHT HALF" control hints in lane colours.
 *   - Breathing thumb circles centred on each lane at VIS_H * 0.72.
 *
 * `pointerEvents="none"` — the touch surface is the wrapping <View> in
 * GameScreen; this overlay is purely decorative.
 *
 * Animations (titleShadowOpacity, thumbR, thumbFillAlpha) are computed by
 * the parent GameScreen each frame and passed in as props. thumbY is constant
 * but lives with the other thumb props for cohesion.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 6.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { LANE_L, LANE_R } from '@features/game/engine';
import { COL_L, COL_R, SCREEN_W, sx } from '../_shared/constants';
import { styles } from '../_shared/styles';

export interface IdleScreenProps {
  titleShadowOpacity: number;
  thumbR: number;
  thumbY: number;
  thumbFillAlpha: string;
}

export function IdleScreen({
  titleShadowOpacity,
  thumbR,
  thumbY,
  thumbFillAlpha,
}: IdleScreenProps): React.ReactElement {
  return (
    <View pointerEvents="none" style={styles.idleOverlay}>
      {/* TWO on left lane, DOTS on right lane — bold title in lane colours */}
      {/* Cross-lane shadow: opposite colour, +3px offset, slow opacity pulse */}
      <Text
        numberOfLines={1}
        style={[
          styles.idleWord,
          {
            color: COL_R,
            opacity: titleShadowOpacity,
            position: 'absolute',
            top: sx(200) - sx(30) + 3,
            left: 3,
            width: SCREEN_W / 2,
          },
        ]}
      >
        TWO
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.idleWord,
          {
            color: COL_L,
            position: 'absolute',
            top: sx(200) - sx(30),
            left: 0,
            width: SCREEN_W / 2,
          },
        ]}
      >
        TWO
      </Text>

      <Text
        numberOfLines={1}
        style={[
          styles.idleWord,
          {
            color: COL_L,
            opacity: titleShadowOpacity,
            position: 'absolute',
            top: sx(200) - sx(30) + 3,
            left: SCREEN_W / 2 + 3,
            width: SCREEN_W / 2,
          },
        ]}
      >
        DOTS
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.idleWord,
          {
            color: COL_R,
            position: 'absolute',
            top: sx(200) - sx(30),
            left: SCREEN_W / 2,
            width: SCREEN_W / 2,
          },
        ]}
      >
        DOTS
      </Text>

      {/* Primary instruction */}
      <Text
        style={[
          styles.idleInstruction,
          {
            position: 'absolute',
            top: sx(268),
            left: 0,
            right: 0,
          },
        ]}
      >
        keep both dots alive
      </Text>

      {/* Control hints — "LEFT HALF" right of centre, "RIGHT HALF" left of centre */}
      <View
        style={[
          styles.idleHintsRow,
          {
            position: 'absolute',
            top: sx(296),
            left: 0,
            right: 0,
          },
        ]}
      >
        <Text style={[styles.idleHintL, { color: COL_L }]}>LEFT HALF</Text>
        <Text style={[styles.idleHintR, { color: COL_R }]}>RIGHT HALF</Text>
      </View>

      {/* Left thumb circle */}
      <View
        style={{
          position: 'absolute',
          left: sx(LANE_L) - thumbR,
          top: thumbY - thumbR,
          width: thumbR * 2,
          height: thumbR * 2,
          borderRadius: thumbR,
          borderWidth: 2,
          borderColor: COL_L + '99',
          backgroundColor: `rgba(255,255,255,${thumbFillAlpha})`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[styles.thumbLabel, { color: COL_L }]}>TAP</Text>
      </View>

      {/* Right thumb circle */}
      <View
        style={{
          position: 'absolute',
          left: sx(LANE_R) - thumbR,
          top: thumbY - thumbR,
          width: thumbR * 2,
          height: thumbR * 2,
          borderRadius: thumbR,
          borderWidth: 2,
          borderColor: COL_R + '99',
          backgroundColor: `rgba(255,255,255,${thumbFillAlpha})`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[styles.thumbLabel, { color: COL_R }]}>TAP</Text>
      </View>
    </View>
  );
}
