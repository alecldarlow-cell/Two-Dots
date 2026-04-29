/**
 * Jupiter — banded · weighty · alien · ×1.5 score · high gravity
 *
 * v0.5-worlds — third WorldTheme. Conforms to types.ts (locked v0.5 schema).
 * Frozen `as const`. Static. Never mutated per-frame. No schema additions —
 * works within Earth's v0.5 spec (per "try v0.5 first, add only if forced").
 *
 * Identity: bands, Great Red Spot, scale, weight. Player flies through
 * Jovian atmosphere — there is no surface. Pipes and dots hover against
 * stacked atmospheric ribbons that drift in alternating zonal flow
 * (negative parallax = retrograde).
 *
 * Bands (atmospheric, top → bottom; all `kind: 'silhouette'` profile
 * 'storm-bands'). Sky is barely visible — only top ~10% — because the
 * upper polar haze covers from 10% downward. Negative parallax values
 * are interpreted by the renderer as retrograde flow (right-to-left) vs
 * the prograde norm (left-to-right):
 *
 *   1 upperPolarHaze   yPct 0.10  height 0.10  parallax  0.10
 *   2 ntrZone          yPct 0.20  height 0.10  parallax -0.15  (NTrZ cream)
 *   3 nebBelt          yPct 0.30  height 0.13  parallax  0.20  (orange-brown)
 *   4 equatorialZone   yPct 0.43  height 0.14  parallax -0.30  (bright cream)
 *   5 sebBelt          yPct 0.57  height 0.13  parallax  0.25  (chocolate)
 *   6 lowerZone        yPct 0.70  height 0.30  parallax -0.18  (extends to bottom)
 *
 * Celestials:
 *   - sun  small + distant (radius 12, ⅓ of Earth's). Same arc shape as Earth's.
 *   - GRS  storm-eye, oval (renderer hardcodes 1.6× horizontal aspect),
 *          static lower-mid, slow rotation, 4 concentric flow rings.
 *   - Io / Europa  Galilean moons drifting across upper sky at different
 *          rates and altitudes. Hidden during day plateau via glow=0.
 *
 * Particles: sparse starfield, sizeMul 0.7. No clouds (the bands ARE the
 * clouds). No birds (no birds on Jupiter). No drift dust.
 *
 * Cycle: 'atmospheric' (Jupiter scatters light through dense haze).
 *
 * Renderer rules invoked:
 *   - Negative parallax → retrograde flow (existing JS modulo behaviour).
 *   - storm-eye kind → oval body + concentric rings + slow rotation;
 *     rendered AFTER bands (so it overlays them — it's IN the SEB).
 *   - sun / moon glow=0 hides body; storm-eye / planet always visible.
 */

import type { WorldTheme } from '../types';

export const jupiterTheme = {
  id: 'jupiter',
  label: 'Jupiter',
  tagline: 'banded · weighty · alien',
  gravityMul: 1.4,
  scoreMul: 1.5,
  cycleProfile: 'atmospheric',

  // ─── SKY ─────────────────────────────────────────────────────────────────
  // Only the top ~10% is visible (above the upper polar haze band). Mid/bot
  // stops are authored for completeness but rarely read.
  sky: {
    topCurve: [
      { t: 0.0, color: '#2a2540' }, // dawn  — deep storm-indigo
      { t: 0.25, color: '#4a5475' }, // day   — Jovian high-atmosphere blue
      { t: 0.5, color: '#4a3050' }, // dusk  — deep mauve
      { t: 0.75, color: '#050810' }, // night — near-black
    ],
    midCurve: [
      { t: 0.0, color: '#6c5a70' },
      { t: 0.25, color: '#a48c6c' },
      { t: 0.5, color: '#a87050' },
      { t: 0.75, color: '#181428' },
    ],
    bottomCurve: [
      { t: 0.0, color: '#a07858' },
      { t: 0.25, color: '#c89878' },
      { t: 0.5, color: '#a04830' },
      { t: 0.75, color: '#08060a' },
    ],
  },

  // ─── BANDS — atmospheric ribbons, no surface ─────────────────────────────
  bands: [
    {
      // Upper polar haze — dim brown, slow eastward drift
      id: 'upperPolarHaze',
      kind: 'silhouette',
      yPct: 0.1,
      heightPct: 0.1,
      parallax: 0.1,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.0, color: '#4a3a32' },
        { t: 0.25, color: '#6e5440' },
        { t: 0.5, color: '#6b3e2c' },
        { t: 0.75, color: '#1a1410' },
      ],
    },
    {
      // North Tropical Zone — cream, retrograde drift
      id: 'ntrZone',
      kind: 'silhouette',
      yPct: 0.2,
      heightPct: 0.1,
      parallax: -0.15,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.0, color: '#c8a896' },
        { t: 0.25, color: '#e8c8a0' },
        { t: 0.5, color: '#d8946a' },
        { t: 0.75, color: '#281e1a' },
      ],
    },
    {
      // North Equatorial Belt — saturated orange-brown, prograde
      id: 'nebBelt',
      kind: 'silhouette',
      yPct: 0.3,
      heightPct: 0.13,
      parallax: 0.2,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.0, color: '#c08868' },
        { t: 0.25, color: '#b87850' },
        { t: 0.5, color: '#a04830' },
        { t: 0.75, color: '#1c1008' },
      ],
    },
    {
      // Equatorial Zone — bright cream, fast retrograde (the iconic central band)
      id: 'equatorialZone',
      kind: 'silhouette',
      yPct: 0.43,
      heightPct: 0.14,
      parallax: -0.3,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.0, color: '#e8b89c' },
        { t: 0.25, color: '#f0d8b0' },
        { t: 0.5, color: '#e09870' },
        { t: 0.75, color: '#2a1f1a' },
      ],
    },
    {
      // South Equatorial Belt — chocolate, prograde. The GRS sits here.
      id: 'sebBelt',
      kind: 'silhouette',
      yPct: 0.57,
      heightPct: 0.13,
      parallax: 0.25,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.0, color: '#6e4838' },
        { t: 0.25, color: '#6a4030' },
        { t: 0.5, color: '#5c2c1c' },
        { t: 0.75, color: '#100808' },
      ],
    },
    {
      // Lower zone — extends to bottom of canvas. Pale tan, retrograde.
      id: 'lowerZone',
      kind: 'silhouette',
      yPct: 0.7,
      heightPct: 0.3,
      parallax: -0.18,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.0, color: '#c89880' },
        { t: 0.25, color: '#d8b894' },
        { t: 0.5, color: '#c47452' },
        { t: 0.75, color: '#1a1410' },
      ],
    },
  ],

  // ─── PARTICLES ───────────────────────────────────────────────────────────
  particles: [
    {
      // Sparse, distant stars — barely visible at night through Jovian haze.
      id: 'stars',
      kind: 'starfield',
      count: 40,
      densityCurve: [
        { t: 0.0, value: 0.05 }, // dawn — almost gone
        { t: 0.25, value: 0.0 }, // day  — invisible
        { t: 0.5, value: 0.1 }, // dusk — emerging
        { t: 0.75, value: 0.7 }, // night — visible but soft
      ],
      twinkle: true,
      sizeMul: 0.7, // smaller than Moon's (1.0) and Earth's (0.85)
    },
  ],

  // ─── CELESTIALS ──────────────────────────────────────────────────────────
  celestials: [
    {
      // Distant sun — much smaller from Jupiter's orbit (~5× further than Earth).
      // Same arc shape as Earth's sun but smaller body and weaker glow.
      id: 'sun',
      kind: 'sun',
      radius: 12,
      xCurve: [
        { t: 0.0, value: 0.1 },
        { t: 0.25, value: 0.5 },
        { t: 0.5, value: 0.9 },
        { t: 0.75, value: 1.3 },
      ],
      yCurve: [
        { t: 0.0, value: 0.18 },
        { t: 0.25, value: 0.06 },
        { t: 0.5, value: 0.18 },
        { t: 0.75, value: 0.3 },
      ],
      xPct: 0.5,
      yPct: 0.1,
      colorCurve: [
        { t: 0.0, color: '#ffe0a0' },
        { t: 0.25, color: '#ffffe8' },
        { t: 0.5, color: '#ff9050' },
        { t: 0.75, color: '#603848' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.5 },
        { t: 0.25, value: 0.4 },
        { t: 0.5, value: 0.6 },
        { t: 0.75, value: 0.0 }, // hidden at night
      ],
    },
    {
      // Great Red Spot — three-Earths-wide oval storm in the SEB.
      // Static position (doesn't arc — it's a feature of the planet itself).
      // Renderer hardcodes oval shape (1.6× horizontal), 4 concentric flow
      // rings, slow rotation (~60s per turn) keyed off `kind: 'storm-eye'`.
      // Rendered AFTER bands (overlays sebBelt). Always visible regardless
      // of glow value — physical feature, not a light source.
      id: 'grs',
      kind: 'storm-eye',
      radius: 38,
      xPct: 0.32,
      yPct: 0.6,
      colorCurve: [
        { t: 0.0, color: '#c4684e' }, // dawn — warm rust
        { t: 0.25, color: '#d87858' }, // day  — vivid red-orange
        { t: 0.5, color: '#b8482c' }, // dusk — deep auburn
        { t: 0.75, color: '#5a2418' }, // night — visible but dim
      ],
      glowCurve: [
        { t: 0.0, value: 0.0 }, // GRS doesn't glow — it's a storm, not a light
        { t: 0.25, value: 0.0 },
        { t: 0.5, value: 0.0 },
        { t: 0.75, value: 0.0 },
      ],
    },
    {
      // Io — sulfur-yellow, sized small (real Io is ¼ Earth's diameter,
      // far away as seen from "near" Jupiter). Drifts left across day, hidden
      // briefly mid-day in glare, then visible again at dusk and night.
      id: 'io',
      kind: 'moon',
      radius: 5,
      xCurve: [
        { t: 0.0, value: 0.2 },
        { t: 0.25, value: 0.7 },
        { t: 0.5, value: 0.9 },
        { t: 0.75, value: -0.1 }, // wraps to far left, drifts back across night
      ],
      yCurve: [
        { t: 0.0, value: 0.08 },
        { t: 0.25, value: 0.04 },
        { t: 0.5, value: 0.08 },
        { t: 0.75, value: 0.06 },
      ],
      xPct: 0.5,
      yPct: 0.07,
      colorCurve: [
        { t: 0.0, color: '#f0e0a0' }, // pale sulfur-yellow
        { t: 0.25, color: '#fff0b8' },
        { t: 0.5, color: '#f0c878' },
        { t: 0.75, color: '#d8c08a' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.4 },
        { t: 0.25, value: 0.0 }, // washed out by daytime glare
        { t: 0.5, value: 0.5 },
        { t: 0.75, value: 0.7 },
      ],
    },
    {
      // Europa — icy white, slightly smaller than Io. Different orbital
      // velocity → opposite drift direction across the cycle.
      id: 'europa',
      kind: 'moon',
      radius: 4,
      xCurve: [
        { t: 0.0, value: 0.85 },
        { t: 0.25, value: 0.3 },
        { t: 0.5, value: 0.1 },
        { t: 0.75, value: 0.55 },
      ],
      yCurve: [
        { t: 0.0, value: 0.06 },
        { t: 0.25, value: 0.1 },
        { t: 0.5, value: 0.05 },
        { t: 0.75, value: 0.04 },
      ],
      xPct: 0.5,
      yPct: 0.07,
      colorCurve: [
        { t: 0.0, color: '#ece8d0' },
        { t: 0.25, color: '#fafaf0' },
        { t: 0.5, color: '#e8d8c0' },
        { t: 0.75, color: '#d4d0c4' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.3 },
        { t: 0.25, value: 0.0 },
        { t: 0.5, value: 0.4 },
        { t: 0.75, value: 0.6 },
      ],
    },
  ],

  // ─── PALETTE (game overlay — locked warm/cool, navy pipe family) ─────────
  palette: {
    pipeWall: '#10355c',
    pipeEdge: '#7ac0e8',
    dotL: '#FFB13B',
    dotR: '#7FE5E8',
    dividerGlowL: '#FFB13B',
    dividerGlowR: '#7FE5E8',
    bgFlash: '#3a1408', // warm rust death-flash, distinct from Earth's '#2a0814'
  },
} as const satisfies WorldTheme;
