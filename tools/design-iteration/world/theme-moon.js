/**
 * Moon — clinical · starlit · exposed · ×0.7 score · low gravity
 *
 * Bands (far → near):
 *   0 sky        full-bleed gradient, time-of-day driven
 *   1 farRidge   distant cratered horizon (lowest contrast silhouette)
 *   2 midRidge   mid silhouette, more defined crater profile
 *   3 nearPlain  the regolith plain — where dots/pipes sit visually
 *   4 foreground crater rims, scattered boulders, fastest scroll
 *
 * Particles: a starfield (dawn/day suppressed, dusk/night active) + lunar dust
 * (fine, slow, low density) drifting horizontally.
 *
 * Celestials: Earth in the sky as the "sun" analogue (always visible — moon
 * has no atmospheric scatter, so Earth stays sharp regardless of "time").
 */

window.MoonTheme = {
  id: 'moon',
  label: 'Moon',
  tagline: 'clinical · starlit · exposed',
  gravityMul: 0.7,
  scoreMul: 0.7,
  cycleProfile: 'airless',

  // SKY — gradient stops are top→bottom; each stop has its own time-of-day curve.
  // Top of sky goes from pre-dawn indigo → pale day → dusk slate → deep night.
  // Bottom of sky meets horizon — softer, warmer at dawn/dusk, ink at night.
  sky: {
    topCurve: [
      { t: 0.00, color: '#1a1d3a' }, // dawn — deep indigo
      { t: 0.25, color: '#0d1638' }, // day  — moon has no blue sky, stays dark
      { t: 0.50, color: '#221530' }, // dusk — violet
      { t: 0.75, color: '#04050d' }, // night — black
    ],
    midCurve: [
      { t: 0.00, color: '#2c2647' },
      { t: 0.25, color: '#1a2452' },
      { t: 0.50, color: '#3a1f3a' },
      { t: 0.75, color: '#080918' },
    ],
    bottomCurve: [
      { t: 0.00, color: '#3d3552' },
      { t: 0.25, color: '#2a3760' },
      { t: 0.50, color: '#4a2a45' },
      { t: 0.75, color: '#0e0f1f' },
    ],
  },

  bands: [
    // farRidge band removed per design review (Moon point 2).
    {
      // Mid ridge — yPct 0.61 / heightPct 0.17 (midpoint between v0.5 0.68/0.10
      // and a more aggressive 0.58/0.20). Reads as proper mountains without
      // dominating the sky. Path generator rewritten for less polygon feel.
      id: 'midRidge',
      kind: 'silhouette',
      yPct: 0.61,
      heightPct: 0.17,
      parallax: 0.22,
      profile: 'cratered-horizon',
      colorCurve: [
        { t: 0.00, color: '#2a2740' },
        { t: 0.25, color: '#1d264a' },
        { t: 0.50, color: '#311f3c' },
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
        { t: 0.00, color: '#5a5670' },
        { t: 0.25, color: '#4a5479' },
        { t: 0.50, color: '#564058' },
        { t: 0.75, color: '#1a1c2e' },
      ],
      // soft horizon haze gradient at top edge of band
      hazeCurve: [
        { t: 0.00, color: '#6c5e74' },
        { t: 0.25, color: '#5e6b8a' },
        { t: 0.50, color: '#6a4a5c' },
        { t: 0.75, color: '#22243a' },
      ],
    },
    {
      // Crater field — extended to cover the full regolith plain (matches
      // nearPlain's yPct/heightPct) per Moon point 3.1 (round 6 review).
      id: 'foreground',
      kind: 'craters',
      yPct: 0.78,
      heightPct: 0.22,
      parallax: 0.85,
      // shadow ovals on the regolith — same colour as regolith but darker
      colorCurve: [
        { t: 0.00, color: '#3e3a52' },
        { t: 0.25, color: '#323a5a' },
        { t: 0.50, color: '#3a2a40' },
        { t: 0.75, color: '#0c0d1c' },
      ],
    },
  ],

  particles: [
    {
      id: 'stars',
      kind: 'starfield',
      count: 80,
      // Stars only render meaningfully when sky is dark.
      densityCurve: [
        { t: 0.00, value: 0.4 },   // dawn — fading
        { t: 0.25, value: 0.15 },  // day — barely visible
        { t: 0.50, value: 0.5 },   // dusk — emerging
        { t: 0.75, value: 1.0 },   // night — full
      ],
      twinkle: true,
    },
    // Lunar dust horizontalDrift particle removed (round 6 review):
    // Moon has no atmosphere, so floating dust isn't realistic; the white
    // particles were also reading as misplaced stars in the regolith area.
  ],

  celestials: [
    {
      id: 'earth',
      // 'earth' kind triggers the renderer's Earth-specific path: blue ocean
      // body + stylised continent shapes (Africa/Europe/Americas/Madagascar) +
      // ice caps + atmospheric halo. Per Moon point 6 (round 6 review).
      kind: 'earth',
      // Earth in the lunar sky — large, blue-white, always visible
      xPct: 0.78,
      yPct: 0.18,
      radius: 28,
      colorCurve: [
        { t: 0.00, color: '#5b8fc9' },
        { t: 0.25, color: '#7aa9d9' },
        { t: 0.50, color: '#4d7ab8' },
        { t: 0.75, color: '#3a5e95' },
      ],
      glowCurve: [
        { t: 0.00, value: 0.4 },
        { t: 0.25, value: 0.6 },
        { t: 0.50, value: 0.5 },
        { t: 0.75, value: 0.3 },
      ],
    },
  ],

  // Re-tints applied to existing gameplay elements when this world is active.
  // Engine semantics preserved (orange L / cyan R), but their *glow* picks up
  // the world's mood. Pipe palette adjusted within the navy/blue family.
  palette: {
    pipeWall: '#10355c',       // unchanged — locked semantic
    pipeEdge: '#7ac0e8',       // unchanged — locked semantic
    // Per-world dot tints. Hue family preserved (warm L / cool R) — only
    // chroma + lightness flex within ±15% so identity stays instantly readable.
    // Moon leans cooler/icier to match starlit palette.
    // WARM/COOL palette — locked across all worlds (see Q2 sign-off).
    // Amber + ice. Lightness/chroma flex per-world; hue family stays warm-L/cool-R.
    dotL: '#FFB13B',           // amber
    dotR: '#7FE5E8',           // ice
    dividerGlowL: '#FFB13B',
    dividerGlowR: '#7FE5E8',
    bgFlash: '#1c0418',
  },
};
