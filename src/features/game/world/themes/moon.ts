/**
 * Moon — clinical · starlit · exposed · ×0.7 score · low gravity
 *
 * First WorldTheme — conforms to types.ts (see world-system.md §1).
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
 *   1 midRidge   mid silhouette, more defined crater profile
 *   2 nearPlain  the regolith plain — where dots/pipes sit visually
 *   3 foreground crater field covering the full plain — fastest scroll
 *
 * Round-6 deltas vs prior:
 *   - farRidge band removed (read as flat noise, not depth).
 *   - midRidge raised + thickened (yPct 0.68→0.61, heightPct 0.10→0.17) so it
 *     reads as proper mountains without dominating the sky.
 *   - foreground crater field extended to cover the full regolith plain
 *     (yPct 0.86→0.78, heightPct 0.14→0.22) — matches nearPlain footprint.
 *   - lunar dust particle removed (no atmosphere; was reading as misplaced stars).
 *   - earth celestial uses kind:'earth' (renderer's Earth-specific path with
 *     stylised continents + ice caps + halo). phaseCurve dropped — the 'earth'
 *     renderer path doesn't terminate.
 */

import type { WorldTheme } from '../types';

export const moonTheme = {
  id: 'moon',
  label: 'Moon',
  tagline: 'clinical · starlit · exposed',
  // v0.3 — gravity gradient deferred. All worlds run at 1.0 (Earth baseline)
  // so Moon, Earth, Jupiter feel mechanically identical while we focus on
  // cosmetic design. Originally Moon = 0.7. Restore for difficulty tuning
  // once the visual pass is locked.
  gravityMul: 1.0,
  scoreMul: 0.7,
  // Sharp horizon snap (Moon has no atmosphere). Day/night dominate;
  // dawn/dusk are brief transitions through the horizon line.
  //
  // Known characteristic: at 10-gate cycle resolution the 47/3/47/3
  // plateau weighting makes the dawn/dusk transitions ~30% of one gate
  // each — visually subtle by design. The regolith plain and star density
  // do shift across the cycle, just quietly. Accepted as the airless feel.
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
    // farRidge band removed (round 6) — read as flat noise rather than depth.
    {
      // Mid ridge — yPct 0.61 / heightPct 0.17 (round 6). Reads as proper
      // mountains without dominating the sky. Path generator rewritten in
      // the iteration tool for less polygon feel; renderer port pending.
      id: 'midRidge',
      kind: 'silhouette',
      yPct: 0.61,
      heightPct: 0.17,
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
      // Crater field — extended (round 6) to cover the full regolith plain
      // (yPct 0.78, heightPct 0.22; matches nearPlain). Renderer port:
      // 32-crater field, two-shade depth, power-law sizing.
      id: 'foreground',
      kind: 'craters',
      yPct: 0.78,
      heightPct: 0.22,
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
    // Lunar dust horizontalDrift particle removed (round 6): Moon has no
    // atmosphere, and the white particles read as misplaced stars on the regolith.
  ],

  celestials: [
    {
      // v0.6 — kind: 'earth' triggers the Earth-from-Moon stylised render
      // path (blue ocean + Africa/Europe/Americas/Madagascar continents +
      // polar ice caps + atmospheric halo + soft terminator).
      // phaseCurve dropped — the dedicated path bakes a static terminator
      // that reads as Earth at a glance, no narrative phase needed.
      id: 'earth',
      kind: 'earth',
      xPct: 0.78,
      // yPct=0.10 keeps the Earth-from-Moon celestial high in the sky so
      // it clears the TWO/DOTS idle title (which lands around logical
      // y=170, ~23% of VIS_H from top). Earth's radius=28 means body spans
      // (yPct*VIS_H ± 28); at 0.10 the bottom edge sits well above the
      // title baseline.
      yPct: 0.1,
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
