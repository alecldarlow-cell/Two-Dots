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

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { W, LANE_ALPHA_BY_TIER, DEATH_FREEZE_FRAMES, tierFor } from '@features/game/engine';
import {
  COL_L,
  COL_R,
  COL_BG,
  COL_BG_FLASH,
  GOLD,
  SCREEN_W,
  SCALE,
  VIS_H,
  GAME_H,
  IDLE_CENTRE_Y,
  IDLE_AMPLITUDE,
  sx,
  alphaHex,
} from './_shared/constants';
import { styles } from './_shared/styles';
import { GameCanvas } from './_canvas/GameCanvas';
import { useCurrentPlanet } from './_hooks/useCurrentPlanet';
import { useGameLoop } from './_hooks/useGameLoop';
import { DeathScreen } from './_overlays/DeathScreen';
import { IdleScreen } from './_overlays/IdleScreen';
import { PlayingHUD } from './_overlays/PlayingHUD';

// v0.3-worlds — planetary backgrounds are still in development. When false,
// GameCanvas renders without the WorldRenderer (pre-v0.3 dark background).
// Flip to true once the Earth/Jupiter theme designs are signed off.
// SMOKE-TEST DEBUG — flipped to true for wifi-debug visual smoke test.
// Revert to false before merging.
const WORLDS_ENABLED = true;

// ─── Component ────────────────────────────────────────────────────────────────
export default function GameScreen(): React.ReactElement {
  // All game-state machinery lives in this hook: refs, gsRef + display state,
  // audio loading, the rAF physics+render loop, the death side-effect, and
  // the multi-touch handler. See _hooks/useGameLoop.ts for the full surface.
  const { display, handleTouch, bestScore, wasNewBest } = useGameLoop();

  // v0.3-worlds — selected planetary mode (persisted to AsyncStorage). The
  // theme registry currently only ships Moon, so this falls back to Moon
  // until Earth + Jupiter design lands. Engine `gravityMul` wiring follows
  // in a separate commit once the renderer side passes the side-by-side
  // diff (spec §6).
  const [worldTheme] = useCurrentPlanet();

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

  // U2 (Stage 2.2, refined): the original HUD top values already had standard
  // Android status-bar breathing room baked in (~30px). Adding raw insets.top
  // pushed everything ~30px too low on Pixel 7. Instead, only add the EXCESS
  // inset above the standard status bar height — that way Android stays put
  // and iPhone notch / Dynamic Island still gets the offset it needs.
  const insets = useSafeAreaInsets();
  const STANDARD_STATUS_BAR = 30;
  const notchOffset = Math.max(0, insets.top - STANDARD_STATUS_BAR);

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
      // U1 (Stage 2.2): screen-reader hooks. The whole View is the touch
      // target across all phases — VoiceOver/TalkBack now describe it as a
      // button with how-to-play context. Score updates aren't announced
      // (would be too chatty); users explore the rest by touching.
      accessible
      accessibilityRole="button"
      accessibilityLabel="Two Dots game"
      accessibilityHint="Tap left side of screen to jump the orange dot. Tap right side to jump the cyan dot. Keep both alive."
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

        {/* ── Skia canvas — all in-game visual effects ── */}
        <GameCanvas
          display={display}
          nowMs={nowMs}
          dotLDisplayY={dotLDisplayY}
          dotRDisplayY={dotRDisplayY}
          divHex={divHex}
          sPulseT={sPulseT}
          sPulseW={sPulseW}
          sPulseX={sPulseX}
          pauseShimmerOpacity={pauseShimmerOpacity}
          goldWashAlpha={goldWashAlpha}
          freezeAlpha={freezeAlpha}
          // v0.3-worlds — Moon background (sky + bands + celestial + stars).
          // worldTod is static at 0.25 (day) for the first render; cycle
          // animation lands in a follow-up once schema is locked. worldScrollX
          // ticks gently from nowMs so parallax bands have a sense of motion.
          // Gated behind WORLDS_ENABLED while themes are in design — when
          // false, GameCanvas's `worldTheme && (...)` guard skips WorldRenderer
          // and the canvas falls back to its pre-v0.3 dark background.
          worldTheme={WORLDS_ENABLED ? worldTheme : undefined}
          // SMOKE-TEST DEBUG — auto-cycle ToD every 60s so we can verify
          // dawn/day/dusk/night transitions without waiting for the cycle
          // engine to land. Revert to `worldTod={0.25}` before merging.
          worldTod={(nowMs / 60000) % 1}
          worldScrollX={nowMs * 0.04}
        />

        {/* ── Playing-phase HUD (live score + progress dots + milestone pop + pause) ── */}
        {display.phase === 'playing' && (
          <PlayingHUD
            display={display}
            nowMs={nowMs}
            notchOffset={notchOffset}
            popT={popT}
            scoreScale={scoreScale}
            scoreColor={scoreColor}
            shadowOff={shadowOff}
            tier={tier}
            isSurvival={isSurvival}
            mAlpha={mAlpha}
            mDriftY={mDriftY}
            isTierBoundary={isTierBoundary}
            pauseSubOpacity={pauseSubOpacity}
          />
        )}

        {/* ── Idle screen ── */}
        {display.phase === 'idle' && (
          <IdleScreen
            titleShadowOpacity={titleShadowOpacity}
            thumbR={thumbR}
            thumbY={thumbY}
            thumbFillAlpha={thumbFillAlpha}
          />
        )}

        {/* ── Death screen ── */}
        {showDeathOverlay && (
          <DeathScreen
            display={display}
            countDone={countDone}
            wasNewBest={wasNewBest}
            bestScore={bestScore}
            retryPulse={retryPulse}
          />
        )}
      </View>
    </View>
  );
}


