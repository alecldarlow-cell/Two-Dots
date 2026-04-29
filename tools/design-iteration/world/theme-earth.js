/**
 * Earth — golden hour · alive · canonical · ×1.0 score · standard gravity
 *
 * Bands (far → near):
 *   0 sky            full-bleed gradient — research-based real-sky colours
 *   1 farMountains   distant forested ridge (low contrast)
 *   2 midMountains   mid forested ridge (deeper green)
 *   3 rollingHills   gentle rolling-hills silhouette (replaces flat plain)
 *   4 nearHill       single foreground hill (closest land — anchors the player)
 *
 * Particles: clouds (cumulus, day-dominant), birds (dawn/dusk, larger now),
 *            stars (night only, sparse and dim — atmosphere scatters them out).
 *
 * Celestials:
 *   - sun  arcs across the sky during day (rises east → noon → sets west).
 *          Visible throughout day. Hidden at night.
 *   - moon arcs across the sky during night. Hidden during day.
 *
 * Cycle: 'atmospheric' — day 40% / dusk 10% / night 40% / dawn 10%.
 * Renderer applies this; theme files just declare the profile.
 */

window.EarthTheme = {
  id: 'earth',
  label: 'Earth',
  tagline: 'golden hour · alive · canonical',
  gravityMul: 1.0,
  scoreMul: 1.0,
  cycleProfile: 'atmospheric',

  /*
   * Sky colours rebuilt against real sky photography.
   * Reasoning per stop:
   *   DAWN  top: deep indigo → pre-sunrise dome
   *         mid: violet/mauve transition
   *         bot: warm peach-pink AT horizon (sunrise glow)
   *   DAY   top: rich saturated blue
   *         mid: classic mid-blue
   *         bot: pale haze near horizon (atmospheric Rayleigh)
   *   DUSK  top: deepening violet-blue
   *         mid: hot pink/magenta band
   *         bot: golden-orange AT horizon (the "golden hour" core)
   *   NIGHT top: near-black navy
   *         mid: deep navy
   *         bot: very slight warm tint (light pollution / faded ember)
   */
  sky: {
    topCurve: [
      { t: 0.00, color: '#2b3050' }, // dawn — deep indigo
      { t: 0.25, color: '#5a8fc4' }, // day — rich blue
      { t: 0.50, color: '#3a3a6a' }, // dusk — violet-blue
      { t: 0.75, color: '#070a1a' }, // night — near-black
    ],
    midCurve: [
      { t: 0.00, color: '#604f6e' }, // dawn — violet/mauve
      { t: 0.25, color: '#a8c8e0' }, // day — mid-blue
      { t: 0.50, color: '#c8688c' }, // dusk — hot pink
      { t: 0.75, color: '#0e1428' }, // night — deep navy
    ],
    bottomCurve: [
      { t: 0.00, color: '#e8a896' }, // dawn — peach-pink at horizon (sunrise)
      { t: 0.25, color: '#e8eef0' }, // day — pale haze
      { t: 0.50, color: '#f0a060' }, // dusk — golden-orange (canonical)
      { t: 0.75, color: '#181828' }, // night — slight warm tint
    ],
  },

  bands: [
    {
      id: 'farMountains',
      kind: 'silhouette',
      yPct: 0.40,
      heightPct: 0.55,
      parallax: 0.08,
      profile: 'mountains',
      colorCurve: [
        { t: 0.00, color: '#4a5a52' }, // dawn — cool moss-grey
        { t: 0.25, color: '#6b8870' }, // day — distant forest haze
        { t: 0.50, color: '#3e4a4a' }, // dusk — deep mossy dark
        { t: 0.75, color: '#0c1414' }, // night — near-black green
      ],
    },
    {
      id: 'midMountains',
      kind: 'silhouette',
      yPct: 0.55,
      heightPct: 0.40,
      parallax: 0.20,
      profile: 'mountains',
      colorCurve: [
        { t: 0.00, color: '#2f3a35' }, // dawn
        { t: 0.25, color: '#48604c' }, // day — closer forest green
        { t: 0.50, color: '#23302a' }, // dusk — deep forest
        { t: 0.75, color: '#060a08' }, // night
      ],
    },
    {
      // Rolling hills — gentle low-frequency sine profile, replaces the flat
      // nearPlain stripe. Sits in front of mid mountains, behind nearHill.
      // Internal vertical gradient gives it depth (lighter top, darker bottom).
      id: 'rollingHills',
      kind: 'silhouette',
      yPct: 0.68,
      heightPct: 0.32,
      parallax: 0.40,
      profile: 'hills',
      colorCurve: [
        { t: 0.00, color: '#5a4438' }, // dawn — warm earth shadow
        { t: 0.25, color: '#7c6048' }, // day — terracotta-warm
        { t: 0.50, color: '#603428' }, // dusk — deep terracotta
        { t: 0.75, color: '#0a0a14' }, // night — near-black
      ],
      // Internal gradient: top edge slightly brighter (light catch),
      // bottom darker. Renderer composites this within the silhouette.
      gradientCurve: [
        { t: 0.00, color: '#7a5a4a' },
        { t: 0.25, color: '#a0805e' },
        { t: 0.50, color: '#7e4630' },
        { t: 0.75, color: '#14141e' },
      ],
    },
    {
      // Single foreground hill — the closest piece of land, "where the player
      // is standing". Lowest parallax-anchored thing, fastest scroll.
      id: 'nearHill',
      kind: 'silhouette',
      yPct: 0.82,
      heightPct: 0.18,
      parallax: 0.85,
      profile: 'singleHill',
      colorCurve: [
        { t: 0.00, color: '#3a2820' }, // dawn — dark earth
        { t: 0.25, color: '#4e3828' }, // day — deep terracotta
        { t: 0.50, color: '#3a1c14' }, // dusk — burnt sienna shadow
        { t: 0.75, color: '#04060c' }, // night — near-black
      ],
      gradientCurve: [
        { t: 0.00, color: '#523a2c' },
        { t: 0.25, color: '#6e4e36' },
        { t: 0.50, color: '#52281c' },
        { t: 0.75, color: '#0a0c14' },
      ],
    },
  ],

  particles: [
    {
      id: 'clouds',
      kind: 'clouds',
      count: 7,
      densityCurve: [
        { t: 0.00, value: 0.5 },  // dawn — partial
        { t: 0.25, value: 1.0 },  // day — full
        { t: 0.50, value: 0.7 },  // dusk — pink-tinged scattering
        { t: 0.75, value: 0.0 },  // night — invisible
      ],
      speed: 1.0,
      colorCurve: [
        { t: 0.00, color: '#e8c0b0' }, // dawn — peach-tinted
        { t: 0.25, color: '#ffffff' }, // day — bright white
        { t: 0.50, color: '#f8a888' }, // dusk — orange-tinged underbelly
        { t: 0.75, color: '#1f2a4a' }, // night (invisible due to density=0)
      ],
    },
    {
      id: 'birds',
      kind: 'birds',
      count: 10,
      densityCurve: [
        { t: 0.00, value: 1.0 }, // dawn peak
        { t: 0.25, value: 0.3 }, // day — sparse
        { t: 0.50, value: 0.9 }, // dusk peak
        { t: 0.75, value: 0.0 }, // night silent
      ],
      speed: 1.2,
      sizeMul: 2.2,              // ↑ bigger than before (was effectively ~1.0)
      colorCurve: [
        { t: 0.00, color: '#2a1f30' }, // dawn — silhouetted dark plum
        { t: 0.25, color: '#3a4558' }, // day — silhouetted blue-grey
        { t: 0.50, color: '#2a1828' }, // dusk — deep silhouette
        { t: 0.75, color: '#000000' }, // night
      ],
    },
    {
      // Stars — Earth has fewer/dimmer than Moon. Atmospheric scatter washes
      // them out. Only visible at night; fade through dusk.
      id: 'stars',
      kind: 'starfield',
      count: 50,                 // Moon has 80
      densityCurve: [
        { t: 0.00, value: 0.0 },
        { t: 0.25, value: 0.0 },
        { t: 0.50, value: 0.15 }, // dusk — faintest emerging
        { t: 0.75, value: 0.7 },  // night — visible but soft (atmospheric haze)
      ],
      twinkle: true,
      sizeMul: 0.85,             // smaller than Moon's
    },
  ],

  celestials: [
    {
      // SUN — arcs across the sky during day. Rises horizon-east at dawn,
      // peaks high overhead at midday, sets horizon-west at dusk, hidden at night.
      // xCurve / yCurve animate position across the cycle. Renderer interpolates
      // via sampleScalarCurve. yPct measured top-down (smaller = higher in sky).
      id: 'sun',
      kind: 'sun',
      radius: 26,
      // Position curves — fall back to xPct/yPct if unsupported.
      xCurve: [
        { t: 0.00, value: 0.10 }, // dawn — emerging on left horizon
        { t: 0.25, value: 0.50 }, // day — high overhead, centered
        { t: 0.50, value: 0.90 }, // dusk — setting on right horizon
        { t: 0.75, value: 1.30 }, // night — off-screen right (invisible)
      ],
      yCurve: [
        { t: 0.00, value: 0.55 }, // dawn — at horizon
        { t: 0.25, value: 0.22 }, // day — high in sky (clear of notch ~95px)
        { t: 0.50, value: 0.55 }, // dusk — at horizon
        { t: 0.75, value: 0.65 }, // night — below horizon
      ],
      // Fallback static position (used if renderer doesn't support curves)
      xPct: 0.50,
      yPct: 0.20,
      colorCurve: [
        { t: 0.00, color: '#ffd0a0' }, // dawn — soft warm
        { t: 0.25, color: '#fff8e0' }, // day — bright white-gold
        { t: 0.50, color: '#ff9050' }, // dusk — saturated orange (canonical)
        { t: 0.75, color: '#603848' }, // night (hidden via glow=0)
      ],
      glowCurve: [
        { t: 0.00, value: 0.85 }, // dawn — strong horizon glow
        { t: 0.25, value: 0.55 }, // day — bright but not overwhelming
        { t: 0.50, value: 1.00 }, // dusk — strongest (canonical reference)
        { t: 0.75, value: 0.00 }, // night — hidden
      ],
    },
    {
      // MOON — arcs across the sky during night. Hidden during day & dusk.
      // Pale, cool, soft glow. Smaller than the sun.
      id: 'moon',
      kind: 'moon',
      radius: 20,
      xCurve: [
        { t: 0.00, value: 0.75 }, // dawn — setting on right (still visible briefly)
        { t: 0.25, value: 1.30 }, // day — off-screen
        { t: 0.50, value: -0.20 }, // dusk — about to rise on left
        { t: 0.75, value: 0.50 }, // night — high overhead
      ],
      yCurve: [
        { t: 0.00, value: 0.55 }, // dawn — low on horizon
        { t: 0.25, value: 0.65 }, // day — below horizon
        { t: 0.50, value: 0.55 }, // dusk — about to rise
        { t: 0.75, value: 0.25 }, // night — high in sky (clear of notch)
      ],
      xPct: 0.50,
      yPct: 0.20,
      colorCurve: [
        { t: 0.00, color: '#d8d2c0' }, // dawn — pale fading
        { t: 0.25, color: '#cccccc' }, // day (hidden)
        { t: 0.50, color: '#d8d2c0' }, // dusk
        { t: 0.75, color: '#f0ebd8' }, // night — pale warm cream
      ],
      glowCurve: [
        { t: 0.00, value: 0.30 }, // dawn — fading
        { t: 0.25, value: 0.00 }, // day — hidden
        { t: 0.50, value: 0.40 }, // dusk — emerging
        { t: 0.75, value: 0.85 }, // night — full glow
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
    bgFlash: '#2a0814',
  },
};
