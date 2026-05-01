/**
 * WorldRenderer — Skia-side renderer for the planetary-mode schema (v0.5).
 *
 * Reads a frozen WorldTheme + the current ToD `t` and draws (in z-order):
 *
 *   1. Sky               full-bleed 3-stop linear gradient (top/mid/bottom curves)
 *   2. Celestials        sun / moon / planet / storm-eye. Optional xCurve/yCurve
 *                        arc using rawT; color/glow/phase use eased t.
 *                        glow=0 hides body+halo entirely.
 *   3. Stars             fixed seeded positions; alpha = density × twinkle
 *                        (cutoff 0.08); optional sizeMul.
 *   4. Clouds            multi-bubble cumulus, sky-tinted, drifting (Earth)
 *   5. Birds             chevron Q-curves with wing-flap (Earth)
 *   6. Bands far→near    silhouette / plain / craters. Silhouettes optionally
 *                        clip an internal vertical gradient (gradientCurve).
 *   7. Drift dust        horizontalDrift particles (Moon)
 *
 * Mounted as the FIRST child of the existing Skia <Canvas> in GameCanvas.tsx.
 *
 * v0.5 posture:
 *   - Static-per-planet geometry memoized via useMemo on theme identity:
 *     star/dust/cloud/bird seeds, silhouette paths, crater rims.
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
  PathOp,
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
import { mulberry32 } from '@shared/utils/rng';

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
    /** v0.7 — cloudBand streak colour curve (interior shear lines). */
    streak?: ReadonlyArray<readonly [number, Oklch]>;
  }>;
  celestials: ReadonlyArray<{
    celestial: Celestial;
    color: ReadonlyArray<readonly [number, Oklch]>;
    /** v0.7 — gasGiantSpot rim/arc colour curve. */
    rim?: ReadonlyArray<readonly [number, Oklch]>;
  }>;
  particles: ReadonlyArray<{
    spec: ParticleSpec;
    color?: ReadonlyArray<readonly [number, Oklch]>;
    /** v0.7 — aurora top-edge gradient colour curve. */
    colorTop?: ReadonlyArray<readonly [number, Oklch]>;
    /** v0.7 — aurora bottom-edge gradient colour curve. */
    colorBot?: ReadonlyArray<readonly [number, Oklch]>;
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
      streak: band.kind === 'cloudBand' ? preprocessHexCurve(band.streakCurve) : undefined,
    })),
    celestials: theme.celestials.map((celestial) => ({
      celestial,
      color: preprocessHexCurve(celestial.colorCurve),
      rim:
        celestial.kind === 'gasGiantSpot'
          ? preprocessHexCurve(celestial.rimCurve)
          : undefined,
    })),
    particles: theme.particles.map((spec) => ({
      spec,
      color:
        spec.kind === 'clouds' ||
        spec.kind === 'birds' ||
        spec.kind === 'stormClouds' ||
        spec.kind === 'shearMotes'
          ? preprocessHexCurve(spec.colorCurve)
          : undefined,
      colorTop: spec.kind === 'aurora' ? preprocessHexCurve(spec.colorTopCurve) : undefined,
      colorBot: spec.kind === 'aurora' ? preprocessHexCurve(spec.colorBotCurve) : undefined,
    })),
  };
}

// ─── Seeded RNG (mulberry32) — deterministic per-theme positions ──────────
// Imported from @shared/utils/rng (single canonical implementation; the
// engine's spawn determinism uses the same function from the same source).

function themeSeed(themeId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < themeId.length; i++) {
    h ^= themeId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ─── Static-per-theme geometry seeders ────────────────────────────────────

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

// Cloud composition: each cloud is built from 6–8 heavily-overlapping circles
// during seeding, then those circles are UNIONED into a single Skia Path —
// `unionPath` — at seed time. At draw time we render one filled Path per
// cloud, not N circles. This kills two artefacts the per-circle approach
// produced:
//   1. Opacity-overlap dark bands. Group.opacity multiplies into each child's
//      paint individually, so where two semi-transparent circles overlapped
//      you got 1-(1-α)² — a visibly darker ring around every bubble. With
//      one path, no overlap at draw time, no dark bands.
//   2. Internal silhouette outlines. Antialiased circle edges left visible
//      arcs WHERE bubbles met, even at full opacity. The union path has no
//      internal edges — only the outer envelope is drawn.
// Bottom is still flat: the CLOUD_CLIP_PATH wrapper truncates every union
// at y=0 in cloud-local coords (same trick as before).
type CloudSeed = {
  baseX: number;
  baseY: number;
  scale: number;
  driftPhase: number;
  unionPath: ReturnType<typeof Skia.Path.Make>;
  alpha: number;
};

function seedClouds(
  spec: Extract<ParticleSpec, { kind: 'clouds' }>,
  seed: number,
): CloudSeed[] {
  const rng = mulberry32(seed ^ 0x33333333);
  const out: CloudSeed[] = [];
  for (let i = 0; i < spec.count; i++) {
    const baseX = rng() * SCREEN_W * 1.4;
    const baseY = 0.06 * VIS_H * SCALE + rng() * 0.28 * VIS_H * SCALE;
    const driftPhase = rng() * 1000;
    const scale = 0.85 + rng() * 0.55;
    const alpha = 0.75 + rng() * 0.2;
    // Bubble layout — 6-8 bubbles, base radius ~18-26 × scale, tight overlap
    // (≈0.42× radius) so they fuse into one continuous silhouette.
    const bubbleCount = 6 + Math.floor(rng() * 3);
    const baseR = (18 + rng() * 8) * scale;
    const stepX = baseR * 0.42;
    const totalSpan = stepX * (bubbleCount - 1);
    // Build the union path bubble-by-bubble. First circle seeds the path;
    // each subsequent circle is unioned in via Skia's PathOp.Union.
    const unionPath = Skia.Path.Make();
    for (let b = 0; b < bubbleCount; b++) {
      const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.3;
      // Bigger in the middle, smaller at edges — classic cumulus dome.
      const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.3 + (rng() - 0.5) * 0.15;
      const br = baseR * sizeFactor;
      // ALL bubbles share the same bottom: center at y = -br + 0.12br, so
      // bottom sits at y = 0.12br (slightly below cloud-local y=0). The
      // clip-path then uniformly truncates every bubble at y=0.
      const by = -br + br * 0.12;
      if (b === 0) {
        unionPath.addCircle(bx, by, br);
      } else {
        const cPath = Skia.Path.Make();
        cPath.addCircle(bx, by, br);
        unionPath.op(cPath, PathOp.Union);
      }
    }
    out.push({ baseX, baseY, scale, driftPhase, unionPath, alpha });
  }
  return out;
}

// Static clip path shared by all clouds — keeps only y ≤ 0 in cloud-local
// coords, giving each cloud a geometrically flat bottom regardless of how
// far below the baseline the bubble arcs would naturally extend.
const CLOUD_CLIP_PATH = (() => {
  const p = Skia.Path.Make();
  p.addRect({ x: -300, y: -300, width: 600, height: 300 });
  return p;
})();

// ─── v0.7 — Jupiter cloudBand seeding ────────────────────────────────────
// CloudBand path is closed: turbulent top edge → down to canvas bottom →
// close. Because the closure goes to canvas-bottom (not band-bottom), the
// band overpaints anything below; the next cloudBand layered in front
// then overpaints THIS band's lower portion. Layered bands tile cleanly
// with no sky-leak between them.
// Path span 2.4× SCREEN_W matches the iteration tool. Drift offset is
// applied via Group transform at draw time.
type CloudBandSeed = {
  path: ReturnType<typeof Skia.Path.Make>;
  /** v0.7.1 — pre-seeded SHADOW swirl-puff positions/sizes in band-local
   *  coords. Tinted from `streakCurve` (darker than band base) at render
   *  time. Each is an elongated horizontal ellipse with a soft radial
   *  alpha falloff (transparent edges) drifting at the band's
   *  `driftSpeed`. Reads as cloud-shadow chunks. */
  darkPuffs: ReadonlyArray<{ x: number; y: number; rx: number; ry: number; opacity: number }>;
  /** v0.7.1 r2 — pre-seeded HIGHLIGHT puffs. Tinted from band's `colorCurve`
   *  lifted toward white at render time. Fewer count + slightly lower
   *  opacity range than darkPuffs. Reads as bright cream cloud zones —
   *  the missing counterpart that gives Jovian banding photography its
   *  light/shadow texture. */
  lightPuffs: ReadonlyArray<{ x: number; y: number; rx: number; ry: number; opacity: number }>;
  /** Span the path was generated across (= SCREEN_W * 2.4). */
  spanPx: number;
};

function seedCloudBand(
  band: Extract<Band, { kind: 'cloudBand' }>,
  seedHash: number,
): CloudBandSeed {
  const heightPx = band.heightPct * VIS_H * SCALE;
  const yPx = band.yPct * VIS_H * SCALE;
  // Path goes from band's top edge down to canvas bottom (so it overpaints
  // anything below). Local coords: x ∈ [0, span], y ∈ [topEdgeY, hExtended].
  // Renderer applies translateY(yPx) at draw time; here we compute heights
  // local to that translated origin.
  const hExtended = VIS_H * SCALE - yPx;
  const rng = mulberry32(seedHash);
  const span = SCREEN_W * 2.4;
  const points = 96;
  const ampTop = band.turbulence * heightPx * 0.45;
  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const j3 = rng() * 6;
  const path = Skia.Path.Make();
  // Top edge — 3-octave sine for organic festoon look. ampTop additive
  // baseline pushes the wave below local y=0 so the edge sits inside the
  // band region rather than slicing through it.
  let firstY = 0;
  let firstX = 0;
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const o1 = Math.sin(x * 0.0035 + j1) * ampTop * 0.55;
    const o2 = Math.sin(x * 0.012 + j2) * ampTop * 0.3;
    const o3 = Math.sin(x * 0.045 + j3) * ampTop * 0.15;
    let yEdge = o1 + o2 + o3 + ampTop;
    if (i === 0) {
      firstY = yEdge;
      firstX = x;
      // Start path at bottom-left, jump up to top edge first point.
      path.moveTo(x, hExtended);
      path.lineTo(x, yEdge);
    } else {
      // Pin last point to first so tiled copies join seamlessly.
      if (i === points) yEdge = firstY;
      path.lineTo(x, yEdge);
    }
  }
  // Close: down to canvas bottom on the right, then close back to start.
  path.lineTo(span, hExtended);
  path.lineTo(firstX, hExtended);
  path.close();

  // v0.7.1 r5 — perf + busyness pass. Halved puff counts:
  //   darkCount: streaks × 2.5 → × 1.2
  //   lightCount: streaks × 1.8 → × 0.7
  // For typical band.streaks 4-7 this drops total puffs per band from
  // ~17-29 to ~6-12, and overall scene puff count from ~70-115 to ~25-50.
  // Visual: less busy / more readable; perf: ~½ the GPU shader work
  // for puff RadialGradients.
  // v0.7.1 r6 — per-puff cull below `particleZoneY` (yPct 0.67). Particles
  // (shearMotes) live in the bottom third; band puffs there overlap with
  // them creating visual noise. Skipping any puff whose absolute centre
  // would land in the particle zone keeps farBand2 + midBand2 fully
  // textured, drops the lower half of nearBand1, drops nearBand2 entirely.
  const bandYPx = band.yPct * VIS_H * SCALE;
  const particleZoneY = 0.67 * VIS_H * SCALE;
  type PuffSeed = { x: number; y: number; rx: number; ry: number; opacity: number };
  const darkCount = Math.max(3, Math.floor(band.streaks * 1.2));
  const darkPuffOut: PuffSeed[] = [];
  for (let i = 0; i < darkCount; i++) {
    const yPct = 0.15 + (i / darkCount) * 0.7 + (rng() - 0.5) * 0.3;
    const yPctClamped = Math.max(0.05, Math.min(0.95, yPct));
    const yAbs = bandYPx + heightPx * yPctClamped;
    if (yAbs >= particleZoneY) continue;
    const x = rng() * SCREEN_W * 2;
    const rx = SCREEN_W * (0.08 + rng() * 0.1);
    const ry = heightPx * (0.14 + rng() * 0.12);
    const opacity = 0.18 + rng() * 0.14;
    darkPuffOut.push({ x, y: heightPx * yPctClamped, rx, ry, opacity });
  }

  const lightCount = Math.max(2, Math.floor(band.streaks * 0.7));
  const lightPuffOut: PuffSeed[] = [];
  for (let i = 0; i < lightCount; i++) {
    const yPct = 0.15 + (i / lightCount) * 0.7 + (rng() - 0.5) * 0.3;
    const yPctClamped = Math.max(0.05, Math.min(0.95, yPct));
    const yAbs = bandYPx + heightPx * yPctClamped;
    if (yAbs >= particleZoneY) continue;
    const x = rng() * SCREEN_W * 2;
    const rx = SCREEN_W * (0.08 + rng() * 0.1);
    const ry = heightPx * (0.14 + rng() * 0.12);
    const opacity = 0.16 + rng() * 0.1;
    lightPuffOut.push({ x, y: heightPx * yPctClamped, rx, ry, opacity });
  }

  return { path, darkPuffs: darkPuffOut, lightPuffs: lightPuffOut, spanPx: span };
}

// ─── v0.7 — Jupiter stormClouds seeding ──────────────────────────────────
// Each storm cell is a cumulus dome: 5–7 overlapping circles unioned into
// one Skia Path at seed time (same union trick as Earth's clouds — kills
// opacity-overlap bands and internal antialiased seams). Unlike Earth's
// flat-bottomed cumulus, storm cells have NO clip — they float in
// atmosphere rather than sitting on a horizon.
type StormCellSeed = {
  baseX: number;
  baseY: number;
  driftPhase: number;
  unionPath: ReturnType<typeof Skia.Path.Make>;
  bbox: { x: number; y: number; w: number; h: number };
  alpha: number;
};

function seedStormClouds(
  spec: Extract<ParticleSpec, { kind: 'stormClouds' }>,
  seed: number,
): StormCellSeed[] {
  const rng = mulberry32(seed ^ 0x55aa55aa);
  const out: StormCellSeed[] = [];
  const yMinPx = spec.yMinPct * VIS_H * SCALE;
  const yMaxPx = spec.yMaxPct * VIS_H * SCALE;
  for (let i = 0; i < spec.count; i++) {
    const baseX = rng() * SCREEN_W * 1.4;
    const baseY = yMinPx + rng() * (yMaxPx - yMinPx);
    const driftPhase = rng() * 1000;
    // v0.7.1 — scale bumped from 0.7-1.4 → 1.0-1.8. Cells are now in the top
    // third (away from playing field), so they can read larger without
    // distracting from gameplay.
    const scale = 1.0 + rng() * 0.8;
    const alpha = 0.85 + rng() * 0.12;
    const bubbleCount = 5 + Math.floor(rng() * 3);
    const baseR = (14 + rng() * 7) * scale;
    const stepX = baseR * 0.55;
    const totalSpan = stepX * (bubbleCount - 1);
    const unionPath = Skia.Path.Make();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let b = 0; b < bubbleCount; b++) {
      const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.2;
      const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.32 + (rng() - 0.5) * 0.1;
      const br = baseR * sizeFactor;
      const by = -br * 0.18 + (rng() - 0.5) * br * 0.18;
      if (b === 0) {
        unionPath.addCircle(bx, by, br);
      } else {
        const cPath = Skia.Path.Make();
        cPath.addCircle(bx, by, br);
        unionPath.op(cPath, PathOp.Union);
      }
      if (bx - br < minX) minX = bx - br;
      if (bx + br > maxX) maxX = bx + br;
      if (by - br < minY) minY = by - br;
      if (by + br > maxY) maxY = by + br;
    }
    out.push({
      baseX,
      baseY,
      driftPhase,
      unionPath,
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      alpha,
    });
  }
  return out;
}

// ─── v0.7 — Jupiter shearMotes seeding ───────────────────────────────────
// Static base positions + per-mote wobble parameters. Wobble + drift +
// rotation computed per-frame via Math.sin / nowMs in render — no
// per-frame seeding.
// v0.7.1 — added rotPhase + rotFreq for leaf-in-wind tumble effect.
type ShearMoteSeed = {
  baseX: number;
  baseY: number;
  driftPhase: number;
  speedJ: number;
  wobblePhase: number;
  wobbleFreq1: number;
  wobbleFreq2: number;
  wobbleAmp1: number;
  wobbleAmp2: number;
  r: number;
  opacity: number;
  /** v0.7.1 — initial rotation in radians [0, 2π). */
  rotPhase: number;
  /** v0.7.1 — signed rotation rate in rad/ms. ±slow tumble. */
  rotFreq: number;
};

function seedShearMotes(
  spec: Extract<ParticleSpec, { kind: 'shearMotes' }>,
  seed: number,
): ShearMoteSeed[] {
  const rng = mulberry32(seed ^ 0x77cc77cc);
  const out: ShearMoteSeed[] = [];
  const yMinPx = spec.yMinPct * VIS_H * SCALE;
  const yMaxPx = spec.yMaxPct * VIS_H * SCALE;
  const [minR, maxR] = spec.sizeRange;
  for (let i = 0; i < spec.count; i++) {
    out.push({
      baseX: rng() * SCREEN_W * 1.4,
      baseY: yMinPx + rng() * (yMaxPx - yMinPx),
      driftPhase: rng() * 1000,
      speedJ: 0.7 + rng() * 0.6,
      wobblePhase: rng() * Math.PI * 2,
      wobbleFreq1: 0.0008 + rng() * 0.001,
      wobbleFreq2: 0.0024 + rng() * 0.003,
      wobbleAmp1: 6 + rng() * 8,
      wobbleAmp2: 2 + rng() * 4,
      r: minR + rng() * (maxR - minR),
      // v0.7.1 — opacity range 0.25-0.55 → 0.55-0.95 for better visibility
      // now that motes are confined to the bottom third (smaller stage).
      opacity: 0.55 + rng() * 0.4,
      // Slow tumble — ±0.0008 rad/ms = up to one full rotation every ~7s.
      rotPhase: rng() * Math.PI * 2,
      rotFreq: (rng() - 0.5) * 0.0016,
    });
  }
  return out;
}

// ─── Grass tufts (round 6) ────────────────────────────────────────────────
// Three-blade clumps with curl on the singleHill silhouette top edge. Two-
// tone (lighter front blade over darker side blades) for depth. ToD-aware
// colours: vivid in day, muted dawn/dusk, near-black at night. Per-clump
// scale + position jitter; ~18% gap probability creates visible clusters
// and gaps. Optional 4th rogue blade per clump (20%) breaks the symmetric
// 3-blade pattern.
//
// Static geometry — memoized per band/seed alongside silhouettePaths.
// Per-frame variable: only the two layer colours (light/dark) sampled
// from the curves below.

const GRASS_LIGHT_CURVE = preprocessHexCurve([
  { t: 0.0, color: '#6a8458' }, // dawn — cool muted green
  { t: 0.25, color: '#5aa040' }, // day  — vivid grass green
  { t: 0.5, color: '#7a8038' }, // dusk — warm olive
  { t: 0.75, color: '#0a1410' }, // night — near-black green
]);

const GRASS_DARK_CURVE = preprocessHexCurve([
  { t: 0.0, color: '#3e5430' }, // dawn — deep moss
  { t: 0.25, color: '#356528' }, // day  — saturated forest
  { t: 0.5, color: '#4f5020' }, // dusk — dark olive
  { t: 0.75, color: '#050a08' }, // night — almost black
]);

type GrassPaths = {
  light: ReturnType<typeof Skia.Path.Make>;
  dark: ReturnType<typeof Skia.Path.Make>;
};

function seedGrass(yPx: number, heightPx: number, seed: number): GrassPaths {
  const rng = mulberry32(seed ^ 0x60ad60ad);
  const span = SCREEN_W * 2.0;
  const peakX = span * 0.42;
  const peakY = heightPx * 0.55; // matches singleHillPath
  const clumpSpacing = 22;

  const light = Skia.Path.Make();
  const dark = Skia.Path.Make();

  // Append a single curved blade (two Q-curves forming a closed shape) to
  // the given path. Curl shifts the mid control points perpendicular to
  // the blade direction, giving each blade a clear soft arc.
  function addBlade(
    target: ReturnType<typeof Skia.Path.Make>,
    xBase: number,
    yBase: number,
    angle: number,
    length: number,
    baseWidth: number,
    curlDir: number,
  ) {
    const tipX = xBase + Math.sin(angle) * length;
    const tipY = yBase - Math.cos(angle) * length;
    const midX = xBase + Math.sin(angle) * length * 0.5;
    const midY = yBase - Math.cos(angle) * length * 0.5;
    const curlAmount = length * 0.15 * curlDir;
    const curlX = Math.cos(angle) * curlAmount;
    const curlY = Math.sin(angle) * curlAmount;
    const perpX = Math.cos(angle) * baseWidth * 0.5;
    const perpY = Math.sin(angle) * baseWidth * 0.5;
    target.moveTo(xBase - baseWidth, yBase);
    target.quadTo(midX + curlX - perpX, midY + curlY - perpY, tipX, tipY);
    target.quadTo(midX + curlX + perpX, midY + curlY + perpY, xBase + baseWidth, yBase);
    target.close();
  }

  for (let x = 0; x <= span; x += clumpSpacing) {
    if (rng() < 0.18) continue; // ~18% gaps — creates visible clusters and gaps
    // Bell curve matches singleHillPath — blade bases sit on the silhouette top.
    const dx = (x - peakX) / (span * 0.55);
    const bell = 1 / (1 + dx * dx);
    const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
    const yEdge = yPx + heightPx - (heightPx - peakY) * bell + tilt;
    const xJitter = (rng() - 0.5) * clumpSpacing * 0.4;
    const xPos = x + xJitter;
    const clumpScale = 0.7 + rng() * 0.7; // 0.7–1.4 — wider variation

    // Center blade — tallest, mostly vertical, lighter shade (pops over sides).
    const centerAngle = (rng() - 0.5) * 0.5; // ±~14° wobble
    const centerH = (16 + rng() * 10) * clumpScale;
    const centerBaseW = (1.8 + rng() * 0.6) * clumpScale;
    const centerCurl = (rng() - 0.5) * 1.2;
    addBlade(light, xPos, yEdge, centerAngle, centerH, centerBaseW, centerCurl);

    // Left blade — angled out left, shorter, darker (recedes).
    const leftAngle = -0.45 + (rng() - 0.5) * 0.45;
    const leftH = (12 + rng() * 5) * clumpScale;
    const leftBaseW = (1.3 + rng() * 0.4) * clumpScale;
    const leftCurl = 0.5 + rng() * 0.5;
    addBlade(dark, xPos - 2, yEdge, leftAngle, leftH, leftBaseW, leftCurl);

    // Right blade — angled out right, shorter, darker.
    const rightAngle = 0.45 + (rng() - 0.5) * 0.45;
    const rightH = (12 + rng() * 5) * clumpScale;
    const rightBaseW = (1.3 + rng() * 0.4) * clumpScale;
    const rightCurl = -(0.5 + rng() * 0.5);
    addBlade(dark, xPos + 2, yEdge, rightAngle, rightH, rightBaseW, rightCurl);

    // Occasional rogue 4th blade — random angle, lighter, breaks 3-blade pattern.
    if (rng() < 0.2) {
      const rogueAngle = (rng() - 0.5) * 1.0;
      const rogueH = (10 + rng() * 6) * clumpScale;
      const rogueBaseW = (1.2 + rng() * 0.4) * clumpScale;
      const rogueCurl = (rng() - 0.5) * 1.5;
      const rogueOffset = (rng() - 0.5) * 4;
      addBlade(light, xPos + rogueOffset, yEdge, rogueAngle, rogueH, rogueBaseW, rogueCurl);
    }
  }
  return { light, dark };
}

type BirdSeed = {
  baseX: number;
  baseY: number;
  driftPhase: number;
  size: number;
  flapPhase: number;
  alpha: number;
};

function seedBirds(spec: Extract<ParticleSpec, { kind: 'birds' }>, seed: number): BirdSeed[] {
  const rng = mulberry32(seed ^ 0x77777777);
  const out: BirdSeed[] = [];
  const sizeMul = spec.sizeMul;
  for (let i = 0; i < spec.count; i++) {
    out.push({
      baseX: rng() * SCREEN_W * 1.2,
      baseY: 0.18 * VIS_H * SCALE + rng() * 0.25 * VIS_H * SCALE,
      driftPhase: rng() * 1000,
      size: (4 + rng() * 3) * sizeMul,
      flapPhase: rng() * Math.PI * 2,
      alpha: 0.55 + rng() * 0.3,
    });
  }
  return out;
}

// ─── Procedural silhouette paths ──────────────────────────────────────────

/**
 * Build a silhouette path filling [yPx, yPx+heightPx] across 2× canvas width,
 * with the top edge shaped by the given profile.
 *
 * Path is in screen pixels, anchored at (0, 0). Render applies translateX =
 * -((scrollX * parallax) mod SCREEN_W) for parallax scroll.
 */
function buildSilhouettePath(
  profile: SilhouetteProfile,
  yPx: number,
  heightPx: number,
  seed: number,
): ReturnType<typeof Skia.Path.Make> {
  const p = Skia.Path.Make();
  const tileW = SCREEN_W * 2;

  if (profile === 'mountains') {
    // Earth — peaked Bezier ridge with random peak/valley nodes.
    // Round 6: peaks lowered (was 0.65-0.95 of band height, now 0.45-0.75) —
    // gentler slopes, less aggressive silhouette.
    const rng = mulberry32(seed);
    const span = SCREEN_W * 2.5;
    const numNodes = 5;
    const nodes: Array<[number, number]> = [];
    for (let i = 0; i <= numNodes; i++) {
      const x = (i / numNodes) * span;
      const isPeak = i % 2 === 1;
      const heightFrac = isPeak ? 0.45 + rng() * 0.3 : 0.15 + rng() * 0.2;
      nodes.push([x, yPx + heightPx * (1 - heightFrac)]);
    }
    // Periodicity fix: pin the last node's y to the first node's y so the
    // path's right edge matches its left edge. Lets two-copy tiling render
    // a seamless silhouette across the parallax wrap.
    nodes[nodes.length - 1]![1] = nodes[0]![1];
    p.moveTo(nodes[0]![0], yPx + heightPx);
    p.lineTo(nodes[0]![0], nodes[0]![1]);
    for (let i = 1; i < nodes.length; i++) {
      const p0 = nodes[i - 1]!;
      const p1 = nodes[i]!;
      const dx = p1[0] - p0[0];
      const c1x = p0[0] + dx * 0.4;
      const c1y = p0[1];
      const c2x = p1[0] - dx * 0.4;
      const c2y = p1[1];
      p.cubicTo(c1x, c1y, c2x, c2y, p1[0], p1[1]);
    }
    const last = nodes[nodes.length - 1]!;
    p.lineTo(last[0], yPx + heightPx);
    p.close();
    return p;
  }

  if (profile === 'hills') {
    // Earth — gentle low-frequency rolling sine (no peaks).
    const rng = mulberry32(seed);
    const j1 = rng() * 6;
    const j2 = rng() * 6;
    const points = 60;
    const span = SCREEN_W * 2.4;
    p.moveTo(0, yPx + heightPx);
    let firstY = 0;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      let y =
        Math.sin(x * 0.0035 + j1) * heightPx * 0.3 +
        Math.sin(x * 0.011 + j2) * heightPx * 0.13 +
        Math.sin(x * 0.045 + rng() * 6) * heightPx * 0.04 +
        heightPx * 0.55;
      if (i === 0) firstY = y;
      // Periodicity fix: pin last sample to firstY so two-copy tiling has
      // no seam at the wrap.
      if (i === points) y = firstY;
      p.lineTo(x, yPx + y);
    }
    p.lineTo(span, yPx + heightPx);
    p.close();
    return p;
  }

  if (profile === 'singleHill') {
    // Earth — flat foreground rise (round 6). Bell curve with peak lowered
    // (h*0.05 → h*0.55), surface ripple removed, 120 points for smoother lines.
    // Pairs with the singleHill band's slowed parallax (0.30) and lower
    // yPct/heightPct in the theme so the peak sits low on screen.
    const span = SCREEN_W * 2.0;
    const peakX = span * 0.42;
    const peakY = heightPx * 0.55;
    const points = 120;
    p.moveTo(0, yPx + heightPx);
    let firstY = 0;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      const dx = (x - peakX) / (span * 0.55);
      const bell = 1 / (1 + dx * dx);
      const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
      let y = heightPx - (heightPx - peakY) * bell + tilt;
      if (i === 0) firstY = y;
      if (i === points) y = firstY;
      p.lineTo(x, yPx + y);
    }
    p.lineTo(span, yPx + heightPx);
    p.close();
    return p;
  }

  if (profile === 'soft-craters') {
    // Moon — far ridge — single low-frequency octave, capped at 55% band height.
    const step = 4;
    p.moveTo(0, yPx + heightPx);
    let firstY = 0;
    for (let x = 0; x <= tileW; x += step) {
      const base = Math.sin(x * 0.012 + seed) * 0.5;
      const wobble = Math.sin(x * 0.04 + seed * 1.7) * 0.15;
      let yLocal = (0.5 + (base + wobble) * 0.5) * heightPx * 0.55;
      if (x === 0) firstY = yLocal;
      if (x + step > tileW) yLocal = firstY;
      p.lineTo(x, yPx + yLocal);
    }
    p.lineTo(tileW, yPx + heightPx);
    p.close();
    return p;
  }

  if (profile === 'cratered-horizon') {
    // Moon — mid ridge (round 6). 96 points across 2.4× canvas width.
    // Three-octave silhouette: large primary peaks (sin × 0.018) + medium
    // variation (sin × 0.07) + fine surface detail (sin × 0.18). Base
    // shifted up (h*0.40 vs 0.45) so peaks reach higher. Wider crater dip
    // events (~every 200x) for sharper foreground crater feel. Higher
    // resolution + the new amplitude mix eliminates the polygon-ish feel
    // from the 36-point version.
    const rng = mulberry32(seed);
    const j1 = rng() * 6;
    const j2 = rng() * 6;
    const j3 = rng() * 6;
    const points = 96;
    const span = SCREEN_W * 2.4;
    p.moveTo(0, yPx + heightPx);
    let firstY = 0;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      const base =
        Math.sin(x * 0.018 + j1) * heightPx * 0.55 +
        Math.sin(x * 0.07 + j2) * heightPx * 0.2 +
        Math.sin(x * 0.18 + j3) * heightPx * 0.06 +
        heightPx * 0.4;
      const crater = Math.sin(x * 0.005) > 0.85 ? -heightPx * 0.12 : 0;
      let y = base + crater;
      if (i === 0) firstY = y;
      if (i === points) y = firstY;
      p.lineTo(x, yPx + y);
    }
    p.lineTo(span, yPx + heightPx);
    p.close();
    return p;
  }

  if (profile === 'storm-bands') {
    // Jupiter — atmospheric ribbon with subtle flow undulation along the top
    // edge. Amplitude is intentionally small (~6% of band height) so each
    // band reads as a horizontal stripe, not a wave. The bottom of the band
    // extends fully so when bands stack they tile cleanly with no gap.
    const step = 6;
    p.moveTo(0, yPx + heightPx);
    let firstY = 0;
    for (let x = 0; x <= tileW; x += step) {
      const flow =
        Math.sin(x * 0.008 + seed) * 0.05 + Math.sin(x * 0.025 + seed * 1.4) * 0.025;
      let yLocal = flow * heightPx;
      if (x === 0) firstY = yLocal;
      if (x + step > tileW) yLocal = firstY;
      p.lineTo(x, yPx + yLocal);
    }
    p.lineTo(tileW, yPx + heightPx);
    p.close();
    return p;
  }

  // Unreachable — all profiles handled above.
  p.moveTo(0, yPx + heightPx);
  p.lineTo(tileW, yPx + heightPx);
  p.close();
  return p;
}

// ─── Crater seeds for foreground 'craters' band ───────────────────────────
// Craters are STATIC features of the regolith (round 6) — they don't drift
// with scroll. Renderer ignores band.parallax for the craters branch.
//
// Power-law size distribution (75% small / 20% medium / 5% large) gives the
// moon-realistic mix; 25-attempt overlap rejection with 10% buffer prevents
// pile-ups. Each crater renders as two ellipses: outer rim (lighter, 1.08×,
// sun-catch halo) + inner bowl (offset up by 15% of ry, darker, suggests
// depth from above-light viewing angle).

type Crater = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  opacity: number;
};

function seedCraters(yPx: number, heightPx: number, seed: number): Crater[] {
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const out: Crater[] = [];
  const targetCount = 32;
  for (let i = 0; i < targetCount; i++) {
    const sizeRoll = rng();
    let rx: number;
    let ry: number;
    if (sizeRoll < 0.75) {
      rx = 6 + rng() * 8; // 6-14 (small)
      ry = 2 + rng() * 2; // 2-4
    } else if (sizeRoll < 0.95) {
      rx = 14 + rng() * 14; // 14-28 (medium)
      ry = 4 + rng() * 3; // 4-7
    } else {
      rx = 28 + rng() * 22; // 28-50 (large — rare)
      ry = 7 + rng() * 5; // 7-12
    }
    // Up to 25 placements; skip if we can't avoid overlap (10% buffer).
    let placed = false;
    for (let attempt = 0; attempt < 25 && !placed; attempt++) {
      const cx = rng() * SCREEN_W;
      const cy = yPx + heightPx * 0.05 + rng() * heightPx * 0.9;
      let overlaps = false;
      for (const e of out) {
        const dxc = cx - e.x;
        const dyc = cy - e.y;
        const dist = Math.sqrt(dxc * dxc + dyc * dyc);
        const minDist = (rx + e.rx) * 1.1;
        if (dist < minDist) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        out.push({ x: cx, y: cy, rx, ry, opacity: 0.55 + rng() * 0.35 });
        placed = true;
      }
    }
  }
  return out;
}

// ─── Per-profile silhouette path span (in canvas-width multiples) ────────
// The path generators in geometry/paths.ts each lay out their content across
// `SCREEN_W * spanMul` pixels. We need this multiplier here so BandRender can
// wrap the parallax offset at the FULL path span (not at SCREEN_W). Wrapping
// at SCREEN_W creates a visible content jump when the path's right-side
// content suddenly gets replaced by left-side content; wrapping at the full
// span and tiling two copies side-by-side keeps the wrap event rare and the
// seam offscreen for most of the cycle.
function silhouetteSpanMul(profile: SilhouetteProfile): number {
  switch (profile) {
    case 'mountains':
      return 2.5;
    case 'hills':
      return 2.4;
    case 'singleHill':
      return 2.0;
    case 'cratered-horizon':
      return 2.4;
    case 'soft-craters':
      return 2.0;
    case 'storm-bands':
      return 2.0;
  }
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
        // Amplitude bumped from [0.6, 1.0] (40% range) to [0.25, 1.0]
        // (75% range) so the twinkle reads clearly on device — was too
        // subtle on Moon's 80 night-dominant stars. Frequency unchanged
        // (~1 Hz). Earth/Jupiter stars are sparse + small so the bigger
        // range still reads as gentle flicker, not strobing.
        const twinkle = spec.twinkle
          ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(nowMs / 1000 + s.phase))
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
  // Caller is responsible for not invoking this with kind: 'storm-eye' —
  // those are rendered separately AFTER bands (see WorldRenderer below).
  // Putting the filter here would conflict with the useMemo hook order.

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
  // v0.7 — `phaseCurve` lives only on the legacy union variant (sun/moon/
  // planet/storm-eye/earth). The `gasGiantSpot` variant doesn't carry it,
  // so we narrow with `'phaseCurve' in celestial` before accessing.
  const phaseCurve = 'phaseCurve' in celestial ? celestial.phaseCurve : undefined;
  const bodyClip = useMemo(() => {
    if (!phaseCurve) return null;
    const path = Skia.Path.Make();
    path.addCircle(cx, cy, r);
    return path;
  }, [phaseCurve, cx, cy, r]);

  const glow = sampleScalarCurve(celestial.glowCurve, t);
  // Visibility rule (revised v0.5 + Jupiter): glow=0 hides body+halo only
  // for light-source celestials (sun, moon). Storm-eye and planet are
  // physical features and remain visible regardless of glow value.
  const isLightSource = celestial.kind === 'sun' || celestial.kind === 'moon';
  if (glow <= 0.01 && isLightSource) return null;

  const baseOklch = sampleOklchCurve(preColor, t);
  const col = oklchToHex(baseOklch);

  let phaseShadow: React.ReactElement | null = null;
  if (phaseCurve && bodyClip) {
    const phase = sampleScalarCurve(phaseCurve, t);
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
        // One pre-unioned Path per cloud — see seedClouds for why. Drawing
        // a single filled Path with one paint at one alpha eliminates both
        // opacity-overlap dark bands and internal silhouette outlines that
        // the old per-circle approach produced. The CLOUD_CLIP_PATH wrapper
        // still truncates the bottom flat.
        return (
          <Group
            key={i}
            transform={[{ translateX: x }, { translateY: c.baseY }]}
            opacity={opacity}
          >
            <Group clip={CLOUD_CLIP_PATH}>
              <Path path={c.unionPath} color={tint} style="fill" antiAlias />
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
  // Stroke width is per-bird in the seed but Skia's Path doesn't carry per-
  // subpath stroke; flatten to a representative size (mean of seeded sizes).
  //
  // Round 6 wing flap rewrite: wingtips oscillate UP/DOWN (signed tipLift,
  // swings through zero) — body stays fixed. Each wing's control point is
  // placed PERPENDICULAR to the tip→body line at a consistent magnitude
  // (size × 0.45), so the arc magnitude stays consistent regardless of where
  // the wing is in the flap cycle. Curl always points upward (negative y) —
  // gives each wing a clear soft arc rather than a chevron straight line.
  // Slowed to ~1.3 Hz (sin × 0.008) — more like real flight, less frantic.
  const path = Skia.Path.Make();
  let widthSum = 0;
  for (const b of birds) {
    const drift = (nowMs * 0.04 * spec.speed + b.driftPhase) % (SCREEN_W + 100);
    const x = ((b.baseX + drift) % (SCREEN_W + 100)) - 50;
    const tipLift = Math.sin(nowMs * 0.008 + b.flapPhase) * 0.7; // signed
    const tipY = b.baseY + b.size * tipLift;
    const curlMag = b.size * 0.45;

    // Left wing: tip → body. Perpendicular to (body - tip), curl points up.
    const lDx = b.size; // body.x - tip.x
    const lDy = b.baseY - tipY;
    const lLen = Math.sqrt(lDx * lDx + lDy * lDy);
    const lPerpX = lDy / lLen;
    const lPerpY = -lDx / lLen; // always negative (points up)
    const lCtrlX = (x - b.size + x) / 2 + lPerpX * curlMag;
    const lCtrlY = (tipY + b.baseY) / 2 + lPerpY * curlMag;

    // Right wing: body → tip (mirror).
    const rDx = b.size;
    const rDy = tipY - b.baseY;
    const rLen = Math.sqrt(rDx * rDx + rDy * rDy);
    const rPerpX = rDy / rLen;
    const rPerpY = -rDx / rLen;
    const rCtrlX = (x + x + b.size) / 2 + rPerpX * curlMag;
    const rCtrlY = (b.baseY + tipY) / 2 + rPerpY * curlMag;

    path.moveTo(x - b.size, tipY);
    path.quadTo(lCtrlX, lCtrlY, x, b.baseY);
    path.quadTo(rCtrlX, rCtrlY, x + b.size, tipY);
    widthSum += Math.max(0.9, b.size * 0.18);
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
  craters?: Crater[];
  t: number;
  scrollX: number;
}): React.ReactElement {
  const yPx = band.yPct * VIS_H * SCALE;
  const heightPx = band.heightPct * VIS_H * SCALE;
  const col = oklchToHex(sampleOklchCurve(preColor, t));

  if (band.kind === 'silhouette' && silhouettePath) {
    // Parallax wrap — render two copies of the path side-by-side and wrap
    // the offset at the FULL path span (not at SCREEN_W). Wrapping at
    // SCREEN_W creates a visible discontinuity once per parallax cycle as
    // the path's right-side content gets replaced by left-side content
    // (different shapes). Two copies at translateX = dx and dx + spanPx
    // keep the seam offscreen for most of the cycle and reduce wrap
    // frequency by spanMul× (≈2.0–2.5×).
    const spanPx = SCREEN_W * silhouetteSpanMul(band.profile);
    const tiledDx = -((scrollX * band.parallax) % spanPx);

    // Grass tufts (round 6) — only on the closest foreground hill (singleHill
    // profile). Render OUTSIDE the silhouette clip — blade tips extend above
    // the silhouette top edge.
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
    if (preGradient) {
      const topCol = oklchToHex(sampleOklchCurve(preGradient, t));
      const gradientFill = (
        <Group clip={silhouettePath}>
          <Rect x={0} y={yPx} width={SCREEN_W * 2} height={heightPx}>
            <LinearGradient
              start={vec(0, yPx)}
              end={vec(0, yPx + heightPx)}
              colors={[topCol, col, col]}
              positions={[0, 0.6, 1]}
            />
          </Rect>
        </Group>
      );
      return (
        <>
          <Group transform={[{ translateX: tiledDx }]}>
            {gradientFill}
            {grassNode}
          </Group>
          <Group transform={[{ translateX: tiledDx + spanPx }]}>
            {gradientFill}
            {grassNode}
          </Group>
        </>
      );
    }
    return (
      <>
        <Group transform={[{ translateX: tiledDx }]}>
          <Path path={silhouettePath} color={col} style="fill" antiAlias />
          {grassNode}
        </Group>
        <Group transform={[{ translateX: tiledDx + spanPx }]}>
          <Path path={silhouettePath} color={col} style="fill" antiAlias />
          {grassNode}
        </Group>
      </>
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
    // Round 6: two-shade depth illusion — lighter rim halo + darker bowl
    // offset slightly upward (suggests depth from above-light viewing).
    // Craters are STATIC: we don't apply the parallax transform here. The
    // band's underlying colour fill is rendered by the nearPlain band
    // beneath; this branch overlays just the crater pattern.
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
        {craters.map((c, i) => {
          // Outer rim — slight halo, lighter than the bowl. Sun-catch effect.
          const rimPath = Skia.Path.Make();
          rimPath.addOval({
            x: c.x - c.rx * 1.08,
            y: c.y - c.ry * 1.08,
            width: c.rx * 1.08 * 2,
            height: c.ry * 1.08 * 2,
          });
          // Inner bowl — darker, offset upward to suggest depth.
          const bowlPath = Skia.Path.Make();
          bowlPath.addOval({
            x: c.x - c.rx * 0.85,
            y: c.y - c.ry * 0.15 - c.ry * 0.8,
            width: c.rx * 0.85 * 2,
            height: c.ry * 0.8 * 2,
          });
          return (
            <Group key={i}>
              <Path path={rimPath} color={rimCol} style="fill" opacity={c.opacity * 0.4} antiAlias />
              <Path path={bowlPath} color={bowlCol} style="fill" opacity={c.opacity} antiAlias />
            </Group>
          );
        })}
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

  // Combined continents path. Africa/Europe/S.America/N.America fragment +
  // Madagascar (separate path because it's an oval, not a Q-curve outline).
  const continentsPath = useMemo(() => {
    const x = cx;
    const y = cy;
    const d = [
      // Africa — taller than wide, distinct horn east, narrow Cape south.
      `M ${x - r * 0.08},${y - r * 0.46}` +
        ` L ${x + r * 0.14},${y - r * 0.44}` +
        ` Q ${x + r * 0.22},${y - r * 0.36} ${x + r * 0.22},${y - r * 0.18}` +
        ` Q ${x + r * 0.3},${y - r * 0.02} ${x + r * 0.26},${y + r * 0.1}` +
        ` Q ${x + r * 0.14},${y + r * 0.2} ${x + r * 0.06},${y + r * 0.35}` +
        ` Q ${x - r * 0.02},${y + r * 0.5} ${x - r * 0.06},${y + r * 0.58}` +
        ` Q ${x - r * 0.18},${y + r * 0.48} ${x - r * 0.22},${y + r * 0.32}` +
        ` Q ${x - r * 0.27},${y + r * 0.1} ${x - r * 0.25},${y - r * 0.12}` +
        ` Q ${x - r * 0.22},${y - r * 0.32} ${x - r * 0.16},${y - r * 0.42}` +
        ` Q ${x - r * 0.12},${y - r * 0.46} ${x - r * 0.08},${y - r * 0.46} Z`,
      // Europe — Iberian bump west, Italian boot middle, eastward Eurasia.
      `M ${x - r * 0.22},${y - r * 0.5}` +
        ` Q ${x - r * 0.3},${y - r * 0.62} ${x - r * 0.15},${y - r * 0.66}` +
        ` Q ${x + r * 0.05},${y - r * 0.72} ${x + r * 0.25},${y - r * 0.66}` +
        ` Q ${x + r * 0.4},${y - r * 0.6} ${x + r * 0.42},${y - r * 0.5}` +
        ` Q ${x + r * 0.34},${y - r * 0.46} ${x + r * 0.2},${y - r * 0.48}` +
        ` L ${x + r * 0.08},${y - r * 0.44}` +
        ` Q ${x + r * 0.04},${y - r * 0.4} ${x + r * 0},${y - r * 0.45}` +
        ` L ${x - r * 0.1},${y - r * 0.46}` +
        ` Q ${x - r * 0.18},${y - r * 0.44} ${x - r * 0.22},${y - r * 0.5} Z`,
      // South America fragment — western limb. Wider top → narrow Patagonia.
      `M ${x - r * 0.85},${y - r * 0.1}` +
        ` Q ${x - r * 0.55},${y - r * 0.05} ${x - r * 0.48},${y + r * 0.08}` +
        ` Q ${x - r * 0.5},${y + r * 0.25} ${x - r * 0.55},${y + r * 0.4}` +
        ` Q ${x - r * 0.6},${y + r * 0.5} ${x - r * 0.65},${y + r * 0.42}` +
        ` Q ${x - r * 0.62},${y + r * 0.25} ${x - r * 0.68},${y + r * 0.1}` +
        ` Q ${x - r * 0.78},${y + r * 0} ${x - r * 0.85},${y - r * 0.1} Z`,
      // North America fragment — upper-left. Hints at the continental mass.
      `M ${x - r * 0.85},${y - r * 0.5}` +
        ` Q ${x - r * 0.55},${y - r * 0.45} ${x - r * 0.42},${y - r * 0.3}` +
        ` Q ${x - r * 0.4},${y - r * 0.18} ${x - r * 0.5},${y - r * 0.12}` +
        ` Q ${x - r * 0.65},${y - r * 0.18} ${x - r * 0.78},${y - r * 0.3}` +
        ` Q ${x - r * 0.88},${y - r * 0.4} ${x - r * 0.85},${y - r * 0.5} Z`,
    ].join(' ');
    return Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
  }, [cx, cy, r]);

  // Madagascar — small island east of southern Africa. Distinctive cue.
  const madagascarPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addOval({
      x: cx + r * 0.34 - r * 0.04,
      y: cy + r * 0.22 - r * 0.1,
      width: r * 0.04 * 2,
      height: r * 0.1 * 2,
    });
    return path;
  }, [cx, cy, r]);

  // Polar ice caps — north (rx=0.55, ry=0.18) and south (rx=0.5, ry=0.15).
  const iceCapsPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addOval({
      x: cx - r * 0.55,
      y: cy - r * 0.95 - r * 0.18,
      width: r * 0.55 * 2,
      height: r * 0.18 * 2,
    });
    path.addOval({
      x: cx - r * 0.5,
      y: cy + r * 0.95 - r * 0.15,
      width: r * 0.5 * 2,
      height: r * 0.15 * 2,
    });
    return path;
  }, [cx, cy, r]);

  const glow = sampleScalarCurve(celestial.glowCurve, t);
  const oceanCol = oklchToHex(sampleOklchCurve(preColor, t));
  const continentCol = '#3a7a3e'; // matches iteration tool's static fallback

  return (
    <Group>
      {/* Atmospheric glow halo (light blue, fades to transparent) */}
      <Circle cx={cx} cy={cy} r={r * 1.8} opacity={glow}>
        <RadialGradient
          c={vec(cx, cy)}
          r={r * 1.8}
          colors={['#a8d0f0', '#a8d0f000']}
        />
      </Circle>
      {/* Ocean body */}
      <Circle cx={cx} cy={cy} r={r} color={oceanCol} />
      {/* Continents + Madagascar + ice caps + terminator — all clipped to body */}
      <Group clip={bodyClip}>
        <Path path={continentsPath} color={continentCol} style="fill" antiAlias />
        <Path path={madagascarPath} color={continentCol} style="fill" antiAlias />
        <Path
          path={iceCapsPath}
          color="#ffffff"
          opacity={0.85}
          style="fill"
          antiAlias
        />
        {/* Soft terminator — dark crescent on lower-right of the ocean body */}
        <Circle cx={cx + r * 0.35} cy={cy + r * 0.05} r={r} color="#000000" opacity={0.22} />
      </Group>
    </Group>
  );
}

/**
 * StormEye — Jupiter's Great Red Spot rendering. Hardcoded behaviour keyed
 * off `kind: 'storm-eye'` (no schema additions).
 *
 * Visual: oblate ellipse (1.6× horizontal aspect) over the SEB. Smoke-test
 * v0.3.1: dropped the 4 concentric stroked flow rings — they read as a
 * bullseye / vinyl record / tree-trunk cross-section, not as a storm. Also
 * dropped the slow rotation: with asymmetric content (the rings), the
 * ~63s turn read as a mid-rotation tilt rather than ambient flow. With
 * the new content (rotationally symmetric body + core), rotation has
 * nothing to tilt and adds no value — keep it static.
 *
 * Replaced with a single darker inner-fill oval at 0.7× scale (≈45%
 * opacity) — gives the GRS a "core" feel without explicit ring lines.
 * Reads as an atmospheric vortex rather than a target.
 *
 * Rendered AFTER bands so it overlays the SEB where the GRS sits in real
 * Jupiter. Geometry memoized per radius so re-renders don't reallocate.
 */
function StormEye({
  celestial,
  preColor,
  t,
}: {
  celestial: Celestial;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
}): React.ReactElement {
  const cx = celestial.xPct * SCREEN_W;
  const cy = celestial.yPct * VIS_H * SCALE;
  const r = celestial.radius;
  const aspect = 1.6; // oblate horizontally — GRS is wider than tall

  // Body + core paths memoized per radius (static across renders).
  const bodyPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addOval({ x: -r * aspect, y: -r, width: 2 * r * aspect, height: 2 * r });
    return path;
  }, [r]);

  const corePath = useMemo(() => {
    const path = Skia.Path.Make();
    const s = 0.7;
    path.addOval({
      x: -r * aspect * s,
      y: -r * s,
      width: 2 * r * aspect * s,
      height: 2 * r * s,
    });
    return path;
  }, [r]);

  const baseOklch = sampleOklchCurve(preColor, t);
  const col = oklchToHex(baseOklch);
  // Core color: darker shade of body — suggests vortex depth without ring lines.
  const coreCol = oklchToHex([baseOklch[0] * 0.65, baseOklch[1] * 0.85, baseOklch[2]]);

  return (
    <Group transform={[{ translateX: cx }, { translateY: cy }]}>
      <Path path={bodyPath} color={col} style="fill" antiAlias />
      <Path path={corePath} color={coreCol} style="fill" opacity={0.45} antiAlias />
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

// ═══ v0.7 Jupiter components ═══════════════════════════════════════════════

/**
 * CloudBandRender — Jupiter atmospheric cloud band. Replaces silhouette+
 * storm-bands. Pre-built festoon-edged path (closed: top wave → canvas
 * bottom → close) is tiled twice horizontally and translated by parallax
 * offset. Internal shear streaks drift independently at `driftSpeed`,
 * tinted by streakCurve, drawn as horizontal stroked lines.
 */
function CloudBandRender({
  band,
  seed,
  preColor,
  t,
  scrollX,
  nowMs,
}: {
  band: Extract<Band, { kind: 'cloudBand' }>;
  seed: CloudBandSeed;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  scrollX: number;
  nowMs: number;
}): React.ReactElement {
  // heightPx not needed at render time — the seed's pre-built path encodes
  // all height info (top wave + canvas-bottom closure). yPx places the band.
  const yPx = band.yPct * VIS_H * SCALE;
  const baseOklch = sampleOklchCurve(preColor, t);
  const col = oklchToHex(baseOklch);
  // v0.7.1 r4 — both puff tints now derived from the band's own colorCurve
  // (not streakCurve). Smaller L deltas so puffs read as in-band cloud
  // variation — same hue family, just slightly brighter/darker — rather
  // than as foreign overlays. streakCurve no longer sampled here (preStreak
  // prop still received for back-compat) but stays in the schema for
  // potential future use (e.g., proper streak overlay if needed).
  const darkTint = oklchToHex([
    Math.max(0, baseOklch[0] - 0.12),
    baseOklch[1] * 0.95,
    baseOklch[2],
  ]);
  const lightTint = oklchToHex([
    Math.min(1, baseOklch[0] + 0.18),
    baseOklch[1] * 0.85,
    baseOklch[2],
  ]);

  // Drift offset = parallax scroll + independent shear drift, normalised
  // to (-SCREEN_W, 0]. JS modulo preserves sign of dividend, so for
  // negative driftSpeeds we'd otherwise get a positive offset that exposes
  // a vertical seam on the left edge — the (+w)%w step fixes it.
  const sx = scrollX * band.parallax;
  const driftPx = (nowMs * band.driftSpeed * 0.02) % SCREEN_W;
  const totalX = sx + driftPx;
  const offset = -(((totalX % SCREEN_W) + SCREEN_W) % SCREEN_W);

  // Streaks drift faster — multiplier 1.5 (renderer was 0.03 vs 0.02 for
  // band itself). Wraps at SCREEN_W (streak positions seeded across 2W).
  const streakDriftPx = (nowMs * band.driftSpeed * 0.03) % SCREEN_W;
  const streakOffset = -(((streakDriftPx % SCREEN_W) + SCREEN_W) % SCREEN_W);

  // Tile two copies of the path — left and right — so the wrap seam is
  // off-screen for most of the cycle. Same approach as silhouette bands.
  return (
    <Group transform={[{ translateY: yPx }]}>
      <Group transform={[{ translateX: offset }]}>
        <Path path={seed.path} color={col} style="fill" antiAlias />
      </Group>
      <Group transform={[{ translateX: offset + seed.spanPx }]}>
        <Path path={seed.path} color={col} style="fill" antiAlias />
      </Group>
      {/* v0.7.1 r2 — Two-tone swirl puffs (dark + light) with radial alpha
          falloff for soft cloud-like edges. Each puff is rendered as a
          unit Circle inside a non-uniform-scaled Group (scaleX = 1,
          scaleY = ry/rx) — the Circle becomes an ellipse, and the
          circular RadialGradient inside it stretches to match. Gradient
          stops fade from full-opacity tint at centre to fully transparent
          (alpha 00) at edge, giving each puff the soft falloff real
          clouds have.
          Both puff sets are clipped to the band's festoon path so they
          respect the band's actual painted region. Dark puffs read as
          shadow zones; light puffs (band base lifted toward white) read
          as bright cream highlights — together they give the band the
          light/shadow texture of real Jovian banding. */}
      <Group clip={seed.path}>
        {/* Dark / shadow puffs */}
        {seed.darkPuffs.map((p, i) => {
          const sx2 = ((p.x + streakOffset) % (SCREEN_W * 2)) - SCREEN_W * 0.2;
          return (
            <Group
              key={`d${i}`}
              transform={[
                { translateX: sx2 },
                { translateY: p.y },
                { scaleX: 1 },
                { scaleY: p.ry / p.rx },
              ]}
              opacity={p.opacity}
            >
              <Circle cx={0} cy={0} r={p.rx}>
                {/* v0.7.1 r4 — dark puff tint = band base darkened in oklch
                    (same hue family). Sharper falloff: inner 60% fully
                    opaque, outer 40% feathers to transparent. */}
                <RadialGradient
                  c={vec(0, 0)}
                  r={p.rx}
                  colors={[darkTint, darkTint, darkTint + '00']}
                  positions={[0, 0.6, 1]}
                />
              </Circle>
            </Group>
          );
        })}
        {/* Light / highlight puffs */}
        {seed.lightPuffs.map((p, i) => {
          const sx2 = ((p.x + streakOffset) % (SCREEN_W * 2)) - SCREEN_W * 0.2;
          return (
            <Group
              key={`l${i}`}
              transform={[
                { translateX: sx2 },
                { translateY: p.y },
                { scaleX: 1 },
                { scaleY: p.ry / p.rx },
              ]}
              opacity={p.opacity}
            >
              <Circle cx={0} cy={0} r={p.rx}>
                <RadialGradient
                  c={vec(0, 0)}
                  r={p.rx}
                  colors={[lightTint, lightTint, lightTint + '00']}
                  positions={[0, 0.6, 1]}
                />
              </Circle>
            </Group>
          );
        })}
      </Group>
    </Group>
  );
}

/**
 * StormCloudField — Jupiter dark amorphous cells riding mid-band region.
 * Same union-path technique as Earth's clouds (kills opacity-overlap
 * bands and internal seams), but no flat-bottom clip — cells float in
 * atmosphere. Renderer derives lightTint/darkTint from spec colorCurve
 * for the vertical 3-stop gradient inside each cell.
 */
function StormCloudField({
  cells,
  spec,
  preColor,
  t,
  nowMs,
}: {
  cells: StormCellSeed[];
  spec: Extract<ParticleSpec, { kind: 'stormClouds' }>;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  nowMs: number;
}): React.ReactElement | null {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  const baseOklch = sampleOklchCurve(preColor, t);
  const tint = oklchToHex(baseOklch);
  // 3-tone shading derived from base tint:
  //   light = lerp(tint → cream, 0.50)
  //   dark  = lerp(tint → near-black, 0.45)
  // In oklch: lift L for light, drop L for dark; chroma trends toward 0
  // for both extremes.
  const lightTint = oklchToHex([
    baseOklch[0] * 0.5 + 1.0 * 0.5,
    baseOklch[1] * 0.5,
    baseOklch[2],
  ]);
  const darkTint = oklchToHex([
    baseOklch[0] * 0.55,
    baseOklch[1] * 0.55,
    baseOklch[2],
  ]);
  return (
    <Group>
      {cells.map((c, i) => {
        const drift = (nowMs * 0.008 * spec.speed + c.driftPhase) % (SCREEN_W + 240);
        const x = ((c.baseX + drift) % (SCREEN_W + 240)) - 120;
        const opacity = c.alpha * density;
        return (
          <Group
            key={i}
            transform={[{ translateX: x }, { translateY: c.baseY }]}
            opacity={opacity}
          >
            <Group clip={c.unionPath}>
              <Rect
                x={c.bbox.x - 2}
                y={c.bbox.y - 2}
                width={c.bbox.w + 4}
                height={c.bbox.h + 4}
              >
                <LinearGradient
                  start={vec(0, c.bbox.y)}
                  end={vec(0, c.bbox.y + c.bbox.h)}
                  colors={[lightTint, tint, darkTint]}
                  positions={[0, 0.55, 1]}
                />
              </Rect>
            </Group>
          </Group>
        );
      })}
    </Group>
  );
}

/**
 * ShearMoteField — Jupiter small fast atmospheric particles. Per-mote
 * sinusoidal vertical wobble + slight x-jitter (pre-seeded phases /
 * frequencies / amplitudes) so motes swirl chaotically rather than drift
 * uniformly. Rendered as horizontal ellipses (rx = r×4, ry = r×0.9).
 */
function ShearMoteField({
  motes,
  spec,
  preColor,
  t,
  nowMs,
}: {
  motes: ShearMoteSeed[];
  spec: Extract<ParticleSpec, { kind: 'shearMotes' }>;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  nowMs: number;
}): React.ReactElement | null {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  // v0.7.1 r2 — leaf-in-wind motion + 3-octave path variation + two-tone
  // circular shape.
  // Path: 3 sine octaves on the lateral axis, with prime-ratio frequencies
  // (×0.4, ×0.3, ×0.17) and a cos in the third — breaks the obvious-sine
  // pattern so each mote's trajectory looks distinct rather than
  // pendulum-like. Vertical wobble also gets a third octave for chaos.
  // Shape: two concentric circles. Dark body (1.2r) sits behind a light
  // highlight (0.5r, offset 0.3r at the per-mote rotation angle). The
  // highlight ORBITS around the body as the mote tumbles, giving a
  // dimensional speck-with-catch-light feel. Tints derived from base
  // tint via oklch L modulation (toward black for dark, toward white
  // for light).
  const baseOklch = sampleOklchCurve(preColor, t);
  const darkTint = oklchToHex([baseOklch[0] * 0.55, baseOklch[1] * 0.85, baseOklch[2]]);
  const lightTint = oklchToHex([
    baseOklch[0] * 0.45 + 0.55,
    baseOklch[1] * 0.7,
    baseOklch[2],
  ]);
  return (
    <Group>
      {motes.map((m, i) => {
        const drift = (nowMs * 0.05 * spec.speed * m.speedJ + m.driftPhase) % (SCREEN_W + 100);
        const xRaw = ((m.baseX + drift) % (SCREEN_W + 100)) - 50;
        // 3-octave lateral swing — first two as before, third uses cos +
        // prime-ratio (1.7×) frequency to break the layered-sine pattern.
        const lateralSwing =
          Math.sin(nowMs * m.wobbleFreq1 * 0.4 + m.wobblePhase) * 25 +
          Math.sin(nowMs * m.wobbleFreq2 * 0.3 + m.wobblePhase * 0.7) * 12 +
          Math.cos(nowMs * m.wobbleFreq1 * 1.7 + m.wobblePhase * 2.1) * 7;
        // 3-octave vertical wobble. Third octave (cos) breaks the pendulum.
        const wobble =
          Math.sin(nowMs * m.wobbleFreq1 * 0.7 + m.wobblePhase * 1.3) * m.wobbleAmp1 * 0.6 +
          Math.sin(nowMs * m.wobbleFreq2 * 0.6 + m.wobblePhase) * m.wobbleAmp2 * 0.5 +
          Math.cos(nowMs * m.wobbleFreq2 * 1.3 + m.wobblePhase * 0.9) * m.wobbleAmp2 * 0.35;
        const x = xRaw + lateralSwing;
        const y = m.baseY + wobble;
        // Highlight orbit — angle drifts at rotFreq, offset is 0.3r at that angle.
        const angle = m.rotPhase + nowMs * m.rotFreq;
        const hlOffsetX = Math.cos(angle) * m.r * 0.3;
        const hlOffsetY = Math.sin(angle) * m.r * 0.3;
        const bodyR = m.r * 1.2;
        const hlR = m.r * 0.5;
        const op = m.opacity * density;
        return (
          <Group key={i}>
            <Circle cx={x} cy={y} r={bodyR} color={darkTint} opacity={op} />
            <Circle
              cx={x + hlOffsetX}
              cy={y + hlOffsetY}
              r={hlR}
              color={lightTint}
              opacity={op}
            />
          </Group>
        );
      })}
    </Group>
  );
}

/**
 * Aurora — Jupiter top-of-sky green/violet wash, night-only. Single
 * gradient strip from top of canvas down to ~55% of vis_h. blendMode
 * "screen" makes it additive — bleeds light into the sky underneath
 * rather than overlaying as paint.
 */
function Aurora({
  spec,
  preColorTop,
  preColorBot,
  t,
}: {
  spec: Extract<ParticleSpec, { kind: 'aurora' }>;
  preColorTop: ReadonlyArray<readonly [number, Oklch]>;
  preColorBot: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
}): React.ReactElement | null {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  const colTop = oklchToHex(sampleOklchCurve(preColorTop, t));
  const colBot = oklchToHex(sampleOklchCurve(preColorBot, t));
  const stripH = VIS_H * SCALE * 0.55;
  // Iteration tool stops were [0% colTop@65%×density, 60% colBot@25%×density,
  // 100% colBot@0%]. Skia LinearGradient takes plain colours, so we approximate
  // the alpha-fade by making the bottom stop use colTop again (visually irrelevant
  // because the rect's overall opacity is density-modulated AND the bottom edge
  // just blends additively onto sky). Top stop sits at 60% — so the upper 60%
  // of the strip carries the strong glow and the lower 40% fades through colBot
  // into nothing, matching the original.
  const overallAlpha = 0.65 * density;
  return (
    <Rect
      x={0}
      y={0}
      width={SCREEN_W}
      height={stripH}
      opacity={overallAlpha}
      blendMode="screen"
    >
      <LinearGradient
        start={vec(0, 0)}
        end={vec(0, stripH)}
        colors={[colTop, colBot, '#000000']}
        positions={[0, 0.6, 1]}
      />
    </Rect>
  );
}

/**
 * Lightning — Jupiter night flash schedule. Per-flash deterministic
 * geometry seeded from index; whole-cycle 8s loop with 10%-attack /
 * 90%-decay intensity envelope. blendMode "screen" on each shape so
 * the flash adds onto bands additively. 3 layers per active flash:
 *   1. radial bloom (cool blue-white, large soft halo)
 *   2. bolt halo (cyan-white, wide stroke)
 *   3. bolt core (pure white, narrow stroke)
 * Plus an ambient white-rect fill capped at 18% opacity for "the
 * whole atmosphere lit up" feel.
 */
function Lightning({
  spec,
  cells,
  cellsSpec,
  t,
  nowMs,
}: {
  spec: Extract<ParticleSpec, { kind: 'lightning' }>;
  /** Storm cells provide the strike anchor points. Lightning bolts snap
   *  to specific cells so the bolt top truly emerges from a cloud bottom. */
  cells: StormCellSeed[];
  cellsSpec: Extract<ParticleSpec, { kind: 'stormClouds' }> | undefined;
  t: number;
  nowMs: number;
}): React.ReactElement | null {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  // No cells = no anchor points = skip lightning. Defensive — the iteration
  // tool's design pairs lightning WITH stormClouds in Jupiter's theme.
  if (cells.length === 0 || !cellsSpec) return null;
  const cycleMs = 8000;
  const cyclePos = (nowMs % cycleMs) / cycleMs;
  const rng = mulberry32(909);
  type Flash = {
    cx: number;
    cy: number;
    baseRadius: number;
    boltLen: number;
    alpha: number;
    geomSeed: number;
  };
  // v0.7.1 r3 — filter cells to ON-SCREEN-with-margin first, then snap each
  // flash slot to one of those. Cells drift across [-120, SCREEN_W + 120],
  // so without filtering up to ~40% of slots fire off-screen and waste a
  // flash. With filtering, every slot strikes a visible cell — apparent
  // frequency goes up even though `count` stayed the same.
  type OnScreenCell = { cellX: number; cellBottomY: number };
  const onScreen: OnScreenCell[] = [];
  for (const cell of cells) {
    const drift = (nowMs * 0.008 * cellsSpec.speed + cell.driftPhase) % (SCREEN_W + 240);
    const cellX = ((cell.baseX + drift) % (SCREEN_W + 240)) - 120;
    // Margin of 30px from each screen edge so bolts (with ±20px jitter)
    // can't fire too close to the canvas edge.
    if (cellX >= 30 && cellX <= SCREEN_W - 30) {
      const cellBottomY = cell.baseY + cell.bbox.y + cell.bbox.h;
      onScreen.push({ cellX, cellBottomY });
    }
  }
  if (onScreen.length === 0) return null;

  const flashes: Flash[] = [];
  for (let i = 0; i < spec.count; i++) {
    const startT = rng();
    const duration = 0.02 + rng() * 0.04;
    const anchor = onScreen[i % onScreen.length]!;
    const xJitter = (rng() - 0.5) * 40;
    const cx = anchor.cellX + xJitter;
    // Bolt top sits a few px below cell bottom for a clean "fork emerging
    // from underside of cloud" read.
    const topY = anchor.cellBottomY + 4;
    const boltLen = 80 + rng() * 110;
    const cy = topY + boltLen / 2;
    const baseRadius = 90 + rng() * 110;
    let dt = cyclePos - startT;
    if (dt < 0) dt += 1;
    if (dt < duration) {
      const u = dt / duration;
      const intensity = u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.5);
      flashes.push({
        cx,
        cy,
        baseRadius,
        boltLen,
        alpha: intensity * density,
        geomSeed: 909 + i * 137,
      });
    }
  }
  if (flashes.length === 0) return null;
  const ambientAlpha = Math.min(
    0.18,
    flashes.reduce((sum, f) => sum + f.alpha * 0.08, 0),
  );
  return (
    <Group>
      {ambientAlpha > 0.005 && (
        <Rect
          x={0}
          y={0}
          width={SCREEN_W}
          height={VIS_H * SCALE}
          color="#ffffff"
          opacity={ambientAlpha}
          blendMode="screen"
        />
      )}
      {flashes.map((f, i) => {
        const r = mulberry32(f.geomSeed);
        // v0.7.1 r2 — per-flash hue palette. Roll weights rebalanced (40
        // cyan / 35 purple / 25 magenta) to make non-cyan flashes show up
        // more often. Halos pushed more saturated, AND the bolt core now
        // tints slightly toward the palette — previously the pure-white
        // core dominated the reading and washed out the hue. Subtle on
        // the core (90% white + 10% hue) so the strike still reads bright.
        const hueRoll = r();
        const palette =
          hueRoll < 0.4
            ? {
                core: '#ffffff', // pure white — Jovian default
                halo: '#80b8ff', // saturated cyan
                bloomA: '#d8ecff',
                bloomB: '#80a8ff',
                bloomC: '#3050b0',
              }
            : hueRoll < 0.75
              ? {
                  core: '#f0e0ff', // hint of violet
                  halo: '#9070ff', // saturated purple
                  bloomA: '#e8d8ff',
                  bloomB: '#9070ff',
                  bloomC: '#4828a0',
                }
              : {
                  core: '#ffe8fc', // hint of pink
                  halo: '#e070d8', // saturated magenta
                  bloomA: '#ffd8f4',
                  bloomB: '#e070d8',
                  bloomC: '#883080',
                };
        const startY = f.cy - f.boltLen * 0.5;
        const endY = f.cy + f.boltLen * 0.5;
        // Build bolt polyline with parabolic-tapered jitter.
        const segs = 8 + Math.floor(r() * 5);
        const boltPath = Skia.Path.Make();
        for (let s = 0; s <= segs; s++) {
          const tp = s / segs;
          const ty = startY + (endY - startY) * tp;
          const taper = 4 * tp * (1 - tp);
          const jitter = (r() - 0.5) * 24 * taper;
          const x = f.cx + jitter;
          if (s === 0) boltPath.moveTo(x, ty);
          else boltPath.lineTo(x, ty);
        }
        // 0–2 branch forks, downward only.
        const branchPaths: Array<ReturnType<typeof Skia.Path.Make>> = [];
        const segCount = segs + 1;
        for (let b = 0; b < 2; b++) {
          if (r() < 0.4) continue;
          const idx = 2 + Math.floor(r() * Math.max(1, segCount - 4));
          if (idx >= segCount) continue;
          const sign = r() < 0.5 ? -1 : 1;
          const angle = sign * (Math.PI * 0.2 + r() * Math.PI * 0.3);
          const len = 22 + r() * 35;
          const bSegs = 3 + Math.floor(r() * 3);
          // Reconstruct branch start point — same rng walk as bolt above.
          // Simpler: derive from idx position.
          const tp = idx / segs;
          const ty = startY + (endY - startY) * tp;
          const branchPath = Skia.Path.Make();
          branchPath.moveTo(f.cx, ty);
          for (let s = 1; s <= bSegs; s++) {
            const ttp = s / bSegs;
            const bx = f.cx + Math.sin(angle) * len * ttp;
            const by = ty + Math.abs(Math.cos(angle)) * len * ttp;
            const j = (r() - 0.5) * 5;
            branchPath.lineTo(bx + j, by);
          }
          branchPaths.push(branchPath);
        }
        const boltAlpha = Math.min(1, f.alpha * 1.6);
        const haloAlpha = Math.min(1, f.alpha * 0.65);
        return (
          <Group key={i}>
            {/* v0.7.1 r2 — Full-canvas radial bloom. A Rect spanning the
                whole canvas carries a RadialGradient centred at the strike
                point with falloff radius ≈ canvas diagonal, so brightness
                peaks at the bolt origin and decays evenly out to all four
                edges. Reads as the sky itself flashing rather than a local
                glow around the bolt. */}
            <Rect
              x={0}
              y={0}
              width={SCREEN_W}
              height={VIS_H * SCALE}
              opacity={f.alpha}
              blendMode="screen"
            >
              <RadialGradient
                c={vec(f.cx, f.cy)}
                r={Math.max(SCREEN_W, VIS_H * SCALE) * 0.85}
                colors={[palette.bloomA, palette.bloomB, palette.bloomC]}
                positions={[0, 0.4, 1]}
              />
            </Rect>
            {/* Bolt halo — palette-tinted wide stroke (cyan / purple / magenta) */}
            <Path
              path={boltPath}
              color={palette.halo}
              style="stroke"
              strokeWidth={6}
              strokeCap="round"
              strokeJoin="round"
              opacity={haloAlpha}
              blendMode="screen"
              antiAlias
            />
            {branchPaths.map((bp, j) => (
              <Path
                key={`h${j}`}
                path={bp}
                color={palette.halo}
                style="stroke"
                strokeWidth={3}
                strokeCap="round"
                strokeJoin="round"
                opacity={haloAlpha * 0.7}
                blendMode="screen"
                antiAlias
              />
            ))}
            {/* Bolt core — palette-tinted near-white narrow stroke */}
            <Path
              path={boltPath}
              color={palette.core}
              style="stroke"
              strokeWidth={2}
              strokeCap="round"
              strokeJoin="round"
              opacity={boltAlpha}
              blendMode="screen"
              antiAlias
            />
            {branchPaths.map((bp, j) => (
              <Path
                key={`c${j}`}
                path={bp}
                color={palette.core}
                style="stroke"
                strokeWidth={1.2}
                strokeCap="round"
                strokeJoin="round"
                opacity={boltAlpha * 0.7}
                blendMode="screen"
                antiAlias
              />
            ))}
          </Group>
        );
      })}
    </Group>
  );
}

/**
 * GasGiantSpot — Jupiter Great Red Spot. Oblate vortex with:
 *   1. soft outer halo (1.25× scale, body colour, opacity 0.18)
 *   2. radial-gradient body (centre → 0.85 → rim)
 *   3. internal swirl arcs — 4 clipped concentric ellipses at decreasing
 *      scale, stroked with rim colour at varying opacity
 *   4. upper-left highlight (small light ellipse offset to upper-left,
 *      suggests catch-light)
 * Position is curve-driven (xCurve drifts left → centre at dusk → right
 * at night). glowCurve modulates the whole group opacity.
 */
function GasGiantSpot({
  celestial,
  preColor,
  preRim,
  t,
  rawT,
}: {
  celestial: Extract<Celestial, { kind: 'gasGiantSpot' }>;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  preRim: ReadonlyArray<readonly [number, Oklch]>;
  t: number;
  rawT: number;
}): React.ReactElement | null {
  const xPct = celestial.xCurve ? sampleScalarCurve(celestial.xCurve, rawT) : celestial.xPct;
  const yPct = celestial.yCurve ? sampleScalarCurve(celestial.yCurve, rawT) : celestial.yPct;
  const x = xPct * SCREEN_W;
  const y = yPct * VIS_H * SCALE;
  const r = celestial.radius;
  const aspect = celestial.aspectRatio;
  const rx = r * aspect;
  const ry = r;

  // Path memos hoisted above the glow gate so React's rules-of-hooks are
  // honoured (hooks must run in the same order on every render). rx/ry are
  // derived from the static celestial spec, so these memos are effectively
  // no-ops when the spot is hidden — the early return below still skips
  // their use, just not their declaration.
  const haloPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval({ x: -rx * 1.25, y: -ry * 1.25, width: rx * 2.5, height: ry * 2.5 });
    return p;
  }, [rx, ry]);
  const bodyPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval({ x: -rx, y: -ry, width: rx * 2, height: ry * 2 });
    return p;
  }, [rx, ry]);
  // Four concentric arcs at decreasing scales, slight offsets for organic feel.
  const arcs = useMemo(() => {
    const make = (sx: number, sy: number, ox: number, oy: number) => {
      const p = Skia.Path.Make();
      p.addOval({ x: ox - rx * sx, y: oy - ry * sy, width: rx * sx * 2, height: ry * sy * 2 });
      return p;
    };
    return [
      { path: make(0.78, 0.62, 0, 0), sw: 1.2, opacity: 0.45 },
      { path: make(0.55, 0.42, -rx * 0.05, ry * 0.05), sw: 1.1, opacity: 0.38 },
      { path: make(0.32, 0.24, rx * 0.08, -ry * 0.03), sw: 0.9, opacity: 0.32 },
      { path: make(0.12, 0.1, 0, 0), sw: 0.8, opacity: 0.4 },
    ];
  }, [rx, ry]);
  // Highlight — small ellipse offset upper-left.
  const highlightPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addOval({
      x: -rx * 0.15 - rx * 0.12,
      y: -ry * 0.18 - ry * 0.08,
      width: rx * 0.24,
      height: ry * 0.16,
    });
    return p;
  }, [rx, ry]);

  const glow = sampleScalarCurve(celestial.glowCurve, t);
  if (glow <= 0.01) return null;
  const col = oklchToHex(sampleOklchCurve(preColor, t));
  const rim = oklchToHex(sampleOklchCurve(preRim, t));

  return (
    <Group transform={[{ translateX: x }, { translateY: y }]} opacity={glow}>
      {/* Outer halo — body colour at low opacity, bleeds into bands */}
      <Path path={haloPath} color={col} style="fill" opacity={0.18} antiAlias />
      {/* Radial-gradient body */}
      <Path path={bodyPath} style="fill" antiAlias>
        <RadialGradient
          c={vec(0, 0)}
          r={rx}
          colors={[col, col, rim]}
          positions={[0, 0.65, 1]}
        />
      </Path>
      {/* Internal swirl arcs — clipped to body so they don't leak past rim */}
      <Group clip={bodyPath}>
        {arcs.map((a, i) => (
          <Path
            key={i}
            path={a.path}
            color={rim}
            style="stroke"
            strokeWidth={a.sw}
            strokeCap="round"
            opacity={a.opacity}
            antiAlias
          />
        ))}
      </Group>
      {/* Upper-left catch-light */}
      <Path path={highlightPath} color="#ffe8d0" style="fill" opacity={0.25} antiAlias />
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
      // v0.7 — Jupiter
      stormCells: [] as StormCellSeed[],
      stormCloudsSpec: undefined as
        | Extract<ParticleSpec, { kind: 'stormClouds' }>
        | undefined,
      motes: [] as ShearMoteSeed[],
      shearMotesSpec: undefined as
        | Extract<ParticleSpec, { kind: 'shearMotes' }>
        | undefined,
      auroraSpec: undefined as Extract<ParticleSpec, { kind: 'aurora' }> | undefined,
      lightningSpec: undefined as Extract<ParticleSpec, { kind: 'lightning' }> | undefined,
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
        result.clouds = seedClouds(spec, seed);
      } else if (spec.kind === 'birds') {
        result.birdsSpec = spec;
        result.birds = seedBirds(spec, seed);
      } else if (spec.kind === 'stormClouds') {
        result.stormCloudsSpec = spec;
        result.stormCells = seedStormClouds(spec, seed);
      } else if (spec.kind === 'shearMotes') {
        result.shearMotesSpec = spec;
        result.motes = seedShearMotes(spec, seed);
      } else if (spec.kind === 'aurora') {
        result.auroraSpec = spec;
      } else if (spec.kind === 'lightning') {
        result.lightningSpec = spec;
      }
    });
    return result;
  }, [theme, seed]);

  // v0.7 — cloudBand seeds (path + streak positions), keyed on band identity.
  const cloudBandSeeds = useMemo(() => {
    const out = new Map<string, CloudBandSeed>();
    theme.bands.forEach((band) => {
      if (band.kind === 'cloudBand') {
        out.set(band.id, seedCloudBand(band, seed ^ themeSeed(band.id)));
      }
    });
    return out;
  }, [theme, seed]);

  // Silhouette paths and crater rims, keyed on band identity.
  const silhouettePaths = useMemo(() => {
    const paths = new Map<string, ReturnType<typeof Skia.Path.Make>>();
    theme.bands.forEach((band) => {
      if (band.kind === 'silhouette') {
        const yPx = band.yPct * VIS_H * SCALE;
        const heightPx = band.heightPct * VIS_H * SCALE;
        paths.set(
          band.id,
          buildSilhouettePath(band.profile, yPx, heightPx, seed ^ themeSeed(band.id)),
        );
      }
    });
    return paths;
  }, [theme, seed]);

  const craters = useMemo(() => {
    const out = new Map<string, Crater[]>();
    theme.bands.forEach((band) => {
      if (band.kind === 'craters') {
        const yPx = band.yPct * VIS_H * SCALE;
        const heightPx = band.heightPct * VIS_H * SCALE;
        out.set(band.id, seedCraters(yPx, heightPx, seed ^ themeSeed(band.id)));
      }
    });
    return out;
  }, [theme, seed]);

  // Grass tufts — only for the closest foreground band (singleHill profile).
  // Static geometry, ToD-tinted at render time via GRASS_LIGHT/DARK_CURVE.
  const grassPaths = useMemo(() => {
    const out = new Map<string, GrassPaths>();
    theme.bands.forEach((band) => {
      if (band.kind === 'silhouette' && band.profile === 'singleHill') {
        const yPx = band.yPct * VIS_H * SCALE;
        const heightPx = band.heightPct * VIS_H * SCALE;
        out.set(band.id, seedGrass(yPx, heightPx, seed ^ themeSeed(band.id)));
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
  const {
    stars,
    starsSpec,
    dust,
    dustSpec,
    clouds,
    cloudsSpec,
    birds,
    birdsSpec,
    stormCells,
    stormCloudsSpec,
    motes,
    shearMotesSpec,
    auroraSpec,
    lightningSpec,
  } = particleSeeds;
  const cloudsColor = cloudsSpec ? particleCurves.get(cloudsSpec.id) : undefined;
  const birdsColor = birdsSpec ? particleCurves.get(birdsSpec.id) : undefined;
  const stormCloudsColor = stormCloudsSpec
    ? particleCurves.get(stormCloudsSpec.id)
    : undefined;
  const motesColor = shearMotesSpec
    ? particleCurves.get(shearMotesSpec.id)
    : undefined;
  // Aurora colour curves (top + bot) preprocessed in pre.particles.
  const auroraEntry = auroraSpec
    ? pre.particles.find((p) => p.spec.id === auroraSpec.id)
    : undefined;

  // Split celestials by z-band: sky celestials (sun, moon, planet, earth)
  // render BEFORE bands. storm-eye and gasGiantSpot overlay bands (Jupiter's
  // GRS sits IN the cloud layer, not above it).
  const skyCelestials = pre.celestials.filter(
    (c) => c.celestial.kind !== 'storm-eye' && c.celestial.kind !== 'gasGiantSpot',
  );
  const stormEyes = pre.celestials.filter((c) => c.celestial.kind === 'storm-eye');
  const gasGiantSpots = pre.celestials.filter((c) => c.celestial.kind === 'gasGiantSpot');

  return (
    <Group>
      {/* 1. Sky */}
      <Sky pre={pre} t={t} />

      {/* 2. Aurora — Jupiter night-only screen-blended overlay above sky */}
      {auroraSpec && auroraEntry?.colorTop && auroraEntry?.colorBot && (
        <Aurora
          spec={auroraSpec}
          preColorTop={auroraEntry.colorTop}
          preColorBot={auroraEntry.colorBot}
          t={t}
        />
      )}

      {/* 3. Sky celestials — sun / moon / planet / earth (between sky and silhouettes) */}
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

      {/* 4. Stars */}
      {starsSpec && <Starfield stars={stars} spec={starsSpec} t={t} nowMs={nowMs} />}

      {/* 5. Clouds (Earth — upper sky, behind silhouettes) */}
      {cloudsSpec && cloudsColor && (
        <CloudField
          clouds={clouds}
          spec={cloudsSpec}
          preColor={cloudsColor}
          t={t}
          nowMs={nowMs}
        />
      )}

      {/* 6. Birds (Earth — upper-mid sky, behind silhouettes) */}
      {birdsSpec && birdsColor && (
        <BirdFlock birds={birds} spec={birdsSpec} preColor={birdsColor} t={t} nowMs={nowMs} />
      )}

      {/* 7. Bands far→near. Each band routes by kind:
          - silhouette / plain / craters → BandRender (existing path)
          - cloudBand                    → CloudBandRender (Jupiter v0.7) */}
      {pre.bands.map((b) => {
        if (b.band.kind === 'cloudBand') {
          const seed = cloudBandSeeds.get(b.band.id);
          if (!seed) return null;
          return (
            <CloudBandRender
              key={b.band.id}
              band={b.band}
              seed={seed}
              preColor={b.color}
              t={t}
              scrollX={scrollX}
              nowMs={nowMs}
            />
          );
        }
        return (
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
        );
      })}

      {/* 8. Gas giant spot (Jupiter — Great Red Spot, overlays bands).
          Rendered BEFORE motes/clouds — both pass in front of it. */}
      {gasGiantSpots.map((c) => {
        if (c.celestial.kind !== 'gasGiantSpot' || !c.rim) return null;
        return (
          <GasGiantSpot
            key={c.celestial.id}
            celestial={c.celestial}
            preColor={c.color}
            preRim={c.rim}
            t={t}
            rawT={positionT}
          />
        );
      })}

      {/* 9. Shear motes (Jupiter — fast atmospheric particles).
          v0.7.1 — moved BEFORE storm clouds so they read as small flecks
          deep in the haze, with the larger cloud formations in front. */}
      {shearMotesSpec && motesColor && (
        <ShearMoteField
          motes={motes}
          spec={shearMotesSpec}
          preColor={motesColor}
          t={t}
          nowMs={nowMs}
        />
      )}

      {/* 10. Storm clouds (Jupiter — frontmost atmospheric layer).
          v0.7.1 — render LAST among atmospheric elements so cells occlude
          bands, GRS, and motes. Only lightning sits above. */}
      {stormCloudsSpec && stormCloudsColor && (
        <StormCloudField
          cells={stormCells}
          spec={stormCloudsSpec}
          preColor={stormCloudsColor}
          t={t}
          nowMs={nowMs}
        />
      )}

      {/* 11. Lightning flashes (Jupiter night — top of GRS + bands).
          v0.7.1 r2 — bolts snap to storm cells via the cells/cellsSpec
          props so the strike origin emerges from a real cloud bottom
          rather than a random point in the cloud y-range. */}
      {lightningSpec && (
        <Lightning
          spec={lightningSpec}
          cells={stormCells}
          cellsSpec={stormCloudsSpec}
          t={t}
          nowMs={nowMs}
        />
      )}

      {/* 12. Storm-eye celestials — overlay bands (legacy v0.5 GRS path,
          unused once jupiter.ts uses gasGiantSpot, but kept for back-compat) */}
      {stormEyes.map((c) => (
        <StormEye
          key={c.celestial.id}
          celestial={c.celestial}
          preColor={c.color}
          t={t}
        />
      ))}

      {/* 8. Drift dust */}
      {dustSpec && <DriftDust dust={dust} spec={dustSpec} t={t} scrollX={scrollX} />}
    </Group>
  );
}
