/**
 * useCurrentPlanet — selected planetary mode, persisted to AsyncStorage.
 *
 * Spec §3: planet selection is app state, not engine state. Same persistence
 * pattern as the personal-best key — AsyncStorage round-trip on mount, setter
 * persists immediately. Default is 'earth' (canonical leaderboard); the
 * theme registry falls back to Moon while Earth + Jupiter are unauthored,
 * so v0.3 ships rendering Moon by default until the design lands.
 *
 * Threaded into GameCanvas as a prop. The engine reads `theme.gravityMul`
 * from the chosen theme on initState (wiring lands in a follow-up commit
 * once the renderer side is verified — see plan).
 */

// SMOKE-TEST DEBUG — useEffect / getItem / isThemeId imports are unused
// while load-from-storage is commented out below. Re-add to the imports
// when reverting (see the commented useEffect for what they're used for).
import { useCallback, useState } from 'react';

import { getTheme, type ThemeId, type WorldTheme } from '@features/game/world';
import { setItem, StorageKeys } from '@shared/storage';

// SMOKE-TEST DEBUG — to test other worlds, change this to 'moon' or 'jupiter'
// and Metro fast-refresh will reload the device. AsyncStorage may have a
// previously-persisted value; if a different world keeps loading, clear app
// storage on device or temporarily comment out the load-from-storage useEffect
// below. Revert this comment before merging.
const DEFAULT_PLANET: ThemeId = 'earth';

// SMOKE-TEST DEBUG — isThemeId only used inside the commented-out useEffect
// below. Restore this function when reverting the smoke-test changes.
// function isThemeId(v: unknown): v is ThemeId {
//   return v === 'moon' || v === 'earth' || v === 'jupiter';
// }

export function useCurrentPlanet(): [WorldTheme, (id: ThemeId) => void] {
  const [planetId, setPlanetId] = useState<ThemeId>(DEFAULT_PLANET);

  // SMOKE-TEST DEBUG — load-from-storage disabled so DEFAULT_PLANET above
  // always wins. Revert (uncomment) before merging.
  //
  // useEffect(() => {
  //   let cancelled = false;
  //   void (async () => {
  //     const stored = await getItem<unknown>(StorageKeys.currentPlanet);
  //     if (!cancelled && isThemeId(stored)) {
  //       setPlanetId(stored);
  //     }
  //   })();
  //   return () => {
  //     cancelled = true;
  //   };
  // }, []);

  const setPlanet = useCallback((id: ThemeId) => {
    setPlanetId(id);
    void setItem<ThemeId>(StorageKeys.currentPlanet, id);
  }, []);

  // Theme registry falls back to Moon if id isn't yet authored.
  const theme = getTheme(planetId);

  return [theme, setPlanet];
}
