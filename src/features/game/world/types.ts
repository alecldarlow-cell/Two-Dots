/**
 * World system schema — the design ↔ engine contract.
 *
 * See docs/world-system.md §1 for the rationale and locked decisions.
 *
 * Schema changelog:
 *   v0.7 — Jupiter v0.7 ingest from iteration tool. New band kind:
 *          'cloudBand' (festoon top edge + internal shear streaks, with
 *          independent driftSpeed). New particle kinds: 'stormClouds'
 *          (amorphous cells riding mid bands), 'shearMotes' (fast
 *          horizontal motes with turbulent paths), 'aurora' (top-sky
 *          green/violet wash, night-only), 'lightning' (rare night
 *          flashes). New celestial kind: 'gasGiantSpot' (oblate vortex
 *          with concentric rim arcs, halo, drift across cycle). All
 *          additions are purely additive — existing kinds unchanged.
 *   v0.6 — `Celestial.kind: 'earth'` — Earth-from-Moon stylised body
 *          (blue ocean + Africa/Europe/Americas/Madagascar continents +
 *          polar ice caps + atmospheric halo + soft terminator). Triggers
 *          a dedicated render path that supersedes the abstract-blob
 *          'planet' rendering for the Moon's earth-in-sky celestial.
 *          phaseCurve is ignored for `kind: 'earth'` — the dedicated
 *          render path bakes its own static terminator.
 *   v0.5 — `Celestial.phaseCurve?` (terminator); `Celestial.xCurve?` /
 *          `yCurve?` (arcing celestials); `WorldTheme.cycleProfile` ('atmospheric'
 *          for plateau-weighted day/night, 'airless' for sharp transitions);
 *          `Band.gradientCurve?` on silhouettes (internal vertical shading);
 *          new band profiles 'mountains' | 'hills' | 'singleHill';
 *          new `ParticleSpec` kinds 'clouds' and 'birds';
 *          new `Celestial.kind: 'moon'`;
 *          optional `sizeMul?` on starfield.
 *   v0.3 — initial schema (sky / silhouette+plain+craters bands /
 *          starfield+horizontalDrift particles / planet+sun+storm-eye celestials).
 *
 * Locked semantics (do not relitigate without spec amendment):
 *   - ToD wrap: schema authors 4 stops at 0.00 / 0.25 / 0.50 / 0.75.
 *     t=1 wraps to t=0; renderer convention, not authored.
 *   - cycleProfile maps raw player time → curve-sample t. Plateau weighted
 *     (atmospheric: 40/10/40/10 day/dusk/night/dawn; airless: 47/3/47/3).
 *   - Position curves (xCurve/yCurve) sample raw t (continuous);
 *     color/glow/phase curves sample profile-eased t.
 *   - Particle `count` = fixed seeded positions (one-time at module load).
 *     `densityCurve` = per-particle alpha multiplier. Particles never
 *     pop in/out — they fade. (Cloud and bird density also fades; counts
 *     are the population ceiling, alpha drops to 0 outside their window.)
 *   - Coordinate units: yPct/heightPct are fractions of VIS_H. xPct is
 *     fraction of canvas width. Celestial `radius` is raw pixels.
 *     `horizontalDrift.speed` is px/sec; cloud/bird `speed` is a unitless
 *     multiplier.
 *   - Twinkle: independent random phase per star, base ~1Hz, deterministic
 *     seed at module-load.
 *   - Colour space: hex strings sRGB-encoded; renderer preprocesses to
 *     oklch numeric components at module-load. Per-frame interpolation
 *     runs in oklch on the worklet thread.
 *   - Visibility rule: `glow=0` hides the celestial body and halo entirely
 *     (Earth's sun goes glow=0 at night → body disappears, not just dims).
 *
 * Themes are defined `as const satisfies WorldTheme` and frozen — never
 * mutated per-frame.
 */

export type ColorStop = { t: number; color: string }; // t∈[0,1]
export type ScalarStop = { t: number; value: number };

/** Time-of-day cycle position. 0=dawn, 0.25=day, 0.5=dusk, 0.75=night, 1=back to dawn. */
export type ToD = number;

/**
 * Cycle profile — controls how raw player time maps to curve sample t.
 *   'atmospheric' — Earth-like. Day 40% / dusk 10% / night 40% / dawn 10%.
 *                   Smooth easing in/out of transitions. Plateaus hold curve t.
 *   'airless'     — Moon-like. Day 47% / dusk 3% / night 47% / dawn 3%.
 *                   Sharp horizon snap, no atmospheric scatter.
 */
export type CycleProfile = 'atmospheric' | 'airless';

export type SkyGradient = {
  topCurve: ColorStop[]; // 3 stops, top-of-sky colour over ToD
  midCurve: ColorStop[]; // 3 stops, mid-sky
  bottomCurve: ColorStop[]; // 3 stops, where sky meets horizon
};

/** Procedural shape generator for a silhouette band's top edge. */
export type SilhouetteProfile =
  | 'soft-craters' // Moon — far ridge — one octave, capped at 55% band height
  | 'cratered-horizon' // Moon — mid ridge — three octaves + crater dip events
  | 'mountains' // Earth — peaked Bezier ridge
  | 'hills' // Earth — gentle low-frequency rolling sine
  | 'singleHill' // Earth — one asymmetric rounded hump
  | 'storm-bands'; // Jupiter — TBD (stub fallback)

export type Band =
  | {
      id: string;
      kind: 'silhouette';
      yPct: number;
      heightPct: number;
      parallax: number;
      profile: SilhouetteProfile;
      colorCurve: ColorStop[];
      /** Optional internal vertical gradient inside the silhouette path
       *  (lighter top → base color at bottom). Adds depth so closer bands
       *  don't read as flat shapes. */
      gradientCurve?: ColorStop[];
    }
  | {
      id: string;
      kind: 'plain';
      yPct: number;
      heightPct: number;
      parallax: number;
      colorCurve: ColorStop[];
      hazeCurve?: ColorStop[];
    }
  | {
      id: string;
      kind: 'craters';
      yPct: number;
      heightPct: number;
      parallax: number;
      colorCurve: ColorStop[];
    }
  | {
      // v0.7 — Jupiter cloud band. Festoon-style turbulent top edge
      // (3-octave sine, amplitude scaled by `turbulence`) over a base
      // colour fill, with `streaks` count of horizontal shear-streak lines
      // drifting INTERNALLY at `driftSpeed` (independent of the band's
      // own parallax). Sells laminar zonal flow + atmospheric shear.
      id: string;
      kind: 'cloudBand';
      yPct: number;
      heightPct: number;
      parallax: number;
      /** 0–1, drives wave amplitude on the band's top festoon edge. */
      turbulence: number;
      /** Signed unitless multiplier. Independent of parallax — drives the
       *  internal shear-streak drift, NOT the band itself. ±0.5–1.1 typical. */
      driftSpeed: number;
      /** Number of internal horizontal shear-streak lines (4–7 typical). */
      streaks: number;
      colorCurve: ColorStop[];
      /** Streak line colour over ToD — typically darker than colorCurve. */
      streakCurve: ColorStop[];
    };

export type ParticleSpec =
  | {
      id: string;
      kind: 'starfield';
      count: number;
      densityCurve: ScalarStop[];
      twinkle: boolean;
      /** Optional per-star size multiplier. Earth's stars use 0.85 vs Moon's 1.0
       *  to read sparser through atmospheric scatter. */
      sizeMul?: number;
    }
  | {
      id: string;
      kind: 'horizontalDrift';
      count: number;
      densityCurve: ScalarStop[];
      speed: number;
      sizeRange: [number, number];
    }
  | {
      id: string;
      kind: 'clouds';
      count: number;
      densityCurve: ScalarStop[];
      /** Unitless drift-speed multiplier. */
      speed: number;
      /** Sky-tinted body colour over ToD (peach at dawn, white at day, etc.). */
      colorCurve: ColorStop[];
    }
  | {
      id: string;
      kind: 'birds';
      count: number;
      densityCurve: ScalarStop[];
      /** Unitless drift-speed multiplier. */
      speed: number;
      /** Per-bird scale multiplier. 2.2 reads cleanly at 390px width. */
      sizeMul: number;
      colorCurve: ColorStop[];
    }
  | {
      // v0.7 — Jupiter storm cells. Amorphous dark cloud blobs riding the
      // mid-band region (y ∈ [yMinPct, yMaxPct]). Distinct from Earth's
      // 'clouds' — no cumulus dome, no flat-bottom clip, elongated by the
      // zonal flow. Renderer derives lightTint/darkTint from `colorCurve`.
      id: string;
      kind: 'stormClouds';
      count: number;
      /** Unitless drift-speed multiplier. */
      speed: number;
      /** Vertical band region the storm cells inhabit (fraction of VIS_H). */
      yMinPct: number;
      yMaxPct: number;
      densityCurve: ScalarStop[];
      /** Mid-tone body colour; renderer derives highlight/shadow via lerp. */
      colorCurve: ColorStop[];
    }
  | {
      // v0.7 — Jupiter shear motes. Small fast horizontal-ellipse particles
      // with sinusoidal vertical wobble + slight x-jitter. Sells eye-level
      // atmospheric shear without aliasing. Spread across the full atmosphere
      // (yMinPct→yMaxPct).
      id: string;
      kind: 'shearMotes';
      count: number;
      densityCurve: ScalarStop[];
      /** Unitless drift-speed multiplier. */
      speed: number;
      /** Per-mote scale range [min, max]. */
      sizeRange: [number, number];
      yMinPct: number;
      yMaxPct: number;
      colorCurve: ColorStop[];
    }
  | {
      // v0.7 — Jupiter aurora. Full-width gradient strip at the top of the
      // sky, screen-blended over the sky gradient. Two-curve gradient: top
      // of strip → bottom of strip. Night-dominant (densityCurve fades it
      // in at dusk, peaks at night, gone by dawn).
      id: string;
      kind: 'aurora';
      densityCurve: ScalarStop[];
      /** Top edge of aurora strip colour over ToD. */
      colorTopCurve: ColorStop[];
      /** Bottom edge of aurora strip colour over ToD (typically violet). */
      colorBotCurve: ColorStop[];
    }
  | {
      // v0.7 — Jupiter lightning. Rare bright flash bloom inside cloud
      // bands, scheduled in slots so multiple flashes can coexist briefly.
      // Colour is hardcoded white-cyan radial bloom — no colorCurve needed.
      id: string;
      kind: 'lightning';
      /** Max simultaneous flash slots. */
      count: number;
      densityCurve: ScalarStop[];
    };

export type Celestial =
  | {
      id: string;
      kind: 'planet' | 'sun' | 'moon' | 'storm-eye' | 'earth';
      /** Static fallback position, used when xCurve/yCurve are absent. */
      xPct: number;
      yPct: number;
      radius: number;
      /** Optional position curves — sample with raw t (continuous player time),
       *  not profile-eased t. Renderer rule: position uses rawT; color/glow/phase
       *  use profile-eased t. Omit for static celestials. */
      xCurve?: ScalarStop[];
      yCurve?: ScalarStop[];
      colorCurve: ColorStop[];
      glowCurve: ScalarStop[];
      /** v0.5 — phase 0..1: 0 = new (fully shadowed), 0.5 = half, 1 = full (fully lit).
       *  Renderer cuts a terminator: lit hemisphere fills with `colorCurve`,
       *  shadowed hemisphere fills with body colour × 0.18. Authored as narrative
       *  (slow drift across ToD), not real celestial mechanics.
       *  Omit for `sun` / `storm-eye` (always full-lit). */
      phaseCurve?: ScalarStop[];
    }
  | {
      // v0.7 — Jupiter Great Red Spot. Oblate vortex (rx = radius × aspectRatio).
      // Distinct from `storm-eye` because it carries new fields (aspectRatio,
      // rimCurve) and renders very differently: radial-gradient body + outer
      // halo + 3–4 clipped concentric rim arcs + upper-left highlight.
      id: string;
      kind: 'gasGiantSpot';
      xPct: number;
      yPct: number;
      /** ry; rx = radius × aspectRatio. */
      radius: number;
      /** Horizontal aspect (1.35 typical — wider than tall). */
      aspectRatio: number;
      xCurve?: ScalarStop[];
      yCurve?: ScalarStop[];
      colorCurve: ColorStop[];
      /** Outer rim + concentric inner arcs colour over ToD. */
      rimCurve: ColorStop[];
      glowCurve: ScalarStop[];
    };

export type WorldTheme = {
  id: 'moon' | 'earth' | 'jupiter';
  label: string;
  tagline: string;
  gravityMul: number; // engine knob — feeds initState()
  scoreMul: number; // scoring multiplier
  /** v0.5 — controls day/night plateau timing. Moon: 'airless'. Earth: 'atmospheric'. */
  cycleProfile: CycleProfile;
  sky: SkyGradient;
  bands: Band[]; // ordered far→near
  particles: ParticleSpec[];
  celestials: Celestial[];
  palette: {
    pipeWall: string; // override of WALL_R within taste
    pipeEdge: string; // override of PIPE_EDGE within taste
    dotL: string; // per-world dot tint (still warm)
    dotR: string; // per-world dot tint (still cool)
    dividerGlowL: string;
    dividerGlowR: string;
    bgFlash: string; // death-flash colour
  };
};
