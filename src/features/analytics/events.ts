/**
 * Analytics event catalogue.
 *
 * Every event shape is typed here so the engine/renderer cannot construct an
 * event with the wrong fields. The shapes mirror the DB constraint on
 * `analytics_events.event_type` plus the documented `payload` shapes in
 * `supabase/migrations/003_analytics_events.sql`.
 */

export type AnalyticsEvent =
  | SessionStartEvent
  | RunStartEvent
  | RunEndEvent
  | RetryTappedEvent
  | SessionEndEvent
  | CloseCallEvent;

export interface SessionStartEvent {
  type: 'session_start';
  sessionId: string;
}

export interface RunStartEvent {
  type: 'run_start';
  sessionId: string;
  runIndex: number;
}

export interface RunEndEvent {
  type: 'run_end';
  sessionId: string;
  runIndex: number;
  score: number;
  tier: number;
  deathSide: '' | 'L' | 'R' | 'both';
  deathGateInTier: number;
}

export interface RetryTappedEvent {
  type: 'retry_tapped';
  sessionId: string;
  previousRunIndex: number;
  timeSinceDeathMs: number;
}

export interface SessionEndEvent {
  type: 'session_end';
  sessionId: string;
  totalRuns: number;
  maxScore: number;
}

export interface CloseCallEvent {
  type: 'close_call';
  sessionId: string;
  runIndex: number;
  score: number;
  side: 'L' | 'R';
}
