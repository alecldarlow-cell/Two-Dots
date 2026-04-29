/**
 * Jupiter — banded · turbulent · alien · ×1.5 score · heavy gravity
 *
 * Vantage: floating in upper atmosphere. No ground; you're inside the storm.
 * The "world" is six horizontal cloud bands stretching to a curved horizon.
 *
 * ToD reinterpretation:
 *   t=0.00  DAWN   storm approaching   → turbulence rising, deeper colors
 *   t=0.25  DAY    calm laminar bands  → cream/ochre, clearest read
 *   t=0.50  DUSK   GRS crossing        → red spot at peak, warmest light
 *   t=0.75  NIGHT  shadow side          → dark amber, lightning, aurora
 *
 * Bands (far → near):
 *   0 farBand1   highest cloud deck (top of frame)
 *   1 farBand2   high cream zone
 *   2 midBand1   ochre belt
 *   3 midBand2   rust band
 *   4 nearBand1  deep brown turbulent zone
 *   5 nearBand2  near foreground (fastest scroll)
 *
 * Particles:
 *   shearMotes   fast small motes drifting horizontally inside bands (always)
 *   lightning    rare bright flashes deep in clouds at night
 *   aurora       subtle green/violet wash at top of frame, night-only
 *
 * Celestials:
 *   greatRedSpot — gas giant spot, drifts left→right across dusk into night
 *
 * Cycle: 'atmospheric' — day 40% / dusk 10% / night 40% / dawn 10%.
 */

window.JupiterTheme = {
  id: 'jupiter',
  label: 'Jupiter',
  tagline: 'banded · turbulent · alien',
  gravityMul: 1.5,
  scoreMul: 1.5,
  cycleProfile: 'atmospheric',

  /*
   * Sky stops — Jupiter has no real "sky". The space ABOVE the highest cloud
   * deck is a thin amber/cream haze by day, deepening through dusk to a deep
   * rust at night. Top/mid/bot lerp gives a subtle vertical feel within the
   * narrow strip ABOVE band 0. Most of the frame is bands, so sky is
   * supporting cast not lead.
   */
  sky: {
    topCurve: [
      { t: 0.00, color: '#3a2820' }, // dawn — deep dusty rust
      { t: 0.25, color: '#a87248' }, // day — warm caramel
      { t: 0.50, color: '#5a2820' }, // dusk — deep maroon-rust
      { t: 0.75, color: '#0a0608' }, // night — near-black with violet hint
    ],
    midCurve: [
      { t: 0.00, color: '#5a3a28' }, // dawn
      { t: 0.25, color: '#c89868' }, // day — cream-ochre
      { t: 0.50, color: '#8a3018' }, // dusk — burnt sienna
      { t: 0.75, color: '#1a0a14' }, // night — deep plum-black
    ],
    bottomCurve: [
      { t: 0.00, color: '#7a5a40' }, // dawn — warm sand
      { t: 0.25, color: '#d8b078' }, // day — pale cream haze blending into top band
      { t: 0.50, color: '#a04830' }, // dusk — golden rust
      { t: 0.75, color: '#2a1820' }, // night — deep ember
    ],
  },

  bands: [
    {
      // farBand1 — highest, palest cream deck. Reads as distant cloud tops
      // catching the sun.
      id: 'farBand1',
      kind: 'cloudBand',
      yPct: 0.18,
      heightPct: 0.10,
      parallax: 0.05,
      turbulence: 0.45,        // boosted — distant cream zone with curling tops
      driftSpeed: 0.4,
      streaks: 3,
      colorCurve: [
        { t: 0.00, color: '#a07858' }, // dawn — dusty
        { t: 0.25, color: '#f0d4a0' }, // day — bright pale cream (more contrast)
        { t: 0.50, color: '#c88858' }, // dusk — warm
        { t: 0.75, color: '#2a1c1a' }, // night
      ],
      streakCurve: [
        { t: 0.00, color: '#7a5640' },
        { t: 0.25, color: '#8a6038' },
        { t: 0.50, color: '#7a3820' },
        { t: 0.75, color: '#1a0e10' },
      ],
    },
    {
      // farBand2 — cream-ochre boundary zone
      id: 'farBand2',
      kind: 'cloudBand',
      yPct: 0.27,
      heightPct: 0.10,
      parallax: 0.10,
      turbulence: 0.55,        // strong scalloped boundary
      driftSpeed: -0.5,        // counter-drift sells shear
      streaks: 4,
      colorCurve: [
        { t: 0.00, color: '#7a5230' }, // dawn
        { t: 0.25, color: '#a06830' }, // day — deeper ochre, more saturation
        { t: 0.50, color: '#8a4830' }, // dusk
        { t: 0.75, color: '#1c1010' }, // night
      ],
      streakCurve: [
        { t: 0.00, color: '#3a2818' },
        { t: 0.25, color: '#4a2e18' },
        { t: 0.50, color: '#4a1e10' },
        { t: 0.75, color: '#080404' },
      ],
    },
    {
      // midBand1 — primary ochre belt
      id: 'midBand1',
      kind: 'cloudBand',
      yPct: 0.36,
      heightPct: 0.13,
      parallax: 0.20,
      turbulence: 0.60,        // turbulent — closer to viewer
      driftSpeed: 0.7,
      streaks: 5,
      colorCurve: [
        { t: 0.00, color: '#5a3820' }, // dawn — deep rust
        { t: 0.25, color: '#704018' }, // day — deeper ochre/rust contrast
        { t: 0.50, color: '#702818' }, // dusk — deep red-brown
        { t: 0.75, color: '#180a0a' }, // night
      ],
      streakCurve: [
        { t: 0.00, color: '#2a1810' },
        { t: 0.25, color: '#3a2010' },
        { t: 0.50, color: '#3a1008' },
        { t: 0.75, color: '#000000' },
      ],
    },
    {
      // midBand2 — rust band, often where GRS sits visually
      id: 'midBand2',
      kind: 'cloudBand',
      yPct: 0.48,
      heightPct: 0.14,
      parallax: 0.32,
      turbulence: 0.65,
      driftSpeed: -0.9,
      streaks: 6,
      colorCurve: [
        { t: 0.00, color: '#4a2818' }, // dawn
        { t: 0.25, color: '#e0b070' }, // day — pale cream zone (high contrast vs midBand1)
        { t: 0.50, color: '#a04020' }, // dusk
        { t: 0.75, color: '#100808' }, // night
      ],
      streakCurve: [
        { t: 0.00, color: '#1a0c08' },
        { t: 0.25, color: '#5a3818' },
        { t: 0.50, color: '#3a1008' },
        { t: 0.75, color: '#000000' },
      ],
    },
    {
      // nearBand1 — deep brown turbulent zone
      id: 'nearBand1',
      kind: 'cloudBand',
      yPct: 0.61,
      heightPct: 0.17,
      parallax: 0.50,
      turbulence: 0.70,
      driftSpeed: 1.1,
      streaks: 7,
      colorCurve: [
        { t: 0.00, color: '#2e1810' }, // dawn — deep brown
        { t: 0.25, color: '#3a1810' }, // day — deep mahogany (was burnt umber, too light)
        { t: 0.50, color: '#3e1008' }, // dusk — bloody rust
        { t: 0.75, color: '#0a0404' }, // night
      ],
      streakCurve: [
        { t: 0.00, color: '#0a0404' },
        { t: 0.25, color: '#1a0c04' },
        { t: 0.50, color: '#1a0404' },
        { t: 0.75, color: '#000000' },
      ],
    },
    {
      // nearBand2 — closest band, fills the bottom of the frame.
      // This is "where the player is" — fastest scroll, most visible motion.
      id: 'nearBand2',
      kind: 'cloudBand',
      yPct: 0.78,
      heightPct: 0.22,
      parallax: 0.85,
      turbulence: 0.80,        // most turbulent — eye-level shear
      driftSpeed: -1.4,
      streaks: 8,
      colorCurve: [
        { t: 0.00, color: '#3e2418' }, // dawn — warm dark brown (was #1a0e08, too black)
        { t: 0.25, color: '#5a3a20' }, // day — warm mahogany (was #2a1408 — read as mountain silhouette)
        { t: 0.50, color: '#4a1a10' }, // dusk — bloody rust (was #28080a)
        { t: 0.75, color: '#180a08' }, // night — still dark but not pitch (was #040202)
      ],
      streakCurve: [
        { t: 0.00, color: '#1a0c08' },
        { t: 0.25, color: '#2a1808' },
        { t: 0.50, color: '#280a08' },
        { t: 0.75, color: '#080404' },
      ],
    },
  ],

  particles: [
    {
      // Storm cells — Jupiter-specific amorphous cloud cells (different
      // particle kind from Earth's 'clouds'). Many small ovals scattered with
      // no cumulus dome, elongated horizontally to feel stretched by the
      // zonal flow, no flat-bottom clip. Sit in the band region (not upper
      // sky) so they read as discrete storms riding ON the atmosphere.
      id: 'stormCells',
      kind: 'stormClouds',
      count: 6,
      speed: 0.55,
      // Ride the mid-to-near-band region — drifting through where the eye
      // already lives, not floating in the narrow strip above band 0.
      yMinPct: 0.32,
      yMaxPct: 0.72,
      densityCurve: [
        { t: 0.00, value: 0.65 },  // dawn — visible
        { t: 0.25, value: 0.95 },  // day — full
        { t: 0.50, value: 0.75 },  // dusk
        { t: 0.75, value: 0.30 },  // night — sparse, lightning dominates
      ],
      colorCurve: [
        { t: 0.00, color: '#6a3a28' }, // dawn — deep rust
        { t: 0.25, color: '#4a3828' }, // day — dark warm grey/brown thunderhead
        { t: 0.50, color: '#c8703a' }, // dusk — warm orange catching last light
        { t: 0.75, color: '#1a0e0e' }, // night — near-black smoke
      ],
    },
    {
      // Shear motes — small fast particles inside the cloud zone, rendered
      // as horizontally-stretched ellipses (motion blur). Count, colour and
      // night density tuned down (was 60 / bright cream / 0.5 night) so they
      // read as faint flow streaks rather than scattered stars. Per particle
      // cohesion pass (round 7 review).
      id: 'shearMotes',
      kind: 'shearMotes',
      count: 28,
      densityCurve: [
        { t: 0.00, value: 0.55 },
        { t: 0.25, value: 0.85 },
        { t: 0.50, value: 0.75 },
        { t: 0.75, value: 0.20 }, // night — sparse so lightning dominates
      ],
      speed: 1.6,
      sizeRange: [0.6, 1.6],
      yMinPct: 0.35,           // confined to band region
      yMaxPct: 0.92,
      colorCurve: [
        { t: 0.00, color: '#bc9070' }, // dawn — soft warm dust
        { t: 0.25, color: '#e8d4a8' }, // day — soft cream tinted toward bands (was bright #fff0c8 — read as stars)
        { t: 0.50, color: '#e8a878' }, // dusk — warm catch-light
        { t: 0.75, color: '#5a4030' }, // night — dim
      ],
    },
    {
      // Aurora — subtle green/violet wash at top, night-only.
      // Fades in through dusk, peaks at night, gone by dawn.
      id: 'aurora',
      kind: 'aurora',
      densityCurve: [
        { t: 0.00, value: 0.0 },
        { t: 0.25, value: 0.0 },
        { t: 0.50, value: 0.25 }, // dusk — beginning to glow
        { t: 0.75, value: 1.0 },  // night — full
      ],
      colorTopCurve: [
        { t: 0.00, color: '#1a3a30' },
        { t: 0.25, color: '#1a3a30' },
        { t: 0.50, color: '#2a8068' }, // dusk — emerald
        { t: 0.75, color: '#3aa888' }, // night — vivid green
      ],
      colorBotCurve: [
        { t: 0.00, color: '#2a1a40' },
        { t: 0.25, color: '#2a1a40' },
        { t: 0.50, color: '#5a3088' }, // dusk — violet hint
        { t: 0.75, color: '#7848b8' }, // night — vivid violet
      ],
    },
    {
      // Lightning — rare bright flashes deep in bands, night-only.
      // count = max simultaneous flash slots in the schedule.
      id: 'lightning',
      kind: 'lightning',
      count: 6,
      densityCurve: [
        { t: 0.00, value: 0.1 },  // dawn — distant residual storm
        { t: 0.25, value: 0.0 },  // day — calm
        { t: 0.50, value: 0.4 },  // dusk — building
        { t: 0.75, value: 1.0 },  // night — full storm
      ],
    },
  ],

  celestials: [
    {
      // Great Red Spot — drifts across the frame at dusk, peaking centered
      // around night. Treated as a celestial because it has its own arc.
      // Sized to feel "huge but not all-consuming" — about 40% of frame width.
      id: 'greatRedSpot',
      kind: 'gasGiantSpot',
      radius: 70,                // ry; rx = radius × aspectRatio
      aspectRatio: 1.35,          // wider than tall but eased from 1.6 (round 7 review — too stretched at frame size)
      // Sits roughly at midBand2 height
      xPct: 0.5,
      yPct: 0.50,
      xCurve: [
        { t: 0.00, value: -0.40 }, // dawn — far off-screen left
        { t: 0.25, value: -0.25 }, // day — still off-screen, approaching
        { t: 0.50, value: 0.50 },  // dusk — centered (signature moment)
        { t: 0.75, value: 1.05 },  // night — drifted off right edge
      ],
      yCurve: [
        { t: 0.00, value: 0.50 },
        { t: 0.25, value: 0.50 },
        { t: 0.50, value: 0.50 },
        { t: 0.75, value: 0.50 },
      ],
      colorCurve: [
        { t: 0.00, color: '#8a3020' }, // dawn — muted (off-screen anyway)
        { t: 0.25, color: '#a04028' }, // day — terracotta
        { t: 0.50, color: '#c84020' }, // dusk — vivid signature red
        { t: 0.75, color: '#5a1810' }, // night — deep ember
      ],
      rimCurve: [
        { t: 0.00, color: '#3a1410' },
        { t: 0.25, color: '#4a1810' },
        { t: 0.50, color: '#6a1810' },
        { t: 0.75, color: '#1a0808' },
      ],
      glowCurve: [
        { t: 0.00, value: 0.6 },
        { t: 0.25, value: 0.7 },
        { t: 0.50, value: 1.0 },  // dusk — full presence
        { t: 0.75, value: 0.85 },
      ],
    },
  ],

  palette: {
    // Pipe palette LOCKED to the cross-world navy+ice family. Claude Design's
    // proposal of warm cream pipes (#3a1810 / #e8c088) is parked pending
    // visibility check across the warm Jovian bands — discussed in round 7.
    pipeWall: '#10355c',
    pipeEdge: '#7ac0e8',
    // Warm/cool dot palette unchanged across all worlds.
    dotL: '#FFB13B',
    dotR: '#7FE5E8',
    dividerGlowL: '#FFB13B',
    dividerGlowR: '#7FE5E8',
    bgFlash: '#3a1408',
  },
};
