/**
 * Deterministic pseudo-random for procedural geometry — shared between the
 * Skia production renderer and the HTML/SVG iteration tool.
 *
 * mulberry32 is chosen for its small state, fast execution, and well-known
 * statistical quality for small generative tasks like crater placement and
 * blade jitter. Same seed → same sequence on every device, every renderer.
 *
 * `themeSeed(id)` derives a stable 32-bit hash from a theme id (e.g. 'moon')
 * so per-band seeds can be `themeSeed(theme.id) ^ themeSeed(band.id)` and
 * stay distinct across themes without collisions.
 */

/** mulberry32 PRNG. Stateful closure; call repeatedly to advance. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string id. Stable, deterministic, per-id seed. */
export function themeSeed(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
