/**
 * Moon — clinical · starlit · exposed · ×0.7 score · low gravity
 *
 * v0.3-worlds — first WorldTheme, conforms to types.ts (see world-system.md §1).
 * Frozen `as const`. Static. Never mutated per-frame.
 *
 * Locked semantics (per spec §1):
 *   - ToD stops at 0.00 / 0.25 / 0.50 / 0.75. t=1 wraps to t=0 (renderer convention).
 *   - Sky / band / celestial colourCurves: hex strings, sRGB-encoded; renderer
 *     preprocesses to oklch at module-load.
 *   - Particle `count` = fixed seeded positions; `densityCurve` modulates alpha,
 *     not population. No particles pop in/out across ToD.
 *   - yPct/heightPct: fractions of VIS_H.  xPct: fraction of canvas width.
 *   - Celestial `radius`: raw pixels.  horizontalDrift `speed`: px/sec.
 *   - twinkle: independent random phase per star, base ~1Hz.
 *
 * Bands (far → near):
 *   0 sky        full-bleed gradient, time-of-day driven
 *   1 farRidge   distant cratered horizon (lowest contrast silhouette)
 *   2 midRidge   mid silhouette, more defined crater profile
 *   3 nearPlain  the regolith plain — where dots/pipes sit visually
 *   4 foreground crater rims, scattered boulders, fastest scroll
 */

import type { WorldTheme } from '../types';

export const moonTheme = {
  id: 'moon',
  label: 'Moon',
  tagline: 'clinical · starlit · exposed',
  gravityMul: 0.7,
  scoreMul: 0.7,
  // v0.5 — sharp horizon snap (Moon has no atmosphere). Day/night dominate;
  // dawn/dusk are just brief transitions through the horizon line.
  cycleProfile: 'airless',

  sky: {
    topCurve: [
      { t: 0.0, color: '#1a1d3a' },
      { t: 0.25, color: '#0d1638' },
      { t: 0.5, color: '#221530' },
      { t: 0.75, color: '#04050d' },
    ],
    midCurve: [
      { t: 0.0, color: '#2c2647' },
      { t: 0.25, color: '#1a2452' },
      { t: 0.5, color: '#3a1f3a' },
      { t: 0.75, color: '#080918' },
    ],
    bottomCurve: [
      { t: 0.0, color: '#3d3552' },
      { t: 0.25, color: '#2a3760' },
      { t: 0.5, color: '#4a2a45' },
      { t: 0.75, color: '#0e0f1f' },
    ],
  },

  bands: [
    {
      id: 'farRidge',
      kind: 'silhouette',
      yPct: 0.62,
      heightPct: 0.08,
      parallax: 0.1,
      profile: 'soft-craters',
      colorCurve: [
        { t: 0.0, color: '#34304a' },
        { t: 0.25, color: '#272f50' },
        { t: 0.5, color: '#3b2945' },
        { t: 0.75, color: '#0f1226' },
      ],
    },
    {
      id: 'midRidge',
      kind: 'silhouette',
      yPct: 0.68,
      heightPct: 0.1,
      parallax: 0.22,
      profile: 'cratered-horizon',
      colorCurve: [
        { t: 0.0, color: '#2a2740' },
        { t: 0.25, color: '#1d264a' },
        { t: 0.5, color: '#311f3c' },
        { t: 0.75, color: '#080a1a' },
      ],
    },
    {
      id: 'nearPlain',
      kind: 'plain',
      yPct: 0.78,
      heightPct: 0.22,
      parallax: 0.45,
      colorCurve: [
        { t: 0.0, color: '#5a5670' },
        { t: 0.25, color: '#4a5479' },
        { t: 0.5, color: '#564058' },
        { t: 0.75, color: '#1a1c2e' },
      ],
      hazeCurve: [
        { t: 0.0, color: '#6c5e74' },
        { t: 0.25, color: '#5e6b8a' },
        { t: 0.5, color: '#6a4a5c' },
        { t: 0.75, color: '#22243a' },
      ],
    },
    {
      id: 'foreground',
      kind: 'craters',
      yPct: 0.86,
      heightPct: 0.14,
      parallax: 0.85,
      colorCurve: [
        { t: 0.0, color: '#3e3a52' },
        { t: 0.25, color: '#323a5a' },
        { t: 0.5, color: '#3a2a40' },
        { t: 0.75, color: '#0c0d1c' },
      ],
    },
  ],

  particles: [
    {
      id: 'stars',
      kind: 'starfield',
      count: 80,
      densityCurve: [
        { t: 0.0, value: 0.4 },
        { t: 0.25, value: 0.15 },
        { t: 0.5, value: 0.5 },
        { t: 0.75, value: 1.0 },
      ],
      twinkle: true,
    },
    {
      id: 'dust',
      kind: 'horizontalDrift',
      count: 30,
      densityCurve: [
        { t: 0.0, value: 0.6 },
        { t: 0.25, value: 0.5 },
        { t: 0.5, value: 0.7 },
        { t: 0.75, value: 0.4 },
      ],
      speed: 0.3,
      sizeRange: [1, 2.5],
    },
  ],

  celestials: [
    {
      id: 'earth',
      kind: 'planet',
      xPct: 0.78,
      yPct: 0.18,
      radius: 28,
      colorCurve: [
        { t: 0.0, color: '#5b8fc9' },
        { t: 0.25, color: '#7aa9d9' },
        { t: 0.5, color: '#4d7ab8' },
        { t: 0.75, color: '#3a5e95' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.4 },
        { t: 0.25, value: 0.6 },
        { t: 0.5, value: 0.5 },
        { t: 0.75, value: 0.3 },
      ],
      // v0.5 — Earth-from-Moon phase. Authored as narrative arc (crescent at
      // dawn → near-full at lunar night), not real celestial mechanics.
      phaseCurve: [
        { t: 0.0, value: 0.3 },
        { t: 0.25, value: 0.55 },
        { t: 0.5, value: 0.75 },
        { t: 0.75, value: 0.95 },
      ],
    },
  ],

  palette: {
    pipeWall: '#10355c',
    pipeEdge: '#7ac0e8',
    // Warm/cool palette — locked across all worlds (Q2 sign-off).
    // Amber + ice. Hue family stays warm-L / cool-R; chroma + lightness
    // flex per-world only.
    dotL: '#FFB13B',
    dotR: '#7FE5E8',
    dividerGlowL: '#FFB13B',
    dividerGlowR: '#7FE5E8',
    bgFlash: '#1c0418',
  },
} as const satisfies WorldTheme;
