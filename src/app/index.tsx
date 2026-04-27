/**
 * Game screen — Phase 1 + 2 + 3 + 4 (Skia migration).
 *
 * Phase 1 (done):
 *  - 60fps physics gate (fixes faster physics on 90/120Hz devices)
 *  - Idle bob animation
 *  - Full-width tier-responsive lane backgrounds
 *  - Death background flash, score pop animation, milestone pop overlay
 *  - Progress dots, pipe clear flash, survival pulse
 *  - pointerEvents="none" on all decorative Views
 *
 * Phase 2 — Death screen overhaul:
 *  - Huge score (150px-equivalent) with orange/cyan shadows + GOLD core
 *  - "★ NEW BEST ★" or "BEST N" line gated behind count-up completion
 *  - Tier + gate info line: "Tier · gate N of 5" or "LVL 8 · gate N"
 *  - Pulsing "tap to retry" on pill background in killed dot's colour
 *
 * Phase 3 — Idle screen overhaul:
 *  - "TWO" on left lane / "DOTS" on right lane, 68px bold
 *  - "keep both dots alive" instruction text, centered
 *  - "LEFT HALF" / "RIGHT HALF" control hints in lane colours
 *  - Breathing thumb circles at visH*0.72 with TAP label inside
 *
 * Phase 4 — Skia canvas migration:
 *  - Replace plain RN Views of dots/pipes with @shopify/react-native-skia Canvas
 *  - Dots: radial glow halo + highlight + pulse ring + close-call gold ring + death flash
 *  - Pipes: solid base + scanline texture + inner glow gradient + gap-cap bar + clear flash
 *  - Divider: bilateral soft glow (COL_L left, COL_R right) + hard centre line
 *  - Title bloom glow on idle screen
 */

import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import {
  Canvas,
  Circle,
  Path,
  Rect,
  RoundedRect,
  Group,
  Skia,
  vec,
  LinearGradient,
  RadialGradient,
} from '@shopify/react-native-skia';

import {
  initState,
  stepPlaying,
  stepDead,
  handleTap,
  W,
  VIS_H_MIN,
  VIS_H_MAX,
  LANE_L,
  LANE_R,
  DOT_R,
  PIPE_W,
  LANE_ALPHA_BY_TIER,
  DEATH_FREEZE_FRAMES,
  tierFor,
  tierName,
} from '@features/game/engine';
import type { GameState, AudioEvent } from '@features/game/engine';
import { defaultRng } from '@shared/utils/rng';
import { useDeviceId } from '@features/leaderboard/hooks/useDeviceId';
import { useSubmitScore } from '@features/leaderboard/api';
import { logEvent } from '@features/analytics';
import { useMonetisation } from '@features/monetisation';
import * as Crypto from 'expo-crypto';

// ─── Colours ──────────────────────────────────────────────────────────────────
const COL_L = '#FF5E35';
const COL_R = '#2ECFFF';
const COL_BG = '#07070f';
const COL_BG_FLASH = '#1c0404'; // brief reddish bg on death
// Pipe wall colour — both halves use WALL_R; the prototype briefly draws a
// WALL_L underlay before overwriting with WALL_R on the right half, but the RN
// port skips the underlay since it's never visible.
const WALL_R = '#10355c';
const GOLD = '#FFD046';
// Fixed physics timestep — matches 60fps HTML prototype regardless of display refresh rate
const PHYSICS_STEP_MS = 1000 / 60; // 16.667ms per step

// ─── Layout (computed once at module load) ────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const SCALE = SCREEN_W / W;
const VIS_H = Math.min(VIS_H_MAX, Math.max(VIS_H_MIN, SCREEN_H / SCALE));
const GAME_H = VIS_H * SCALE;

// Idle bob geometry — matches prototype exactly.
const IDLE_SAFE_TOP = 330;
const IDLE_SAFE_BOT = VIS_H * 0.72 - 80;
const IDLE_CENTRE_Y = (IDLE_SAFE_TOP + IDLE_SAFE_BOT) / 2;
const IDLE_AMPLITUDE = Math.min(55, (IDLE_SAFE_BOT - IDLE_SAFE_TOP) / 2);

// ─── Display snapshot ─────────────────────────────────────────────────────────
interface DisplaySnapshot {
  phase: GameState['phase'];
  dotLY: number;
  dotRY: number;
  pipes: GameState['pipes'];
  score: number;
  scoreDisplay: number;
  deathSide: GameState['deathSide'];
  deathParticles: GameState['deathParticles'];
  deathCountFrames: number;
  scoreCountFrames: number;
  deathTierName: string;
  deathGateInTier: number;
  paused: boolean;
  pulseL: number;
  pulseR: number;
  closeL: number;
  closeR: number;
  deathFlashL: number;
  deathFlashR: number;
  flash: number;
  scorePop: number;
  milestonePop: number;
  survivalPulse: number;
}

function snap(s: GameState): DisplaySnapshot {
  return {
    phase: s.phase,
    dotLY: s.dotLY,
    dotRY: s.dotRY,
    pipes: s.pipes.map((p) => ({ ...p })),
    score: s.score,
    scoreDisplay: s.scoreDisplay,
    deathSide: s.deathSide,
    deathParticles: s.deathParticles.map((p) => ({ ...p })),
    deathCountFrames: s.deathCountFrames,
    scoreCountFrames: s.scoreCountFrames,
    deathTierName: s.deathTierName,
    deathGateInTier: s.deathGateInTier,
    paused: s.paused,
    pulseL: s.pulseL,
    pulseR: s.pulseR,
    closeL: s.closeL,
    closeR: s.closeR,
    deathFlashL: s.deathFlashL,
    deathFlashR: s.deathFlashR,
    flash: s.flash,
    scorePop: s.scorePop,
    milestonePop: s.milestonePop,
    survivalPulse: s.survivalPulse,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Scale a logical-px value to screen pixels. */
const sx = (n: number) => n * SCALE;

/** Convert a 0–255 integer alpha to a two-char hex string. */
function alphaHex(a: number): string {
  return Math.round(a).toString(16).padStart(2, '0');
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GameScreen(): React.ReactElement {
  const deviceState = useDeviceId();
  const { mutate: submitScore } = useSubmitScore();
  const { showInterstitial } = useMonetisation();

  const sessionIdRef = useRef<string>(Crypto.randomUUID());
  const runIndexRef = useRef<number>(0);
  const deathTimeRef = useRef<number>(0);
  const prevPhaseRef = useRef<GameState['phase']>('idle');
  // Fixed-timestep accumulator — ensures physics runs at exactly 60 steps/second
  // regardless of display refresh rate (60/90/120Hz). Without this, physics
  // runs 50–100% faster on high-refresh-rate devices.
  const lastFrameRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  // Best score — persisted in-memory like the prototype (no AsyncStorage needed for MVP)
  const bestScoreRef = useRef<number>(0);
  // Set to true when this run beats the previous best (drives "★ NEW BEST ★" display)
  const wasNewBestRef = useRef<boolean>(false);

  const gsRef = useRef<GameState>(initState());
  const [display, setDisplay] = useState<DisplaySnapshot>(() => snap(gsRef.current));

  // ─── Audio (expo-av) ───────────────────────────────────────────────────────
  // All sounds stored in a single ref-keyed map so the replay function is
  // stable and safe to call from both the physics loop and touch handlers.
  const sounds = useRef<Record<string, Audio.Sound>>({});

  // Stable replay — accesses sounds.current at call time; never stale.
  const replay = useRef((key: string): void => {
    sounds.current[key]?.replayAsync().catch(() => {});
  }).current;

  // Load all sounds once on mount; clean up on unmount.
  // Capture sounds.current into a local so the cleanup closure references the
  // same map ESLint can prove won't change. (sounds is initialized once via
  // useRef so .current is stable, but lint can't see that.)
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    const soundsMap = sounds.current;
    const sources: Record<string, number> = {
      jumpL: require('../../assets/sounds/jump_l.wav'),
      jumpR: require('../../assets/sounds/jump_r.wav'),
      tap: require('../../assets/sounds/tap.wav'),
      pauseOn: require('../../assets/sounds/pause_on.wav'),
      blip1: require('../../assets/sounds/blip_t1.wav'),
      blip2: require('../../assets/sounds/blip_t2.wav'),
      blip3: require('../../assets/sounds/blip_t3.wav'),
      blip4: require('../../assets/sounds/blip_t4.wav'),
      blip5: require('../../assets/sounds/blip_t5.wav'),
      blip6: require('../../assets/sounds/blip_t6.wav'),
      blip7: require('../../assets/sounds/blip_t7.wav'),
      blip8: require('../../assets/sounds/blip_t8.wav'),
      chordTier: require('../../assets/sounds/chord_tier.wav'),
      chordFive: require('../../assets/sounds/chord_five.wav'),
      closeCall: require('../../assets/sounds/close_call.wav'),
      death: require('../../assets/sounds/death.wav'),
    };
    Object.entries(sources).forEach(([key, src]) => {
      Audio.Sound.createAsync(src, { shouldPlay: false })
        .then(({ sound }) => {
          soundsMap[key] = sound;
        })
        .catch(() => {});
    });
    return () => {
      Object.values(soundsMap).forEach((s) => s.unloadAsync().catch(() => {}));
    };
  }, []);

  // ─── Physics + render loop ─────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number;
    let frameCount = 0;

    // Map an engine AudioEvent → sound key.
    function playAudioEvent(ae: AudioEvent) {
      switch (ae.kind) {
        case 'score-blip':
          replay(`blip${Math.min(ae.tier, 8)}`);
          break;
        case 'tier-boundary-chord':
          replay('chordTier');
          break;
        case 'every-five-chime':
          replay('chordFive');
          break;
        case 'close-call':
          replay('closeCall');
          break;
        case 'death':
          replay('death');
          break;
        // tap/tap-start/tap-pause fired from handleTouch, not the loop
      }
    }

    function loop() {
      const s = gsRef.current;
      const now = Date.now();

      // ── Fixed-timestep physics accumulator ─────────────────────────────────
      // Classic game-loop pattern: accumulate real elapsed time, consume in
      // fixed 16.667ms slices. Guarantees exactly 60 physics steps/second on
      // any display refresh rate (60/90/120Hz). Cap at 100ms to avoid spiral
      // on tab restore / long frame hitches.
      const dt = lastFrameRef.current > 0 ? now - lastFrameRef.current : 0;
      lastFrameRef.current = now;
      accRef.current += Math.min(dt, 100);

      while (accRef.current >= PHYSICS_STEP_MS) {
        accRef.current -= PHYSICS_STEP_MS;
        if (s.phase === 'playing') {
          const fx = stepPlaying(s, { now, visH: VIS_H, rng: defaultRng });
          for (const ae of fx.audio) playAudioEvent(ae);
        } else if (s.phase === 'dead') {
          stepDead(s);
        }
        // idle phase needs no step — bob is computed from Date.now() in render
      }

      // Update React state every other frame to halve re-render cost.
      frameCount++;
      if (frameCount % 2 === 0) {
        setDisplay(snap(s));
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
    // `replay` is stable (captured via useRef(...).current at component
    // initialisation, never reassigned) so listing it here doesn't cause
    // the loop to restart — it just satisfies the exhaustive-deps lint.
  }, [replay]);

  // ─── Death side-effect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (display.phase === 'dead' && prevPhaseRef.current === 'playing') {
      deathTimeRef.current = Date.now();
      // Track best score — set wasNewBest BEFORE updating bestScore
      wasNewBestRef.current = display.score > 0 && display.score > bestScoreRef.current;
      if (wasNewBestRef.current) {
        bestScoreRef.current = display.score;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      logEvent({
        type: 'run_end',
        sessionId: sessionIdRef.current,
        runIndex: runIndexRef.current,
        score: display.score,
        tier: tierFor(display.score),
        deathSide: display.deathSide,
        deathGateInTier: display.deathGateInTier,
      });
      if (deviceState.status === 'ready') {
        submitScore({
          deviceId: deviceState.deviceId,
          sessionId: sessionIdRef.current,
          score: display.score,
          tier: tierFor(display.score),
          deathSide: display.deathSide,
        });
      }
      showInterstitial();
    }
    prevPhaseRef.current = display.phase;
  }, [
    display.phase,
    display.score,
    display.deathSide,
    display.deathGateInTier,
    deviceState,
    submitScore,
    showInterstitial,
  ]);

  // ─── Touch handler (supports multi-touch via onTouchStart) ─────────────────
  function handleTouch(tapX: number) {
    const s = gsRef.current;
    const prevPhase = s.phase;
    const now = Date.now();

    const events = handleTap(s, tapX, now, VIS_H);
    setDisplay(snap(s));

    // Analytics
    if (prevPhase === 'idle' && s.phase === 'playing') {
      runIndexRef.current++;
      logEvent({
        type: 'run_start',
        sessionId: sessionIdRef.current,
        runIndex: runIndexRef.current,
      });
    } else if (prevPhase === 'dead' && s.phase === 'idle') {
      logEvent({
        type: 'retry_tapped',
        sessionId: sessionIdRef.current,
        previousRunIndex: runIndexRef.current,
        timeSinceDeathMs: now - deathTimeRef.current,
      });
    }

    // Event-driven audio + haptics
    for (const ev of events) {
      switch (ev.kind) {
        case 'tap-start':
          replay('tap');
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'tap':
          replay(ev.side === 'L' ? 'jumpL' : 'jumpR');
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'tap-pause':
          replay(ev.paused ? 'pauseOn' : 'tap');
          break;
      }
    }
    // Dead → idle tap: no engine event emitted, handle directly
    if (prevPhase === 'dead' && s.phase === 'idle') {
      replay('tap');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // ─── Derived render values ─────────────────────────────────────────────────
  const nowMs = Date.now();
  // Idle title glow pulse (5s cycle, used for cross-lane shadow opacity)
  const glowPulse = 0.5 + 0.5 * Math.sin(nowMs / 2500);
  const titleShadowOpacity = 0.18 + glowPulse * 0.08;
  // Pause sub-text pulse (matches prototype: 0.45+0.55*sin(now/500))
  const pauseSubOpacity = 0.45 + 0.55 * Math.sin(nowMs / 500);

  // Idle bob — computed from live clock so dots move even when step() isn't running
  const dotLDisplayY =
    display.phase === 'idle'
      ? IDLE_CENTRE_Y + Math.sin(nowMs / 900) * IDLE_AMPLITUDE
      : display.dotLY;
  const dotRDisplayY =
    display.phase === 'idle'
      ? IDLE_CENTRE_Y + Math.sin(nowMs / 900 + 1.8) * IDLE_AMPLITUDE
      : display.dotRY;

  // Lane background alpha — tier-responsive. The Math.min keeps the index
  // in [0, 7] so the array access never goes out of range, but ?? 0x08 is a
  // belt-and-braces guard that also satisfies noUncheckedIndexedAccess.
  const laneAlpha =
    display.phase === 'playing'
      ? (LANE_ALPHA_BY_TIER[Math.min(7, tierFor(display.score) - 1)] ?? 0x08)
      : 0x08;
  const laneHex = alphaHex(laneAlpha);

  // Background colour — briefly reddish on death
  const bgColor = display.flash > 6 ? COL_BG_FLASH : COL_BG;

  // Live score pop animation
  const popT = display.scorePop / 18;
  const scoreScale = 1 + popT * 0.4;
  const scoreColor = display.scorePop > 12 ? '#ffffff' : GOLD;
  const shadowOff = 3 + popT * 4;

  // Milestone pop
  const TIER_BOUNDARY_SCORES = [5, 10, 15, 20, 25, 30, 35];
  const isTierBoundary = TIER_BOUNDARY_SCORES.includes(display.score);
  const milestoneFrames = isTierBoundary ? 90 : 40;
  const mT = display.milestonePop / milestoneFrames;
  const mAlpha =
    display.milestonePop > 0
      ? isTierBoundary
        ? display.milestonePop > 30
          ? 1
          : display.milestonePop / 30
        : mT > 0.15
          ? 1
          : mT / 0.15
      : 0;
  const mDriftY = (1 - mT) * 30;

  // Survival pulse on divider
  const sPulseT = display.survivalPulse / 20;
  const sPulseW = sx(2 + sPulseT * 6);
  const sPulseX = sx(W / 2) - sPulseW / 2;

  // Death overlay
  const showDeathOverlay =
    display.phase === 'dead' && display.deathCountFrames <= display.scoreCountFrames;

  // Count-up completion — best/tier/retry only revealed once animation ends
  const countDone = display.deathCountFrames === 0;

  // Pulsing opacity for "tap to retry" text (matches prototype: 0.55+0.45*sin(now/430))
  const retryPulse = 0.55 + 0.45 * Math.sin(nowMs / 430);

  // Breathing thumb circles (prototype: 38 ± 5px radius, 700ms period)
  const thumbR = (38 + 5 * Math.sin(nowMs / 700)) * SCALE;
  const thumbY = VIS_H * 0.72 * SCALE;
  const thumbFillAlpha = (0.05 + 0.03 * Math.sin(nowMs / 700)).toFixed(3);

  // Tier progress dots
  const tier = tierFor(display.score);
  const isSurvival = tier === 8;

  // Divider glow animation — prototype: 0.03 + 0.02 * sin(now / 800)
  const divPulse = 0.03 + 0.02 * Math.sin(nowMs / 800);
  const divHex = alphaHex(Math.round(divPulse * 255));

  // Pause shimmer — white overlay on each pipe segment, pulsing at ~8Hz
  const pauseShimmerOpacity = 0.08 + 0.08 * Math.sin(nowMs / 120);

  // Gold screen wash — full-canvas tint during milestone pop window
  // Tier-boundary pop is more subdued (0.15 peak) than regular milestone (0.22 peak).
  const goldWashAlpha =
    display.milestonePop > 0 && display.phase === 'playing'
      ? (isTierBoundary ? 0.15 : 0.22) * mAlpha
      : 0;

  // Freeze ramp — black overlay that ramps 0→0.45 during the particle freeze window
  // (deathCountFrames > scoreCountFrames). Gives weight to the death moment.
  const freezeWindowFrames = display.deathCountFrames - display.scoreCountFrames;
  const freezeAlpha =
    display.phase === 'dead' && freezeWindowFrames > 0
      ? (1 - freezeWindowFrames / DEATH_FREEZE_FRAMES) * 0.45
      : 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View
      onTouchStart={(e) => {
        // Multi-touch: iterate changedTouches so both fingers fire independently
        const { changedTouches } = e.nativeEvent;
        for (let i = 0; i < changedTouches.length; i++) {
          const t = changedTouches[i];
          if (!t) continue;
          handleTouch(t.locationX / SCALE);
        }
      }}
      style={[styles.root, { backgroundColor: bgColor }]}
    >
      <View style={{ width: SCREEN_W, height: GAME_H, overflow: 'hidden' }}>
        {/* ── Lane backgrounds ── */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: SCREEN_W / 2,
            height: GAME_H,
            backgroundColor: COL_L + laneHex,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: SCREEN_W / 2,
            top: 0,
            width: SCREEN_W / 2,
            height: GAME_H,
            backgroundColor: COL_R + laneHex,
          }}
        />

        {/* ── Skia Canvas for visual effects ── */}
        {/* Contains: divider glow, pipes (with scanlines/glow/caps), death particles,
            dots (with glow/pulse/highlight/close-call/death flash), title bloom */}
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
          {/* ── Divider bilateral soft glow ── */}
          {/* Left glow: COL_L transparent at far-left, opaque near centre */}
          <Rect x={sx(W / 2 - 18)} y={0} width={sx(18)} height={GAME_H}>
            <LinearGradient
              start={vec(sx(W / 2 - 18), 0)}
              end={vec(sx(W / 2), 0)}
              colors={[COL_L + '00', COL_L + divHex]}
            />
          </Rect>

          {/* Right glow: COL_R fade from left to right */}
          <Rect x={sx(W / 2)} y={0} width={sx(18)} height={GAME_H}>
            <LinearGradient
              start={vec(sx(W / 2), 0)}
              end={vec(sx(W / 2 + 18), 0)}
              colors={[COL_R + divHex, COL_R + '00']}
            />
          </Rect>

          {/* Hard centre line */}
          <Rect x={sx(W / 2 - 1)} y={0} width={2} height={GAME_H} color="#111120" />

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

                    {/* Scanline texture — horizontal + vertical lines */}
                    {/* Build Path for all scanlines to avoid too many JSX elements */}
                    {/* Horizontal lines every 5px */}
                    <PipeScanlines
                      x={pipeLeft}
                      y={seg.y}
                      width={sx(PIPE_W)}
                      height={seg.h}
                      edgeCol={COL_L}
                    />

                    {/* Outer glow gradients — prototype: left outer = COL_R, right outer = COL_L */}
                    {/* Left half: left (outer) edge glows COL_R */}
                    <Rect x={pipeLeft} y={seg.y} width={sx(18)} height={seg.h}>
                      <LinearGradient
                        start={vec(pipeLeft, seg.y)}
                        end={vec(pipeLeft + sx(18), seg.y)}
                        colors={[COL_R + 'cc', COL_R + '00']}
                      />
                    </Rect>

                    {/* Right half: right (outer) edge glows COL_L */}
                    <Rect
                      x={pipeLeft + sx(PIPE_W) - sx(18)}
                      y={seg.y}
                      width={sx(18)}
                      height={seg.h}
                    >
                      <LinearGradient
                        start={vec(pipeLeft + sx(PIPE_W), seg.y)}
                        end={vec(pipeLeft + sx(PIPE_W) - sx(18), seg.y)}
                        colors={[COL_L + 'cc', COL_L + '00']}
                      />
                    </Rect>

                    {/* Hard 1px outer edge lines — COL_R on left outer, COL_L on right outer */}
                    <Rect
                      x={pipeLeft}
                      y={seg.y}
                      width={sx(1)}
                      height={seg.h}
                      color={COL_R}
                      opacity={0.6}
                    />
                    <Rect
                      x={pipeLeft + sx(PIPE_W) - sx(1)}
                      y={seg.y}
                      width={sx(1)}
                      height={seg.h}
                      color={COL_L}
                      opacity={0.6}
                    />

                    {/* Gap-facing cap bar (6px tall, rounded on gap side) */}
                    {seg.isTop ? (
                      /* Top segment: cap at bottom of segment */
                      <>
                        <RoundedRect
                          x={pipeLeft}
                          y={seg.y + seg.h - sx(6)}
                          width={halfW}
                          height={sx(6)}
                          r={sx(3)}
                          color={COL_L + 'ee'}
                        />
                        <RoundedRect
                          x={pipeLeft + halfW}
                          y={seg.y + seg.h - sx(6)}
                          width={halfW}
                          height={sx(6)}
                          r={sx(3)}
                          color={COL_R + 'ee'}
                        />
                      </>
                    ) : (
                      /* Bottom segment: cap at top of segment */
                      <>
                        <RoundedRect
                          x={pipeLeft}
                          y={seg.y}
                          width={halfW}
                          height={sx(6)}
                          r={sx(3)}
                          color={COL_L + 'ee'}
                        />
                        <RoundedRect
                          x={pipeLeft + halfW}
                          y={seg.y}
                          width={halfW}
                          height={sx(6)}
                          r={sx(3)}
                          color={COL_R + 'ee'}
                        />
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
          <Dot
            cx={sx(LANE_L)}
            cy={dotLDisplayY * SCALE}
            col={COL_L}
            pulse={display.pulseL}
            closeCall={display.closeL}
            deathFlash={display.deathFlashL}
          />

          {/* ── Right dot with all effects ── */}
          <Dot
            cx={sx(LANE_R)}
            cy={dotRDisplayY * SCALE}
            col={COL_R}
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

        {/* ── Live score with pop animation ── */}
        {display.phase === 'playing' && (
          <View
            pointerEvents="none"
            style={[styles.scoreContainer, { transform: [{ scale: scoreScale }] }]}
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
        )}

        {/* ── Tier progress dots ── */}
        {display.phase === 'playing' && (
          <View pointerEvents="none" style={styles.progressDotsContainer}>
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
        )}

        {/* ── Milestone pop overlay ── */}
        {display.milestonePop > 0 && display.phase === 'playing' && (
          <View
            pointerEvents="none"
            style={[styles.milestoneContainer, { top: 110 - mDriftY, opacity: mAlpha }]}
          >
            <Text style={styles.milestoneText}>★ {display.score} ★</Text>
            {isTierBoundary && (
              <Text style={styles.milestoneTierName}>{tierName(display.score)}</Text>
            )}
          </View>
        )}

        {/* ── Idle screen — Phase 3 ── */}
        {display.phase === 'idle' && (
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
                  top: sx(200) - sx(34) + 3,
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
                  top: sx(200) - sx(34),
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
                  top: sx(200) - sx(34) + 3,
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
                  top: sx(200) - sx(34),
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
        )}

        {/* ── Pause overlay ── */}
        {display.phase === 'playing' && display.paused && (
          <View style={[styles.overlay, { backgroundColor: '#07070faa' }]}>
            <Text style={styles.pauseTitle}>PAUSED</Text>
            <Text style={[styles.sub, { opacity: pauseSubOpacity }]}>tap to resume</Text>
          </View>
        )}

        {/* ── Death overlay — Phase 2 ── */}
        {showDeathOverlay && (
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
              (wasNewBestRef.current ? (
                <Text style={styles.deathNewBest}>★ NEW BEST ★</Text>
              ) : (
                <Text style={styles.deathBestLine}>BEST {bestScoreRef.current}</Text>
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
        )}
      </View>
    </View>
  );
}

// ─── Skia Dot Component ───────────────────────────────────────────────────────
/**
 * Renders a dot with all visual effects:
 * 1. Pulse ring (when pulse > 0)
 * 2. Ambient glow halo
 * 3. Solid core
 * 4. Highlight spot
 * 5. Close-call gold ring
 * 6. Death flash burst rings
 */
interface DotProps {
  cx: number;
  cy: number;
  col: string;
  pulse: number;
  closeCall: number;
  deathFlash: number;
}

function Dot({ cx, cy, col, pulse, closeCall, deathFlash }: DotProps) {
  const r = sx(DOT_R) + (pulse > 0 ? pulse * SCALE * 0.5 : 0);

  // Helper: draw a stroked circle using Path
  const strokeCircle = (radius: number, strokeW: number, color: string, opacity: number) => {
    const path = Skia.Path.Make();
    path.addCircle(cx, cy, radius);
    return (
      <Path
        path={path}
        start={0}
        end={1}
        color={color}
        opacity={opacity}
        style="stroke"
        strokeWidth={strokeW}
      />
    );
  };

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

// ─── Skia Pipe Scanlines Component ────────────────────────────────────────────
/**
 * Renders horizontal and vertical scanline texture for a pipe segment.
 * Uses a single Path with moveTo/lineTo to avoid too many JSX elements.
 */
interface PipeScanlinesProps {
  x: number;
  y: number;
  width: number;
  height: number;
  edgeCol: string;
}

function PipeScanlines({ x, y, width, height, edgeCol }: PipeScanlinesProps) {
  const path = Skia.Path.Make();

  // Horizontal lines every 5 logical px
  const hSpacing = 5 * SCALE;
  let ly = y;
  while (ly < y + height) {
    path.moveTo(x, ly);
    path.lineTo(x + width, ly);
    ly += hSpacing;
  }

  // Vertical lines every 9 logical px
  const vSpacing = 9 * SCALE;
  let lx = x;
  while (lx < x + width) {
    path.moveTo(lx, y);
    path.lineTo(lx, y + height);
    lx += vSpacing;
  }

  return (
    <Path
      path={path}
      start={0}
      end={1}
      color={edgeCol}
      opacity={0.25}
      strokeWidth={1}
      style="stroke"
    />
  );
}

// ─── Skia Title Bloom Component ───────────────────────────────────────────────
/**
 * Renders the radial bloom glow behind the "TWO" and "DOTS" title words on idle screen.
 */
interface TitleBloomProps {
  nowMs: number;
}

function TitleBloom({ nowMs }: TitleBloomProps) {
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Live score ──────────────────────────────────────────────────────────────
  scoreContainer: {
    position: 'absolute',
    // Adaptive Y: prototype uses Math.max(58, visH*0.09) in logical px
    top: Math.max(58 * SCALE, GAME_H * 0.09),
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  scoreLive: {
    textAlign: 'center',
    fontFamily: 'SpaceMono-Bold',
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 4,
  },

  // ── Progress dots ───────────────────────────────────────────────────────────
  progressDotsContainer: {
    position: 'absolute',
    // Track score Y: prototype places dots 22 logical px below score text
    top: Math.max(58 * SCALE, GAME_H * 0.09) + 22 * SCALE,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
    opacity: 0.85,
  },

  // ── Milestone pop ───────────────────────────────────────────────────────────
  milestoneContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  milestoneText: {
    color: GOLD,
    fontFamily: 'SpaceMono-Bold',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  milestoneTierName: {
    color: GOLD,
    fontFamily: 'SpaceMono-Bold',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 8,
  },

  // ── Idle screen — Phase 3 ───────────────────────────────────────────────────
  idleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  idleWord: {
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(68),
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  idleInstruction: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(18),
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  idleHintsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleHintL: {
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'right',
    paddingRight: 10,
  },
  idleHintR: {
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'left',
    paddingLeft: 10,
  },
  thumbLabel: {
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 2,
  },

  // ── Pause ───────────────────────────────────────────────────────────────────
  pauseTitle: {
    color: '#ffffff',
    fontFamily: 'SpaceMono-Bold',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  sub: {
    color: '#ffffff',
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(14),
    fontWeight: 'bold',
    letterSpacing: 3,
    marginTop: 14,
  },

  // ── Death screen — Phase 2 ──────────────────────────────────────────────────
  deathScoreBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    // Padding to ensure shadows (offset ±6 logical) aren't clipped
    paddingHorizontal: 20,
  },
  deathScoreBig: {
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(150),
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
  },
  deathNewBest: {
    color: GOLD,
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(20),
    fontWeight: 'bold',
    letterSpacing: 3,
    marginTop: sx(8),
  },
  // Prototype: DIMMED (#2a2a3a) at globalAlpha 0.75 — very dark and muted,
  // intentionally de-emphasised so the score stays dominant.
  deathBestLine: {
    color: 'rgba(42,42,58,0.75)',
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(20),
    fontWeight: 'bold',
    letterSpacing: 3,
    marginTop: sx(8),
  },
  deathTierInfo: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(13),
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: sx(4),
  },
  retryPill: {
    marginTop: sx(20),
    paddingHorizontal: sx(28),
    paddingVertical: sx(10),
    borderRadius: sx(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#ffffff',
    fontFamily: 'SpaceMono-Bold',
    fontSize: sx(18),
    fontWeight: 'bold',
    letterSpacing: 2,
  },
});
