/**
 * Skia TitleBloom — renders the radial bloom glow behind the "TWO" and "DOTS"
 * title words on the idle screen. Pulses on a 5-second cycle (0.5 + 0.5 *
 * sin(now/2500)).
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 4.
 */

import React from 'react';
import { Circle, RadialGradient, vec } from '@shopify/react-native-skia';

import { W } from '@features/game/engine';
import { COL_L, COL_R, SCALE, alphaHex, sx } from '../_shared/constants';

export interface TitleBloomProps {
  nowMs: number;
}

export function TitleBloom({ nowMs }: TitleBloomProps): React.ReactElement {
  const glowPulse = 0.5 + 0.5 * Math.sin(nowMs / 2500);
  const bloomR = 70 + glowPulse * 18;
  const bloomA = 0.06 + glowPulse * 0.07;

  return (
    <>
      {/* TWO on left lane */}
      <Circle cx={sx(W * 0.25)} cy={sx(200)} r={bloomR * SCALE}>
        <RadialGradient
          c={vec(sx(W * 0.25), sx(200))}
          r={bloomR * SCALE}
          colors={[COL_L + alphaHex(Math.round(bloomA * 255)), COL_L + '00']}
        />
      </Circle>

      {/* DOTS on right lane */}
      <Circle cx={sx(W * 0.75)} cy={sx(200)} r={bloomR * SCALE}>
        <RadialGradient
          c={vec(sx(W * 0.75), sx(200))}
          r={bloomR * SCALE}
          colors={[COL_R + alphaHex(Math.round(bloomA * 255)), COL_R + '00']}
        />
      </Circle>
    </>
  );
}
