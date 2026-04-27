/**
 * Event serialiser.
 *
 * Translates the typed AnalyticsEvent union into the shape expected by the
 * analytics_events table. Keeps knowledge of the DB schema out of the rest
 * of the analytics feature.
 */

import type { AnalyticsEvent } from './events';

export interface SerialisedEvent {
  session_id: string;
  event_type: AnalyticsEvent['type'];
  score: number | null;
  tier: number | null;
  run_index: number | null;
  payload: Record<string, unknown> | null;
}

export function serialiseEvent(event: AnalyticsEvent): SerialisedEvent {
  const base = {
    session_id: event.sessionId,
    event_type: event.type,
    score: null as number | null,
    tier: null as number | null,
    run_index: null as number | null,
    payload: null as Record<string, unknown> | null,
  };

  switch (event.type) {
    case 'session_start':
      return base;

    case 'run_start':
      return { ...base, run_index: event.runIndex };

    case 'run_end':
      return {
        ...base,
        score: event.score,
        tier: event.tier,
        run_index: event.runIndex,
        payload: {
          death_side: event.deathSide,
          death_gate_in_tier: event.deathGateInTier,
        },
      };

    case 'retry_tapped':
      return {
        ...base,
        run_index: event.previousRunIndex,
        payload: {
          time_since_death_ms: event.timeSinceDeathMs,
        },
      };

    case 'session_end':
      return {
        ...base,
        payload: {
          total_runs: event.totalRuns,
          max_score: event.maxScore,
        },
      };

    case 'close_call':
      return {
        ...base,
        score: event.score,
        run_index: event.runIndex,
        payload: { side: event.side },
      };
  }
}
