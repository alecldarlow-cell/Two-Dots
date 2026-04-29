import { describe, expect, it } from 'vitest';
import { computeRetryRate, UNPROMPTED_THRESHOLD_MS } from '../retryRate';
import type { AnalyticsEvent } from '../events';

type Stamped = AnalyticsEvent & { occurredAt: number };

function makeDeath(sessionId: string, runIndex: number, at: number): Stamped {
  return {
    type: 'run_end',
    sessionId,
    runIndex,
    score: 0,
    tier: 1,
    deathSide: 'L',
    deathGateInTier: 1,
    timeToDeathMs: 0,
    closeCallsInRun: 0,
    occurredAt: at,
  };
}

function makeRetry(
  sessionId: string,
  previousRunIndex: number,
  at: number,
  timeSinceDeathMs: number,
): Stamped {
  return {
    type: 'retry_tapped',
    sessionId,
    previousRunIndex,
    timeSinceDeathMs,
    occurredAt: at,
  };
}

describe('computeRetryRate', () => {
  describe('GIVEN no events', () => {
    it('WHEN computed THEN NaN rate, no sessions', () => {
      const r = computeRetryRate([]);
      expect(r.totalDeaths).toBe(0);
      expect(r.retryRate).toBeNaN();
      expect(r.sessionsAnalysed).toBe(0);
    });
  });

  describe('GIVEN a session with one death and no retry', () => {
    it('WHEN computed THEN session is ignored (< 2 deaths)', () => {
      const events: Stamped[] = [makeDeath('s1', 1, 1000)];
      const r = computeRetryRate(events);
      expect(r.sessionsAnalysed).toBe(0);
      expect(r.totalDeaths).toBe(0);
    });
  });

  describe('GIVEN a session with 3 deaths, 2 quick retries, 1 slow retry', () => {
    it('WHEN computed THEN 2/3 retry rate', () => {
      const events: Stamped[] = [
        makeDeath('s1', 1, 1000),
        makeRetry('s1', 1, 1500, 500), // quick — within 30s
        makeDeath('s1', 2, 2500),
        makeRetry('s1', 2, 3000, 500), // quick
        makeDeath('s1', 3, 4000),
        makeRetry('s1', 3, 4000 + UNPROMPTED_THRESHOLD_MS + 100, UNPROMPTED_THRESHOLD_MS + 100), // slow
      ];
      const r = computeRetryRate(events);
      expect(r.totalDeaths).toBe(3);
      expect(r.unpromptedRetries).toBe(2);
      expect(r.retryRate).toBeCloseTo(2 / 3, 5);
    });
  });

  describe('GIVEN multiple sessions with mixed behaviour', () => {
    it('WHEN computed THEN aggregates across sessions', () => {
      const events: Stamped[] = [
        // Session A — 2 deaths, 2 retries, both quick
        makeDeath('a', 1, 100),
        makeRetry('a', 1, 200, 100),
        makeDeath('a', 2, 500),
        makeRetry('a', 2, 600, 100),
        // Session B — 4 deaths, 1 retry
        makeDeath('b', 1, 1000),
        makeDeath('b', 2, 2000),
        makeDeath('b', 3, 3000),
        makeRetry('b', 3, 3500, 500),
        makeDeath('b', 4, 5000),
        // Session C — only 1 death (ignored)
        makeDeath('c', 1, 10000),
      ];
      const r = computeRetryRate(events);
      expect(r.sessionsAnalysed).toBe(2);
      expect(r.totalDeaths).toBe(6); // A has 2, B has 4
      expect(r.unpromptedRetries).toBe(3); // A has 2, B has 1
      expect(r.retryRate).toBeCloseTo(3 / 6, 5);
    });
  });

  describe('GIVEN a retry exactly at the threshold', () => {
    it('WHEN retry is at THRESHOLD ms exactly THEN excluded (strict less-than)', () => {
      const events: Stamped[] = [
        makeDeath('s', 1, 0),
        makeRetry('s', 1, UNPROMPTED_THRESHOLD_MS, UNPROMPTED_THRESHOLD_MS),
        makeDeath('s', 2, UNPROMPTED_THRESHOLD_MS + 1),
      ];
      const r = computeRetryRate(events);
      expect(r.totalDeaths).toBe(2);
      expect(r.unpromptedRetries).toBe(0);
    });
    it('WHEN retry is at THRESHOLD-1 ms THEN included', () => {
      const events: Stamped[] = [
        makeDeath('s', 1, 0),
        makeRetry('s', 1, UNPROMPTED_THRESHOLD_MS - 1, UNPROMPTED_THRESHOLD_MS - 1),
        makeDeath('s', 2, UNPROMPTED_THRESHOLD_MS),
      ];
      const r = computeRetryRate(events);
      expect(r.unpromptedRetries).toBe(1);
    });
  });

  describe('GIVEN events arrive out of order', () => {
    it('WHEN computed THEN sorts per-session and still pairs correctly', () => {
      const events: Stamped[] = [
        makeRetry('s', 1, 1500, 500),
        makeDeath('s', 2, 2500),
        makeDeath('s', 1, 1000),
        makeRetry('s', 2, 3000, 500),
      ];
      const r = computeRetryRate(events);
      expect(r.totalDeaths).toBe(2);
      expect(r.unpromptedRetries).toBe(2);
      expect(r.retryRate).toBe(1);
    });
  });

  describe('GIVEN the Phase 1 gate is 70%', () => {
    it('WHEN retry rate is 70% THEN the gate is met', () => {
      // 7 retries out of 10 deaths, single session.
      const events: Stamped[] = [];
      for (let i = 1; i <= 10; i++) {
        events.push(makeDeath('s', i, i * 1000));
        if (i <= 7) events.push(makeRetry('s', i, i * 1000 + 500, 500));
      }
      const r = computeRetryRate(events);
      expect(r.retryRate).toBeCloseTo(0.7, 5);
      expect(r.retryRate >= 0.7).toBe(true);
    });
    it('WHEN retry rate is 69% THEN the gate is missed', () => {
      const events: Stamped[] = [];
      for (let i = 1; i <= 100; i++) {
        events.push(makeDeath('s', i, i * 1000));
        if (i <= 69) events.push(makeRetry('s', i, i * 1000 + 500, 500));
      }
      const r = computeRetryRate(events);
      expect(r.retryRate).toBeCloseTo(0.69, 5);
      expect(r.retryRate < 0.7).toBe(true);
    });
  });
});
