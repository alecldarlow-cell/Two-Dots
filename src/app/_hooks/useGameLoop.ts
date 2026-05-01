/**
 * useGameLoop — encapsulates ALL game-state machinery the parent GameScreen
 * used to own inline:
 *
 *   - Per-component refs (sessionId, runIndex, deathTime, prevPhase,
 *     lastFrame accumulator, bestScore, wasNewBest, gameState).
 *   - Display snapshot state (the React-rendered projection of gsRef.current).
 *   - Audio loading and replay (expo-audio, 16 WAVs preloaded in parallel,
 *     rapid-fire SFX pooled per POOLED_SOUNDS).
 *   - The fixed-timestep physics+render loop (rAF + accumulator + every-other-
 *     frame setDisplay).
 *   - The death side-effect (haptics, analytics run_end, score submission,
 *     monetisation interstitial, persisted-best update).
 *   - The multi-touch tap handler (handleTouch) — analytics run_start /
 *     retry_tapped + event-driven audio + haptics.
 *
 * Returns { display, handleTouch, bestScore, wasNewBest } for the parent to
 * render. bestScore and wasNewBest are read fresh from refs on every hook
 * call; the rAF loop's setDisplay re-render is what propagates the latest
 * values to the parent.
 *
 * STALE-CLOSURE NOTES:
 * - `replay` is captured via useRef(...).current so it's stable across the
 *   life of the component. Listing it as the rAF effect's dep satisfies
 *   exhaustive-deps without restarting the loop.
 * - The death side-effect's deps include all the display fields it actually
 *   reads (phase / score / deathSide / deathGateInTier) plus the unstable
 *   external hooks (deviceState, submitScore, showInterstitial). It writes
 *   to wasNewBestRef BEFORE bestScoreRef so the new-best detection isn't
 *   self-defeating.
 * - The rAF loop reads gsRef.current synchronously inside its closure each
 *   frame — never via a stale snapshot.
 *
 * Extracted from src/app/index.tsx as Stage 5 first-pass refactor step 9
 * (the careful one). Tag v0.1.2-refactor-split lands AFTER manual on-device
 * QA confirms the rAF loop and death sequence still behave identically.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';

import { logEvent } from '@features/analytics';
import { handleTap, initState, stepDead, stepPlaying, tierFor } from '@features/game/engine';
import type { AudioEvent, GameState } from '@features/game/engine';
import { getTheme } from '@features/game/world';
import { useDeviceId } from '@features/leaderboard/hooks/useDeviceId';
import { useSubmitScore } from '@features/leaderboard/api';
import { useMonetisation } from '@features/monetisation';
import { StorageKeys, getItem, setItem } from '@shared/storage';
import { defaultRng } from '@shared/utils/rng';

import { PHYSICS_STEP_MS, VIS_H } from '../_shared/constants';
import { snap, type DisplaySnapshot } from '../_shared/snapshot';
import { planetForScore } from './useCurrentPlanet';

// ─── Audio pool config ──────────────────────────────────────────────────────
// Sounds that benefit from a multi-instance pool — rapid-fire SFX where
// successive taps may overlap. Each pooled sound gets POOL_SIZE players;
// replay() round-robins through them so every tap lands on a fresh-start
// instance, eliminating the seek+play race and supporting overlapping
// plays. Other sounds get pool size 1.
const POOLED_SOUNDS = new Set(['jumpL', 'jumpR', 'tap', 'closeCall']);
const POOL_SIZE = 2;

export interface GameLoopAPI {
  /** The latest snapshot of the game state, re-rendered every other frame. */
  display: DisplaySnapshot;
  /** Multi-touch entry point — call once per `changedTouches` entry. */
  handleTouch: (tapX: number) => void;
  /** Persisted personal best (loaded from AsyncStorage on mount). */
  bestScore: number;
  /** True if the most-recent run beat the previous best — drives the "★ NEW BEST ★" line. */
  wasNewBest: boolean;
}

export function useGameLoop(): GameLoopAPI {
  const deviceState = useDeviceId();
  const { mutate: submitScore } = useSubmitScore();
  const { showInterstitial } = useMonetisation();

  const sessionIdRef = useRef<string>(Crypto.randomUUID());
  const runIndexRef = useRef<number>(0);
  const deathTimeRef = useRef<number>(0);
  const prevPhaseRef = useRef<GameState['phase']>('idle');
  // Run-lifecycle timing — set on idle→playing tap, read at death to compute
  // time_to_death_ms for the run_end analytics event.
  const runStartTimeRef = useRef<number>(0);
  // Close-call counter — incremented on each close-call audio event during a
  // run, reset on idle→playing transition. Banked into run_end payload.
  const closeCallsInRunRef = useRef<number>(0);
  // Fixed-timestep accumulator — ensures physics runs at exactly 60 steps/second
  // regardless of display refresh rate (60/90/120Hz). Without this, physics
  // runs 50–100% faster on high-refresh-rate devices.
  const lastFrameRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  // Best score — persisted to AsyncStorage so it survives app kill. Loaded
  // once on mount; written through on every new PB. (Stage 2.2 P-best fix.)
  const bestScoreRef = useRef<number>(0);
  // Set to true when this run beats the previous best (drives "★ NEW BEST ★" display)
  const wasNewBestRef = useRef<boolean>(false);

  const gsRef = useRef<GameState>(initState());
  const [display, setDisplay] = useState<DisplaySnapshot>(() => snap(gsRef.current));

  // ─── Audio (expo-audio) ──────────────────────────────────────────────────────
  // Each sound key maps to a small pool of AudioPlayer instances. Replay
  // round-robins through the pool so rapid-fire keys (jumpL/jumpR/tap/
  // closeCall) can fire overlapping plays without contending on a single
  // player's seek+play race.
  const sounds = useRef<Record<string, AudioPlayer[]>>({});
  const poolIndex = useRef<Record<string, number>>({});

  // Stable replay — accesses sounds.current at call time; never stale.
  //
  // expo-audio's AudioPlayer.currentTime is a GETTER ONLY at runtime
  // (despite the .d.ts not marking it readonly), so seekTo(0) is the
  // documented way to restart playback. seekTo returns a Promise; we
  // fire-and-forget and call play() immediately — the native seek
  // completes before the audio thread services play, so the replay
  // starts from zero in practice. .catch() on the Promise stops async
  // rejections from floating as unhandled.
  const replay = useRef((key: string): void => {
    const pool = sounds.current[key];
    if (!pool || pool.length === 0) {
      console.warn(`[audio] replay called for missing key: ${key}`);
      return;
    }
    const cur = poolIndex.current[key] ?? -1;
    const next = (cur + 1) % pool.length;
    poolIndex.current[key] = next;
    const player = pool[next];
    if (!player) return; // unreachable — pool.length verified non-zero above
    try {
      player.seekTo(0).catch(() => {});
      player.play();
    } catch (e) {
      console.warn(`[audio] replay ${key} threw:`, e);
    }
  }).current;

  // Load persistent best score once on mount. Falls back to 0 if absent or
  // corrupt. Writes happen inline at the new-PB site below.
  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      const stored = await getItem<number>(StorageKeys.personalBest);
      if (!cancelled && typeof stored === 'number' && stored > 0) {
        bestScoreRef.current = stored;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Background/foreground handling ──────────────────────────────────────────
  // Two things happen when the app is sent to background:
  //   1. We set `gsRef.current.paused = true` if a run is in progress, which
  //      the engine respects (stepPlaying is a no-op when paused — see
  //      step.ts:85). This freezes physics so the dots don't fall during
  //      resume; any non-centre tap on return unpauses (step.ts:313-315).
  //   2. We reset `lastFrameRef` and the physics accumulator so that even if
  //      the engine state somehow continued, the first frame after resume
  //      would compute zero catch-up physics. Belt and braces.
  // Idle and dead phases don't need pausing — they're already not stepping
  // physics — but resetting the timestamps is harmless.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (gsRef.current.phase === 'playing') {
          gsRef.current.paused = true;
        }
        lastFrameRef.current = 0;
        accRef.current = 0;
      }
    });
    return () => sub.remove();
  }, []);

  // Load all sounds once on mount; clean up on unmount.
  //
  // Source form: pass the resolved Asset object directly to
  // createAudioPlayer. expo-audio's resolveSource detects `source
  // instanceof Asset` and produces { uri: localUri ?? uri } with NO
  // assetId — sidestepping the ambiguity that makes
  // createAudioPlayer(src) (raw require id) silent in preview/production
  // builds. Pre-download the asset first so localUri is populated.
  //
  // Loading runs in parallel via Promise.all so all 16 downloads progress
  // concurrently rather than serialising — cuts cold-start audio-ready
  // time from sum-of-downloads to max-of-downloads.
  //
  // Pool sizing: POOLED_SOUNDS get POOL_SIZE players; everything else
  // gets a single player.
  //
  // Errors surface via console.warn rather than silently swallowed so
  // future regressions show up in device logs immediately.
  useEffect(() => {
    // playsInSilentMode is iOS-only; on Android it's a no-op.
    // interruptionMode: 'mixWithOthers' on Android tells the system "no
    // audio focus needed — these are short SFX." Hints the audio stack
    // toward a lower-latency routing path; the docs explicitly recommend
    // this mode for "sound effects, UI feedback, or short audio clips."
    // No effect on the silent-mode side; iOS still respects playsInSilentMode.
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch((e) => {
      console.warn('[audio] setAudioModeAsync failed:', e);
    });
    const soundsMap = sounds.current;
    const poolIndexMap = poolIndex.current;
    /* eslint-disable @typescript-eslint/no-require-imports --
       Asset requires are the canonical React Native + Metro pattern for
       bundled non-JS assets (.wav). ES imports of audio files aren't
       supported by the existing bundler config. The @typescript-eslint v8
       rule flags these by default; locally disabling for this block. */
    const sources: Record<string, number> = {
      jumpL: require('../../../assets/sounds/jump_l.wav'),
      jumpR: require('../../../assets/sounds/jump_r.wav'),
      tap: require('../../../assets/sounds/tap.wav'),
      pauseOn: require('../../../assets/sounds/pause_on.wav'),
      blip1: require('../../../assets/sounds/blip_t1.wav'),
      blip2: require('../../../assets/sounds/blip_t2.wav'),
      blip3: require('../../../assets/sounds/blip_t3.wav'),
      blip4: require('../../../assets/sounds/blip_t4.wav'),
      blip5: require('../../../assets/sounds/blip_t5.wav'),
      blip6: require('../../../assets/sounds/blip_t6.wav'),
      blip7: require('../../../assets/sounds/blip_t7.wav'),
      blip8: require('../../../assets/sounds/blip_t8.wav'),
      chordTier: require('../../../assets/sounds/chord_tier.wav'),
      chordFive: require('../../../assets/sounds/chord_five.wav'),
      closeCall: require('../../../assets/sounds/close_call.wav'),
      death: require('../../../assets/sounds/death.wav'),
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
    let cancelled = false;
    void Promise.all(
      Object.entries(sources).map(async ([key, src]) => {
        if (cancelled) return;
        try {
          const asset = Asset.fromModule(src);
          await asset.downloadAsync();
          if (cancelled) return;
          const poolSize = POOLED_SOUNDS.has(key) ? POOL_SIZE : 1;
          const pool: AudioPlayer[] = [];
          for (let i = 0; i < poolSize; i++) {
            pool.push(
              createAudioPlayer(asset as unknown as Parameters<typeof createAudioPlayer>[0]),
            );
          }
          soundsMap[key] = pool;
          poolIndexMap[key] = -1; // first replay() advances to index 0
        } catch (e) {
          console.warn(`[audio] failed to load ${key}:`, e);
        }
      }),
    );
    return () => {
      cancelled = true;
      Object.values(soundsMap)
        .flat()
        .forEach((p) => {
          try {
            p.remove();
          } catch {
            // Already removed; ignore.
          }
        });
    };
  }, []);

  // ─── Physics + render loop ───────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number;
    let frameCount = 0;

    // Map an engine AudioEvent → sound key. Also forks selected events into
    // the analytics queue (close-call) so the dashboard can compute close-call
    // rate and per-run engagement signal without a separate emission path.
    function playAudioEvent(ae: AudioEvent): void {
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
          closeCallsInRunRef.current++;
          logEvent({
            type: 'close_call',
            sessionId: sessionIdRef.current,
            runIndex: runIndexRef.current,
            score: gsRef.current.score,
            side: ae.side,
          });
          break;
        case 'death':
          replay('death');
          break;
        // tap/tap-start/tap-pause fired from handleTouch, not the loop
      }
    }

    function loop(): void {
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
          // Per-world gravity — recomputed per step from current score so
          // mid-run world swaps (gates 10, 20) take effect on the next frame.
          // Cheap (table lookup + property access). The same multiplier is
          // applied to dot physics AND the spawner's reachability projection
          // inside stepPlaying so gates stay reachable in any world.
          const gravityMul = getTheme(planetForScore(s.score)).gravityMul;
          const fx = stepPlaying(s, { now, visH: VIS_H, rng: defaultRng, gravityMul });
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

  // ─── Death side-effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (display.phase === 'dead' && prevPhaseRef.current === 'playing') {
      const now = Date.now();
      deathTimeRef.current = now;
      // Track best score — set wasNewBest BEFORE updating bestScore.
      // Persist new bests to AsyncStorage so they survive app kill.
      wasNewBestRef.current = display.score > 0 && display.score > bestScoreRef.current;
      if (wasNewBestRef.current) {
        bestScoreRef.current = display.score;
        void setItem(StorageKeys.personalBest, display.score).catch(() => {});
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
        timeToDeathMs: runStartTimeRef.current > 0 ? now - runStartTimeRef.current : 0,
        closeCallsInRun: closeCallsInRunRef.current,
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

  // ─── Touch handler (supports multi-touch via onTouchStart) ───────────────────
  // Audio + haptics fire IMMEDIATELY after handleTap determines what
  // events were emitted. setDisplay (snap deep-clone + React state set)
  // and analytics are deferred to after audio is dispatched. Audio-first
  // ordering minimises perceived input latency — saves the snap+setState
  // JS work (~1-2ms with several pipes alive) on the path to the play()
  // call.
  function handleTouch(tapX: number): void {
    const s = gsRef.current;
    const prevPhase = s.phase;
    const now = Date.now();

    const events = handleTap(s, tapX, now, VIS_H);

    // Audio + haptics first — minimum JS work between tap and play.
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
    // Dead → idle tap: no engine event emitted, handle directly.
    if (prevPhase === 'dead' && s.phase === 'idle') {
      replay('tap');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Visual update + analytics — happen after audio is in flight.
    setDisplay(snap(s));

    if (prevPhase === 'idle' && s.phase === 'playing') {
      runIndexRef.current++;
      runStartTimeRef.current = now;
      closeCallsInRunRef.current = 0;
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
  }

  return {
    display,
    handleTouch,
    bestScore: bestScoreRef.current,
    wasNewBest: wasNewBestRef.current,
  };
}
