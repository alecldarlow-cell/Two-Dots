/**
 * Earth — golden hour · alive · canonical · ×1.0 score · standard gravity
 *
 * v0.5-worlds — second WorldTheme. Conforms to types.ts (see world-system.md §1).
 * Frozen `as const`. Static. Never mutated per-frame.
 *
 * What's new in v0.5 (vs Moon v0.3):
 *   - cycleProfile: 'atmospheric' (40/10/40/10 day/dusk/night/dawn). Moon
 *     uses 'airless' (47/3/47/3). Curve t still anchors to 0/0.25/0.5/0.75.
 *   - Sun and Moon arc across the sky via xCurve / yCurve. Position curves
 *     sample raw player t (continuous); color/glow keep using profile-eased t.
 *   - Two foreground bands carry an internal `gradientCurve` for top-to-bottom
 *     shading inside the silhouette path.
 *   - New silhouette profiles: 'mountains' / 'hills' / 'singleHill'.
 *   - New particle kinds: 'clouds' (multi-bubble cumulus) and 'birds'
 *     (chevron Q-curves with wing-flap).
 *   - New celestial kind: 'moon'.
 *   - Sky colours rebuilt against real sunrise/sunset photography.
 *
 * Bands (far → near, all `kind: 'silhouette'`):
 *   0 sky          full-bleed gradient (3-stop top/mid/bottom)
 *   1 farMountains profile: 'mountains'   parallax 0.08
 *   2 midMountains profile: 'mountains'   parallax 0.20  (heightPct 0.45)
 *   3 nearHill     profile: 'singleHill'  parallax 0.30  + gradientCurve
 *
 * Round-6 deltas vs prior:
 *   - midMountains heightPct 0.40 → 0.45 (extends to canvas bottom, closes
 *     gap between band base and the foreground hill's bell-curve edges).
 *   - rollingHills band removed (read as redundant with the foreground hill).
 *   - nearHill yPct 0.82→0.86, heightPct 0.18→0.14, parallax 0.85→0.30 —
 *     peak sits lower on screen; mid mountains covers any gap at the edges.
 *   - singleHill renderer profile updated: flat peak, no ripple. Renderer
 *     port pending.
 *
 * Particles:
 *   - clouds:  multi-bubble cumulus (renderer composes 6–8 overlapping circles
 *              + flat base per cloud, NOT a single ellipse). Sky-tinted.
 *   - birds:   chevron Q-curves with wing-flap (~3Hz). Dawn/dusk dominant.
 *   - stars:   sparse (50), small (sizeMul 0.85), night-only with twinkle.
 *
 * Celestials:
 *   - sun  arcs left → overhead → right across the day plateau.
 *   - moon arcs from right (dawn) → off-screen → left (dusk) → overhead at night.
 *
 * Visual reference: handoff/reference/earth-{00-dawn,25-day,50-dusk,75-night}.png.
 */

import type { WorldTheme } from '../types';

export const earthTheme = {
  id: 'earth',
  label: 'Earth',
  tagline: 'golden hour · alive · canonical',
  gravityMul: 1.0,
  scoreMul: 1.0,
  cycleProfile: 'atmospheric',

  // ─── SKY ─────────────────────────────────────────────────────────────────
  sky: {
    topCurve: [
      { t: 0.0, color: '#2b3050' }, // dawn  — deep indigo pre-sunrise
      { t: 0.25, color: '#5a8fc4' }, // day   — rich saturated blue
      { t: 0.5, color: '#3a3a6a' }, // dusk  — deepening violet-blue
      { t: 0.75, color: '#070a1a' }, // night — near-black navy
    ],
    midCurve: [
      { t: 0.0, color: '#604f6e' }, // dawn  — violet/mauve transition
      { t: 0.25, color: '#a8c8e0' }, // day   — classic mid-blue
      { t: 0.5, color: '#c8688c' }, // dusk  — hot pink/magenta band
      { t: 0.75, color: '#0e1428' }, // night — deep navy
    ],
    bottomCurve: [
      { t: 0.0, color: '#e8a896' }, // dawn  — peach-pink horizon (sunrise)
      { t: 0.25, color: '#e8eef0' }, // day   — pale Rayleigh haze
      { t: 0.5, color: '#f0a060' }, // dusk  — golden-orange (canonical)
      { t: 0.75, color: '#181828' }, // night — slight warm tint
    ],
  },

  // ─── BANDS (far → near) ──────────────────────────────────────────────────
  bands: [
    {
      id: 'farMountains',
      kind: 'silhouette',
      yPct: 0.4,
      heightPct: 0.55,
      parallax: 0.08,
      profile: 'mountains',
      colorCurve: [
        { t: 0.0, color: '#4a5a52' },
        { t: 0.25, color: '#6b8870' },
        { t: 0.5, color: '#3e4a4a' },
        { t: 0.75, color: '#0c1414' },
      ],
    },
    {
      // Extended downward (round 6): heightPct 0.40 → 0.45 closes the small
      // gap between band bottom and the foreground hill's bell-curve edges.
      id: 'midMountains',
      kind: 'silhouette',
      yPct: 0.55,
      heightPct: 0.45,
      parallax: 0.2,
      profile: 'mountains',
      colorCurve: [
        { t: 0.0, color: '#2f3a35' },
        { t: 0.25, color: '#48604c' },
        { t: 0.5, color: '#23302a' },
        { t: 0.75, color: '#060a08' },
      ],
    },
    // rollingHills band removed (round 6) — read as redundant with the
    // foreground hill silhouette below.
    {
      // Single foreground hill — closest piece of land (round 6).
      // Lowered (yPct 0.82→0.86, heightPct 0.18→0.14) so the peak sits
      // lower on screen; mid mountains (heightPct 0.45) covers any gap
      // that appears at the foreground edges. Parallax slowed (0.85→0.30)
      // so the closest band moves believably with player travel.
      id: 'nearHill',
      kind: 'silhouette',
      yPct: 0.86,
      heightPct: 0.14,
      parallax: 0.3,
      profile: 'singleHill',
      colorCurve: [
        { t: 0.0, color: '#3a2820' },
        { t: 0.25, color: '#4e3828' },
        { t: 0.5, color: '#3a1c14' },
        { t: 0.75, color: '#04060c' },
      ],
      gradientCurve: [
        { t: 0.0, color: '#523a2c' },
        { t: 0.25, color: '#6e4e36' },
        { t: 0.5, color: '#52281c' },
        { t: 0.75, color: '#0a0c14' },
      ],
    },
  ],

  // ─── PARTICLES ───────────────────────────────────────────────────────────
  particles: [
    {
      id: 'clouds',
      kind: 'clouds',
      count: 7,
      densityCurve: [
        { t: 0.0, value: 0.5 },
        { t: 0.25, value: 1.0 },
        { t: 0.5, value: 0.7 },
        { t: 0.75, value: 0.0 },
      ],
      speed: 1.0,
      colorCurve: [
        { t: 0.0, color: '#e8c0b0' },
        { t: 0.25, color: '#ffffff' },
        { t: 0.5, color: '#f8a888' },
        { t: 0.75, color: '#1f2a4a' },
      ],
    },
    {
      id: 'birds',
      kind: 'birds',
      count: 10,
      densityCurve: [
        { t: 0.0, value: 1.0 },
        { t: 0.25, value: 0.3 },
        { t: 0.5, value: 0.9 },
        { t: 0.75, value: 0.0 },
      ],
      speed: 1.2,
      sizeMul: 2.2,
      colorCurve: [
        { t: 0.0, color: '#2a1f30' },
        { t: 0.25, color: '#3a4558' },
        { t: 0.5, color: '#2a1828' },
        { t: 0.75, color: '#000000' },
      ],
    },
    {
      id: 'stars',
      kind: 'starfield',
      count: 50,
      densityCurve: [
        { t: 0.0, value: 0.0 },
        { t: 0.25, value: 0.0 },
        { t: 0.5, value: 0.15 },
        { t: 0.75, value: 0.7 },
      ],
      twinkle: true,
      sizeMul: 0.85,
    },
  ],

  // ─── CELESTIALS ──────────────────────────────────────────────────────────
  celestials: [
    {
      id: 'sun',
      kind: 'sun',
      radius: 26,
      xCurve: [
        { t: 0.0, value: 0.1 },
        { t: 0.25, value: 0.5 },
        { t: 0.5, value: 0.9 },
        { t: 0.75, value: 1.3 },
      ],
      yCurve: [
        { t: 0.0, value: 0.55 },
        { t: 0.25, value: 0.22 },
        { t: 0.5, value: 0.55 },
        { t: 0.75, value: 0.65 },
      ],
      xPct: 0.5,
      yPct: 0.2,
      colorCurve: [
        { t: 0.0, color: '#ffd0a0' },
        { t: 0.25, color: '#fff8e0' },
        { t: 0.5, color: '#ff9050' },
        { t: 0.75, color: '#603848' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.85 },
        { t: 0.25, value: 0.55 },
        { t: 0.5, value: 1.0 },
        { t: 0.75, value: 0.0 },
      ],
    },
    {
      id: 'moon',
      kind: 'moon',
      radius: 20,
      xCurve: [
        { t: 0.0, value: 0.75 },
        { t: 0.25, value: 1.3 },
        { t: 0.5, value: -0.2 },
        { t: 0.75, value: 0.5 },
      ],
      yCurve: [
        { t: 0.0, value: 0.55 },
        { t: 0.25, value: 0.65 },
        { t: 0.5, value: 0.55 },
        { t: 0.75, value: 0.25 },
      ],
      xPct: 0.5,
      yPct: 0.2,
      colorCurve: [
        { t: 0.0, color: '#d8d2c0' },
        { t: 0.25, color: '#cccccc' },
        { t: 0.5, color: '#d8d2c0' },
        { t: 0.75, color: '#f0ebd8' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.3 },
        { t: 0.25, value: 0.0 },
        { t: 0.5, value: 0.4 },
        { t: 0.75, value: 0.85 },
      ],
    },
  ],

  // ─── PALETTE (game overlay — pipes, dots, divider, bg flash) ─────────────
  palette: {
    pipeWall: '#10355c',
    pipeEdge: '#7ac0e8',
    dotL: '#FFB13B',
    dotR: '#7FE5E8',
    dividerGlowL: '#FFB13B',
    dividerGlowR: '#7FE5E8',
    bgFlash: '#2a0814',
  },
} as const satisfies WorldTheme;
