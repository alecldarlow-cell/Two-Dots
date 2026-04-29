/**
 * Event queue — fire-and-forget analytics writes with offline tolerance.
 *
 * Design:
 *   - `enqueue(event)` is synchronous from the caller's perspective.
 *   - Events batch in memory; the queue flushes every FLUSH_INTERVAL_MS or
 *     when the batch reaches BATCH_SIZE.
 *   - On flush failure (network down, Supabase unreachable), events persist
 *     to AsyncStorage under a dedicated key. On next app launch, the queue
 *     drains persisted events before accepting new ones.
 *   - Writes are never awaited by UI code. Analytics loss is preferable to
 *     blocking the user on a retry screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@shared/supabase';
import type { AnalyticsEvent } from './events';
import { serialiseEvent, type SerialisedEvent } from './serialise';

const PERSISTED_QUEUE_KEY = 'td.analytics.pending';
const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 5_000;

interface PendingEvent extends SerialisedEvent {
  device_id: string;
  /** Client-side timestamp for ordering during offline queueing. */
  occurred_at: string;
}

interface QueueInternals {
  deviceId: string | null;
  buffer: PendingEvent[];
  flushing: boolean;
  flushTimer: ReturnType<typeof setInterval> | null;
}

const state: QueueInternals = {
  deviceId: null,
  buffer: [],
  flushing: false,
  flushTimer: null,
};

/** Must be called once the device ID is known — typically in the root layout. */
export async function initAnalyticsQueue(deviceId: string): Promise<void> {
  state.deviceId = deviceId;

  // Drain any events persisted from a previous session.
  const persisted = await readPersisted();
  if (persisted.length > 0) {
    state.buffer.push(...persisted);
    await clearPersisted();
  }

  if (!state.flushTimer) {
    state.flushTimer = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);
  }
}

/** Stop the background flush timer. Call on app teardown (rarely needed). */
export function shutdownAnalyticsQueue(): void {
  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }
}

/** Add an event to the queue. Non-blocking; returns immediately. */
export function logEvent(event: AnalyticsEvent): void {
  if (!state.deviceId) {
    // No device ID yet — drop. This only happens before initAnalyticsQueue runs,
    // which is during the very first moments of app launch.
    console.warn('[analytics] event dropped — queue not initialised', event.type);
    return;
  }
  const serialised = serialiseEvent(event);
  state.buffer.push({
    ...serialised,
    device_id: state.deviceId,
    occurred_at: new Date().toISOString(),
  });
  if (state.buffer.length >= BATCH_SIZE) {
    void flush();
  }
}

/** Force a flush. Returns true if the flush succeeded, false otherwise. */
export async function flush(): Promise<boolean> {
  if (state.flushing) return true;
  if (state.buffer.length === 0) return true;

  state.flushing = true;
  const batch = state.buffer.splice(0, state.buffer.length);

  try {
    const supabase = getSupabase();
    // TODO(P1-4): the `as never` is a temporary bridge. PendingEvent.payload is
    // typed as Record<string, unknown> | null because that's what callers
    // actually pass; Supabase's auto-generated `Json` union is stricter and
    // recursive. Both serialise identically on the wire. Remove this cast
    // after `supabase gen types typescript --project-id <ref> > src/shared/supabase/types.ts`.
    const { error } = await supabase.from('analytics_events').insert(batch as never);
    if (error) throw error;
    state.flushing = false;
    return true;
  } catch (err) {
    // Put the batch back at the front so order is preserved, then persist for
    // retry on next launch.
    state.buffer = [...batch, ...state.buffer];
    await writePersisted(state.buffer);
    console.warn('[analytics] flush failed, persisted for retry:', err);
    state.flushing = false;
    return false;
  }
}

async function readPersisted(): Promise<PendingEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(PERSISTED_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingEvent[];
  } catch {
    return [];
  }
}

async function writePersisted(events: PendingEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PERSISTED_QUEUE_KEY, JSON.stringify(events));
  } catch (err) {
    console.warn('[analytics] failed to persist queue:', err);
  }
}

async function clearPersisted(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PERSISTED_QUEUE_KEY);
  } catch {
    /* silent */
  }
}

/** Test-only: reset internal state. */
export function __resetAnalyticsQueueForTests(): void {
  state.deviceId = null;
  state.buffer = [];
  state.flushing = false;
  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }
}

/** Test-only: inspect buffer. */
export function __getQueueBufferForTests(): PendingEvent[] {
  return [...state.buffer];
}
