/**
 * App-level providers.
 *
 * Wraps the app in the providers every feature depends on:
 *   - QueryClientProvider for React Query
 *   - GestureHandlerRootView for react-native-gesture-handler
 *   - SafeAreaProvider for notch/home-indicator awareness
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

export function Providers({ children }: PropsWithChildren): React.ReactElement {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          {children}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07070f' },
});
