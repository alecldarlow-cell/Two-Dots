/**
 * usePersonalBest — fetches the current device's personal best from Supabase.
 *
 * Uses the `personal_bests` view (aggregated, one row per device). Returns null
 * if no scores have been submitted yet.
 *
 * Cached for 30s — a new submission invalidates via useSubmitScore's onSuccess.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getSupabase, type PersonalBestRow } from '@shared/supabase';

export function personalBestQueryKey(deviceId: string): readonly unknown[] {
  return ['personalBest', deviceId];
}

async function fetchPersonalBest(deviceId: string): Promise<PersonalBestRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('personal_bests')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function usePersonalBest(
  deviceId: string | null,
): UseQueryResult<PersonalBestRow | null, Error> {
  return useQuery({
    queryKey: deviceId ? personalBestQueryKey(deviceId) : ['personalBest', 'pending'],
    queryFn: () => {
      if (!deviceId) throw new Error('deviceId required');
      return fetchPersonalBest(deviceId);
    },
    enabled: deviceId !== null,
    staleTime: 30_000,
  });
}

export const __fetchPersonalBestForTests = fetchPersonalBest;
