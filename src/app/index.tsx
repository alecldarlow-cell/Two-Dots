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

import { W, DEATH_FREEZE_FRAMES } from '@features/game/engine';
import {
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
} from './_shared/constants';
import { styles } from './_shared/styles';
import { GameCanvas } from './_canvas/GameCanvas';
import { useCurrentPlanet } from './_hooks/useCurrentPlanet';
import { useGameLoop } from './_hooks/useGameLoop';
import { useWorldTod } from './_hooks/useWorldTod';
import { DeathScreen } from './_overlays/DeathScreen';
import { IdleScreen } from './_overlays/IdleScreen';
import { PlayingHUD } from './_overlays/PlayingHUD';

// v0.3-worlds — planetary backgrounds. Three worlds are now authored
// (Moon, Earth, Jupiter) and the WorldRenderer is wired through to the
// gate-anchored ToD cycle and the score-derived theme picker. Set to
// false to fall back to the pre-v0.3 dark background.
const WORLDS_ENABLED = true;

// ─── Component ────────────────────────────────────────────────────────────────
export default function GameScreen(): React.ReactElement {
  // All game-state machinery lives in this hook: refs, gsRef + display state,
  // audio loading, the rAF physics+render loop, the death side-effect, and
  // the multi-touch handler. See _hooks/useGameLoop.ts for the full surface.
  const { display, handleTouch, bestScore, wasNewBest } = useGameLoop();

  // ─── Derived render values ─────────────────────────────────────────────────
  const nowMs = Date.now();

  // v0.3-worlds — world selection is now derived from player score:
  //   gates  0– 9 → Moon, 10–19 → Earth, 20+ → Jupiter (terminal).
  // No persistence; every run starts on Moon and progresses with the score.
  // Engine `gravityMul` wiring still pending — see spec §6.
  const worldTheme = useCurrentPlanet(display.score);

  // ToD is gate-anchored (one full cycle per 10 gates) with an adaptive
  // tween between gate clears that tracks the player's recent pacing.
  // Pause / idle / dead freeze the cycle at dawn.
  const worldTod = useWorldTod(display, nowMs);

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

  // Background colour — briefly reddish on death
  const bgColor = display.flash > 6 ? COL_BG_FLASH : COL_BG;

  // Live score pop animation. v0.3-worlds: dropped the orange/cyan offset
  // shadow values (shadowOff) since the redesigned HUD score has no
  // shadows — single gold core, scale-pop animation only.
  const popT = display.scorePop / 18;
  const scoreScale = 1 + popT * 0.4;
  const scoreColor = display.scorePop > 12 ? '#ffffff' : GOLD;

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

  // Count-up completion — gates the "reached <world>" caption reveal.
  const countDone = display.deathCountFrames === 0;

  // Breathing thumb circles (prototype: 38 ± 5px radius, 700ms period).
  // v0.3-worlds: thumbFillAlpha bumped from 0.05±0.03 (range 0.02–0.08, near
  // invisible against the new world backgrounds) to 0.20±0.05 (range
  // 0.15–0.25). Light-but-translucent white inside the tap circles so the
  // affordance reads against any sky.
  const thumbR = (38 + 5 * Math.sin(nowMs / 700)) * SCALE;
  const thumbY = VIS_H * 0.72 * SCALE;
  const thumbFillAlpha = (0.2 + 0.05 * Math.sin(nowMs / 700)).toFixed(3);

  // U2 (Stage 2.2, refined): the original HUD top values already had standard
  // Android status-bar breathing room baked in (~30px). Adding raw insets.top
  // pushed everything ~30px too low on Pixel 7. Instead, only add the EXCESS
  // inset above the standard status bar height — that way Android stays put
  // and iPhone notch / Dynamic Island still gets the offset it needs.
  const insets = useSafeAreaInsets();
  const STANDARD_STATUS_BAR = 30;
  const notchOffset = Math.max(0, insets.top - STANDARD_STATUS_BAR);

  // Tier-based HUD dots removed (v0.3-worlds): the in-game progression
  // dots now derive from world reached (computed inside PlayingHUD), not
  // from engine tiers. tierFor still drives engine difficulty curves but
  // is no longer surfaced in the HUD.

  // Divider glow + hard centre line removed (v0.3-worlds — see GameCanvas).
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
        {/* v0.3-worlds — Lane backgrounds removed. Under the legacy
         *  pre-worlds theme these warm-L / cool-R tint Views ramped alpha
         *  by tier (LANE_ALPHA_BY_TIER) to amplify progression tension on
         *  a dark canvas. With WorldRenderer owning the full background
         *  and the warm/cool dot pair carrying L/R identity on its own,
         *  the lane tints fought the world palette and produced an
         *  unintended "darkens as you progress" effect. */}

        {/* ── Skia canvas — all in-game visual effects ── */}
        <GameCanvas
          display={display}
          nowMs={nowMs}
          dotLDisplayY={dotLDisplayY}
          dotRDisplayY={dotRDisplayY}
          sPulseT={sPulseT}
          sPulseW={sPulseW}
          sPulseX={sPulseX}
          pauseShimmerOpacity={pauseShimmerOpacity}
          goldWashAlpha={goldWashAlpha}
          freezeAlpha={freezeAlpha}
          // v0.3-worlds — planetary background. worldTheme switches based on
          // score (Moon → Earth → Jupiter), worldTod cycles per 10 gates with
          // adaptive tween between clears (see useWorldTod). worldScrollX
          // ticks gently from nowMs so parallax bands have motion independent
          // of the ToD cycle. Gated behind WORLDS_ENABLED — when false,
          // GameCanvas's `worldTheme && (...)` guard skips WorldRenderer and
          // the canvas falls back to its pre-v0.3 dark background.
          worldTheme={WORLDS_ENABLED ? worldTheme : undefined}
          worldTod={worldTod}
          worldScrollX={nowMs * 0.04}
        />

        {/* ── Playing-phase HUD (live score + world dots + milestone pop + pause) ── */}
        {display.phase === 'playing' && (
          <PlayingHUD
            display={display}
            notchOffset={notchOffset}
            scoreScale={scoreScale}
            scoreColor={scoreColor}
            mAlpha={mAlpha}
            mDriftY={mDriftY}
            isTierBoundary={isTierBoundary}
            pauseSubOpacity={pauseSubOpacity}
          />
        )}

        {/* ── Idle screen ── */}
        {display.phase === 'idle' && (
          <IdleScreen
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
          />
        )}
      </View>
    </View>
  );
}


