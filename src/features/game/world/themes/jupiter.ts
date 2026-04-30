/**
 * Jupiter — banded · turbulent · alien · ×1.5 score · heavy gravity
 *
 * v0.7-worlds — third WorldTheme. Conforms to types.ts v0.7 schema.
 * Frozen `as const`. Static. Never mutated per-frame.
 *
 * Vantage: floating in upper atmosphere. No ground; you're inside the storm.
 * The "world" is four horizontal cloud bands stretching to a curved horizon.
 *
 * ToD reinterpretation:
 *   t=0.00  DAWN   storm approaching   → turbulence rising, deeper colors
 *   t=0.25  DAY    calm laminar bands  → cream/ochre, clearest read
 *   t=0.50  DUSK   GRS crossing        → red spot at peak, warmest light
 *   t=0.75  NIGHT  shadow side          → dark amber, lightning, aurora
 *
 * Bands (top → bottom, all `kind: 'cloudBand'`). Counter-drift on alternating
 * bands sells zonal shear. Streaks per band increase toward the foreground
 * (4 → 7) — closer to the player = more visible motion. Generous sky strip
 * (0.0–0.22) above topmost band gives aurora and GRS-approach visual room.
 *
 *   farBand2   yPct 0.22  height 0.20  parallax 0.10  drift -0.5  4 streaks
 *   midBand2   yPct 0.41  height 0.20  parallax 0.32  drift  0.7  5 streaks
 *   nearBand1  yPct 0.60  height 0.20  parallax 0.50  drift -0.9  6 streaks
 *   nearBand2  yPct 0.79  height 0.21  parallax 0.85  drift  1.1  7 streaks
 *
 * Particles:
 *   stormCells   6  amorphous dark cloud cells riding mid bands
 *   shearMotes  18  fast small motes with sinusoidal vertical wobble
 *   aurora       1  full-width green/violet wash at top of sky, night-only
 *   lightning    6  rare bright flashes with bolt + halo + bloom
 *
 * Celestials:
 *   greatRedSpot — `gasGiantSpot`, drifts off-screen-left → centre at dusk
 *                  → off-screen-right at night. Renders OVER bands + cells.
 *
 * Cycle: 'atmospheric' (40/10/40/10).
 *
 * Round-7 deltas (from earlier v0.5 silhouette+storm-bands stub):
 *   - 6 silhouette bands → 4 cloudBands with festoon edges + interior streaks
 *   - storm-eye GRS → gasGiantSpot (radial body, concentric arcs, halo, highlight)
 *   - Added stormClouds, shearMotes, aurora, lightning (full v0.7 ingest)
 *   - Removed Io / Europa moons (not in iteration tool design)
 *   - Removed sun (Jovian sun is occluded by haze at game scale)
 *   - Sky stops rebuilt against iteration-tool reference
 */

import type { WorldTheme } from '../types';

export const jupiterTheme = {
  id: 'jupiter',
  label: 'Jupiter',
  tagline: 'banded · turbulent · alien',
  gravityMul: 1.5,
  scoreMul: 1.5,
  cycleProfile: 'atmospheric',

  // ─── SKY — only top ~22% visible, rest covered by bands ─────────────────
  sky: {
    topCurve: [
      { t: 0.0, color: '#3a2820' }, // dawn — deep dusty rust
      { t: 0.25, color: '#a87248' }, // day  — warm caramel
      { t: 0.5, color: '#5a2820' }, // dusk — deep maroon-rust
      { t: 0.75, color: '#0a0608' }, // night — near-black with violet hint
    ],
    midCurve: [
      { t: 0.0, color: '#5a3a28' },
      { t: 0.25, color: '#c89868' }, // day  — cream-ochre
      { t: 0.5, color: '#8a3018' }, // dusk — burnt sienna
      { t: 0.75, color: '#1a0a14' }, // night — deep plum-black
    ],
    bottomCurve: [
      { t: 0.0, color: '#7a5a40' },
      { t: 0.25, color: '#d8b078' }, // day  — pale cream haze blending into top band
      { t: 0.5, color: '#a04830' }, // dusk — golden rust
      { t: 0.75, color: '#2a1820' }, // night — deep ember
    ],
  },

  // ─── BANDS — 4 cloudBands stacked to fill the canvas ────────────────────
  bands: [
    {
      id: 'farBand2',
      kind: 'cloudBand',
      yPct: 0.22,
      heightPct: 0.2,
      parallax: 0.1,
      turbulence: 0.45,
      driftSpeed: -0.5, // counter-drift sells shear
      streaks: 4,
      colorCurve: [
        { t: 0.0, color: '#7a5230' },
        { t: 0.25, color: '#d4a070' }, // day — warmer cream-ochre
        { t: 0.5, color: '#a86038' },
        { t: 0.75, color: '#1c1010' },
      ],
      streakCurve: [
        { t: 0.0, color: '#3a2818' },
        { t: 0.25, color: '#4a2e18' },
        { t: 0.5, color: '#4a1e10' },
        { t: 0.75, color: '#080404' },
      ],
    },
    {
      id: 'midBand2',
      kind: 'cloudBand',
      yPct: 0.41,
      heightPct: 0.2,
      parallax: 0.32,
      turbulence: 0.55,
      driftSpeed: 0.7,
      streaks: 5,
      colorCurve: [
        { t: 0.0, color: '#4a2818' },
        { t: 0.25, color: '#e0b070' }, // day — pale cream zone
        { t: 0.5, color: '#a04020' },
        { t: 0.75, color: '#100808' },
      ],
      streakCurve: [
        { t: 0.0, color: '#1a0c08' },
        { t: 0.25, color: '#5a3818' },
        { t: 0.5, color: '#3a1008' },
        { t: 0.75, color: '#000000' },
      ],
    },
    {
      id: 'nearBand1',
      kind: 'cloudBand',
      yPct: 0.6,
      heightPct: 0.2,
      parallax: 0.5,
      turbulence: 0.65,
      driftSpeed: -0.9,
      streaks: 6,
      colorCurve: [
        { t: 0.0, color: '#2e1810' }, // dawn — deep brown
        { t: 0.25, color: '#3a1810' }, // day  — deep mahogany
        { t: 0.5, color: '#3e1008' }, // dusk — bloody rust
        { t: 0.75, color: '#0a0404' },
      ],
      streakCurve: [
        { t: 0.0, color: '#0a0404' },
        { t: 0.25, color: '#1a0c04' },
        { t: 0.5, color: '#1a0404' },
        { t: 0.75, color: '#000000' },
      ],
    },
    {
      // Foreground band — fastest scroll, most turbulent. "Where the player is."
      id: 'nearBand2',
      kind: 'cloudBand',
      yPct: 0.79,
      heightPct: 0.21,
      parallax: 0.85,
      turbulence: 0.75,
      driftSpeed: 1.1,
      streaks: 7,
      colorCurve: [
        { t: 0.0, color: '#3e2418' }, // dawn — warm dark brown
        { t: 0.25, color: '#5a3a20' }, // day  — warm mahogany
        { t: 0.5, color: '#4a1a10' }, // dusk — bloody rust
        { t: 0.75, color: '#180a08' }, // night — still dark but not pitch
      ],
      streakCurve: [
        { t: 0.0, color: '#1a0c08' },
        { t: 0.25, color: '#2a1808' },
        { t: 0.5, color: '#280a08' },
        { t: 0.75, color: '#080404' },
      ],
    },
  ],

  // ─── PARTICLES ───────────────────────────────────────────────────────────
  particles: [
    {
      // v0.7.1 — moved to top third (yMinPct 0.32 → 0.05, yMaxPct 0.72 → 0.30)
      // so they don't crowd the lower playing field. Count 6 → 8 to cover the
      // wider y-band evenly. Speed 0.55 → 1.1 for more atmospheric flow read.
      id: 'stormCells',
      kind: 'stormClouds',
      count: 8,
      speed: 1.1,
      yMinPct: 0.05,
      yMaxPct: 0.3,
      densityCurve: [
        { t: 0.0, value: 0.65 }, // dawn — visible
        { t: 0.25, value: 0.95 }, // day  — full
        { t: 0.5, value: 0.75 }, // dusk
        { t: 0.75, value: 0.3 }, // night — sparse, lightning dominates
      ],
      // Mid-tone for cumulus body; renderer derives lightTint/darkTint via lerp.
      colorCurve: [
        { t: 0.0, color: '#8a5a40' }, // dawn — warm rust-tan
        { t: 0.25, color: '#b48868' }, // day  — warm cream-tan
        { t: 0.5, color: '#c88058' }, // dusk — warm burning orange
        { t: 0.75, color: '#4a3a30' }, // night — dim warm grey
      ],
    },
    {
      // v0.7.1 — bigger + more visible, confined to bottom third so the
      // central playfield (where dots fall through pipes) stays clear.
      // Storm clouds occupy the top third; motes the bottom third —
      // symmetrical atmospheric framing of the gameplay zone.
      // sizeRange [0.6, 1.6] → [2.5, 5.0] (≈3× larger)
      // yMinPct 0.20 → 0.67 (top of bottom third)
      id: 'shearMotes',
      kind: 'shearMotes',
      count: 18,
      speed: 1.6,
      sizeRange: [2.5, 5.0],
      yMinPct: 0.67,
      yMaxPct: 0.95,
      densityCurve: [
        { t: 0.0, value: 0.55 },
        { t: 0.25, value: 0.85 },
        { t: 0.5, value: 0.75 },
        { t: 0.75, value: 0.2 }, // night — sparse so lightning dominates
      ],
      colorCurve: [
        { t: 0.0, color: '#bc9070' }, // dawn — soft warm dust
        { t: 0.25, color: '#e8d4a8' }, // day  — soft cream
        { t: 0.5, color: '#e8a878' }, // dusk — warm catch-light
        { t: 0.75, color: '#5a4030' }, // night — dim
      ],
    },
    {
      id: 'aurora',
      kind: 'aurora',
      densityCurve: [
        { t: 0.0, value: 0.0 },
        { t: 0.25, value: 0.0 },
        { t: 0.5, value: 0.25 }, // dusk — beginning to glow
        { t: 0.75, value: 1.0 }, // night — full
      ],
      colorTopCurve: [
        { t: 0.0, color: '#1a3a30' },
        { t: 0.25, color: '#1a3a30' },
        { t: 0.5, color: '#2a8068' }, // dusk — emerald
        { t: 0.75, color: '#3aa888' }, // night — vivid green
      ],
      colorBotCurve: [
        { t: 0.0, color: '#2a1a40' },
        { t: 0.25, color: '#2a1a40' },
        { t: 0.5, color: '#5a3088' }, // dusk — violet hint
        { t: 0.75, color: '#7848b8' }, // night — vivid violet
      ],
    },
    {
      // v0.7.1 — count 6 → 3. Halves simultaneous flash slots; with the
      // 8s cycle that's now ~1 flash per ~2.5s instead of ~1.3s.
      id: 'lightning',
      kind: 'lightning',
      count: 3,
      densityCurve: [
        { t: 0.0, value: 0.1 }, // dawn — distant residual storm
        { t: 0.25, value: 0.0 }, // day  — calm
        { t: 0.5, value: 0.4 }, // dusk — building
        { t: 0.75, value: 1.0 }, // night — full storm
      ],
    },
  ],

  // ─── CELESTIALS ──────────────────────────────────────────────────────────
  celestials: [
    {
      // Great Red Spot — drifts across the frame at dusk, peaking centred
      // around the dusk→night transition. Sized to feel "huge but not
      // all-consuming" — about 40% of frame width.
      // v0.7.1 — radius 70 → 38 and y position 0.5 → 0.22 so the GRS sits
      // up near the storm-cloud band rather than dominating the centre of
      // the playing field. Still the signature dusk moment, but no longer
      // crowds the lanes where dots fall.
      id: 'greatRedSpot',
      kind: 'gasGiantSpot',
      radius: 38, // ry; rx = radius × aspectRatio
      aspectRatio: 1.35,
      xPct: 0.5, // fallback; xCurve drives it
      yPct: 0.22, // sits up in the storm-cloud band region
      xCurve: [
        // Trajectory revised so the wrap (rawT 0.75 → 1.0) stays entirely
        // off-screen-left — both night and the next dawn anchor sit at
        // ~-0.35 / -0.4. Without this, the previous night value of 1.05
        // (off-right) lerped back to -0.4 across the wrap quarter, dragging
        // the GRS visibly across mid-frame during night-into-dawn with full
        // glow. Narrative now: GRS approaches from haze on the left at dawn,
        // emerges and centres at dusk (signature moment), then retreats
        // back into the same left-side haze as night falls.
        { t: 0.0, value: -0.4 }, // dawn  — far off-screen left
        { t: 0.25, value: -0.25 }, // day   — still off-screen, approaching
        { t: 0.5, value: 0.5 }, // dusk  — centred (signature moment)
        { t: 0.75, value: -0.35 }, // night — withdrawn off-screen left
      ],
      // Slight arc — sits lower at dawn (off-screen anyway), rises to a
      // peak at dusk for the signature centring moment, descends again at
      // night. Subtle (max 8% vis_h variation) — sells "drifting up + over
      // + back down" without becoming a noticeable bounce.
      yCurve: [
        { t: 0.0, value: 0.26 }, // dawn  — low (off-screen)
        { t: 0.25, value: 0.2 }, // day   — rising
        { t: 0.5, value: 0.18 }, // dusk  — peak (signature moment)
        { t: 0.75, value: 0.24 }, // night — descending (off-screen)
      ],
      colorCurve: [
        { t: 0.0, color: '#8a3020' }, // dawn — muted (off-screen anyway)
        { t: 0.25, color: '#a04028' }, // day  — terracotta
        { t: 0.5, color: '#c84020' }, // dusk — vivid signature red
        { t: 0.75, color: '#5a1810' }, // night — deep ember
      ],
      rimCurve: [
        { t: 0.0, color: '#3a1410' },
        { t: 0.25, color: '#4a1810' },
        { t: 0.5, color: '#6a1810' },
        { t: 0.75, color: '#1a0808' },
      ],
      glowCurve: [
        { t: 0.0, value: 0.6 },
        { t: 0.25, value: 0.7 },
        { t: 0.5, value: 1.0 }, // dusk — full presence
        { t: 0.75, value: 0.85 },
      ],
    },
  ],

  // ─── PALETTE (game overlay — locked navy/ice family) ─────────────────────
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
