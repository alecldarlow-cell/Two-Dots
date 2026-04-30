/**
 * useCurrentPlanet — world selection derived from player score.
 *
 * Worlds are gate-banded:
 *   - score   0– 9 → Moon
 *   - score  10–19 → Earth
 *   - score  20+   → Jupiter (terminal — stays Jupiter forever past gate 20)
 *
 * No persistence, no manual override. The world is purely a function of
 * progression in the current run; on death + restart the score resets to
 * 0 and the player begins again on Moon.
 *
 * Future worlds can extend `planetForScore` by adding entries to the
 * boundary table — the renderer and engine consume the returned theme
 * unchanged.
 */

import { getTheme, type ThemeId, type WorldTheme } from '@features/game/world';

/** Score threshold at which Moon ends and Earth begins. */
const EARTH_START_GATE = 10;
/** Score threshold at which Earth ends and Jupiter begins. */
const JUPITER_START_GATE = 20;

/**
 * Pure mapping from score → ThemeId. Exported for tests and any non-React
 * callsite that needs the world id without resolving the full theme.
 */
export function planetForScore(score: number): ThemeId {
  if (score < EARTH_START_GATE) return 'moon';
  if (score < JUPITER_START_GATE) return 'earth';
  return 'jupiter';
}

/**
 * Resolve the current WorldTheme for a given score. Cheap — just a table
 * lookup + theme registry hit; no React state.
 */
export function useCurrentPlanet(score: number): WorldTheme {
  return getTheme(planetForScore(score));
}
