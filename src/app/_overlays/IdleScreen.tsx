/**
 * IdleScreen — the full-screen overlay shown during the 'idle' phase, before
 * the first tap of a run.
 *
 * v0.3-worlds redesign: refined split-title direction (Direction A). Drops
 * the prototype's +3px cross-lane ghost duplicate (which read as
 * retro-arcade against the new painterly worlds), softens the title hues
 * from the vivid prototype lane colours (COL_L/COL_R = #FF5E35 / #2ECFFF)
 * to the theme palette's amber/ice family (#FFB13B / #7FE5E8). Lane hints
 * are dimmed via opacity. Thumb circles get a more visible white fill so
 * the breathing affordance reads against the dark/atmospheric world.
 *
 * Layered (top to bottom):
 *   - "TWO" on left lane (amber) / "DOTS" on right lane (ice).
 *   - "keep both dots alive" instruction.
 *   - "LEFT HALF" / "RIGHT HALF" control hints in soft amber / ice.
 *   - Breathing thumb circles centred on each lane at VIS_H * 0.72,
 *     with a visible-but-translucent white inner fill.
 *
 * `pointerEvents="none"` — the touch surface is the wrapping <View> in
 * GameScreen; this overlay is purely decorative.
 *
 * Animations (thumbR, thumbFillAlpha) are computed by the parent
 * GameScreen each frame and passed in as props. thumbY is constant but
 * lives with the other thumb props for cohesion.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 6.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { LANE_L, LANE_R } from '@features/game/engine';
import { SCREEN_W, sx } from '../_shared/constants';
import { styles } from '../_shared/styles';

// Soft amber/ice — matches the theme palette's dotL/dotR. The vivid
// prototype lane colours (COL_L/COL_R) are kept for the engine/canvas
// rendering of the dots themselves; idle-screen typography uses the
// gentler family so it doesn't fight the world's painterly palette.
const TITLE_L = '#FFB13B';
const TITLE_R = '#7FE5E8';

export interface IdleScreenProps {
  thumbR: number;
  thumbY: number;
  thumbFillAlpha: string;
}

export function IdleScreen({
  thumbR,
  thumbY,
  thumbFillAlpha,
}: IdleScreenProps): React.ReactElement {
  return (
    <View pointerEvents="none" style={styles.idleOverlay}>
      {/* Title — TWO (amber) on left half, DOTS (ice) on right half. */}
      <Text
        numberOfLines={1}
        style={[
          styles.idleWord,
          {
            color: TITLE_L,
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
            color: TITLE_R,
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
          borderColor: TITLE_L + '99',
          backgroundColor: `rgba(255,255,255,${thumbFillAlpha})`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[styles.thumbLabel, { color: TITLE_L }]}>TAP</Text>
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
          borderColor: TITLE_R + '99',
          backgroundColor: `rgba(255,255,255,${thumbFillAlpha})`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[styles.thumbLabel, { color: TITLE_R }]}>TAP</Text>
      </View>

      {/* Lane labels — positioned under each tap circle, centred on the
       *  lane vertical axis. Replaced the prior "LEFT HALF" / "RIGHT HALF"
       *  row that sat above the dots: shorter wording, lane-anchored
       *  position. The 60px wide centred Text spans across the lane
       *  centre so each label is readable without crowding the circle. */}
      <Text
        style={[
          styles.idleHintL,
          {
            position: 'absolute',
            top: thumbY + thumbR + sx(20),
            left: sx(LANE_L) - sx(60),
            width: sx(120),
            textAlign: 'center',
            paddingLeft: 0,
            paddingRight: 0,
            color: TITLE_L,
            opacity: 0.75,
          },
        ]}
      >
        LEFT
      </Text>
      <Text
        style={[
          styles.idleHintR,
          {
            position: 'absolute',
            top: thumbY + thumbR + sx(20),
            left: sx(LANE_R) - sx(60),
            width: sx(120),
            textAlign: 'center',
            paddingLeft: 0,
            paddingRight: 0,
            color: TITLE_R,
            opacity: 0.75,
          },
        ]}
      >
        RIGHT
      </Text>
    </View>
  );
}
