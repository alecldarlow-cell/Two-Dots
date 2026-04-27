/**
 * Seedable pseudo-random number generator.
 *
 * Why this exists:
 * The prototype calls `Math.random()` inline inside spawn logic. That is fine
 * at runtime but makes the spawn logic untestable — we cannot assert that a
 * given (score, visH, seed) combination produces a specific gap centre.
 *
 * The engine accepts an `Rng` on the state object. In production the Rng wraps
 * `Math.random`. In tests we inject a seeded mulberry32 implementation so we can
 * pin the entire run sequence and assert that e.g. the gap-reachability clamp
 * correctly catches an impossible spawn.
 */

export type Rng = () => number;

/**
 * Mulberry32 — a simple, fast, non-cryptographic 32-bit PRNG.
 * Good enough for gameplay and tests. Period is 2^32.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The production Rng — thin wrapper over Math.random so the dependency is explicit. */
export const defaultRng: Rng = () => Math.random();
