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

// Cloud composition: each cloud = 6–8 overlapping circles + flat baseline.
type CloudBubble = { bx: number; by: number; br: number };
type CloudSeed = {
  baseX: number;
  baseY: number;
  scale: number;
  driftPhase: number;
  bubbles: CloudBubble[];
  baseW: number;
  baseY0: number; // common bottom line, slightly above lowest bubble bottom
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
    // Bubble layout — 6-8 bubbles, base radius ~18-26 × scale, tight overlap.
    const bubbleCount = 6 + Math.floor(rng() * 3);
    const baseR = (18 + rng() * 8) * scale;
    const stepX = baseR * 0.42;
    const totalSpan = stepX * (bubbleCount - 1);
    const bubbles: CloudBubble[] = [];
    let maxBottom = 0;
    for (let b = 0; b < bubbleCount; b++) {
      const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.3;
      const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.35 + (rng() - 0.5) * 0.15;
      const br = baseR * sizeFactor;
      const topJitter = (rng() - 0.5) * br * 0.4;
      const by = topJitter - (1 - distFromCenter) * br * 0.3;
      bubbles.push({ bx, by, br });
      maxBottom = Math.max(maxBottom, by + br);
    }
    out.push({
      baseX,
      baseY,
      scale,
      driftPhase,
      bubbles,
      baseW: totalSpan + baseR * 1.6,
      baseY0: maxBottom - 2,
      alpha,
    });
  }
  return out;
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
    const rng = mulberry32(seed);
    const span = SCREEN_W * 2.5;
    const numNodes = 5;
    const nodes: Array<readonly [number, number]> = [];
    for (let i = 0; i <= numNodes; i++) {
      const x = (i / numNodes) * span;
      const isPeak = i % 2 === 1;
      const heightFrac = isPeak ? 0.65 + rng() * 0.3 : 0.15 + rng() * 0.2;
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
    // Earth — one asymmetric rounded hump occupying most of the frame.
    const rng = mulberry32(seed);
    const span = SCREEN_W * 2.0;
    const peakX = span * 0.42;
    const peakY = heightPx * 0.05;
    const points = 80;
    p.moveTo(0, yPx + heightPx);
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * span;
      const dx = (x - peakX) / (span * 0.55);
      const bell = 1 / (1 + dx * dx);
      const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
      const ripple = Math.sin(x * 0.018 + rng() * 4) * heightPx * 0.02;
      const y = heightPx - (heightPx - peakY) * bell + tilt + ripple;
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
    // Moon — mid ridge — three octaves + discrete crater dip events.
    const step = 4;
    p.moveTo(0, yPx + heightPx);
    for (let x = 0; x <= tileW; x += step) {
      const o1 = Math.sin(x * 0.018 + seed) * 0.5;
      const o2 = Math.sin(x * 0.05 + seed * 2.3) * 0.25;
      const o3 = Math.sin(x * 0.13 + seed * 3.7) * 0.12;
      const dipPhase = (x + seed * 31) % 90;
      const dip = dipPhase < 14 ? -Math.sin((dipPhase / 14) * Math.PI) * 0.18 : 0;
      const yLocal = (0.5 + (o1 + o2 + o3 + dip)) * heightPx;
      p.lineTo(x, yPx + yLocal);
    }
    p.lineTo(tileW, yPx + heightPx);
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

// ─── Crater-rim seeds for foreground 'craters' band ───────────────────────

type CraterRim = { x: number; y: number; r: number };

function seedCraterRims(yPx: number, heightPx: number, seed: number): CraterRim[] {
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const out: CraterRim[] = [];
  const tileW = SCREEN_W * 2;
  const count = 8;
  for (let i = 0; i < count; i++) {
    out.push({
      x: ((i + rng()) / count) * tileW,
      y: yPx + heightPx * (0.35 + rng() * 0.35),
      r: 14 + rng() * 22,
    });
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
            {/* Flat baseline — anchors all bubbles to a common bottom line */}
            <Rect
              x={-c.baseW / 2}
              y={c.baseY0 - 6}
              width={c.baseW}
              height={8}
              color={tint}
            />
            {c.bubbles.map((b, j) => (
              <Circle key={j} cx={b.bx} cy={b.by} r={b.br} color={tint} />
            ))}
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
  // subpath stroke; flatten to a representative size (median of seeded sizes).
  const path = Skia.Path.Make();
  let widthSum = 0;
  for (const b of birds) {
    const drift = (nowMs * 0.04 * spec.speed + b.driftPhase) % (SCREEN_W + 100);
    const x = ((b.baseX + drift) % (SCREEN_W + 100)) - 50;
    const wing = Math.sin(nowMs * 0.005 + b.flapPhase) * 0.4 + 0.6; // ~3Hz, 0.2→1.0
    const wingY = b.size * wing;
    path.moveTo(x - b.size, b.baseY);
    path.quadTo(x - b.size * 0.4, b.baseY - wingY, x, b.baseY);
    path.quadTo(x + b.size * 0.4, b.baseY - wingY, x + b.size, b.baseY);
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
  craterRims,
  t,
  scrollX,
}: {
  band: Band;
  preColor: ReadonlyArray<readonly [number, Oklch]>;
  preHaze?: ReadonlyArray<readonly [number, Oklch]>;
  preGradient?: ReadonlyArray<readonly [number, Oklch]>;
  silhouettePath?: ReturnType<typeof Skia.Path.Make>;
  craterRims?: CraterRim[];
  t: number;
  scrollX: number;
}): React.ReactElement {
  const yPx = band.yPct * VIS_H * SCALE;
  const heightPx = band.heightPct * VIS_H * SCALE;
  const col = oklchToHex(sampleOklchCurve(preColor, t));
  const dx = -((scrollX * band.parallax) % SCREEN_W);

  if (band.kind === 'silhouette' && silhouettePath) {
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
        </Group>
      );
    }
    return (
      <Group transform={[{ translateX: dx }]}>
        <Path path={silhouettePath} color={col} style="fill" antiAlias />
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

  if (band.kind === 'craters' && craterRims) {
    const baseOklch = sampleOklchCurve(preColor, t);
    const rimCol = oklchToHex([baseOklch[0] * 0.55, baseOklch[1] * 0.85, baseOklch[2]]);
    return (
      <Group transform={[{ translateX: dx }]}>
        <Rect x={0} y={yPx} width={SCREEN_W * 2} height={heightPx} color={col} />
        {craterRims.map((rim, i) => (
          <Circle key={i} cx={rim.x} cy={rim.y} r={rim.r} color={rimCol} opacity={0.65} />
        ))}
      </Group>
    );
  }

  return <Group />;
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

  const craterRims = useMemo(() => {
    const rims = new Map<string, CraterRim[]>();
    theme.bands.forEach((band) => {
      if (band.kind === 'craters') {
        const yPx = band.yPct * VIS_H * SCALE;
        const heightPx = band.heightPct * VIS_H * SCALE;
        rims.set(band.id, seedCraterRims(yPx, heightPx, seed ^ themeSeed(band.id)));
      }
    });
    return rims;
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

      {/* 2. Sky celestials — sun / moon / planet (between sky and silhouettes) */}
      {skyCelestials.map((c) => (
        <CelestialBody
          key={c.celestial.id}
          celestial={c.celestial}
          preColor={c.color}
          t={t}
          rawT={positionT}
        />
      ))}

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
          craterRims={craterRims.get(b.band.id)}
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
