export { getSupabase, __resetSupabaseClientForTests } from './client';
export type { Database } from './types';
import type { Tables } from './types';

// Convenience row types derived from the generated Database schema.
// These replace the old hand-written interfaces so all existing consumers
// can keep their imports without changes.
export type DeviceRow = Tables<'devices'>;
export type ScoreRow = Tables<'scores'>;
export type AnalyticsEventRow = Tables<'analytics_events'>;
export type PersonalBestRow = Tables<'personal_bests'>;
export type TopScoreRow = Tables<'top_scores'>;

// These were previously string-literal union enums. The DB schema stores them
// as plain strings; the literal unions live in the feature-layer schemas
// (scoreSubmission.ts, analyticsEvents.ts) and are not in the generated types.
export type Platform = string;
export type DeathSide = string;
export type AnalyticsEventType = string;
