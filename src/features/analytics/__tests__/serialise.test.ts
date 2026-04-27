import { describe, expect, it } from 'vitest';
import { serialiseEvent } from '../serialise';
import type { AnalyticsEvent } from '../events';

const SESSION_ID = '00000000-0000-4000-8000-000000000001';

describe('serialiseEvent', () => {
  describe('GIVEN session_start', () => {
    it('WHEN serialised THEN has no payload', () => {
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
    it('WHEN serialised THEN carries score/tier/run_index and death payload', () => {
      const out = serialiseEvent({
        type: 'run_end',
        sessionId: SESSION_ID,
        runIndex: 5,
        score: 22,
        tier: 5,
        deathSide: 'L',
        deathGateInTier: 3,
      });
      expect(out.score).toBe(22);
      expect(out.tier).toBe(5);
      expect(out.run_index).toBe(5);
      expect(out.payload).toEqual({
        death_side: 'L',
        death_gate_in_tier: 3,
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
