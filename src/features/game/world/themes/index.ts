/**
 * Theme registry — id ↔ frozen WorldTheme.
 *
 * Adding a planet:
 *   1. Define `themes/<id>.ts` with `as const satisfies WorldTheme`.
 *   2. Import + register here.
 *   3. The id literal in WorldTheme.id (types.ts) constrains valid keys.
 */

import type { WorldTheme } from '../types';

import { earthTheme } from './earth';
import { jupiterTheme } from './jupiter';
import { moonTheme } from './moon';

export const themes = {
  moon: moonTheme,
  earth: earthTheme,
  jupiter: jupiterTheme,
} as const;

export type ThemeId = WorldTheme['id'];

/** Falls back to earth (canonical leaderboard) if id is unregistered. */
export function getTheme(id: ThemeId): WorldTheme {
  const t = (themes as Partial<Record<ThemeId, WorldTheme>>)[id];
  return t ?? earthTheme;
}

export { earthTheme, jupiterTheme, moonTheme };
