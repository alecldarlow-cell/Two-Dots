/**
 * Skia PipeScanlines — renders horizontal and vertical scanline texture for a
 * single pipe segment. Uses one Path with moveTo/lineTo to keep the JSX node
 * count low.
 *
 * P0-1 perf: build the scanline path RELATIVE to (0, 0) and memoize on the
 * only dimensions that actually change the geometry — width and height. The
 * pipe's x/y position is applied via a Group transform at render time, so as
 * the pipe scrolls leftward (x changes every frame) the path itself stays
 * cached and is never reallocated. Heights vary per pipe segment but cluster
 * in a small set of values (top vs bottom segment of each gap), giving a
 * high memo-cache hit rate across pipes.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 4.
 */

import React, { useMemo } from 'react';
import { Group, Path, Skia } from '@shopify/react-native-skia';

import { SCALE } from '../_shared/constants';

export interface PipeScanlinesProps {
  x: number;
  y: number;
  width: number;
  height: number;
  edgeCol: string;
}

export function PipeScanlines({
  x,
  y,
  width,
  height,
  edgeCol,
}: PipeScanlinesProps): React.ReactElement {
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    const hSpacing = 5 * SCALE;
    for (let ly = 0; ly < height; ly += hSpacing) {
      p.moveTo(0, ly);
      p.lineTo(width, ly);
    }
    const vSpacing = 9 * SCALE;
    for (let lx = 0; lx < width; lx += vSpacing) {
      p.moveTo(lx, 0);
      p.lineTo(lx, height);
    }
    return p;
  }, [width, height]);

  return (
    <Group transform={[{ translateX: x }, { translateY: y }]}>
      <Path
        path={path}
        start={0}
        end={1}
        color={edgeCol}
        opacity={0.25}
        strokeWidth={1}
        style="stroke"
      />
    </Group>
  );
}
