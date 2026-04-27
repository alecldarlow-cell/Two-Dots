/**
 * useSubmitScore — React Query mutation for posting a completed run.
 *
 * Validates with Yup before hitting the network. On success, invalidates the
 * personal-best query so the UI re-fetches. Fire-and-forget from the UI
 * perspective — the death screen does not block on submission success.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { getSupabase } from '@shared/supabase';
import {
  scoreSubmissionSchema,
  type ScoreSubmissionInput,
} from '../schemas/scoreSubmission';
import { personalBestQueryKey } from './usePersonalBest';
import { topScoresQueryKey } from './useTopScores';

export interface SubmittedScore {
  id: string;
  score: number;
  tier: number;
}

async function submitScoreImpl(input: ScoreSubmissionInput): Promise<SubmittedScore> {
  // Defensive — the mutation input type already enforces this, but runtime
  // validation catches programming errors (e.g. score set to a cheat value).
  const validated = await scoreSubmissionSchema.validate(input, { abortEarly: false });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('scores')
    .insert({
      device_id: validated.deviceId,
      session_id: validated.sessionId,
      score: validated.score,
      tier: validated.tier,
      death_side: validated.deathSide,
    })
    .select('id, score, tier')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Score insert returned no row');
  return { id: data.id, score: data.score, tier: data.tier };
}

export function useSubmitScore(): UseMutationResult<
  SubmittedScore,
  Error,
  ScoreSubmissionInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitScoreImpl,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: personalBestQueryKey(variables.deviceId) });
      qc.invalidateQueries({ queryKey: topScoresQueryKey() });
    },
  });
}

/** Exposed for tests — the underlying function without the React wrapper. */
export const __submitScoreImplForTests = submitScoreImpl;
