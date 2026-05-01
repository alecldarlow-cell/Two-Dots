import { describe, expect, it } from 'vitest';
import { serialiseEvent } from '../serialise';
import type { AnalyticsEvent } from '../events';

const SESSION_ID = '00000000-0000-4000-8000-000000000001';

describe('serialiseEvent', () => {
  describe('GIVEN session_start', () => {
    it('WHEN serialised without seed THEN has no payload (production build)', () => {
      const event: AnalyticsEvent = { type: 'session_start', sessionId: SESSION_ID };
      const out = serialiseEvent(event);
      expect(out).toEqual({
        session_id: SESSION_ID,
        event_type: 'session_start',
        score: null,
        tier: null,
        run_index: null,
        payload: null,
      });
    });

    it('WHEN serialised with seed=null THEN has no payload (E2E_SEED parsing failed)', () => {
      const out = serialiseEvent({ type: 'session_start', sessionId: SESSION_ID, seed: null });
      expect(out.payload).toBeNull();
    });

    it('WHEN serialised with seed THEN payload carries the seed (E2E build)', () => {
      const out = serialiseEvent({ type: 'session_start', sessionId: SESSION_ID, seed: 42 });
      expect(out.payload).toEqual({ seed: 42 });
    });
  });

  describe('GIVEN run_start', () => {
    it('WHEN serialised THEN carries run_index', () => {
      const out = serialiseEvent({
        type: 'run_start',
        sessionId: SESSION_ID,
        runIndex: 3,
      });
      expect(out.run_index).toBe(3);
      expect(out.score).toBeNull();
      expect(out.payload).toBeNull();
    });
  });

  describe('GIVEN run_end', () => {
    it('WHEN serialised without seed THEN payload is unchanged from pre-E2E', () => {
      const out = serialiseEvent({
        type: 'run_end',
        sessionId: SESSION_ID,
        runIndex: 5,
        score: 22,
        tier: 5,
        deathSide: 'L',
        deathGateInTier: 3,
        timeToDeathMs: 18420,
        closeCallsInRun: 4,
      });
      expect(out.score).toBe(22);
      expect(out.tier).toBe(5);
      expect(out.run_index).toBe(5);
      expect(out.payload).toEqual({
        death_side: 'L',
        death_gate_in_tier: 3,
        time_to_death_ms: 18420,
        close_calls_in_run: 4,
      });
    });

    it('WHEN serialised with seed but no taps THEN payload carries seed only', () => {
      // E2E build, run died below the fixture-worthy score threshold (<20).
      // Seed flows for join-free querying; taps stay client-side and dropped.
      const out = serialiseEvent({
        type: 'run_end',
        sessionId: SESSION_ID,
        runIndex: 1,
        score: 5,
        tier: 2,
        deathSide: 'R',
        deathGateInTier: 1,
        timeToDeathMs: 8000,
        closeCallsInRun: 1,
        seed: 42,
      });
      expect(out.payload).toEqual({
        death_side: 'R',
        death_gate_in_tier: 1,
        time_to_death_ms: 8000,
        close_calls_in_run: 1,
        seed: 42,
      });
    });

    it('WHEN serialised with seed + taps THEN payload carries both (fixture-worthy run)', () => {
      const taps = { L: [820, 1450, 2100], R: [950, 1300, 1900] };
      const out = serialiseEvent({
        type: 'run_end',
        sessionId: SESSION_ID,
        runIndex: 7,
        score: 24,
        tier: 5,
        deathSide: 'both',
        deathGateInTier: 4,
        timeToDeathMs: 28000,
        closeCallsInRun: 6,
        seed: 42,
        taps,
      });
      expect(out.payload).toEqual({
        death_side: 'both',
        death_gate_in_tier: 4,
        time_to_death_ms: 28000,
        close_calls_in_run: 6,
        seed: 42,
        taps,
      });
    });
  });

  describe('GIVEN retry_tapped', () => {
    it('WHEN serialised THEN payload carries time_since_death_ms', () => {
      const out = serialiseEvent({
        type: 'retry_tapped',
        sessionId: SESSION_ID,
        previousRunIndex: 4,
        timeSinceDeathMs: 1240,
      });
      expect(out.run_index).toBe(4);
      expect(out.payload).toEqual({ time_since_death_ms: 1240 });
    });
  });

  describe('GIVEN session_end', () => {
    it('WHEN serialised THEN payload carries total_runs and max_score', () => {
      const out = serialiseEvent({
        type: 'session_end',
        sessionId: SESSION_ID,
        totalRuns: 14,
        maxScore: 22,
      });
      expect(out.payload).toEqual({ total_runs: 14, max_score: 22 });
    });
  });

  describe('GIVEN close_call', () => {
    it('WHEN serialised THEN payload carries side', () => {
      const out = serialiseEvent({
        type: 'close_call',
        sessionId: SESSION_ID,
        runIndex: 2,
        score: 7,
        side: 'R',
      });
      expect(out.score).toBe(7);
      expect(out.run_index).toBe(2);
      expect(out.payload).toEqual({ side: 'R' });
    });
  });

  describe('GIVEN the full event-type catalogue', () => {
    it('WHEN each event serialises THEN event_type is preserved', () => {
      const events: AnalyticsEvent[] = [
        { type: 'session_start', sessionId: SESSION_ID },
        { type: 'run_start', sessionId: SESSION_ID, runIndex: 1 },
        {
          type: 'run_end',
          sessionId: SESSION_ID,
          runIndex: 1,
          score: 1,
          tier: 1,
          deathSide: '',
          deathGateInTier: 1,
          timeToDeathMs: 1000,
          closeCallsInRun: 0,
        },
        {
          type: 'retry_tapped',
          sessionId: SESSION_ID,
          previousRunIndex: 1,
          timeSinceDeathMs: 500,
        },
        { type: 'session_end', sessionId: SESSION_ID, totalRuns: 1, maxScore: 1 },
        { type: 'close_call', sessionId: SESSION_ID, runIndex: 1, score: 1, side: 'L' },
      ];
      for (const e of events) {
        const out = serialiseEvent(e);
        expect(out.event_type).toBe(e.type);
        expect(out.session_id).toBe(SESSION_ID);
      }
    });
  });
});
