/**
 * Retry-rate computation.
 *
 * Pure function that computes the Phase 1 gate metric from a stream of
 * analytics events. Matches the SQL in docs/analytics.md — this function is
 * the source of truth for the computation; the SQL is the efficient version.
 *
 * Threshold: "unprompted" = retry within 30 seconds of the preceding run_end.
 * Sessions with only 1 run are excluded (no retry opportunity).
 */

import type { AnalyticsEvent } from './events';

export const UNPROMPTED_THRESHOLD_MS = 30_000;

export interface RetryRateResult {
  totalDeaths: number;
  unpromptedRetries: number;
  retryRate: number; // 0..1, NaN if totalDeaths === 0
  sessionsAnalysed: number;
}

/**
 * Compute retry rate over a sequence of events. Input need not be sorted.
 * The events are grouped by sessionId and evaluated per session; the top-line
 * numbers aggregate across all qualifying sessions.
 */
export function computeRetryRate(
  events: Array<AnalyticsEvent & { occurredAt: number }>,
): RetryRateResult {
  // Group by sessionId.
  const bySession = new Map<string, Array<AnalyticsEvent & { occurredAt: number }>>();
  for (const e of events) {
    const list = bySession.get(e.sessionId) ?? [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  let totalDeaths = 0;
  let unpromptedRetries = 0;
  let sessionsAnalysed = 0;

  for (const [, sessionEvents] of bySession) {
    sessionEvents.sort((a, b) => a.occurredAt - b.occurredAt);

    // Count deaths in this session. Skip if < 2 — no retry opportunity.
    const deaths = sessionEvents.filter((e) => e.type === 'run_end');
    if (deaths.length < 2) continue;

    sessionsAnalysed++;
    totalDeaths += deaths.length;

    // Pair each retry with the most recent preceding death, if within threshold.
    // A retry can count for at most one death; a death can be counted as retried
    // at most once. This matches the SQL in docs/analytics.md, where
    // time_since_death_ms is computed at the client against the immediately
    // preceding run_end.
    const retries = sessionEvents.filter((e) => e.type === 'retry_tapped');
    const deathsConsumed = new Set<number>();
    for (const retry of retries) {
      // Find the latest death before this retry that hasn't been paired yet.
      let pairedDeathIdx = -1;
      for (let i = deaths.length - 1; i >= 0; i--) {
        const d = deaths[i];
        if (!d) continue;
        if (deathsConsumed.has(i)) continue;
        if (d.occurredAt > retry.occurredAt) continue;
        pairedDeathIdx = i;
        break;
      }
      if (pairedDeathIdx === -1) continue;
      const death = deaths[pairedDeathIdx];
      if (!death) continue;
      if (retry.occurredAt - death.occurredAt < UNPROMPTED_THRESHOLD_MS) {
        unpromptedRetries++;
      }
      deathsConsumed.add(pairedDeathIdx);
    }
  }

  const retryRate = totalDeaths === 0 ? NaN : unpromptedRetries / totalDeaths;
  return { totalDeaths, unpromptedRetries, retryRate, sessionsAnalysed };
}
