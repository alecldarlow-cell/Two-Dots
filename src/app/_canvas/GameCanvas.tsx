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
import { applyCycleProfile, type WorldTheme } from '@features/game/world';
import {
  COL_L,
  COL_R,
  GAME_H,
  GOLD,
  PIPE_INNER_EDGE,
  SCALE,
  SCREEN_W,
  WALL_R,
  sx,
} from '../_shared/constants';
import type { DisplaySnapshot } from '../_shared/snapshot';

import { Dot } from './Dot';
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
      {/* ── World (v0.3 planetary mode background — behind everything) ──
       *  worldTod is the RAW player ToD ∈ [0,1] (drives celestial position
       *  curves continuously). cycleProfile easing is applied here at the
       *  call site to produce the eased `t` (drives colour / glow / phase
       *  curves with day/night plateaus). Renderer takes both. */}
      {worldTheme && (
        <WorldRenderer
          theme={worldTheme}
          t={applyCycleProfile(worldTod, worldTheme.cycleProfile)}
          rawT={worldTod}
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
                {/* v0.3-worlds — Edge-lit silhouette pipe.
                 *  Body: solid near-black-with-cool (WALL_R) so the pipe reads
                 *  as a foreground silhouette against any world's sky.
                 *  Inner edges: 1px warm-neutral pinstripe (PIPE_INNER_EDGE)
                 *  on each side, suggesting catchlight on a beveled object;
                 *  warm-leaning hue ties subtly to the gold gap-cap.
                 *  Gap cap: universal gold kill-line (GOLD) with a 14px
                 *  inward bleed so the cap feels integrated, not stamped on.
                 *  No scanlines (legacy retro-arcade treatment removed). */}

                {/* Solid body */}
                <Rect x={pipeLeft} y={seg.y} width={sx(PIPE_W)} height={seg.h} color={WALL_R} />

                {/* Inner-edge pinstripes — 1px hard line just inside the
                    left and right edges of the body. */}
                <Rect
                  x={pipeLeft}
                  y={seg.y}
                  width={sx(1)}
                  height={seg.h}
                  color={PIPE_INNER_EDGE}
                />
                <Rect
                  x={pipeLeft + sx(PIPE_W) - sx(1)}
                  y={seg.y}
                  width={sx(1)}
                  height={seg.h}
                  color={PIPE_INNER_EDGE}
                />

                {/* Gap-facing cap — universal gold kill-line with a 14px
                    inward bleed into the body so the cap reads as
                    integrated rather than stamped on. */}
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
                        colors={[GOLD + '00', GOLD + '99']}
                      />
                    </Rect>
                    <Rect
                      x={pipeLeft}
                      y={seg.y + seg.h - sx(6)}
                      width={sx(PIPE_W)}
                      height={sx(6)}
                      color={GOLD}
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
                      color={GOLD}
                    />
                    <Rect x={pipeLeft} y={seg.y + sx(6)} width={sx(PIPE_W)} height={sx(14)}>
                      <LinearGradient
                        start={vec(0, seg.y + sx(6))}
                        end={vec(0, seg.y + sx(20))}
                        colors={[GOLD + '99', GOLD + '00']}
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
