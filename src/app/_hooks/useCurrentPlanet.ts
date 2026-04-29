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

import { useCallback, useEffect, useState } from 'react';

import { getTheme, type ThemeId, type WorldTheme } from '@features/game/world';
import { getItem, setItem, StorageKeys } from '@shared/storage';

const DEFAULT_PLANET: ThemeId = 'earth';

function isThemeId(v: unknown): v is ThemeId {
  return v === 'moon' || v === 'earth' || v === 'jupiter';
}

export function useCurrentPlanet(): [WorldTheme, (id: ThemeId) => void] {
  const [planetId, setPlanetId] = useState<ThemeId>(DEFAULT_PLANET);

  // Load persisted choice on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getItem<unknown>(StorageKeys.currentPlanet);
      if (!cancelled && isThemeId(stored)) {
        setPlanetId(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPlanet = useCallback((id: ThemeId) => {
    setPlanetId(id);
    void setItem<ThemeId>(StorageKeys.currentPlanet, id);
  }, []);

  // Theme registry falls back to Moon if id isn't yet authored.
  const theme = getTheme(planetId);

  return [theme, setPlanet];
}
