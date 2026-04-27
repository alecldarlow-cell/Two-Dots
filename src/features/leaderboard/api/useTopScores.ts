/**
 * useTopScores — the global top-100 leaderboard.
 *
 * Uses the `top_scores` view, which applies rank() and limits to 100.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getSupabase, type TopScoreRow } from '@shared/supabase';

export function topScoresQueryKey(): readonly unknown[] {
  return ['topScores'];
}

async function fetchTopScores(): Promise<TopScoreRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('top_scores')
    .select('*')
    .order('rank', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function useTopScores(): UseQueryResult<TopScoreRow[], Error> {
  return useQuery({
    queryKey: topScoresQueryKey(),
    queryFn: fetchTopScores,
    staleTime: 60_000,
  });
}

export const __fetchTopScoresForTests = fetchTopScores;
