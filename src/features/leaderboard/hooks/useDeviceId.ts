/**
 * useDeviceId — the foundation of device-scoped identity.
 *
 * On first launch: creates a `devices` row in Supabase, persists its `id` to
 * AsyncStorage under StorageKeys.deviceId.
 * On every subsequent launch: reads the cached ID from AsyncStorage and
 * returns it immediately.
 *
 * Race safety: the effect uses a ref-guard so strict-mode double-invocation
 * cannot produce two device rows.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getItem, setItem, StorageKeys } from '@shared/storage';
import { getSupabase, type Platform as DbPlatform } from '@shared/supabase';

export type DeviceIdState =
  | { status: 'loading' }
  | { status: 'ready'; deviceId: string }
  | { status: 'error'; error: Error };

function platformToDb(): DbPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

export function useDeviceId(): DeviceIdState {
  const [state, setState] = useState<DeviceIdState>({ status: 'loading' });
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    let cancelled = false;

    (async (): Promise<void> => {
      try {
        // 1. Cached path.
        const cached = await getItem<string>(StorageKeys.deviceId);
        if (cached) {
          if (!cancelled) setState({ status: 'ready', deviceId: cached });
          return;
        }

        // 2. First launch — create a device row.
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('devices')
          .insert({
            platform: platformToDb(),
            app_version: currentAppVersion(),
          })
          .select('id')
          .single();

        if (error) throw error;
        if (!data) throw new Error('Device insert returned no row');

        await setItem(StorageKeys.deviceId, data.id);
        if (!cancelled) setState({ status: 'ready', deviceId: data.id });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
