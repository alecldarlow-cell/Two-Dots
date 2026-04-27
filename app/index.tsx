/**
 * Game screen.
 *
 * S2 scaffolding: engine state, tap handler, and frame loop are all wired,
 * but the render layer is a placeholder until S3. This file exists so the
 * app boots end-to-end on device — launching `expo start` shows a black
 * screen with a tap target that logs engine events.
 *
 * S3 replaces the placeholder <View> with <Canvas> from @shopify/react-native-skia
 * and moves the per-frame redraw into a Reanimated useFrameCallback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import {
  handleTap,
  initState,
  stepDead,
  stepPlaying,
  tierFor,
  VIS_H_MAX,
  VIS_H_MIN,
  W,
  type GameState,
} from '@features/game/engine';
import { defaultRng } from '@shared/utils/rng';
import { logEvent } from '@features/analytics';
import { useDeviceId } from '@features/leaderboard/hooks/useDeviceId';
import { useSubmitScore } from '@features/leaderboard/api';

export default function GameScreen(): React.ReactElement {
  const dims = useWindowDimensions();
  const deviceState = useDeviceId();
  const { mutate: submitScore } = useSubmitScore();

  // Engine state lives in a ref — game loop mutates it and React never sees
  // the per-frame churn. A single piece of state (`phase`) is lifted for UI.
  const stateRef = useRef<GameState>(initState());
  const [displayPhase, setDisplayPhase] = useState<GameState['phase']>('idle');

  const sessionIdRef = useRef<string>(uuidv4());
  const runIndexRef = useRef<number>(0);
  const lastDeathAtRef = useRef<number | null>(null);

  // Compute logical visH the same way the prototype does — W=390 fixed, height
  // scales to viewport aspect ratio, clamped to VIS_H_MIN..VIS_H_MAX.
  const visH = Math.round(
    Math.max(VIS_H_MIN, Math.min(VIS_H_MAX, W * (dims.height / Math.max(1, dims.width)))),
  );

  // ── Game loop ─────────────────────────────────────────────────────────────
  // S2 scaffold: setInterval at ~16ms. S3 replaces this with Reanimated's
  // useFrameCallback running on the UI thread, synchronised to Skia frames.
  useEffect(() => {
    let raf: ReturnType<typeof setInterval> | null = null;
    raf = setInterval(() => {
      const s = stateRef.current;
      const now = performance.now();
      if (s.phase === 'playing') {
        const effects = stepPlaying(s, { now, visH, rng: defaultRng });
        if (effects.died) {
          lastDeathAtRef.current = now;
          logEvent({
            type: 'run_end',
            sessionId: sessionIdRef.current,
            runIndex: runIndexRef.current,
            score: s.score,
            tier: tierFor(s.score),
            deathSide: s.deathSide,
            deathGateInTier: s.deathGateInTier,
          });
          if (deviceState.status === 'ready' && s.score > 0) {
            submitScore({
              deviceId: deviceState.deviceId,
              sessionId: sessionIdRef.current,
              score: s.score,
              tier: tierFor(s.score),
              deathSide: s.deathSide,
            });
          }
          setDisplayPhase('dead');
        }
      } else if (s.phase === 'dead') {
        stepDead(s);
      }
    }, 16);
    return () => {
      if (raf) clearInterval(raf);
    };
  }, [visH, deviceState, submitScore]);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const onTap = useCallback(
    (tapXScreen: number) => {
      const s = stateRef.current;
      const wasAlive = s.phase === 'playing';
      const wasDead = s.phase === 'dead';
      // Translate screen px → logical (W=390) px.
      const scale = W / Math.max(1, dims.width);
      const tapX = tapXScreen * scale;
      const now = performance.now();

      handleTap(s, tapX, now, visH);

      if (!wasAlive && s.phase === 'playing') {
        runIndexRef.current++;
        logEvent({
          type: 'run_start',
          sessionId: sessionIdRef.current,
          runIndex: runIndexRef.current,
        });
        if (wasDead && lastDeathAtRef.current !== null) {
          logEvent({
            type: 'retry_tapped',
            sessionId: sessionIdRef.current,
            previousRunIndex: runIndexRef.current - 1,
            timeSinceDeathMs: now - lastDeathAtRef.current,
          });
          lastDeathAtRef.current = null;
        }
        setDisplayPhase('playing');
      }
    },
    [dims.width, visH],
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Pressable
          style={styles.hit}
          onPressIn={(e) => onTap(e.nativeEvent.pageX)}
          testID="game-canvas"
        >
          <View style={styles.placeholder}>
            <Text style={styles.title}>TWO DOTS</Text>
            <Text style={styles.hint}>
              {displayPhase === 'idle'
                ? 'tap to start'
                : displayPhase === 'playing'
                  ? 'tap left / right'
                  : 'tap to retry'}
            </Text>
            <Text style={styles.note}>
              S2 placeholder — Skia renderer lands in S3.
            </Text>
          </View>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070f' },
  safe: { flex: 1 },
  hit: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    color: '#ffffff',
    fontFamily: 'Space Mono',
    fontSize: 32,
    letterSpacing: 6,
    fontWeight: '700',
  },
  hint: {
    color: '#2ECFFF',
    fontFamily: 'Space Mono',
    fontSize: 14,
    letterSpacing: 2,
  },
  note: {
    color: '#5c5c70',
    fontFamily: 'Space Mono',
    fontSize: 10,
    marginTop: 24,
  },
});
