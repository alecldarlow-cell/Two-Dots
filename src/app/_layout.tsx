/**
 * Root layout for expo-router.
 *
 * Wraps every route in the app-wide Providers (React Query, GestureHandler,
 * SafeArea) and bootstraps analytics once the device ID is available.
 *
 * Font loading: Space Mono (Regular + Bold) is bundled locally under
 * assets/fonts/ and loaded via require(). The splash screen is held until
 * fonts are ready so no layout-shift occurs. No network dependency on first
 * launch — works in airplane mode.
 */

/**
 * Polyfill crypto.getRandomValues() for Hermes / React Native.
 * Must be the very first import so it runs before @supabase/supabase-js,
 * uuid, or any other library that calls it during module initialisation.
 *
 * The local CryptoLike type captures the minimal shape we install on globalThis
 * so we can avoid `any` casts. The double-cast through `unknown` is needed
 * because lib.dom defines a stricter `Crypto` type that conflicts with our
 * minimal implementation.
 */
import * as ExpoCrypto from 'expo-crypto';
type CryptoLike = { getRandomValues?: (array: Uint8Array) => Uint8Array };
type GlobalWithCrypto = { crypto?: CryptoLike };
const g = globalThis as unknown as GlobalWithCrypto;
if (typeof g.crypto === 'undefined') {
  g.crypto = {};
}
if (typeof g.crypto.getRandomValues === 'undefined') {
  g.crypto.getRandomValues = (array: Uint8Array): Uint8Array => {
    const bytes = ExpoCrypto.getRandomBytes(array.length);
    array.set(bytes);
    return array;
  };
}

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Providers } from '@/providers';
import { useDeviceId } from '@features/leaderboard/hooks/useDeviceId';
import { initAnalyticsQueue, logEvent } from '@features/analytics';

// U3 (Stage 2.2): cap Dynamic Type / Display Size scaling at 1.3× across the
// whole app. Two Dots is a fixed-pixel design — uncapped scaling at 200%+
// breaks the carefully-positioned HUD and idle title. 1.3× still gives users
// who need slightly larger text some headroom while keeping layouts readable.
type TextDefaults = { defaultProps?: { maxFontSizeMultiplier?: number } };
const TextWithDefaults = Text as unknown as TextDefaults;
TextWithDefaults.defaultProps = {
  ...TextWithDefaults.defaultProps,
  maxFontSizeMultiplier: 1.3,
};

// Hold the splash screen until fonts (and analytics) are ready.
SplashScreen.preventAutoHideAsync().catch(() => {
  // preventAutoHideAsync can throw on some Expo versions — safe to ignore.
});

function AnalyticsBootstrap(): null {
  const deviceState = useDeviceId();

  useEffect(() => {
    if (deviceState.status !== 'ready') return;
    let cancelled = false;

    (async (): Promise<void> => {
      await initAnalyticsQueue(deviceState.deviceId);
      if (cancelled) return;
      logEvent({ type: 'session_start', sessionId: ExpoCrypto.randomUUID() });
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceState]);

  return null;
}

export default function RootLayout(): React.ReactElement {
  /* eslint-disable @typescript-eslint/no-require-imports --
     useFonts expects bundled asset references; require() is the canonical
     React Native pattern for non-JS bundled assets (.ttf). The
     @typescript-eslint v8 rule flags these by default — locally disabling. */
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
    'SpaceMono-Bold': require('../../assets/fonts/SpaceMono-Bold.ttf'),
  });
  /* eslint-enable @typescript-eslint/no-require-imports */

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide splash whether fonts loaded or errored — fall back to system font.
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Keep splash up while fonts are still loading.
  if (!fontsLoaded && !fontError) {
    return <></>;
  }

  return (
    <Providers>
      <AnalyticsBootstrap />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#07070f' },
          animation: 'fade',
        }}
      />
    </Providers>
  );
}
