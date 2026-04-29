/**
 * WorldRenderer — Skia-side renderer for the planetary-mode schema (v0.6).
 *
 * Reads a frozen WorldTheme + the current ToD `t` and draws (in z-order):
 *
 *   1. Sky               full-bleed 3-stop linear gradient (top/mid/bottom curves)
 *   2. Celestials        sun / moon / planet / earth / storm-eye. Optional
 *                        xCurve/yCurve arc using rawT; color/glow use eased t.
 *                        glow=0 hides body+halo entirely (light sources only).
 *                        kind:'earth' takes a dedicated stylised render path
 *                        (ocean + Africa/Europe/Americas/Madagascar continents
 *                        + ice caps + halo + soft terminator).
 *   3. Stars             fixed seeded positions; alpha = density × twinkle
 *                        (cutoff 0.08); optional sizeMul.
 *   4. Clouds            multi-bubble cumulus with clip-path flat bottom (round
 *                        6) — bubbles share by = -br + 0.12br, clipped to y<0.
 *   5. Birds             Q-curve wings with signed wingtip oscillation +
 *                        perpendicular curl (round 6) — body fixed, tips
 *                        swing through zero; control points placed perp to
 *                        tip→body line at consistent magnitude.
 *   6. Bands far→near    silhouette / plain / craters. Silhouettes optionally
 *                        clip an internal vertical gradient (gradientCurve).
 *                        singleHill profile gets grass tufts overlaid (round 6).
 *                        Craters are STATIC — band.parallax is ignored for
 *                        the craters branch. Two-shade rim+bowl depth (round 6).
 *   7. Drift dust        horizontalDrift particles (legacy — Moon's lunar dust
 *                        was removed in round 6; profile preserved for future).
 *
 * Mounted as the FIRST child of the existing Skia <Canvas> in GameCanvas.tsx.
 *
 * v0.5 posture (still applies):
 *   - Static-per-planet geometry memoized via useMemo on theme identity:
 *     star/dust/cloud/bird seeds, silhouette paths, grass tufts, craters.
 *   - ToD interpolation runs in JS at React render time (oklch — see ./color.ts).
 *     Worklet migration is a follow-up commit when `t` is wired to a Reanimated
 *     SharedValue from the game clock. Math is pure and worklet-safe.
 *   - Position curves (xCurve/yCurve) sample raw t (continuous player time).
 *     Color/glow/phase curves sample profile-eased t. Cycle easing happens at
 *     the call site (GameCanvas) — renderer accepts both as separate props.
 *   - Silhouette `profile` enum drives a procedural path generator. No pattern
 *     fills (spec §5: Skia tile semantics differ from CSS — avoid).
 *
 * Skia/CSS divergence intentionally tolerated:
 *   - oklch interpolation diverges from sRGB CSS gradient banding.
 *   - Glow blur uses Skia's RadialGradient ramp; CSS filter:blur ≠ BlurMask.
 *   - Silhouette tiles vs evolves — Moon's design tool moves the noise field
 *     with scroll; Skia tiles a static shape (cheaper). Documented divergence.
 */

import React, { useMemo } from 'react';
import {
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import type {
  Band,
  Celestial,
  ParticleSpec,
  SilhouetteProfile,
  WorldTheme,
} from '@features/game/world';
import { GAME_H, SCALE, SCREEN_W, VIS_H } from '../_shared/constants';

import {
  oklchToHex,
  preprocessHexCurve,
  sampleOklchCurve,
  sampleScalarCurve,
  type Oklch,
} from '@features/game/world/color';

import {
  mulberry32,
  themeSeed,
  SILHOUETTE_PATH_BUILDERS,
  seedCraters,
  craterRimBounds,
  craterBowlBounds,
  type Crater,
  seedClouds,
  CLOUD_CLIP_RECT,
  type CloudSeed,
  seedBirds,
  birdScreenX,
  computeBirdWingPoints,
  birdStrokeWidth,
  type BirdSeed,
  seedGrassBlades,
  computeBladePoints,
  GRASS_LIGHT_STOPS,
  GRASS_DARK_STOPS,
  continentsSvgPath,
  madagascarBounds,
  northIceCapBounds,
  southIceCapBounds,
  TERMINATOR_OFFSET_FRAC,
  TERMINATOR_OPACITY,
  TERMINATOR_COLOR,
  EARTH_HALO_RADIUS_MUL,
  EARTH_HALO_COLOR,
  EARTH_CONTINENT_COLOR,
  EARTH_ICE_COLOR,
  EARTH_ICE_OPACITY,
} from '@features/game/world/geometry';

// ─── Props ────────────────────────────────────────────────────────────────

export interface WorldRendererProps {
  theme: WorldTheme;
  /** Profile-eased ToD ∈ [0,1] — drives color/glow/phase curves. */
  t: number;
  /** Raw player ToD ∈ [0,1] — drives position curves (xCurve/yCurve) so
   *  celestials arc continuously even during plateaus. Defaults to `t`. */
  rawT?: number;
  /** World scroll offset in screen pixels. Bands scale by their `parallax`. */
  scrollX: number;
  /** Live clock for twinkle / cloud drift / bird wing-flap. */
  nowMs: number;
}

// ─── Preprocessing — runs once per theme identity ─────────────────────────

type PreprocessedTheme = {
  skyTop: ReadonlyArray<readonly [number, Oklch]>;
  skyMid: ReadonlyArray<readonly [number, Oklch]>;
  skyBot: ReadonlyArray<readonly [number, Oklch]>;
  bands: ReadonlyArray<{
    band: Band;
    color: ReadonlyArray<readonly [number, Oklch]>;
    haze?: ReadonlyArray<readonly [number, Oklch]>;
    gradient?: ReadonlyArray<readonly [number, Oklch]>;
  }>;
  celestials: ReadonlyArray<{
    celestial: Celestial;
    color: ReadonlyArray<readonly [number, Oklch]>;
  }>;
  particles: ReadonlyArray<{
    spec: ParticleSpec;
    color?: ReadonlyArray<readonly [number, Oklch]>;
  }>;
};

function preprocessTheme(theme: WorldTheme): PreprocessedTheme {
  return {
    skyTop: preprocessHexCurve(theme.sky.topCurve),
    skyMid: preprocessHexCurve(theme.sky.midCurve),
    skyBot: preprocessHexCurve(theme.sky.bottomCurve),
    bands: theme.bands.map((band) => ({
      band,
      color: preprocessHexCurve(band.colorCurve),
      haze:
        band.kind === 'plain' && band.hazeCurve
          ? preprocessHexCurve(band.hazeCurve)
          : undefined,
      gradient:
        band.kind === 'silhouette' && band.gradientCurve
          ? preprocessHexCurve(band.gradientCurve)
          : undefined,
    })),
    celestials: theme.celestials.map((celestial) => ({
      celestial,
      color: preprocessHexCurve(celestial.colorCurve),
    })),
    particles: theme.particles.map((spec) => ({
      spec,
      color:
        spec.kind === 'clouds' || spec.kind === 'birds'
          ? preprocessHexCurve(spec.colorCurve)
          : undefined,
    })),
  };
}

// ─── Static-per-theme geometry seeders ────────────────────────────────────
// mulberry32 + themeSeed live in @features/game/world/geometry/prng — shared
// with the iteration tool. Star/dust seeders stay here because they're
// production-only helpers (not part of the round-6 drift surface).

type StarSeed = { x: number; y: number; r: number; phase: number };

function seedStars(spec: Extract<ParticleSpec, { kind: 'starfield' }>, seed: number): StarSeed[] {
  const rng = mulberry32(seed);
  const out: StarSeed[] = [];
  const skyBottomPx = 0.6 * VIS_H * SCALE;
  const sizeMul = spec.sizeMul ?? 1;
  for (let i = 0; i < spec.count; i++) {
    out.push({
      x: rng() * SCREEN_W,
      y: rng() * skyBottomPx,
      r: (0.5 + rng() * 1.1) * sizeMul,
      phase: rng() * Math.PI * 2,
    });
  }
  return out;
}

type DustSeed = { x: number; y: number; r: number };

function seedDust(
  spec: Extract<ParticleSpec, { kind: 'horizontalDrift' }>,
  seed: number,
): DustSeed[] {
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  const out: DustSeed[] = [];
  const yMin = 0.7 * VIS_H * SCALE;
  const yMax = 0.85 * VIS_H * SCALE;
  const [minR, maxR] = spec.sizeRange;
  for (let i = 0; i < spec.count; i++) {
    out.push({
      x: rng() * SCREEN_W,
      y: yMin + rng() * (yMax - yMin),
      r: minR + rng() * (maxR - minR),
    });
  }
  return out;
}

// Cloud bubble layout (CloudSeed type, seedClouds, CLOUD_CLIP_RECT) lives in
// @features/game/world/geometry/clouds — shared with iteration tool.
// Production builds the Skia clip path once at module load from the shared
// rect dimensions.
const CLOUD_CLIP_PATH = (() => {
  const p = Skia.Path.Make();
  p.addRect(CLOUD_CLIP_RECT);
  return p;
})();

// ─── Grass tufts (round 6) ────────────────────────────────────────────────
// Blade specs (light/dark blade lists + colour stops + per-blade math) live
// in @features/game/world/geometry/grass — shared with iteration tool.
// Production builds two composite Skia paths from those specs at memo time
// (one for the light layer, one for the dark layer) so per-frame rendering
// is just two `<Path>` draws with curve-sampled colours.

const GRASS_LIGHT_CURVE = preprocessHexCurve([...GRASS_LIGHT_STOPS]);
const GRASS_DARK_CURVE = preprocessHexCurve([...GRASS_DARK_STOPS]);

type GrassPaths = {
  light: ReturnType<typeof Skia.Path.Make>;
  dark: ReturnType<typeof Skia.Path.Make>;
};

function buildGrassPaths(heightPx: number, seed: number): GrassPaths {
  const { light: lightBlades, dark: darkBlades } = seedGrassBlades(
    SCREEN_W,
    heightPx,
    seed,
  );
  const light = Skia.Path.Make();
  const dark = Skia.Path.Make();
  for (const blade of lightBlades) {
    const pts = computeBladePoints(blade);
    light.moveTo(pts.baseLeft[0], pts.baseLeft[1]);
    light.quadTo(pts.ctrl1[0], pts.ctrl1[1], pts.tip[0], pts.tip[1]);
    light.quadTo(pts.ctrl2[0], pts.ctrl2[1], pts.baseRight[0], pts.baseRight[1]);
    light.close();
  }
  for (const blade of darkBlades) {
    const pts = computeBladePoints(blade);
    dark.moveTo(pts.baseLeft[0], pts.baseLeft[1]);
    dark.quadTo(pts.ctrl1[0], pts.ctrl1[1], pts.tip[0], pts.tip[1]);
    dark.quadTo(pts.ctrl2[0], pts.ctrl2[1], pts.baseRight[0], pts.baseRight[1]);
    dark.close();
  }
  return { light, dark };
}

// Bird seeds (BirdSeed type, seedBirds, birdScreenX, computeBirdWingPoints,
// birdStrokeWidth) live in @features/game/world/geometry/birds — shared
// with iteration tool. Production calls them at the BirdFlock render path.

// ─── Procedural silhouette paths ──────────────────────────────────────────
// Path generators (mountainsSvgPath, singleHillSvgPath, etc.) live in
// @features/game/world/geometry/paths — shared with iteration tool. They
// return SVG path strings in BAND-LOCAL coordinates (y=0 at top of band,
// y=heightPx at bottom). Production parses them into Skia paths and the
// BandRender wrapper applies translateY = yPx via Group transform.

function buildSilhouetteSkiaPath(
  profile: SilhouetteProfile,
  heightPx: number,
  seed: number,
): ReturnType<typeof Skia.Path.Make> {
  const builder = SILHOUETTE_PATH_BUILDERS[profile];
  if (!builder) {
    // Defensive — should be unreachable since SilhouetteProfile union enumerates
    // all profile keys.
    return Skia.Path.Make();
  }
  const svg = builder(SCREEN_W, heightPx, seed);
  return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make();
}

// ─── Crater seeds for foreground 'craters' band ───────────────────────────
// Crater data (Crater type + seedCraters) lives in
// @features/game/world/geometry/craters — shared with iteration tool.
// Production wraps each Crater in CraterRender which adds pre-built Skia
// paths (rim + bowl ellipses) so we don't allocate per-frame.

type CraterRender = {
  crater: Crater;
  rimPath: ReturnType<typeof Skia.Path.Make>;
  bowlPath: ReturnType<typeof Skia.Path.Make>;
};

function buildCraterRenders(
  yPx: number,
  heightPx: number,
  seed: number,
): CraterRender[] {
  const craters = seedCraters(SCREEN_W, yPx, heightPx, seed);
  return craters.map((c) => {
    const rimPath = Skia.Path.Make();
    rimPath.addOval(craterRimBounds(c));
    const bowlPath = Skia.Path.Make();
    bowlPath.addOval(craterBowlBounds(c));
    return { crater: c, rimPath, bowlPath };
  });
}

// ─── Sub-renderers ────────────────────────────────────────────────────────

function Sky({ pre, t }: { pre: PreprocessedTheme; t: number }): React.ReactElement {
  const top = oklchToHex(sampleOklchCurve(pre.skyTop, t));
  const mid = oklchToHex(sampleOklchCurve(pre.skyMid, t));
  const bot = oklchToHex(sampleOklchCurve(pre.skyBot, t));
  return (
    <Rect x={0} y={0} width={SCREEN_W} height={GAME_H}>
      <LinearGradient
        start={vec(0, 0)}
        end={vec(0, GAME_H)}
        colors={[top, mid, bot]}
        positions={[0, 0.55, 1]}
      />
    </Rect>
  );
}

function Starfield({
  stars,
  spec,
  t,
  nowMs,
}: {
  stars: StarSeed[];
  spec: Extract<ParticleSpec, { kind: 'starfield' }>;
  t: number;
  nowMs: number;
}): React.ReactElement {
  const density = sampleScalarCurve(spec.densityCurve, t);
  return (
    <Group>
      {stars.map((s, i) => {
        const twinkle = spec.twinkle
          ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(nowMs / 1000 + s.phase))
          : 1;
        const alpha = density * twinkle;
        if (alpha < 0.08) return null;
        return (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} color="#ffffff" opacity={Math.min(1, alpha)} />
        );
      })}
    </Group>
  );
}

function CelestialBody({
  celestial,
  preColor,
  t,
  rawT,
}: {
  celestial: Celestial;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  rawT: number;
}): React.ReactElement | null {
  // Caller dispatches by kind:
  //   - kind: 'storm-eye' → StormEye (rendered AFTER bands so the GRS overlays
  //     the SEB; see WorldRenderer below).
  //   - kind: 'earth'     → EarthBody (dedicated continents/ice/halo path).
  //   - kind: 'sun' | 'moon' | 'planet' → this function.
  // Putting those filters here would conflict with hook order, so dispatch
  // happens in the parent before the component is invoked.

  // Position: xCurve/yCurve (raw t) take precedence over static xPct/yPct.
  // Computed BEFORE the early-return so rules-of-hooks holds for useMemo below.
  const xPct = celestial.xCurve ? sampleScalarCurve(celestial.xCurve, rawT) : celestial.xPct;
  const yPct = celestial.yCurve ? sampleScalarCurve(celestial.yCurve, rawT) : celestial.yPct;
  const cx = xPct * SCREEN_W;
  const cy = yPct * VIS_H * SCALE;
  const r = celestial.radius;

  // Phase terminator clip path — MUST be called every render for rules of hooks.
  // For static celestials (no xCurve/yCurve), cx/cy/r are stable so the path
  // is allocated once. For arcing celestials, the clip moves with the body —
  // but Earth's sun and moon have no phaseCurve, so this allocates-per-frame
  // case never triggers in current themes.
  const bodyClip = useMemo(() => {
    if (!celestial.phaseCurve) return null;
    const path = Skia.Path.Make();
    path.addCircle(cx, cy, r);
    return path;
  }, [celestial.phaseCurve, cx, cy, r]);

  const glow = sampleScalarCurve(celestial.glowCurve, t);
  // Visibility rule (revised v0.5 + Jupiter): glow=0 hides body+halo only
  // for light-source celestials (sun, moon). Storm-eye and planet are
  // physical features and remain visible regardless of glow value.
  const isLightSource = celestial.kind === 'sun' || celestial.kind === 'moon';
  if (glow <= 0.01 && isLightSource) return null;

  const baseOklch = sampleOklchCurve(preColor, t);
  const col = oklchToHex(baseOklch);

  let phaseShadow: React.ReactElement | null = null;
  if (celestial.phaseCurve && bodyClip) {
    const phase = sampleScalarCurve(celestial.phaseCurve, t);
    if (phase < 0.99) {
      const shadowCol = oklchToHex([baseOklch[0] * 0.18, baseOklch[1] * 0.6, baseOklch[2]]);
      const terminatorX = cx + (2 * phase - 1) * r;
      phaseShadow = (
        <Group clip={bodyClip}>
          <Rect
            x={terminatorX}
            y={cy - r}
            width={cx + r - terminatorX}
            height={2 * r}
            color={shadowCol}
          />
        </Group>
      );
    }
  }

  // Halo radius differs by kind: sun = 2.6× (showy), moon = 1.8× (gentle),
  // planet = 2.4× (default), storm-eye = 2.4×.
  const haloR =
    celestial.kind === 'sun' ? r * 2.6 : celestial.kind === 'moon' ? r * 1.8 : r * 2.4;
  const haloAlphaHex = celestial.kind === 'moon' ? '88' : 'aa';

  return (
    <Group>
      <Circle cx={cx} cy={cy} r={haloR} opacity={glow}>
        <RadialGradient
          c={vec(cx, cy)}
          r={haloR}
          colors={[col + haloAlphaHex, col + '00']}
        />
      </Circle>
      <Circle cx={cx} cy={cy} r={r} color={col} />
      {phaseShadow}
    </Group>
  );
}

function CloudField({
  clouds,
  spec,
  preColor,
  t,
  nowMs,
}: {
  clouds: CloudSeed[];
  spec: Extract<ParticleSpec, { kind: 'clouds' }>;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  nowMs: number;
}): React.ReactElement | null {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.02) return null;
  const tint = oklchToHex(sampleOklchCurve(preColor, t));
  return (
    <Group>
      {clouds.map((c, i) => {
        // Drift: wraps every (SCREEN_W + 240) px so off-screen clouds reappear left.
        const drift = (nowMs * 0.01 * spec.speed + c.driftPhase) % (SCREEN_W + 240);
        const x = ((c.baseX + drift) % (SCREEN_W + 240)) - 120;
        const opacity = c.alpha * density;
        return (
          <Group key={i} transform={[{ translateX: x }, { translateY: c.baseY }]} opacity={opacity}>
            <Group clip={CLOUD_CLIP_PATH}>
              {c.bubbles.map((b, j) => (
                <Circle key={j} cx={b.bx} cy={b.by} r={b.br} color={tint} />
              ))}
            </Group>
          </Group>
        );
      })}
    </Group>
  );
}

function BirdFlock({
  birds,
  spec,
  preColor,
  t,
  nowMs,
}: {
  birds: BirdSeed[];
  spec: Extract<ParticleSpec, { kind: 'birds' }>;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  nowMs: number;
}): React.ReactElement | null {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  const tint = oklchToHex(sampleOklchCurve(preColor, t));

  // P0-1: build one multi-subpath that batches every bird into a single
  // Path allocation per frame (vs. N paths/frame in the naive map approach).
  // Wing geometry math lives in @features/game/world/geometry/birds —
  // shared with iteration tool. computeBirdWingPoints handles signed
  // wingtip oscillation + perpendicular control-point curl (round 6).
  // Stroke width is per-bird in the seed but Skia's Path doesn't carry
  // per-subpath stroke; flatten to a representative size (mean of seeded).
  const path = Skia.Path.Make();
  let widthSum = 0;
  for (const b of birds) {
    const x = birdScreenX(b, SCREEN_W, spec.speed, nowMs);
    const pts = computeBirdWingPoints(x, b, nowMs);
    path.moveTo(pts.lTip[0], pts.lTip[1]);
    path.quadTo(pts.lCtrl[0], pts.lCtrl[1], pts.body[0], pts.body[1]);
    path.quadTo(pts.rCtrl[0], pts.rCtrl[1], pts.rTip[0], pts.rTip[1]);
    widthSum += birdStrokeWidth(b);
  }
  const sw = widthSum / Math.max(1, birds.length);
  // Per-bird alpha varies in seed; use a representative average for the
  // group. Big visual stylings of "flock fades together" are dominated by
  // density, which IS uniform.
  const groupAlpha = density * 0.7; // 0.55-0.85 alpha range × density

  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={sw}
      strokeCap="round"
      color={tint}
      opacity={groupAlpha}
      antiAlias
    />
  );
}

function BandRender({
  band,
  preColor,
  preHaze,
  preGradient,
  silhouettePath,
  grassPaths,
  craters,
  t,
  scrollX,
}: {
  band: Band;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  preHaze?: ReadonlyArray<readonly [number, Oklch]>;
  preGradient?: ReadonlyArray<readonly [number, Oklch]>;
  silhouettePath?: ReturnType<typeof Skia.Path.Make>;
  grassPaths?: GrassPaths;
  craters?: CraterRender[];
  t: number;
  scrollX: number;
}): React.ReactElement {
  const yPx = band.yPct * VIS_H * SCALE;
  const heightPx = band.heightPct * VIS_H * SCALE;
  const col = oklchToHex(sampleOklchCurve(preColor, t));
  const dx = -((scrollX * band.parallax) % SCREEN_W);

  if (band.kind === 'silhouette' && silhouettePath) {
    // Silhouette path + grass blade paths are BAND-LOCAL (y=0 at top of band)
    // — wrap in translateY = yPx so they render at the correct canvas
    // position. translateX = dx applies parallax scroll.
    const grassNode = grassPaths ? (
      <>
        <Path
          path={grassPaths.dark}
          color={oklchToHex(sampleOklchCurve(GRASS_DARK_CURVE, t))}
          style="fill"
          antiAlias
        />
        <Path
          path={grassPaths.light}
          color={oklchToHex(sampleOklchCurve(GRASS_LIGHT_CURVE, t))}
          style="fill"
          antiAlias
        />
      </>
    ) : null;

    // v0.5 — gradientCurve clips an internal vertical gradient to the silhouette
    // path. Top edge brighter (sun-catch), fading to base color at the bottom.
    // Rect + LinearGradient use band-local y (0..heightPx) since they're
    // inside the translateY group.
    if (preGradient) {
      const topCol = oklchToHex(sampleOklchCurve(preGradient, t));
      return (
        <Group transform={[{ translateX: dx }, { translateY: yPx }]}>
          <Group clip={silhouettePath}>
            <Rect x={0} y={0} width={SCREEN_W * 2} height={heightPx}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, heightPx)}
                colors={[topCol, col, col]}
                positions={[0, 0.6, 1]}
              />
            </Rect>
          </Group>
          {grassNode}
        </Group>
      );
    }
    return (
      <Group transform={[{ translateX: dx }, { translateY: yPx }]}>
        <Path path={silhouettePath} color={col} style="fill" antiAlias />
        {grassNode}
      </Group>
    );
  }

  if (band.kind === 'plain') {
    const haze = preHaze ? oklchToHex(sampleOklchCurve(preHaze, t)) : col;
    return (
      <Group>
        <Rect x={0} y={yPx} width={SCREEN_W} height={heightPx}>
          <LinearGradient
            start={vec(0, yPx)}
            end={vec(0, yPx + heightPx)}
            colors={[haze, col]}
            positions={[0, 0.3]}
          />
        </Rect>
      </Group>
    );
  }

  if (band.kind === 'craters' && craters) {
    // Round 6: two-shade depth illusion — lighter rim halo (sun-catch) +
    // darker bowl offset slightly upward (suggests depth from above-light
    // viewing). Craters are STATIC: we don't apply the parallax transform.
    // The band's underlying colour fill is rendered by the nearPlain band
    // beneath; this branch overlays just the crater pattern.
    //
    // CraterRender wraps geometry's Crater data with pre-built Skia paths
    // (built once at memo time in buildCraterRenders) — no per-frame alloc.
    const baseOklch = sampleOklchCurve(preColor, t);
    const bowlCol = oklchToHex(baseOklch);
    // Rim: lerp 25% toward white. In oklch: lift L toward 1, drop C toward 0.
    const rimCol = oklchToHex([
      baseOklch[0] * 0.75 + 0.25,
      baseOklch[1] * 0.75,
      baseOklch[2],
    ]);
    return (
      <Group>
        {craters.map((cr, i) => (
          <Group key={i}>
            <Path
              path={cr.rimPath}
              color={rimCol}
              style="fill"
              opacity={cr.crater.opacity * 0.4}
              antiAlias
            />
            <Path
              path={cr.bowlPath}
              color={bowlCol}
              style="fill"
              opacity={cr.crater.opacity}
              antiAlias
            />
          </Group>
        ))}
      </Group>
    );
  }

  return <Group />;
}

/**
 * EarthBody — Earth-from-Moon stylised rendering keyed off `kind: 'earth'`.
 *
 * Visual: blue ocean body + recognisable continents (Africa, Europe, Americas,
 * Madagascar) + polar ice caps + atmospheric halo + soft terminator on the
 * lower-right. Africa-Europe view (the iconic Earth-from-Moon angle).
 *
 * Replaces the abstract 'planet' rendering for the Moon's earth-in-sky
 * celestial. Per Moon point 6 (round 6 review).
 *
 * Geometry is memoized per (cx, cy, r) so re-renders don't reallocate paths.
 * Position uses rawT (xCurve/yCurve), color uses eased t (colorCurve).
 */
function EarthBody({
  celestial,
  preColor,
  t,
  rawT,
}: {
  celestial: Celestial;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  rawT: number;
}): React.ReactElement {
  const xPct = celestial.xCurve ? sampleScalarCurve(celestial.xCurve, rawT) : celestial.xPct;
  const yPct = celestial.yCurve ? sampleScalarCurve(celestial.yCurve, rawT) : celestial.yPct;
  const cx = xPct * SCREEN_W;
  const cy = yPct * VIS_H * SCALE;
  const r = celestial.radius;

  const bodyClip = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(cx, cy, r);
    return path;
  }, [cx, cy, r]);

  // Continent SVG path strings live in @features/game/world/geometry/continents
  // — shared with iteration tool. Production parses to Skia paths once per
  // (cx, cy, r) via useMemo.
  const continentsPath = useMemo(
    () => Skia.Path.MakeFromSVGString(continentsSvgPath(cx, cy, r)) ?? Skia.Path.Make(),
    [cx, cy, r],
  );

  const madagascarPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addOval(madagascarBounds(cx, cy, r));
    return path;
  }, [cx, cy, r]);

  const iceCapsPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addOval(northIceCapBounds(cx, cy, r));
    path.addOval(southIceCapBounds(cx, cy, r));
    return path;
  }, [cx, cy, r]);

  const glow = sampleScalarCurve(celestial.glowCurve, t);
  const oceanCol = oklchToHex(sampleOklchCurve(preColor, t));
  const haloR = r * EARTH_HALO_RADIUS_MUL;
  const haloEdgeColor = EARTH_HALO_COLOR + '00'; // alpha 0 at edge

  return (
    <Group>
      {/* Atmospheric glow halo (light blue, fades to transparent) */}
      <Circle cx={cx} cy={cy} r={haloR} opacity={glow}>
        <RadialGradient
          c={vec(cx, cy)}
          r={haloR}
          colors={[EARTH_HALO_COLOR, haloEdgeColor]}
        />
      </Circle>
      {/* Ocean body */}
      <Circle cx={cx} cy={cy} r={r} color={oceanCol} />
      {/* Continents + Madagascar + ice caps + terminator — all clipped to body */}
      <Group clip={bodyClip}>
        <Path path={continentsPath} color={EARTH_CONTINENT_COLOR} style="fill" antiAlias />
        <Path path={madagascarPath} color={EARTH_CONTINENT_COLOR} style="fill" antiAlias />
        <Path
          path={iceCapsPath}
          color={EARTH_ICE_COLOR}
          opacity={EARTH_ICE_OPACITY}
          style="fill"
          antiAlias
        />
        {/* Soft terminator — dark crescent on lower-right of the ocean body */}
        <Circle
          cx={cx + r * TERMINATOR_OFFSET_FRAC.x}
          cy={cy + r * TERMINATOR_OFFSET_FRAC.y}
          r={r}
          color={TERMINATOR_COLOR}
          opacity={TERMINATOR_OPACITY}
        />
      </Group>
    </Group>
  );
}

/**
 * StormEye — Jupiter's Great Red Spot rendering. Hardcoded behaviour keyed
 * off `kind: 'storm-eye'` (no schema additions).
 *
 * Visual: oblate ellipse (1.6× horizontal aspect) with 4 concentric flow
 * ring outlines fading inward, slowly rotating (~63s per turn). Rendered
 * AFTER bands so it overlays the SEB where the GRS sits in real Jupiter.
 *
 * Geometry is memoized per celestial-radius so re-renders don't reallocate
 * paths. Rotation is the only per-frame variable — applied via Group transform.
 */
function StormEye({
  celestial,
  preColor,
  t,
  nowMs,
}: {
  celestial: Celestial;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  nowMs: number;
}): React.ReactElement {
  const cx = celestial.xPct * SCREEN_W;
  const cy = celestial.yPct * VIS_H * SCALE;
  const r = celestial.radius;
  const aspect = 1.6; // oblate horizontally — GRS is wider than tall

  // Body + ring paths memoized per radius (static across renders).
  const bodyPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addOval({ x: -r * aspect, y: -r, width: 2 * r * aspect, height: 2 * r });
    return path;
  }, [r]);

  const ringPaths = useMemo(() => {
    return [0.85, 0.65, 0.45, 0.25].map((s) => {
      const path = Skia.Path.Make();
      path.addOval({
        x: -r * aspect * s,
        y: -r * s,
        width: 2 * r * aspect * s,
        height: 2 * r * s,
      });
      return path;
    });
  }, [r]);

  const baseOklch = sampleOklchCurve(preColor, t);
  const col = oklchToHex(baseOklch);
  // Ring color: darker shade of body — suggests flow shadow.
  const ringCol = oklchToHex([baseOklch[0] * 0.5, baseOklch[1] * 0.7, baseOklch[2]]);

  // Slow rotation: ~0.0001 rad/ms ≈ ~63s per full turn.
  const angle = nowMs * 0.0001;

  return (
    <Group
      transform={[{ translateX: cx }, { translateY: cy }, { rotate: angle }]}
    >
      <Path path={bodyPath} color={col} style="fill" antiAlias />
      {ringPaths.map((p, i) => (
        <Path
          key={i}
          path={p}
          color={ringCol}
          style="stroke"
          strokeWidth={1}
          opacity={0.15 + i * 0.04}
          antiAlias
        />
      ))}
    </Group>
  );
}

function DriftDust({
  dust,
  spec,
  t,
  scrollX,
}: {
  dust: DustSeed[];
  spec: Extract<ParticleSpec, { kind: 'horizontalDrift' }>;
  t: number;
  scrollX: number;
}): React.ReactElement {
  const density = sampleScalarCurve(spec.densityCurve, t);
  return (
    <Group>
      {dust.map((d, i) => {
        const x = (((d.x - scrollX * 0.6) % SCREEN_W) + SCREEN_W) % SCREEN_W;
        return <Circle key={i} cx={x} cy={d.y} r={d.r} color="#ffffff" opacity={density * 0.3} />;
      })}
    </Group>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export function WorldRenderer({
  theme,
  t,
  rawT,
  scrollX,
  nowMs,
}: WorldRendererProps): React.ReactElement {
  const positionT = rawT ?? t;

  const pre = useMemo(() => preprocessTheme(theme), [theme]);
  const seed = useMemo(() => themeSeed(theme.id), [theme.id]);

  // Static-per-theme particle seeds, keyed on theme identity.
  const particleSeeds = useMemo(() => {
    const result = {
      stars: [] as StarSeed[],
      starsSpec: undefined as Extract<ParticleSpec, { kind: 'starfield' }> | undefined,
      dust: [] as DustSeed[],
      dustSpec: undefined as Extract<ParticleSpec, { kind: 'horizontalDrift' }> | undefined,
      clouds: [] as CloudSeed[],
      cloudsSpec: undefined as Extract<ParticleSpec, { kind: 'clouds' }> | undefined,
      birds: [] as BirdSeed[],
      birdsSpec: undefined as Extract<ParticleSpec, { kind: 'birds' }> | undefined,
    };
    theme.particles.forEach((spec) => {
      if (spec.kind === 'starfield') {
        result.starsSpec = spec;
        result.stars = seedStars(spec, seed);
      } else if (spec.kind === 'horizontalDrift') {
        result.dustSpec = spec;
        result.dust = seedDust(spec, seed);
      } else if (spec.kind === 'clouds') {
        result.cloudsSpec = spec;
        result.clouds = seedClouds(SCREEN_W, VIS_H * SCALE, spec.count, seed);
      } else if (spec.kind === 'birds') {
        result.birdsSpec = spec;
        result.birds = seedBirds(SCREEN_W, VIS_H * SCALE, spec.count, spec.sizeMul, seed);
      }
    });
    return result;
  }, [theme, seed]);

  // Silhouette paths (band-local) keyed on band identity. Production wraps
  // them in translateY = yPx at the render site.
  const silhouettePaths = useMemo(() => {
    const paths = new Map<string, ReturnType<typeof Skia.Path.Make>>();
    theme.bands.forEach((band) => {
      if (band.kind === 'silhouette') {
        const heightPx = band.heightPct * VIS_H * SCALE;
        paths.set(
          band.id,
          buildSilhouetteSkiaPath(band.profile, heightPx, seed ^ themeSeed(band.id)),
        );
      }
    });
    return paths;
  }, [theme, seed]);

  // Crater renders (canvas-absolute): geometry's Crater data wrapped with
  // pre-built Skia paths for rim + bowl ellipses.
  const craters = useMemo(() => {
    const out = new Map<string, CraterRender[]>();
    theme.bands.forEach((band) => {
      if (band.kind === 'craters') {
        const yPx = band.yPct * VIS_H * SCALE;
        const heightPx = band.heightPct * VIS_H * SCALE;
        out.set(band.id, buildCraterRenders(yPx, heightPx, seed ^ themeSeed(band.id)));
      }
    });
    return out;
  }, [theme, seed]);

  // Grass tufts (band-local) — only for the closest foreground band (singleHill
  // profile). Static geometry, ToD-tinted at render time via GRASS curves.
  // Wrapped in the same translateY = yPx Group as the silhouette path.
  const grassPaths = useMemo(() => {
    const out = new Map<string, GrassPaths>();
    theme.bands.forEach((band) => {
      if (band.kind === 'silhouette' && band.profile === 'singleHill') {
        const heightPx = band.heightPct * VIS_H * SCALE;
        out.set(band.id, buildGrassPaths(heightPx, seed ^ themeSeed(band.id)));
      }
    });
    return out;
  }, [theme, seed]);

  // Particle preprocessed curves indexed by particle id (for clouds/birds).
  const particleCurves = useMemo(() => {
    const map = new Map<string, ReadonlyArray<readonly [number, Oklch]>>();
    pre.particles.forEach((p) => {
      if (p.color) map.set(p.spec.id, p.color);
    });
    return map;
  }, [pre]);

  // Destructure once so TS narrowing carries through the JSX below.
  const { stars, starsSpec, dust, dustSpec, clouds, cloudsSpec, birds, birdsSpec } =
    particleSeeds;
  const cloudsColor = cloudsSpec ? particleCurves.get(cloudsSpec.id) : undefined;
  const birdsColor = birdsSpec ? particleCurves.get(birdsSpec.id) : undefined;

  // Split celestials by z-band: sky celestials (sun, moon, planet) render
  // BEFORE bands; storm-eye renders AFTER bands so it overlays them
  // (Jupiter's GRS sits IN the SEB, not above it).
  const skyCelestials = pre.celestials.filter((c) => c.celestial.kind !== 'storm-eye');
  const stormEyes = pre.celestials.filter((c) => c.celestial.kind === 'storm-eye');

  return (
    <Group>
      {/* 1. Sky */}
      <Sky pre={pre} t={t} />

      {/* 2. Sky celestials — sun / moon / planet / earth (between sky and silhouettes) */}
      {skyCelestials.map((c) =>
        c.celestial.kind === 'earth' ? (
          <EarthBody
            key={c.celestial.id}
            celestial={c.celestial}
            preColor={c.color}
            t={t}
            rawT={positionT}
          />
        ) : (
          <CelestialBody
            key={c.celestial.id}
            celestial={c.celestial}
            preColor={c.color}
            t={t}
            rawT={positionT}
          />
        ),
      )}

      {/* 3. Stars */}
      {starsSpec && <Starfield stars={stars} spec={starsSpec} t={t} nowMs={nowMs} />}

      {/* 4. Clouds (upper sky, behind silhouettes) */}
      {cloudsSpec && cloudsColor && (
        <CloudField
          clouds={clouds}
          spec={cloudsSpec}
          preColor={cloudsColor}
          t={t}
          nowMs={nowMs}
        />
      )}

      {/* 5. Birds (upper-mid sky, behind silhouettes) */}
      {birdsSpec && birdsColor && (
        <BirdFlock birds={birds} spec={birdsSpec} preColor={birdsColor} t={t} nowMs={nowMs} />
      )}

      {/* 6. Bands far→near */}
      {pre.bands.map((b) => (
        <BandRender
          key={b.band.id}
          band={b.band}
          preColor={b.color}
          preHaze={b.haze}
          preGradient={b.gradient}
          silhouettePath={silhouettePaths.get(b.band.id)}
          grassPaths={grassPaths.get(b.band.id)}
          craters={craters.get(b.band.id)}
          t={t}
          scrollX={scrollX}
        />
      ))}

      {/* 7. Storm-eye celestials — overlay bands (Jupiter's GRS sits IN the SEB) */}
      {stormEyes.map((c) => (
        <StormEye
          key={c.celestial.id}
          celestial={c.celestial}
          preColor={c.color}
          t={t}
          nowMs={nowMs}
        />
      ))}

      {/* 8. Drift dust */}
      {dustSpec && <DriftDust dust={dust} spec={dustSpec} t={t} scrollX={scrollX} />}
    </Group>
  );
}
