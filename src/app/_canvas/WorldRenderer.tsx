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

// ─── Seeded RNG (mulberry32) — deterministic per-theme positions ──────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

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

// Cloud composition: each cloud = 6–8 heavily-overlapping circles, clipped to
// y < 0 in cloud-local coords so all bubble bottoms truncate at the same line
// (round 6: clip-path flat-bottom). Without the clip, the envelope between
// adjacent bubbles dips upward and the cloud bottom reads as scalloped.
type CloudBubble = { bx: number; by: number; br: number };
type CloudSeed = {
  baseX: number;
  baseY: number;
  scale: number;
  driftPhase: number;
  bubbles: CloudBubble[];
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
    const bubbles: CloudBubble[] = [];
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
      bubbles.push({ bx, by, br });
    }
    out.push({ baseX, baseY, scale, driftPhase, bubbles, alpha });
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
    const nodes: Array<readonly [number, number]> = [];
    for (let i = 0; i <= numNodes; i++) {
      const x = (i / numNodes) * span;
      const isPeak = i % 2 === 1;
      const heightFrac = isPeak ? 0.45 + rng() * 0.3 : 0.15 + rng() * 0.2;
      nodes.push([x, yPx + heightPx * (1 - heightFrac)]);
    }
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
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      const y =
        Math.sin(x * 0.0035 + j1) * heightPx * 0.3 +
        Math.sin(x * 0.011 + j2) * heightPx * 0.13 +
        Math.sin(x * 0.045 + rng() * 6) * heightPx * 0.04 +
        heightPx * 0.55;
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
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      const dx = (x - peakX) / (span * 0.55);
      const bell = 1 / (1 + dx * dx);
      const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
      const y = heightPx - (heightPx - peakY) * bell + tilt;
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
    for (let x = 0; x <= tileW; x += step) {
      const base = Math.sin(x * 0.012 + seed) * 0.5;
      const wobble = Math.sin(x * 0.04 + seed * 1.7) * 0.15;
      const yLocal = (0.5 + (base + wobble) * 0.5) * heightPx * 0.55;
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
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      const base =
        Math.sin(x * 0.018 + j1) * heightPx * 0.55 +
        Math.sin(x * 0.07 + j2) * heightPx * 0.2 +
        Math.sin(x * 0.18 + j3) * heightPx * 0.06 +
        heightPx * 0.4;
      const crater = Math.sin(x * 0.005) > 0.85 ? -heightPx * 0.12 : 0;
      p.lineTo(x, yPx + base + crater);
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
    for (let x = 0; x <= tileW; x += step) {
      const flow =
        Math.sin(x * 0.008 + seed) * 0.05 + Math.sin(x * 0.025 + seed * 1.4) * 0.025;
      const yLocal = flow * heightPx;
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
  const dx = -((scrollX * band.parallax) % SCREEN_W);

  if (band.kind === 'silhouette' && silhouettePath) {
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
      return (
        <Group transform={[{ translateX: dx }]}>
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
          {grassNode}
        </Group>
      );
    }
    return (
      <Group transform={[{ translateX: dx }]}>
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
        result.clouds = seedClouds(spec, seed);
      } else if (spec.kind === 'birds') {
        result.birdsSpec = spec;
        result.birds = seedBirds(spec, seed);
      }
    });
    return result;
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
