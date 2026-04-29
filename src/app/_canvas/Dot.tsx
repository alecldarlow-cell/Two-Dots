/**
 * Skia Dot — renders a player dot with all visual effects layered:
 *   1. Pulse ring (when pulse > 0, expanding outward)
 *   2. Ambient glow halo
 *   3. Solid core
 *   4. Highlight spot (top-left, 42% white)
 *   5. Close-call gold ring (range 1-12)
 *   6. Death flash burst rings (range 1-18)
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 4.
 *
 * P0-1 perf note: previously used Skia.Path.Make() in a helper which allocated
 * a new Path every frame for every visible ring. The current implementation
 * uses Skia's <Circle style="stroke"> primitive which renders the same shape
 * with no Path object at all.
 */

import React from 'react';
import { Circle, Group, RadialGradient, vec } from '@shopify/react-native-skia';

import { DOT_R } from '@features/game/engine';
import { GOLD, SCALE, sx } from '../_shared/constants';

export interface DotProps {
  cx: number;
  cy: number;
  col: string;
  pulse: number;
  closeCall: number;
  deathFlash: number;
}

export function Dot({ cx, cy, col, pulse, closeCall, deathFlash }: DotProps): React.ReactElement {
  const r = sx(DOT_R) + (pulse > 0 ? pulse * SCALE * 0.5 : 0);

  const strokeCircle = (
    radius: number,
    strokeW: number,
    color: string,
    opacity: number,
  ): React.ReactElement => (
    <Circle
      cx={cx}
      cy={cy}
      r={radius}
      color={color}
      opacity={opacity}
      style="stroke"
      strokeWidth={strokeW}
    />
  );

  return (
    <Group>
      {/* 1. Pulse ring (expands outward when pulse > 0) */}
      {pulse > 0 && (
        <Circle cx={cx} cy={cy} r={r + pulse * SCALE * 3}>
          <RadialGradient
            c={vec(cx, cy)}
            r={r + pulse * SCALE * 3}
            colors={[col + '55', col + '00']}
          />
        </Circle>
      )}

      {/* 2. Ambient glow halo */}
      <Circle cx={cx} cy={cy} r={r * 2.2}>
        <RadialGradient c={vec(cx, cy)} r={r * 2.2} colors={[col + '55', col + '00']} />
      </Circle>

      {/* 3. Solid dot core */}
      <Circle cx={cx} cy={cy} r={r} color={col} />

      {/* 4. Highlight spot (top-left, white 42% opacity) */}
      <Circle cx={cx - r * 0.28} cy={cy - r * 0.3} r={r * 0.3} color="rgba(255,255,255,0.42)" />

      {/* 5. Close-call gold ring (expands, range 1-12) */}
      {closeCall > 0 &&
        strokeCircle(
          r + 4 * SCALE + (1 - closeCall / 12) * 14 * SCALE,
          sx(2),
          GOLD,
          (closeCall / 12) * 0.9,
        )}

      {/* 6. Death flash rings (expands outward, range 1-18) */}
      {deathFlash > 0 && (
        <>
          {strokeCircle(
            r + 6 * SCALE + (1 - deathFlash / 18) * 30 * SCALE,
            sx(3),
            'rgba(255,80,50,1)',
            (deathFlash / 18) * 0.95,
          )}
          {strokeCircle(
            r + 6 * SCALE + (1 - deathFlash / 18) * 30 * SCALE - 6 * SCALE,
            sx(1.5),
            'rgba(255,200,100,1)',
            (deathFlash / 18) * 0.95 * 0.6,
          )}
        </>
      )}
    </Group>
  );
}
