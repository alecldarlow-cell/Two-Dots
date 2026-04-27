/**
 * Root layout for expo-router.
 *
 * Wraps every route in the app-wide Providers (React Query, GestureHandler,
 * SafeArea) and bootstraps analytics once the device ID is available.
 */

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Providers } from '@/app/providers';
import { useDeviceId } from '@features/leaderboard/hooks/useDeviceId';
import { initAnalyticsQueue, logEvent } from '@features/analytics';
import { v4 as uuidv4 } from 'uuid';

function AnalyticsBootstrap(): null {
  const deviceState = useDeviceId();

  useEffect(() => {
    if (deviceState.status !== 'ready') return;
    let cancelled = false;

    (async (): Promise<void> => {
      await initAnalyticsQueue(deviceState.deviceId);
      if (cancelled) return;
      logEvent({ type: 'session_start', sessionId: uuidv4() });
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceState]);

  return null;
}

export default function RootLayout(): React.ReactElement {
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
