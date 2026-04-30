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
    // Reduced from 6 to 4 in round 7 (layer-count audit). Cut farBand1 (top
    // narrow cream deck) and midBand1 (primary ochre belt). Remaining bands
    // retuned to tile evenly across the band region with each ~20% of canvas.
    // Generous sky strip (0–0.22) above the topmost band gives aurora and
    // GRS-approach more visual room.
    {
      // farBand2 — distant ochre/cream zone (now topmost band)
      id: 'farBand2',
      kind: 'cloudBand',
      yPct: 0.22,
      heightPct: 0.20,
      parallax: 0.10,
      turbulence: 0.45,
      driftSpeed: -0.5,        // counter-drift sells shear
      // Streak density follows a top→middle→bottom curve: SPARSE at the top
      // and bottom of the band stack, DENSE in the middle. Top band gets
      // just a couple of fine streaks so it reads as a clean horizon.
      // Per round 8 line-density pass.
      streaks: 2,
      colorCurve: [
        { t: 0.00, color: '#7a5230' }, // dawn
        { t: 0.25, color: '#d4a070' }, // day — warmer cream-ochre (lifted from #a06830 — was too dark for topmost)
        { t: 0.50, color: '#a86038' }, // dusk
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
      // midBand2 — rust/cream belt, hosts the GRS visually at yPct 0.50
      id: 'midBand2',
      kind: 'cloudBand',
      yPct: 0.41,
      heightPct: 0.20,
      parallax: 0.32,
      turbulence: 0.55,
      driftSpeed: 0.7,
      // Mid-band — DENSE streaks. Sits at the eye-level zone of the band
      // stack where atmospheric flow detail reads strongest. Per round 8.
      streaks: 9,
      colorCurve: [
        { t: 0.00, color: '#4a2818' }, // dawn
        { t: 0.25, color: '#e0b070' }, // day — pale cream zone
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
      // nearBand1 — deep brown turbulent belt
      id: 'nearBand1',
      kind: 'cloudBand',
      yPct: 0.60,
      heightPct: 0.20,
      parallax: 0.50,
      turbulence: 0.65,
      driftSpeed: -0.9,
      // Lower-mid band — DENSE streaks. Together with midBand2 above this
      // forms the dense middle section of the streak-density curve.
      streaks: 9,
      colorCurve: [
        { t: 0.00, color: '#2e1810' }, // dawn — deep brown
        { t: 0.25, color: '#3a1810' }, // day — deep mahogany
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
      // nearBand2 — foreground band, fills the bottom of the frame.
      // "Where the player is." Distinguished from nearBand1 above by being
      // SLOWER (lower drift), DARKER (deeper mahogany day-tone for contrast
      // against nearBand1's #3a1810), and MORE TEXTURED (denser streaks)
      // — same role as Earth's foreground hill or Moon's regolith plain.
      // Per round-7 100% pass.
      id: 'nearBand2',
      kind: 'cloudBand',
      yPct: 0.79,
      heightPct: 0.21,
      parallax: 0.85,
      turbulence: 0.75,
      driftSpeed: 0.4,         // slower — feels "near", not racing past
      // Foreground — SPARSE streaks. Bottom edge of the streak-density curve;
      // just a couple of low-key streaks so the foreground reads as a calm
      // anchor and doesn't compete with the dense mid bands above.
      // (Was 10 in round 7 — dropped to 2 in round 8 line-density pass.)
      streaks: 2,
      colorCurve: [
        { t: 0.00, color: '#2a1810' }, // dawn — deeper than nearBand1 above
        { t: 0.25, color: '#3a2010' }, // day — darkest mahogany (anchors foreground)
        { t: 0.50, color: '#321008' }, // dusk — deeper bloody rust
        { t: 0.75, color: '#0c0606' }, // night — near-black foreground
      ],
      streakCurve: [
        { t: 0.00, color: '#0a0604' },
        { t: 0.25, color: '#1a0c04' },
        { t: 0.50, color: '#180604' },
        { t: 0.75, color: '#040202' },
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
      //
      // Round 8 — storm-peak progression on TWO axes (per design feedback):
      //   colour:  light at dawn/day, DARK at dusk (storm peak), warming at night
      //   size:    small at dawn/day, LARGE at dusk, medium at night
      // Cell COUNT is intentionally held constant across ToD — cells should
      // only enter/leave the frame by drifting at the edges, never pop in or
      // out of existence on screen. densityCurve below is retained for
      // future use / extreme-low-density bail; it does NOT modulate count.
      id: 'stormCells',
      kind: 'stormClouds',
      count: 8,
      speed: 0.55,
      // Storm cells live in the TOP HALF — sit in the sky strip and topmost
      // bands, with the rest of the frame left clear for the streak/lines mid
      // section, motes below the dots, and a clear foreground anchor.
      // Lightning bolts (anchored to these cells via computeStormCellPositions)
      // extend downward from each cell, so cells riding high makes the bolts
      // visible against the dimmer mid/lower bands at night. Per round 8.
      yMinPct: 0.12,
      yMaxPct: 0.45,
      densityCurve: [
        // Held above the StormClouds early-bail threshold (0.05) at every
        // ToD so cells render through the whole cycle. No longer tied to
        // visible count (per the comment above).
        { t: 0.00, value: 1.00 },
        { t: 0.25, value: 1.00 },
        { t: 0.50, value: 1.00 },
        { t: 0.75, value: 1.00 },
      ],
      sizeMulCurve: [
        // Per-cell radius multiplier. Storm peak = larger cumulus.
        { t: 0.00, value: 0.85 },  // dawn
        { t: 0.25, value: 0.70 },  // day — small fair-weather wisps
        { t: 0.50, value: 1.40 },  // dusk — towering storm domes
        { t: 0.75, value: 1.05 },  // night — still substantial
      ],
      // Mid-tone for cumulus body; renderer derives lightTint (highlight) and
      // darkTint (shadow) from this via lerpHex. Hue/value progression keeps
      // dawn/day warm and bright, drops to a bruised storm-grey at dusk, and
      // warms back up through night.
      colorCurve: [
        { t: 0.00, color: '#a07858' }, // dawn — warm sandy tan (light, calm)
        { t: 0.25, color: '#d4b088' }, // day — bright cream cumulus
        { t: 0.50, color: '#3a2820' }, // dusk — STORM thunderhead, dark bruised brown
        { t: 0.75, color: '#5a4838' }, // night — medium warm grey, lightning lights it up
      ],
    },
    {
      // Foreground motes — fast small particles drifting through the BOTTOM
      // strip of the frame, below the dot row. Round 7 dropped them from
      // Jupiter as redundant with the band streaks; round 8 reintroduces them
      // for the foreground only, since with streaks now confined to the
      // middle bands (sparse top + bottom) the foreground band reads as
      // empty without some flow detail at the player's eye level.
      //
      // Constraint: motes never appear above halfway. yMinPct 0.70 sits
      // below the dot row (≈ yPct 0.67 in the iteration tool) so they
      // never collide with the dots. yMaxPct 0.95 keeps them off the very
      // bottom edge.
      id: 'foregroundMotes',
      kind: 'shearMotes',
      count: 30,
      speed: 1.0,
      yMinPct: 0.70,
      yMaxPct: 0.95,
      sizeRange: [0.5, 1.4],
      densityCurve: [
        { t: 0.00, value: 0.60 }, // dawn
        { t: 0.25, value: 1.00 }, // day — full
        { t: 0.50, value: 0.85 }, // dusk
        { t: 0.75, value: 0.45 }, // night — quieter, lightning dominates
      ],
      colorCurve: [
        { t: 0.00, color: '#e8c890' }, // dawn — warm cream
        { t: 0.25, color: '#fff5d8' }, // day — pale cream
        { t: 0.50, color: '#ffd098' }, // dusk — warm peach
        { t: 0.75, color: '#a89890' }, // night — muted warm grey
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
      // Sits in the top third of the frame, centred on the topmost cloud
      // band (farBand2 starts at yPct 0.22). GRS centre at yPct 0.22 puts
      // its body roughly between y 88 and 228 — well inside the upper
      // third while still crossing the top band region. Per round 8.
      xPct: 0.5,
      yPct: 0.22,
      xCurve: [
        // Widened so GRS is visible across most of the cycle (parity with
        // Earth's sun and Moon's earth-from-Moon). Centred dusk peak still
        // the signature moment; day shows it on the left, night on the right.
        { t: 0.00, value: -0.15 }, // dawn — just off-left, about to enter
        { t: 0.25, value: 0.20 },  // day — visible on the left side
        { t: 0.50, value: 0.50 },  // dusk — centered (signature moment)
        { t: 0.75, value: 0.85 },  // night — visible on the right side
      ],
      yCurve: [
        // Constant in the top third across the cycle. Was 0.50 in round 7;
        // raised to 0.22 in round 8 so the GRS reads as a feature in the
        // upper sky/top-band region rather than centred on the frame.
        { t: 0.00, value: 0.22 },
        { t: 0.25, value: 0.22 },
        { t: 0.50, value: 0.22 },
        { t: 0.75, value: 0.22 },
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
