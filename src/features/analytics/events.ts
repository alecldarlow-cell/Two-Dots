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

/**
 * Captured tap stream attached to RunEndEvent for fixture-worthy seeded runs
 * (score >= 20 with EXPO_PUBLIC_E2E_SEED set). Two arrays of ms-since-run-start
 * timestamps, one per side. Production runs without a seed never carry this.
 *
 * The Maestro fixture generator merges L + R into a single time-ordered
 * stream, then emits `waitFor: { milliseconds: <delta> }` + `tapOn` commands.
 * The starting tap (idle→playing transition) is implicit at ms=0 — engine
 * handleTap on idle phase fires regardless of tap position, so the generator
 * is free to use any safe off-centre position for the opening tap.
 *
 * Pause-toggles are deliberately omitted from v1 fixture replay; runs that
 * pause are still captured at the L/R level but the pause itself isn't
 * reproduced.
 */
export interface TapsRecord {
  L: number[];
  R: number[];
}

export interface SessionStartEvent {
  type: 'session_start';
  sessionId: string;
  /** Engine RNG seed if the build was started with EXPO_PUBLIC_E2E_SEED set.
   *  null/undefined for production builds. Filterable downstream so the
   *  Maestro fixture generator only consumes seeded runs (where tap
   *  sequences are reproducible against a deterministic pipe layout). */
  seed?: number | null;
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
  /** Milliseconds elapsed from idle→playing transition to death. */
  timeToDeathMs: number;
  /** Number of close-call activations during this run. */
  closeCallsInRun: number;
  /** Engine seed copied from session_start. Carried per-run so a query for
   *  fixture-worthy runs (score + seed) needs no join. Optional — only
   *  present in seeded builds. */
  seed?: number | null;
  /** Captured tap stream. Only attached when seed is set AND score >= 20
   *  (fixture-worthy threshold). Production runs (no seed) and short
   *  runs never carry this — keeps payload size bounded. */
  taps?: TapsRecord;
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
