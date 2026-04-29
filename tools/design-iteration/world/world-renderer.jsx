/**
 * WorldRenderer — pure presentational SVG/Canvas hybrid that draws a WorldTheme.
 *
 * Maps 1:1 to the production Skia renderer:
 *   <SkyBand>          — Skia <Rect> + <LinearGradient>
 *   <SilhouetteBand>   — Skia <Path> generated from a profile fn
 *   <PlainBand>        — Skia <Rect> + horizon haze gradient
 *   <CraterField>      — scrolling Skia <Group> of ovals
 *   <Starfield>        — <Group> of <Circle>s with sin-driven opacity
 *   <DustField>        — <Group> of <Circle>s drifting horizontally
 *   <Celestial>        — <Circle> with optional <BlurMask>
 *
 * Designed at 390×844 (logical iPhone), scaled to fit container.
 */

const { sampleColorCurve, sampleScalarCurve } = window.ThemeSchema;

// Deterministic pseudo-random (so star positions stay stable across renders)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Sky band ────────────────────────────────────────────────────────────────
function SkyBand({ theme, t, w, h }) {
  const top = sampleColorCurve(theme.sky.topCurve, t);
  const mid = sampleColorCurve(theme.sky.midCurve, t);
  const bot = sampleColorCurve(theme.sky.bottomCurve, t);
  const id = 'skygrad-' + theme.id;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={bot} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={w} height={h} fill={`url(#${id})`} />
    </g>
  );
}

// ─── Silhouette path generators ──────────────────────────────────────────────
// 'soft-craters' — gentle wavy horizon
function softCraterPath(w, h, scrollX, seed) {
  const rng = mulberry32(seed);
  const points = 24;
  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * w * 2;
    const y =
      Math.sin((x + scrollX) * 0.012) * h * 0.35 +
      Math.sin((x + scrollX) * 0.04 + rng() * 6) * h * 0.18 +
      h * 0.55;
    pts.push([x - (scrollX % w), y]);
  }
  let d = `M ${pts[0][0]},${h} L ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]},${pts[i][1]}`;
  d += ` L ${pts[pts.length - 1][0]},${h} Z`;
  return d;
}

// 'cratered-horizon' — Moon mid ridge. Three octaves + crater dips. Higher
// resolution (96 points across 2.4× width) eliminates the polygon-ish feel
// from the 36-point version. Per Moon point 5 (round 6).
function crateredHorizonPath(w, h, scrollX, seed) {
  const rng = mulberry32(seed);
  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const j3 = rng() * 6;
  const points = 96;
  const span = w * 2.4;
  const offset = -(scrollX % w);
  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    // Three-octave silhouette: large primary peaks + medium variation + fine
    // surface detail. Base shifted up (0.40 vs 0.45) so peaks reach higher.
    const base =
      Math.sin(x * 0.018 + j1) * h * 0.55 +
      Math.sin(x * 0.07 + j2) * h * 0.20 +
      Math.sin(x * 0.18 + j3) * h * 0.06 +
      h * 0.40;
    // Wider crater dip events (~every 200x) for sharper foreground crater feel.
    const crater = Math.sin(x * 0.005) > 0.85 ? -h * 0.12 : 0;
    pts.push([x + offset, base + crater]);
  }
  let d = `M ${pts[0][0]},${h} L ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]},${pts[i][1]}`;
  d += ` L ${pts[pts.length - 1][0]},${h} Z`;
  return d;
}

// 'mountains' — broad rounded silhouette anchored to the bottom of its band.
// Both the far and mid mountain bands extend down to band's full height so that
// the silhouettes share a common ground line; the near plain sits in front of
// them. No floating-mountain gap.
function mountainsPath(w, h, scrollX, seed) {
  const rng = mulberry32(seed);

  const span = w * 2.5;
  const numNodes = 5;
  const nodes = [];
  for (let i = 0; i <= numNodes; i++) {
    const x = (i / numNodes) * span;
    const isPeak = i % 2 === 1;
    let heightFrac;
    if (isPeak) {
      heightFrac = 0.65 + rng() * 0.30;
    } else {
      heightFrac = 0.15 + rng() * 0.20;
    }
    nodes.push([x, h * (1 - heightFrac)]);
  }

  const offset = -(scrollX % w);

  let d = `M ${nodes[0][0] + offset},${h}`;
  d += ` L ${nodes[0][0] + offset},${nodes[0][1]}`;

  for (let i = 1; i < nodes.length; i++) {
    const p0 = nodes[i - 1];
    const p1 = nodes[i];
    const dx = p1[0] - p0[0];
    const c1x = p0[0] + dx * 0.4 + offset;
    const c1y = p0[1];
    const c2x = p1[0] - dx * 0.4 + offset;
    const c2y = p1[1];
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p1[0] + offset},${p1[1]}`;
  }

  const last = nodes[nodes.length - 1];
  d += ` L ${last[0] + offset},${h} Z`;
  return d;
}

// 'hills' — gentle low-frequency rolling sine. Soft, broad shoulders, no peaks.
// Anchored to bottom of band; top edge undulates ~25-50% of band height.
function hillsPath(w, h, scrollX, seed) {
  const rng = mulberry32(seed);
  const points = 60;
  const span = w * 2.4;
  const offset = -(scrollX % w);
  // Pre-jitter to break symmetry
  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    // Two overlaid low-frequency sines + tiny detail
    const y =
      Math.sin(x * 0.0035 + j1) * h * 0.30 +
      Math.sin(x * 0.011 + j2) * h * 0.13 +
      Math.sin(x * 0.045 + rng() * 6) * h * 0.04 +
      h * 0.55;
    pts.push([x + offset, y]);
  }
  let d = `M ${pts[0][0]},${h} L ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]},${pts[i][1]}`;
  d += ` L ${pts[pts.length - 1][0]},${h} Z`;
  return d;
}

// 'singleHill' — one big rounded silhouette occupying most of the frame.
// Asymmetric so it doesn't read as a perfect dome.
function singleHillPath(w, h, scrollX, seed) {
  const rng = mulberry32(seed);
  const span = w * 2.0;
  const offset = -(scrollX % w);
  // One main hump, off-center
  const peakX = span * 0.42;
  const peakY = h * 0.05; // peak height (top of band ≈ peak)
  const points = 80;
  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    // Bell-ish curve: 1 / (1 + (dx/width)^2)
    const dx = (x - peakX) / (span * 0.55);
    const bell = 1 / (1 + dx * dx);
    // Asymmetry: bias right side downward
    const tilt = (x - peakX) > 0 ? -dx * 0.04 * h : 0;
    const ripple = Math.sin(x * 0.018 + rng() * 4) * h * 0.02;
    const y = h - (h - peakY) * bell + tilt + ripple;
    pts.push([x + offset, y]);
  }
  let d = `M ${pts[0][0]},${h} L ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]},${pts[i][1]}`;
  d += ` L ${pts[pts.length - 1][0]},${h} Z`;
  return d;
}

// 'storm-bands' — Jupiter — atmospheric ribbon with subtle flow undulation
// along the top edge. Amplitude ~6% of band height. Used by Jupiter's bands
// stacked top-to-bottom with alternating parallax (zonal flow).
function stormBandsPath(w, h, scrollX, seed) {
  const points = 80;
  const span = w * 2;
  const offset = -(scrollX % w);
  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const flow =
      Math.sin(x * 0.008 + seed * 0.001) * 0.05 +
      Math.sin(x * 0.025 + seed * 0.0014) * 0.025;
    const y = flow * h;
    pts.push([x + offset, y]);
  }
  let d = `M ${pts[0][0]},${h} L ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]},${pts[i][1]}`;
  d += ` L ${pts[pts.length - 1][0]},${h} Z`;
  return d;
}

function SilhouetteBand({ band, theme, t, w, gameH, scrollX, scrollSpeed }) {
  const color = sampleColorCurve(band.colorCurve, t);
  const y = band.yPct * gameH;
  const h = band.heightPct * gameH;
  const sx = scrollX * band.parallax * scrollSpeed;
  const seed =
    band.id === 'farRidge' ? 1234 :
    band.id === 'midRidge' ? 5678 :
    band.id === 'farMountains' ? 2222 :
    band.id === 'midMountains' ? 4444 :
    band.id === 'rollingHills' ? 6666 :
    band.id === 'nearHill' ? 7777 :
    band.id === 'upperPolarHaze' ? 1111 :
    band.id === 'ntrZone' ? 2233 :
    band.id === 'nebBelt' ? 3344 :
    band.id === 'equatorialZone' ? 4455 :
    band.id === 'sebBelt' ? 5566 :
    band.id === 'lowerZone' ? 6677 : 9012;
  const pathFn =
    band.profile === 'cratered-horizon' ? crateredHorizonPath :
    band.profile === 'mountains' ? mountainsPath :
    band.profile === 'hills' ? hillsPath :
    band.profile === 'singleHill' ? singleHillPath :
    band.profile === 'storm-bands' ? stormBandsPath :
    softCraterPath;
  const d = pathFn(w, h, sx, seed);

  // Optional internal vertical gradient (lighter top edge, darker base —
  // adds depth so the silhouette doesn't read as a flat shape).
  if (band.gradientCurve) {
    const topColor = sampleColorCurve(band.gradientCurve, t);
    const gradId = `silgrad-${theme.id}-${band.id}`;
    const clipId = `silclip-${theme.id}-${band.id}`;
    return (
      <g transform={`translate(0, ${y})`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={topColor} />
            <stop offset="60%" stopColor={color} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
        </defs>
        <rect x={0} y={0} width={w} height={h} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />
      </g>
    );
  }

  return (
    <g transform={`translate(0, ${y})`}>
      <path d={d} fill={color} />
    </g>
  );
}

// ─── Plain band (regolith) with horizon haze ────────────────────────────────
function PlainBand({ band, theme, t, w, gameH }) {
  const base = sampleColorCurve(band.colorCurve, t);
  const haze = band.hazeCurve ? sampleColorCurve(band.hazeCurve, t) : base;
  const y = band.yPct * gameH;
  const h = band.heightPct * gameH;
  const id = 'plaingrad-' + theme.id + '-' + band.id;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={haze} stopOpacity="1" />
          <stop offset="40%" stopColor={base} stopOpacity="1" />
          <stop offset="100%" stopColor={base} stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect x="0" y={y} width={w} height={h} fill={`url(#${id})`} />
    </g>
  );
}

// ─── Crater field foreground ─────────────────────────────────────────────────
// Craters are STATIC features of the regolith — they don't drift with scroll.
// Per Moon design review (round 6):
//   - Cover the full regolith plain (foreground band yPct/heightPct extended
//     to match nearPlain).
//   - Two-shade depth illusion: lighter rim halo + darker bowl offset upward.
//   - Power-law size distribution (mostly small, rare large) — moon-realistic.
//   - Heavy density (~32 visible) without a feature crater.
function CraterField({ band, theme, t, w, gameH }) {
  const bowlColor = sampleColorCurve(band.colorCurve, t);
  const rimColor = window.ThemeSchema.lerpHex(bowlColor, '#ffffff', 0.25);
  const y = band.yPct * gameH;
  const h = band.heightPct * gameH;
  const rng = mulberry32(42);
  const craters = [];
  const targetCount = 32;
  // Scaled up across the board so smaller craters read on mobile (round 6.2),
  // and reject placements that overlap existing craters with a 10% buffer.
  for (let i = 0; i < targetCount; i++) {
    const sizeRoll = rng();
    let rx, ry;
    if (sizeRoll < 0.75) {
      rx = 6 + rng() * 8;         // 6-14 (small)
      ry = 2 + rng() * 2;         // 2-4
    } else if (sizeRoll < 0.95) {
      rx = 14 + rng() * 14;       // 14-28 (medium)
      ry = 4 + rng() * 3;         // 4-7
    } else {
      rx = 28 + rng() * 22;       // 28-50 (large — rare)
      ry = 7 + rng() * 5;         // 7-12
    }
    // Try up to 25 placements; skip if we can't avoid overlap.
    let placed = false;
    for (let attempt = 0; attempt < 25 && !placed; attempt++) {
      const cx = rng() * w;
      const cy = y + h * 0.05 + rng() * h * 0.9;
      let overlaps = false;
      for (const e of craters) {
        const dx = cx - e.x;
        const dy = cy - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (rx + e.rx) * 1.1; // 10% buffer
        if (dist < minDist) { overlaps = true; break; }
      }
      if (!overlaps) {
        craters.push({ x: cx, y: cy, rx, ry, o: 0.55 + rng() * 0.35 });
        placed = true;
      }
    }
  }
  return (
    <g>
      {craters.map((c, i) => (
        <g key={i}>
          {/* Outer rim — slight halo, lighter than the bowl. Sun-catch effect. */}
          <ellipse
            cx={c.x}
            cy={c.y}
            rx={c.rx * 1.08}
            ry={c.ry * 1.08}
            fill={rimColor}
            opacity={c.o * 0.4}
          />
          {/* Inner bowl — darker, offset slightly upward to suggest depth.
              The visual implication: viewing from above, the bowl's far wall
              is shadowed; the near wall catches some indirect light. */}
          <ellipse
            cx={c.x}
            cy={c.y - c.ry * 0.15}
            rx={c.rx * 0.85}
            ry={c.ry * 0.8}
            fill={bowlColor}
            opacity={c.o}
          />
        </g>
      ))}
    </g>
  );
}

// ─── Starfield ───────────────────────────────────────────────────────────────
// Stars are seeded across the SKY region only — anywhere below the highest
// silhouette/plain band's top edge would either be covered by terrain or
// look wrong (stars below the horizon). Per Moon point 4, we look up the
// theme's first non-sky band and use its yPct as the star ceiling. That
// way Moon, Earth, and Jupiter each get the right region without hardcoding.
function Starfield({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  const sizeMul = spec.sizeMul || 1;
  const rng = mulberry32(7);
  const stars = [];
  const count = Math.floor(spec.count * density);
  // Find the highest band (smallest yPct) — that's our star ceiling.
  // Fallback to 0.55 (legacy default) if no bands are defined.
  const topBand = theme.bands && theme.bands.length > 0
    ? theme.bands.reduce((m, b) => (b.yPct < m.yPct ? b : m))
    : null;
  const skyBottomFraction = topBand ? topBand.yPct : 0.55;
  for (let i = 0; i < spec.count; i++) {
    const x = rng() * w;
    const y = rng() * gameH * skyBottomFraction;
    const baseR = (0.4 + rng() * 1.4) * sizeMul;
    const phase = rng() * Math.PI * 2;
    const speed = 0.0008 + rng() * 0.0015;
    if (i >= count) continue;
    const twinkle = spec.twinkle ? 0.55 + 0.45 * Math.sin(nowMs * speed + phase) : 1;
    stars.push({ x, y, r: baseR, o: twinkle * density });
  }
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.o} />
      ))}
    </g>
  );
}

// ─── Dust field ──────────────────────────────────────────────────────────────
function DustField({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  const rng = mulberry32(99);
  const dust = [];
  const count = Math.floor(spec.count * density);
  for (let i = 0; i < spec.count; i++) {
    const baseY = gameH * 0.55 + rng() * gameH * 0.4;
    const baseX = rng() * w;
    const drift = (nowMs * 0.03 * spec.speed + rng() * 1000) % (w + 100);
    const x = (baseX + drift) % w;
    const r = spec.sizeRange[0] + rng() * (spec.sizeRange[1] - spec.sizeRange[0]);
    if (i >= count) continue;
    dust.push({ x, y: baseY, r, o: 0.3 + rng() * 0.4 });
  }
  return (
    <g>
      {dust.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#cdc8d8" opacity={d.o * density} />
      ))}
    </g>
  );
}

// ─── Cloud band — fused cumulus silhouette ───────────────────────────────────
// Strategy: many heavily-overlapping circles (spacing < 0.5× radius) so the
// individual bubbles fuse into one continuous silhouette rather than reading
// as a clump of separate balls. Bigger overall scale + flat baseline aligned
// to bottom-most circles gives a proper cumulus profile.
function CloudField({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  const tint = spec.colorCurve ? sampleColorCurve(spec.colorCurve, t) : '#ffffff';
  const rng = mulberry32(33);
  const clouds = [];
  for (let i = 0; i < spec.count; i++) {
    const baseX = rng() * w * 1.4;
    const baseY = (gameH * 0.06) + rng() * gameH * 0.28;
    const drift = (nowMs * 0.01 * spec.speed + rng() * 1000) % (w + 240);
    const x = ((baseX + drift) % (w + 240)) - 120;
    const scale = 0.85 + rng() * 0.55;
    const o = (0.75 + rng() * 0.2) * density;

    // Bigger, more bubbles, much tighter spacing.
    // Base radius ~18-26; bubbles step ~9px apart (≈0.4× radius) so they fuse.
    const bubbleCount = 6 + Math.floor(rng() * 3); // 6-8 bubbles
    const baseR = (18 + rng() * 8) * scale;
    const stepX = baseR * 0.42; // tight overlap
    const totalSpan = stepX * (bubbleCount - 1);
    const bubbles = [];
    let maxBottom = 0;
    for (let b = 0; b < bubbleCount; b++) {
      // Position along x, then nudge slightly
      const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.3;
      // Vary radius — bigger in the middle, smaller at edges, gives that
      // classic cumulus dome silhouette
      const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.35 + (rng() - 0.5) * 0.15;
      const br = baseR * sizeFactor;
      // Y: top edge varies (puffy); all bubbles share approximately the same
      // BOTTOM line — that's what makes cumulus look grounded vs. blobby
      const topJitter = (rng() - 0.5) * br * 0.4;
      const by = topJitter - (1 - distFromCenter) * br * 0.3;
      bubbles.push({ bx, by, br });
      maxBottom = Math.max(maxBottom, by + br);
    }
    clouds.push({ x, y: baseY, bubbles, baseW: totalSpan + baseR * 1.6, baseY: maxBottom - 2, o });
  }
  return (
    <g>
      {clouds.map((c, i) => (
        <g key={i} transform={`translate(${c.x},${c.y})`} opacity={c.o}>
          {/* Flat base — anchors all bubbles to a common bottom line.
              Sits slightly above the lowest circle bottom so it fuses with them. */}
          <rect
            x={-c.baseW / 2}
            y={c.baseY - 6}
            width={c.baseW}
            height={8}
            rx={4}
            fill={tint}
          />
          {c.bubbles.map((b, j) => (
            <circle key={j} cx={b.bx} cy={b.by} r={b.br} fill={tint} />
          ))}
        </g>
      ))}
    </g>
  );
}

// ─── Bird flock ('v'/chevron shapes drifting at dawn/dusk) ───────────────────
function BirdFlock({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  const tint = spec.colorCurve ? sampleColorCurve(spec.colorCurve, t) : '#1a1a2a';
  if (density < 0.05) return null;
  const sizeMul = spec.sizeMul || 1;
  const rng = mulberry32(77);
  const birds = [];
  for (let i = 0; i < spec.count; i++) {
    const baseX = rng() * w * 1.2;
    const baseY = gameH * 0.18 + rng() * gameH * 0.25;
    const drift = (nowMs * 0.04 * spec.speed + rng() * 1000) % (w + 100);
    const x = ((baseX + drift) % (w + 100)) - 50;
    // wing flap — phase per bird, ~3Hz
    const wingPhase = nowMs * 0.005 + rng() * Math.PI * 2;
    const wing = Math.sin(wingPhase) * 0.4 + 0.6; // 0.2 → 1.0
    const size = (4 + rng() * 3) * sizeMul;
    birds.push({ x, y: baseY, size, wing, o: (0.55 + rng() * 0.3) * density });
  }
  return (
    <g>
      {birds.map((b, i) => {
        // Two wing strokes forming a "v"
        const wingY = b.size * b.wing;
        // Stroke width scales with size so big birds don't look like hairlines
        const sw = Math.max(0.9, b.size * 0.18);
        return (
          <path
            key={i}
            d={`M ${b.x - b.size},${b.y} Q ${b.x - b.size * 0.4},${b.y - wingY} ${b.x},${b.y} Q ${b.x + b.size * 0.4},${b.y - wingY} ${b.x + b.size},${b.y}`}
            stroke={tint}
            strokeWidth={sw}
            fill="none"
            opacity={b.o}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

// ─── Celestial body (sun, moon, earth-from-space, etc.) ──────────────────────
function Celestial({ spec, theme, t, positionT, w, gameH }) {
  const color = sampleColorCurve(spec.colorCurve, t);
  const glow = sampleScalarCurve(spec.glowCurve, t);
  // Position uses positionT (rawT) so the body arcs continuously across the
  // raw cycle even during long plateaus. Color/glow uses t (sampledT) so the
  // body's tint stays in sync with the sky.
  const posT = positionT != null ? positionT : t;
  // Position: prefer xCurve/yCurve (animated arc) over fixed xPct/yPct.
  const xPct = spec.xCurve ? sampleScalarCurve(spec.xCurve, posT) : spec.xPct;
  const yPct = spec.yCurve ? sampleScalarCurve(spec.yCurve, posT) : spec.yPct;
  const x = xPct * w;
  const y = yPct * gameH;
  const id = 'celest-' + spec.id;
  const r = spec.radius;

  // Hide entirely if glow=0 — applies to light-source kinds (sun, moon).
  // Physical features (storm-eye, planet, earth) remain visible regardless.
  const isLightSource = spec.kind === 'sun' || spec.kind === 'moon';
  if (glow <= 0.01 && isLightSource) return null;

  // Storm-eye (Jupiter's Great Red Spot) — oval body, 4 concentric flow rings.
  // No halo. Static (no rotation in iteration tool — engine renderer animates).
  if (spec.kind === 'storm-eye') {
    const aspect = 1.6; // oblate horizontally
    const rx = r * aspect;
    const ry = r;
    // Ring color: darker shade of body color. Using a simple multiply on RGB.
    const ringHex = (function darken(hex) {
      const n = parseInt(hex.replace('#', ''), 16);
      const rr = ((n >> 16) & 255) * 0.5;
      const gg = ((n >> 8) & 255) * 0.5;
      const bb = (n & 255) * 0.5;
      const c = (v) => Math.round(v).toString(16).padStart(2, '0');
      return '#' + c(rr) + c(gg) + c(bb);
    })(color);
    return (
      <g>
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={color} />
        {[0.85, 0.65, 0.45, 0.25].map((s, i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={rx * s}
            ry={ry * s}
            fill="none"
            stroke={ringHex}
            strokeWidth="1"
            opacity={0.15 + i * 0.04}
          />
        ))}
      </g>
    );
  }

  // Earth-from-space: blue ocean + green continent patches + atmospheric glow
  if (spec.kind === 'earth') {
    const continent = spec.continentCurve ? sampleColorCurve(spec.continentCurve, t) : '#5a8a4e';
    const clipId = id + '-clip';
    return (
      <g>
        <defs>
          <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#a8d0f0" stopOpacity="1" />
            <stop offset="100%" stopColor="#a8d0f0" stopOpacity="0" />
          </radialGradient>
          <clipPath id={clipId}>
            <circle cx={x} cy={y} r={r} />
          </clipPath>
        </defs>
        {/* Atmospheric glow halo */}
        <circle cx={x} cy={y} r={r * 1.8} fill={`url(#${id})`} opacity={glow} />
        {/* Ocean body */}
        <circle cx={x} cy={y} r={r} fill={color} />
        {/* Continent patches — clipped to body. Stylized blob shapes. */}
        <g clipPath={`url(#${clipId})`} fill={continent}>
          {/* Africa-ish */}
          <path d={`M ${x - r * 0.1},${y - r * 0.4} q ${r * 0.25},${r * 0.1} ${r * 0.2},${r * 0.5} q -${r * 0.05},${r * 0.3} -${r * 0.3},${r * 0.2} q -${r * 0.2},-${r * 0.15} -${r * 0.15},-${r * 0.45} q ${r * 0.05},-${r * 0.2} ${r * 0.25},-${r * 0.1} z`} />
          {/* Eurasia smear */}
          <path d={`M ${x + r * 0.1},${y - r * 0.55} q ${r * 0.4},-${r * 0.05} ${r * 0.55},${r * 0.1} q ${r * 0.05},${r * 0.2} -${r * 0.2},${r * 0.18} q -${r * 0.4},${r * 0.0} -${r * 0.45},-${r * 0.1} z`} />
          {/* Small island/Australia-ish */}
          <ellipse cx={x + r * 0.45} cy={y + r * 0.35} rx={r * 0.22} ry={r * 0.12} />
          {/* Polar tip */}
          <path d={`M ${x - r * 0.5},${y + r * 0.4} q ${r * 0.3},${r * 0.05} ${r * 0.45},-${r * 0.05} q -${r * 0.1},${r * 0.2} -${r * 0.4},${r * 0.18} z`} />
        </g>
        {/* Soft terminator — dark crescent on opposite side of glow */}
        <circle cx={x + r * 0.35} cy={y + r * 0.05} r={r} fill="#000" opacity="0.22" clipPath={`url(#${clipId})`} />
      </g>
    );
  }

  // Moon: cool soft body, gentle halo, slight phase-shadow on the lit side.
  if (spec.kind === 'moon') {
    return (
      <g>
        <defs>
          <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Soft halo (smaller than sun's) */}
        <circle cx={x} cy={y} r={r * 1.8} fill={`url(#${id})`} opacity={glow} />
        {/* Body */}
        <circle cx={x} cy={y} r={r} fill={color} />
        {/* Subtle terminator hint — barely visible, gives the moon dimension */}
        <circle cx={x + r * 0.25} cy={y - r * 0.05} r={r} fill="#1a1a2a" opacity="0.18" />
      </g>
    );
  }

  // Default: sun / generic disc
  return (
    <g>
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r={r * 2.6} fill={`url(#${id})`} opacity={glow} />
      <circle cx={x} cy={y} r={r} fill={color} />
    </g>
  );
}

// ─── The composer ────────────────────────────────────────────────────────────
function WorldRenderer({ theme, t, rawT, w, gameH, scrollX, nowMs, layerVisible, scrollSpeed, particleMul }) {
  const visible = (id) => (layerVisible ? layerVisible[id] !== false : true);
  // Celestial bodies use rawT for position arcs (so the sun/moon glide
  // continuously even during the long day/night plateaus of an atmospheric
  // cycle), but keep `t` for color/glow so they tint with the sky.
  const positionT = rawT != null ? rawT : t;

  return (
    <svg
      width={w}
      height={gameH}
      viewBox={`0 0 ${w} ${gameH}`}
      style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
    >
      {visible('sky') && <SkyBand theme={theme} t={t} w={w} h={gameH} />}

      {/* celestials sit between sky and silhouettes */}
      {visible('celestials') && theme.celestials.map((c) => (
        <Celestial key={c.id} spec={c} theme={theme} t={t} positionT={positionT} w={w} gameH={gameH} />
      ))}

      {/* stars in sky region */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'starfield').map((p) => (
        <Starfield key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* clouds in upper sky, behind silhouettes */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'clouds').map((p) => (
        <CloudField key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* birds in upper-mid sky, behind silhouettes */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'birds').map((p) => (
        <BirdFlock key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* bands */}
      {theme.bands.map((band) => {
        if (!visible(band.id)) return null;
        if (band.kind === 'silhouette') {
          return <SilhouetteBand key={band.id} band={band} theme={theme} t={t} w={w} gameH={gameH} scrollX={scrollX} scrollSpeed={scrollSpeed} />;
        }
        if (band.kind === 'plain') {
          return <PlainBand key={band.id} band={band} theme={theme} t={t} w={w} gameH={gameH} />;
        }
        if (band.kind === 'craters') {
          return <CraterField key={band.id} band={band} theme={theme} t={t} w={w} gameH={gameH} scrollX={scrollX} scrollSpeed={scrollSpeed} />;
        }
        return null;
      })}

      {/* dust drifts above the regolith */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'horizontalDrift').map((p) => (
        <DustField key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}
    </svg>
  );
}

window.WorldRenderer = WorldRenderer;
