/**
 * AsyncStorage wrapper.
 *
 * Thin typed wrapper so call sites don't swallow errors silently and key
 * constants live in one place. All reads/writes are JSON-encoded.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  deviceId: 'td.device_id',
  personalBest: 'td.personal_best',
  displayName: 'td.display_name',
  currentSessionId: 'td.current_session_id',
  // Legacy. World selection is now derived from score (see
  // useCurrentPlanet) rather than persisted manual choice. Key kept defined
  // so old installs with persisted values aren't disrupted; nothing writes
  // to it. Safe to remove in a future schema migration.
  currentPlanet: 'td.current_planet',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

export async function getItem<T>(key: StorageKey): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    // Corrupt value or storage unavailable — callers treat as "not set".
    console.warn(`[storage] getItem failed for ${key}:`, err);
    return null;
  }
}

export async function setItem<T>(key: StorageKey, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] setItem failed for ${key}:`, err);
    throw err;
  }
}

export async function removeItem(key: StorageKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] removeItem failed for ${key}:`, err);
  }
}
