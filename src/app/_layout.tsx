/**
 * Root layout for expo-router.
 *
 * Wraps every route in the app-wide Providers (React Query, GestureHandler,
 * SafeArea) and bootstraps analytics once the device ID is available.
 *
 * Font loading: Space Mono (Regular + Bold) is fetched from the Google Fonts
 * GitHub repo on first launch and cached by expo-font. The splash screen is
 * held until fonts are ready so no layout-shift occurs.
 */

/**
 * Polyfill crypto.getRandomValues() for Hermes / React Native.
 * Must be the very first import so it runs before @supabase/supabase-js,
 * uuid, or any other library that calls it during module initialisation.
 */
import * as ExpoCrypto from 'expo-crypto';
if (typeof (global as any).crypto === 'undefined') {
  (global as any).crypto = {};
}
if (typeof (global as any).crypto.getRandomValues === 'undefined') {
  (global as any).crypto.getRandomValues = (array: Uint8Array): Uint8Array => {
    const bytes = ExpoCrypto.getRandomBytes(array.length);
    array.set(bytes);
    return array;
  };
}

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Providers } from '@/providers';
import { useDeviceId } from '@features/leaderboard/hooks/useDeviceId';
import { initAnalyticsQueue, logEvent } from '@features/analytics';

// Hold the splash screen until fonts (and analytics) are ready.
SplashScreen.preventAutoHideAsync().catch(() => {
  // preventAutoHideAsync can throw on some Expo versions — safe to ignore.
});

const SPACE_MONO_BASE =
  'https://raw.githubusercontent.com/googlefonts/spacemono/main/fonts';

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
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: { uri: `${SPACE_MONO_BASE}/SpaceMono-Regular.ttf` },
    'SpaceMono-Bold': { uri: `${SPACE_MONO_BASE}/SpaceMono-Bold.ttf` },
  });

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
