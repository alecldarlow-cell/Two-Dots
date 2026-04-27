/**
 * Yup schemas for leaderboard payloads.
 *
 * Mirrors the CHECK constraints in supabase/migrations/002_scores.sql:
 *   - score: integer 0..10000
 *   - tier:  integer 1..8
 *   - death_side: one of '' | 'L' | 'R' | 'both'
 *
 * Per technical-requirements.md §8: validation must exist in both frontend
 * and backend. These schemas are the frontend gate; the DB constraints are the
 * backend gate.
 */

import { object, string, number, type InferType } from 'yup';

export const scoreSubmissionSchema = object({
  deviceId: string().uuid().required(),
  sessionId: string().uuid().required(),
  score: number().integer().min(0).max(10000).required(),
  tier: number().integer().min(1).max(8).required(),
  // deathSide can be empty string for out-of-bounds deaths. The schema must
  // permit '' as a valid value — Yup's .required() rejects empty strings by
  // default, so we use .defined() + .oneOf() instead.
  deathSide: string().defined().oneOf(['', 'L', 'R', 'both']),
});

export type ScoreSubmissionInput = InferType<typeof scoreSubmissionSchema>;
