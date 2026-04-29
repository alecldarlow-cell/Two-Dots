/**
 * Jupiter — banded · weighty · alien · ×1.5 score · high gravity
 *
 * Mirror of src/features/game/world/themes/jupiter.ts. Same values, JS-format
 * for the iteration tool runtime. When tweaking values in the tweaks panel,
 * either edit this file directly OR copy values back to jupiter.ts when locking.
 *
 * Bands: 6 atmospheric ribbons (storm-bands profile). Negative parallax = retrograde.
 * Celestials: distant sun, Great Red Spot (storm-eye), Io + Europa (moon kind).
 * No clouds, no birds, no foreground silhouette — flying through Jovian atmosphere.
 */

window.JupiterTheme = {
  id: 'jupiter',
  label: 'Jupiter',
  tagline: 'banded · weighty · alien',
  gravityMul: 1.4,
  scoreMul: 1.5,
  cycleProfile: 'atmospheric',

  sky: {
    topCurve: [
      { t: 0.00, color: '#2a2540' },
      { t: 0.25, color: '#4a5475' },
      { t: 0.50, color: '#4a3050' },
      { t: 0.75, color: '#050810' },
    ],
    midCurve: [
      { t: 0.00, color: '#6c5a70' },
      { t: 0.25, color: '#a48c6c' },
      { t: 0.50, color: '#a87050' },
      { t: 0.75, color: '#181428' },
    ],
    bottomCurve: [
      { t: 0.00, color: '#a07858' },
      { t: 0.25, color: '#c89878' },
      { t: 0.50, color: '#a04830' },
      { t: 0.75, color: '#08060a' },
    ],
  },

  bands: [
    { id: 'upperPolarHaze', kind: 'silhouette', yPct: 0.10, heightPct: 0.10, parallax:  0.10,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.00, color: '#4a3a32' }, { t: 0.25, color: '#6e5440' },
        { t: 0.50, color: '#6b3e2c' }, { t: 0.75, color: '#1a1410' },
      ] },
    { id: 'ntrZone', kind: 'silhouette', yPct: 0.20, heightPct: 0.10, parallax: -0.15,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.00, color: '#c8a896' }, { t: 0.25, color: '#e8c8a0' },
        { t: 0.50, color: '#d8946a' }, { t: 0.75, color: '#281e1a' },
      ] },
    { id: 'nebBelt', kind: 'silhouette', yPct: 0.30, heightPct: 0.13, parallax:  0.20,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.00, color: '#c08868' }, { t: 0.25, color: '#b87850' },
        { t: 0.50, color: '#a04830' }, { t: 0.75, color: '#1c1008' },
      ] },
    { id: 'equatorialZone', kind: 'silhouette', yPct: 0.43, heightPct: 0.14, parallax: -0.30,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.00, color: '#e8b89c' }, { t: 0.25, color: '#f0d8b0' },
        { t: 0.50, color: '#e09870' }, { t: 0.75, color: '#2a1f1a' },
      ] },
    { id: 'sebBelt', kind: 'silhouette', yPct: 0.57, heightPct: 0.13, parallax:  0.25,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.00, color: '#6e4838' }, { t: 0.25, color: '#6a4030' },
        { t: 0.50, color: '#5c2c1c' }, { t: 0.75, color: '#100808' },
      ] },
    { id: 'lowerZone', kind: 'silhouette', yPct: 0.70, heightPct: 0.30, parallax: -0.18,
      profile: 'storm-bands',
      colorCurve: [
        { t: 0.00, color: '#c89880' }, { t: 0.25, color: '#d8b894' },
        { t: 0.50, color: '#c47452' }, { t: 0.75, color: '#1a1410' },
      ] },
  ],

  particles: [
    {
      id: 'stars',
      kind: 'starfield',
      count: 40,
      densityCurve: [
        { t: 0.00, value: 0.05 }, { t: 0.25, value: 0.0 },
        { t: 0.50, value: 0.10 }, { t: 0.75, value: 0.7 },
      ],
      twinkle: true,
      sizeMul: 0.7,
    },
  ],

  celestials: [
    {
      id: 'sun',
      kind: 'sun',
      radius: 12,
      xCurve: [
        { t: 0.00, value: 0.10 }, { t: 0.25, value: 0.50 },
        { t: 0.50, value: 0.90 }, { t: 0.75, value: 1.30 },
      ],
      yCurve: [
        { t: 0.00, value: 0.18 }, { t: 0.25, value: 0.06 },
        { t: 0.50, value: 0.18 }, { t: 0.75, value: 0.30 },
      ],
      xPct: 0.50, yPct: 0.10,
      colorCurve: [
        { t: 0.00, color: '#ffe0a0' }, { t: 0.25, color: '#ffffe8' },
        { t: 0.50, color: '#ff9050' }, { t: 0.75, color: '#603848' },
      ],
      glowCurve: [
        { t: 0.00, value: 0.50 }, { t: 0.25, value: 0.40 },
        { t: 0.50, value: 0.60 }, { t: 0.75, value: 0.00 },
      ],
    },
    {
      id: 'grs',
      kind: 'storm-eye',
      radius: 38,
      xPct: 0.32, yPct: 0.60,
      colorCurve: [
        { t: 0.00, color: '#c4684e' }, { t: 0.25, color: '#d87858' },
        { t: 0.50, color: '#b8482c' }, { t: 0.75, color: '#5a2418' },
      ],
      glowCurve: [
        { t: 0.00, value: 0.0 }, { t: 0.25, value: 0.0 },
        { t: 0.50, value: 0.0 }, { t: 0.75, value: 0.0 },
      ],
    },
    {
      id: 'io',
      kind: 'moon',
      radius: 5,
      xCurve: [
        { t: 0.00, value:  0.20 }, { t: 0.25, value:  0.70 },
        { t: 0.50, value:  0.90 }, { t: 0.75, value: -0.10 },
      ],
      yCurve: [
        { t: 0.00, value: 0.08 }, { t: 0.25, value: 0.04 },
        { t: 0.50, value: 0.08 }, { t: 0.75, value: 0.06 },
      ],
      xPct: 0.50, yPct: 0.07,
      colorCurve: [
        { t: 0.00, color: '#f0e0a0' }, { t: 0.25, color: '#fff0b8' },
        { t: 0.50, color: '#f0c878' }, { t: 0.75, color: '#d8c08a' },
      ],
      glowCurve: [
        { t: 0.00, value: 0.4 }, { t: 0.25, value: 0.0 },
        { t: 0.50, value: 0.5 }, { t: 0.75, value: 0.7 },
      ],
    },
    {
      id: 'europa',
      kind: 'moon',
      radius: 4,
      xCurve: [
        { t: 0.00, value: 0.85 }, { t: 0.25, value: 0.30 },
        { t: 0.50, value: 0.10 }, { t: 0.75, value: 0.55 },
      ],
      yCurve: [
        { t: 0.00, value: 0.06 }, { t: 0.25, value: 0.10 },
        { t: 0.50, value: 0.05 }, { t: 0.75, value: 0.04 },
      ],
      xPct: 0.50, yPct: 0.07,
      colorCurve: [
        { t: 0.00, color: '#ece8d0' }, { t: 0.25, color: '#fafaf0' },
        { t: 0.50, color: '#e8d8c0' }, { t: 0.75, color: '#d4d0c4' },
      ],
      glowCurve: [
        { t: 0.00, value: 0.3 }, { t: 0.25, value: 0.0 },
        { t: 0.50, value: 0.4 }, { t: 0.75, value: 0.6 },
      ],
    },
  ],

  palette: {
    pipeWall: '#10355c',
    pipeEdge: '#7ac0e8',
    dotL: '#FFB13B',
    dotR: '#7FE5E8',
    dividerGlowL: '#FFB13B',
    dividerGlowR: '#7FE5E8',
    bgFlash: '#3a1408',
  },
};
