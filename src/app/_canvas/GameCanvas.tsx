/**
 * GameCanvas — the single Skia <Canvas> that owns ALL in-game visual effects:
 *   - Divider bilateral soft glow (COL_L left / COL_R right) + hard centre line
 *   - Survival pulse on divider
 *   - Pipes: solid base + scanlines + gold-cap edge + clear flash + pause shimmer
 *   - Milestone gold screen wash (full canvas tint during milestone pop)
 *   - Death particles
 *   - Left + right dots (with all per-dot effects via the <Dot> component)
 *   - Idle title bloom glow (idle phase only)
 *   - Death freeze ramp (black overlay 0→0.45 during particle freeze window)
 *
 * pointerEvents="none" — the touch surface is the wrapping <View> in
 * GameScreen, not this canvas.
 *
 * Props are kept explicit (no internal computations of derived values) so this
 * component remains a pure presentation layer. The parent computes per-frame
 * derived values once and feeds both the canvas and the HUD overlays from a
 * single source. Keeping the API broad here is deliberate for the first-pass
 * refactor; if duplication shows up between canvas and HUD in the second pass,
 * derived-value helpers can move into a shared module.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 5.
 */

import React from 'react';
import { Canvas, Circle, Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

import { LANE_L, LANE_R, PIPE_W } from '@features/game/engine';
import type { WorldTheme } from '@features/game/world';
import {
  COL_L,
  COL_R,
  GAME_H,
  PIPE_EDGE,
  SCALE,
  SCREEN_W,
  WALL_R,
  sx,
} from '../_shared/constants';
import type { DisplaySnapshot } from '../_shared/snapshot';

import { Dot } from './Dot';
import { PipeScanlines } from './PipeScanlines';
import { TitleBloom } from './TitleBloom';
import { WorldRenderer } from './WorldRenderer';

export interface GameCanvasProps {
  display: DisplaySnapshot;
  nowMs: number;
  dotLDisplayY: number;
  dotRDisplayY: number;
  sPulseT: number;
  sPulseW: number;
  sPulseX: number;
  pauseShimmerOpacity: number;
  goldWashAlpha: number;
  freezeAlpha: number;
  // v0.3-worlds — when present, WorldRenderer mounts as the first child
  // (behind divider/pipes/dots/particles). Optional to keep existing
  // snapshot tests untouched; if absent, canvas renders as it did pre-v0.3.
  worldTheme?: WorldTheme;
  /** Time-of-day cycle ∈ [0,1]. 0=dawn, 0.25=day, 0.5=dusk, 0.75=night. */
  worldTod?: number;
  /** Parallax scroll offset in screen px. Bands scale by their `parallax`. */
  worldScrollX?: number;
}

export function GameCanvas({
  display,
  nowMs,
  dotLDisplayY,
  dotRDisplayY,
  sPulseT,
  sPulseW,
  sPulseX,
  pauseShimmerOpacity,
  goldWashAlpha,
  freezeAlpha,
  worldTheme,
  worldTod = 0.25,
  worldScrollX = 0,
}: GameCanvasProps): React.ReactElement {
  return (
    <Canvas
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: SCREEN_W,
        height: GAME_H,
      }}
    >
      {/* ── World (v0.3 planetary mode background — behind everything) ── */}
      {worldTheme && (
        <WorldRenderer
          theme={worldTheme}
          t={worldTod}
          scrollX={worldScrollX}
          nowMs={nowMs}
        />
      )}

      {/* v0.3-worlds redesign — split-screen tint + hard centre line removed.
       *  The warm/cool dot pair (amber-L + ice-R) now carries the L/R identity
       *  on its own. Survival pulse below still renders for the clear-event
       *  feedback moment. Per task 5 of jupiter-ingest follow-ups. */}

      {/* ── Survival pulse on divider (optional) ── */}
      {display.survivalPulse > 0 && (
        <Rect
          x={sPulseX}
          y={0}
          width={sPulseW}
          height={GAME_H}
          color="#ffffff"
          opacity={sPulseT * 0.85}
        />
      )}

      {/* ── Pipes with all visual effects ── */}
      {display.pipes.map((pipe) => {
        const pipeLeft = sx(pipe.x - PIPE_W / 2);
        const halfW = sx(PIPE_W / 2);

        // Gap bounds in screen pixels
        const gapTop = (pipe.gapCY - pipe.gap / 2) * SCALE;
        const gapBot = (pipe.gapCY + pipe.gap / 2) * SCALE;

        // Segment 1: top (y=0 to gapTop)
        // Segment 2: bottom (gapBot to GAME_H)
        const segments = [
          { y: 0, h: gapTop, isTop: true },
          { y: gapBot, h: GAME_H - gapBot, isTop: false },
        ].filter((seg) => seg.h > 0);

        const flashAlpha = pipe.clearFlash > 0 ? (pipe.clearFlash / 20) * 0.55 : 0;

        return (
          <Group key={pipe.id}>
            {segments.map((seg, segIdx) => (
              <Group key={segIdx}>
                {/* Left half (WALL_R base — prototype draws WALL_L then overwrites with WALL_R) */}
                <Rect x={pipeLeft} y={seg.y} width={halfW} height={seg.h} color={WALL_R} />

                {/* Right half (WALL_R, COL_R inner edge) */}
                <Rect
                  x={pipeLeft + halfW}
                  y={seg.y}
                  width={halfW}
                  height={seg.h}
                  color={WALL_R}
                />

                {/* Scanline texture — recoloured to PIPE_EDGE so the pipe
                    stays in a single blue family. Stage 2.2 redesign:
                    orange/cyan no longer appear on pipes. */}
                <PipeScanlines
                  x={pipeLeft}
                  y={seg.y}
                  width={sx(PIPE_W)}
                  height={seg.h}
                  edgeCol={PIPE_EDGE}
                />

                {/* Stage 2.2: outer-edge orange/cyan glow gradients and
                    the hard 1px lane-coloured edges have been removed.
                    Reduces the pipe's palette from 4 colours to 2 (navy
                    body + sky-blue gap edge), freeing orange/cyan to mean
                    only "left dot / right dot" in the visual language. */}

                {/* Gap-facing cap (Stage 2.2 redesign): unified solid gold
                    kill-line with an inner glow that fades into the pipe
                    body. Replaces the previous two-half bicolor cap that
                    read as jarring/separate. Gold ties the cap into the
                    existing milestone/score visual language and reads as
                    "the goal" rather than "left dot's edge / right dot's
                    edge". The 6px hard edge gives players a clear contact
                    line for the death condition; the 14px inner glow above
                    (top seg) or below (bottom seg) bleeds the cap into the
                    navy body so it feels integrated, not stamped on. */}
                {seg.isTop ? (
                  /* Top segment: glow fades upward into body, then 6px solid edge */
                  <>
                    <Rect
                      x={pipeLeft}
                      y={seg.y + seg.h - sx(20)}
                      width={sx(PIPE_W)}
                      height={sx(14)}
                    >
                      <LinearGradient
                        start={vec(0, seg.y + seg.h - sx(20))}
                        end={vec(0, seg.y + seg.h - sx(6))}
                        colors={[PIPE_EDGE + '00', PIPE_EDGE + '99']}
                      />
                    </Rect>
                    <Rect
                      x={pipeLeft}
                      y={seg.y + seg.h - sx(6)}
                      width={sx(PIPE_W)}
                      height={sx(6)}
                      color={PIPE_EDGE}
                    />
                  </>
                ) : (
                  /* Bottom segment: 6px solid edge, then glow fades downward into body */
                  <>
                    <Rect
                      x={pipeLeft}
                      y={seg.y}
                      width={sx(PIPE_W)}
                      height={sx(6)}
                      color={PIPE_EDGE}
                    />
                    <Rect x={pipeLeft} y={seg.y + sx(6)} width={sx(PIPE_W)} height={sx(14)}>
                      <LinearGradient
                        start={vec(0, seg.y + sx(6))}
                        end={vec(0, seg.y + sx(20))}
                        colors={[PIPE_EDGE + '99', PIPE_EDGE + '00']}
                      />
                    </Rect>
                  </>
                )}

                {/* Clear flash gold glow */}
                {flashAlpha > 0 && (
                  <>
                    <Rect
                      x={pipeLeft}
                      y={seg.y}
                      width={sx(PIPE_W)}
                      height={seg.h}
                      color={`rgba(255,208,70,${flashAlpha.toFixed(3)})`}
                    />
                    {/* Edge brightener (2px on outer edges — matches prototype placement) */}
                    <Rect
                      x={pipeLeft}
                      y={seg.y}
                      width={sx(2)}
                      height={seg.h}
                      color={`rgba(255,240,140,${(flashAlpha * 0.8).toFixed(3)})`}
                    />
                    <Rect
                      x={pipeLeft + sx(PIPE_W) - sx(2)}
                      y={seg.y}
                      width={sx(2)}
                      height={seg.h}
                      color={`rgba(255,240,140,${(flashAlpha * 0.8).toFixed(3)})`}
                    />
                  </>
                )}

                {/* Paused shimmer — white pulse over the pipe when game is paused */}
                {display.paused && (
                  <Rect
                    x={pipeLeft}
                    y={seg.y}
                    width={sx(PIPE_W)}
                    height={seg.h}
                    color="#ffffff"
                    opacity={pauseShimmerOpacity}
                  />
                )}
              </Group>
            ))}
          </Group>
        );
      })}

      {/* ── Milestone gold screen wash ── */}
      {goldWashAlpha > 0 && (
        <Rect
          x={0}
          y={0}
          width={SCREEN_W}
          height={GAME_H}
          color={`rgba(255,208,70,${goldWashAlpha.toFixed(3)})`}
        />
      )}

      {/* ── Death particles ── */}
      {display.deathParticles.map((p, i) => (
        <Circle
          key={i}
          cx={p.x * SCALE}
          cy={p.y * SCALE}
          r={p.r * (0.4 + (p.life / p.maxLife) * 0.6) * SCALE}
          color={p.col}
          opacity={p.life / p.maxLife}
        />
      ))}

      {/* ── Left dot with all effects ── */}
      {/* v0.3-worlds — dot colour comes from the active world's palette
       *  (warm amber per world). Falls back to COL_L for legacy/no-world. */}
      <Dot
        cx={sx(LANE_L)}
        cy={dotLDisplayY * SCALE}
        col={worldTheme?.palette.dotL ?? COL_L}
        pulse={display.pulseL}
        closeCall={display.closeL}
        deathFlash={display.deathFlashL}
      />

      {/* ── Right dot with all effects ── */}
      <Dot
        cx={sx(LANE_R)}
        cy={dotRDisplayY * SCALE}
        col={worldTheme?.palette.dotR ?? COL_R}
        pulse={display.pulseR}
        closeCall={display.closeR}
        deathFlash={display.deathFlashR}
      />

      {/* ── Idle title bloom glow ── */}
      {display.phase === 'idle' && <TitleBloom nowMs={nowMs} />}

      {/* ── Death freeze ramp (black overlay 0→0.45 during particle freeze window) ── */}
      {freezeAlpha > 0 && (
        <Rect
          x={0}
          y={0}
          width={SCREEN_W}
          height={GAME_H}
          color={`rgba(0,0,0,${freezeAlpha.toFixed(3)})`}
        />
      )}
    </Canvas>
  );
}
