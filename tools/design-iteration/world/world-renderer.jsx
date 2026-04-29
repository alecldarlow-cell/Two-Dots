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
// Peaks lowered (was 0.65-0.95 of band height, now 0.45-0.75) per Earth
// point 4 (round 6) — gentler slopes, less aggressive silhouette.
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
      heightFrac = 0.45 + rng() * 0.30; // peaks reach 45-75% of band height
    } else {
      heightFrac = 0.15 + rng() * 0.20; // valleys 15-35%
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

// 'singleHill' — flat foreground rise per Earth point 3 (round 6 review).
// Bell curve with peak lowered (h*0.05 → h*0.55), no surface ripple, 120
// points for smoother lines.
function singleHillPath(w, h, scrollX, seed) {
  const span = w * 2.0;
  const offset = -(scrollX % w);
  const peakX = span * 0.42;
  const peakY = h * 0.55;
  const points = 120;
  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const dx = (x - peakX) / (span * 0.55);
    const bell = 1 / (1 + dx * dx);
    const tilt = (x - peakX) > 0 ? -dx * 0.04 * h : 0;
    const y = h - (h - peakY) * bell + tilt;
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

// Grass tuft generator — clumps of 3 curved blades along the top edge of the
// singleHill silhouette. Two-tone (lighter front blade over darker side
// blades) for depth, ToD-aware colours, parallax-scrolling. Per Earth
// foreground review (round 6 — "tufts of three blades, varied angles").
function renderGrassTufts(band, h, sx, t, w) {
  // Two grass colour curves — light (front blade) and dark (back blades).
  // Both shift through the day cycle: vivid in day, muted dawn/dusk, near
  // black at night. Light/dark contrast gives the clumps depth.
  const grassLightCurve = [
    { t: 0.00, color: '#6a8458' }, // dawn — cool muted green
    { t: 0.25, color: '#5aa040' }, // day  — vivid grass green
    { t: 0.50, color: '#7a8038' }, // dusk — warm olive
    { t: 0.75, color: '#0a1410' }, // night — near-black green
  ];
  const grassDarkCurve = [
    { t: 0.00, color: '#3e5430' }, // dawn — deep moss
    { t: 0.25, color: '#356528' }, // day  — saturated forest
    { t: 0.50, color: '#4f5020' }, // dusk — dark olive
    { t: 0.75, color: '#050a08' }, // night — almost black
  ];
  const grassLight = sampleColorCurve(grassLightCurve, t);
  const grassDark = sampleColorCurve(grassDarkCurve, t);

  const span = w * 2.0;
  const offset = -(sx % w);
  const peakX = span * 0.42;
  const peakY = h * 0.55; // matches singleHillPath
  const rng = mulberry32(7777);
  const clumpSpacing = 22; // wider so bigger clumps don't pile up
  const darkBlades = [];
  const lightBlades = [];

  // Build a single curved blade as a closed Q-curve path.
  //   xBase, yBase   blade attachment point (on the silhouette top edge)
  //   angle          tilt from vertical, in radians (0 = straight up)
  //   length         blade length in px
  //   baseWidth      half-width of blade base
  //   curlDir        bend direction along the blade (-1 ↔ +1)
  function makeBlade(xBase, yBase, angle, length, baseWidth, curlDir) {
    const tipX = xBase + Math.sin(angle) * length;
    const tipY = yBase - Math.cos(angle) * length;
    const midX = xBase + Math.sin(angle) * length * 0.5;
    const midY = yBase - Math.cos(angle) * length * 0.5;
    // Curl: shift mid perpendicular to blade direction
    const curlAmount = length * 0.15 * curlDir;
    const curlX = Math.cos(angle) * curlAmount;
    const curlY = Math.sin(angle) * curlAmount;
    // Perpendicular offset for blade thickness
    const perpX = Math.cos(angle) * baseWidth * 0.5;
    const perpY = Math.sin(angle) * baseWidth * 0.5;
    return (
      `M ${xBase - baseWidth},${yBase} ` +
      `Q ${(midX + curlX - perpX).toFixed(2)},${(midY + curlY - perpY).toFixed(2)} ` +
      `${tipX.toFixed(2)},${tipY.toFixed(2)} ` +
      `Q ${(midX + curlX + perpX).toFixed(2)},${(midY + curlY + perpY).toFixed(2)} ` +
      `${xBase + baseWidth},${yBase} Z`
    );
  }

  for (let x = 0; x <= span; x += clumpSpacing) {
    if (rng() < 0.18) continue; // ~18% gaps — creates visible clusters and gaps
    const dx = (x - peakX) / (span * 0.55);
    const bell = 1 / (1 + dx * dx);
    const tilt = (x - peakX) > 0 ? -dx * 0.04 * h : 0;
    const yEdge = h - (h - peakY) * bell + tilt;
    // Per-clump x jitter so positions aren't on a fixed grid
    const xJitter = (rng() - 0.5) * clumpSpacing * 0.4;
    const xPos = x + offset + xJitter;
    const clumpScale = 0.7 + rng() * 0.7; // 0.7-1.4 — wider variation

    // Center blade — tallest, mostly vertical with stronger wobble. Lighter
    // shade so it pops against the side blades behind it.
    const centerAngle = (rng() - 0.5) * 0.5; // ±~14° wobble (was ±~9°)
    const centerH = (16 + rng() * 10) * clumpScale; // ~11-36px tall
    const centerBaseW = (1.8 + rng() * 0.6) * clumpScale;
    const centerCurl = (rng() - 0.5) * 1.2;
    lightBlades.push(makeBlade(xPos, yEdge, centerAngle, centerH, centerBaseW, centerCurl));

    // Left blade — angled out left, shorter. Darker shade (recedes).
    const leftAngle = -0.45 + (rng() - 0.5) * 0.45; // wider angle range
    const leftH = (12 + rng() * 5) * clumpScale; // ~8-24px
    const leftBaseW = (1.3 + rng() * 0.4) * clumpScale;
    const leftCurl = 0.5 + rng() * 0.5; // 0.5-1.0
    darkBlades.push(makeBlade(xPos - 2, yEdge, leftAngle, leftH, leftBaseW, leftCurl));

    // Right blade — angled out right, shorter. Darker.
    const rightAngle = 0.45 + (rng() - 0.5) * 0.45;
    const rightH = (12 + rng() * 5) * clumpScale;
    const rightBaseW = (1.3 + rng() * 0.4) * clumpScale;
    const rightCurl = -(0.5 + rng() * 0.5);
    darkBlades.push(makeBlade(xPos + 2, yEdge, rightAngle, rightH, rightBaseW, rightCurl));

    // Occasionally (20%) add a 4th rogue blade for more variety. Random
    // angle, light shade, helps break up the symmetric 3-blade pattern.
    if (rng() < 0.2) {
      const rogueAngle = (rng() - 0.5) * 1.0; // wide range -29° to +29°
      const rogueH = (10 + rng() * 6) * clumpScale;
      const rogueBaseW = (1.2 + rng() * 0.4) * clumpScale;
      const rogueCurl = (rng() - 0.5) * 1.5;
      const rogueOffset = (rng() - 0.5) * 4;
      lightBlades.push(
        makeBlade(xPos + rogueOffset, yEdge, rogueAngle, rogueH, rogueBaseW, rogueCurl),
      );
    }
  }
  return (
    <g>
      {/* Dark side blades render first (behind) */}
      <g fill={grassDark}>
        {darkBlades.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* Light center blades render on top */}
      <g fill={grassLight}>
        {lightBlades.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
}

// 'storm-bands' specialised renderer — for gas-giant atmospheric bands.
// Each band is a solid-fill region with a turbulent top edge (festoons, curls,
// four-octave organic noise) extending down to the bottom of the canvas. The
// theme's bands are painted top-to-bottom in array order, so each one over-
// paints the previous's lower portion — its turbulent top edge thereby becomes
// the boundary against the band above. No internal silhouette, no alpha
// gradient: clean defined bands with organic edges, mirroring real Jupiter's
// cloud-band structure (the visible interest lives at zone-belt boundaries,
// not inside the bands). Per Jupiter point 1 (round 7 — review of v1
// alpha-feathered renderer which lost band identity).
function StormBand({ band, theme, t, w, gameH, scrollX, scrollSpeed }) {
  const color = sampleColorCurve(band.colorCurve, t);
  const yTop = band.yPct * gameH;
  const h = band.heightPct * gameH;
  const sx = scrollX * band.parallax * scrollSpeed;

  const seed =
    band.id === 'upperPolarHaze' ? 1111 :
    band.id === 'ntrZone'        ? 2233 :
    band.id === 'nebBelt'        ? 3344 :
    band.id === 'equatorialZone' ? 4455 :
    band.id === 'sebBelt'        ? 5566 :
    band.id === 'lowerZone'      ? 6677 : 9012;
  const rng = mulberry32(seed);
  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const j3 = rng() * 6;
  const j4 = rng() * 6;

  // Turbulent top edge — 4-octave wave gives organic festoon-style undulation.
  // Amplitudes scale with band height so wider bands get proportionally
  // larger wobble. Total max ~17% of band height.
  const points = 240;
  const span = w * 1.4;
  const offset = -(sx % w);
  const startX = -w * 0.2;

  const pts = [];
  for (let i = 0; i <= points; i++) {
    const x = startX + (i / points) * span;
    const xs = x + offset;
    const wave =
      Math.sin(xs * 0.0090 + j1) * h * 0.090 + // long swell — broad arcs across screen
      Math.sin(xs * 0.0320 + j2) * h * 0.045 + // medium — primary festoons
      Math.sin(xs * 0.0900 + j3) * h * 0.022 + // small detail
      Math.sin(xs * 0.2400 + j4) * h * 0.010;  // fine grain
    pts.push([xs, yTop + wave]);
  }

  // Closed path: bottom-left → up to turbulent edge → across the edge →
  // down to bottom-right → close. Fills from the turbulent top edge to the
  // canvas bottom; bands listed AFTER this one paint over our lower portion,
  // so the visible slice is bounded by our top edge above and theirs below.
  let d = `M ${pts[0][0].toFixed(1)},${gameH}`;
  d += ` L ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
  }
  d += ` L ${pts[pts.length - 1][0].toFixed(1)},${gameH}`;
  d += ' Z';

  return <path d={d} fill={color} />;
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

  // Grass tufts — only for the closest foreground band (singleHill profile).
  const grassTufts = band.profile === 'singleHill' ? renderGrassTufts(band, h, sx, t, w) : null;

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
        {grassTufts}
      </g>
    );
  }

  return (
    <g transform={`translate(0, ${y})`}>
      <path d={d} fill={color} />
      {grassTufts}
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
    for (let b = 0; b < bubbleCount; b++) {
      // Position along x, then nudge slightly
      const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.3;
      // Vary radius — bigger in the middle, smaller at edges, gives the
      // classic cumulus dome silhouette
      const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.30 + (rng() - 0.5) * 0.15;
      const br = baseR * sizeFactor;
      // ALL bubble bottoms extend slightly BELOW the cloud baseline (clip
      // line at y=0). The clip-path then uniformly truncates every bubble
      // to a flat bottom. If a bubble didn't extend past the baseline, its
      // natural arc would show through, breaking the flat look. Per Earth
      // point 6 follow-up (round 6).
      const by = -br + br * 0.12;
      bubbles.push({ bx, by, br });
    }
    clouds.push({ x, y: baseY, bubbles, o });
  }
  return (
    <g>
      {clouds.map((c, i) => {
        // Clip everything below the baseline (y=0 in local coords) so the
        // cloud bottom is geometrically flat. Without this, each circle's
        // bottom is an arc and the envelope between adjacent bubbles dips
        // upward, creating a scalloped wavy bottom. Per Earth point 6.
        const clipId = `cloudclip-${theme.id}-${i}`;
        return (
          <g key={i} transform={`translate(${c.x},${c.y})`} opacity={c.o}>
            <defs>
              <clipPath id={clipId}>
                <rect x={-300} y={-300} width={600} height={300} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              {c.bubbles.map((b, j) => (
                <circle key={j} cx={b.bx} cy={b.by} r={b.br} fill={tint} />
              ))}
            </g>
          </g>
        );
      })}
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
    // Wing flap — wingtips oscillate up/down, body stays fixed. Slowed to
    // ~1.3 Hz (was ~2 Hz) — more like real flight, less frantic.
    const wingPhase = nowMs * 0.008 + rng() * Math.PI * 2;
    const tipLift = Math.sin(wingPhase) * 0.7; // signed, swings through zero
    const size = (4 + rng() * 3) * sizeMul;
    birds.push({ x, y: baseY, size, tipLift, o: (0.55 + rng() * 0.3) * density });
  }
  return (
    <g>
      {birds.map((b, i) => {
        // Wingtip y oscillates above/below body y. Body stays at b.y.
        // Each wing's control point is placed PERPENDICULAR to the tip→body
        // line by curlMag, so the arc magnitude stays consistent regardless
        // of where the wing is in the flap cycle. Curl always points upward
        // (negative y) — gives each wing a clear soft arc rather than a
        // chevron straight line. Per Earth point 5 follow-up (round 6).
        const tipY = b.y + b.size * b.tipLift;
        const sw = Math.max(0.9, b.size * 0.18);
        const curlMag = b.size * 0.45;

        // Left wing: tip → body
        const lDx = b.size; // body.x - tip.x
        const lDy = b.y - tipY;
        const lLen = Math.sqrt(lDx * lDx + lDy * lDy);
        const lPerpX = lDy / lLen; // perpendicular, normalised
        const lPerpY = -lDx / lLen; // always negative (points up)
        const lCtrlX = (b.x - b.size + b.x) / 2 + lPerpX * curlMag;
        const lCtrlY = (tipY + b.y) / 2 + lPerpY * curlMag;

        // Right wing: body → tip (mirror)
        const rDx = b.size;
        const rDy = tipY - b.y;
        const rLen = Math.sqrt(rDx * rDx + rDy * rDy);
        const rPerpX = rDy / rLen;
        const rPerpY = -rDx / rLen;
        const rCtrlX = (b.x + b.x + b.size) / 2 + rPerpX * curlMag;
        const rCtrlY = (b.y + tipY) / 2 + rPerpY * curlMag;

        return (
          <path
            key={i}
            d={
              `M ${b.x - b.size},${tipY} ` +
              `Q ${lCtrlX.toFixed(2)},${lCtrlY.toFixed(2)} ${b.x},${b.y} ` +
              `Q ${rCtrlX.toFixed(2)},${rCtrlY.toFixed(2)} ${b.x + b.size},${tipY}`
            }
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

  // Earth-from-space: blue ocean + recognisable continents + ice caps + halo.
  // Africa-Europe view (the iconic Earth-from-Moon angle). Per Moon point 6
  // (round 6 review) — replaces the abstract blob continents with shapes
  // that read as Earth at a glance.
  if (spec.kind === 'earth') {
    const continent = spec.continentCurve ? sampleColorCurve(spec.continentCurve, t) : '#3a7a3e';
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
        {/* Land + ice caps — all clipped to body so excess gets trimmed at edge */}
        <g clipPath={`url(#${clipId})`}>
          {/* Africa — sharper proportions: taller than wide, distinct horn
              on the east, narrowing to a clear southern point (Cape).
              West coast roughly straight along the Atlantic. */}
          <path
            fill={continent}
            d={`M ${x - r * 0.08},${y - r * 0.46}
                L ${x + r * 0.14},${y - r * 0.44}
                Q ${x + r * 0.22},${y - r * 0.36} ${x + r * 0.22},${y - r * 0.18}
                Q ${x + r * 0.30},${y - r * 0.02} ${x + r * 0.26},${y + r * 0.10}
                Q ${x + r * 0.14},${y + r * 0.20} ${x + r * 0.06},${y + r * 0.35}
                Q ${x - r * 0.02},${y + r * 0.50} ${x - r * 0.06},${y + r * 0.58}
                Q ${x - r * 0.18},${y + r * 0.48} ${x - r * 0.22},${y + r * 0.32}
                Q ${x - r * 0.27},${y + r * 0.10} ${x - r * 0.25},${y - r * 0.12}
                Q ${x - r * 0.22},${y - r * 0.32} ${x - r * 0.16},${y - r * 0.42}
                Q ${x - r * 0.12},${y - r * 0.46} ${x - r * 0.08},${y - r * 0.46} Z`}
          />
          {/* Europe — bigger and more peninsula-defined. Iberian bump on
              the west, Italian boot dipping middle, eastward Eurasia. */}
          <path
            fill={continent}
            d={`M ${x - r * 0.22},${y - r * 0.5}
                Q ${x - r * 0.30},${y - r * 0.62} ${x - r * 0.15},${y - r * 0.66}
                Q ${x + r * 0.05},${y - r * 0.72} ${x + r * 0.25},${y - r * 0.66}
                Q ${x + r * 0.40},${y - r * 0.60} ${x + r * 0.42},${y - r * 0.50}
                Q ${x + r * 0.34},${y - r * 0.46} ${x + r * 0.20},${y - r * 0.48}
                L ${x + r * 0.08},${y - r * 0.44}
                Q ${x + r * 0.04},${y - r * 0.40} ${x + r * 0.00},${y - r * 0.45}
                L ${x - r * 0.10},${y - r * 0.46}
                Q ${x - r * 0.18},${y - r * 0.44} ${x - r * 0.22},${y - r * 0.5} Z`}
          />
          {/* South America fragment — dropped on the western limb. Tapers
              from wider top (Brazil/Amazon) to narrow southern tip
              (Patagonia). Body clip trims the leftmost portion. */}
          <path
            fill={continent}
            d={`M ${x - r * 0.85},${y - r * 0.10}
                Q ${x - r * 0.55},${y - r * 0.05} ${x - r * 0.48},${y + r * 0.08}
                Q ${x - r * 0.50},${y + r * 0.25} ${x - r * 0.55},${y + r * 0.40}
                Q ${x - r * 0.60},${y + r * 0.50} ${x - r * 0.65},${y + r * 0.42}
                Q ${x - r * 0.62},${y + r * 0.25} ${x - r * 0.68},${y + r * 0.10}
                Q ${x - r * 0.78},${y + r * 0.00} ${x - r * 0.85},${y - r * 0.10} Z`}
          />
          {/* North America fragment — upper-left, partial. Hints at the
              continental mass without trying to draw the whole thing. */}
          <path
            fill={continent}
            d={`M ${x - r * 0.85},${y - r * 0.50}
                Q ${x - r * 0.55},${y - r * 0.45} ${x - r * 0.42},${y - r * 0.30}
                Q ${x - r * 0.40},${y - r * 0.18} ${x - r * 0.50},${y - r * 0.12}
                Q ${x - r * 0.65},${y - r * 0.18} ${x - r * 0.78},${y - r * 0.30}
                Q ${x - r * 0.88},${y - r * 0.40} ${x - r * 0.85},${y - r * 0.50} Z`}
          />
          {/* Madagascar — small island east of southern Africa. Tiny but
              distinctive; instantly cues "Earth" to map-readers. */}
          <ellipse
            cx={x + r * 0.34}
            cy={y + r * 0.22}
            rx={r * 0.04}
            ry={r * 0.10}
            fill={continent}
          />
          {/* North polar ice cap */}
          <ellipse
            cx={x}
            cy={y - r * 0.95}
            rx={r * 0.55}
            ry={r * 0.18}
            fill="rgba(255,255,255,0.85)"
          />
          {/* South polar ice cap */}
          <ellipse
            cx={x}
            cy={y + r * 0.95}
            rx={r * 0.5}
            ry={r * 0.15}
            fill="rgba(255,255,255,0.85)"
          />
        </g>
        {/* Soft terminator — dark crescent on far side of the sun */}
        <circle
          cx={x + r * 0.35}
          cy={y + r * 0.05}
          r={r}
          fill="#000"
          opacity="0.22"
          clipPath={`url(#${clipId})`}
        />
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

      {/* celestials sit between sky and silhouettes — except storm-eye
          (Jupiter's Great Red Spot), which lives IN the cloud layer rather
          than behind it. We render it after the bands below. */}
      {visible('celestials') && theme.celestials.filter((c) => c.kind !== 'storm-eye').map((c) => (
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
          // Gas-giant bands take a specialised renderer (alpha-feathered
          // overlap, no silhouette path). Per Jupiter point 1 (round 7).
          if (band.profile === 'storm-bands') {
            return <StormBand key={band.id} band={band} theme={theme} t={t} w={w} gameH={gameH} scrollX={scrollX} scrollSpeed={scrollSpeed} />;
          }
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

      {/* storm-eye celestials (Jupiter's Great Red Spot) — drawn LAST so they
          sit on top of the atmospheric bands as a cloud-layer feature. */}
      {visible('celestials') && theme.celestials.filter((c) => c.kind === 'storm-eye').map((c) => (
        <Celestial key={c.id} spec={c} theme={theme} t={t} positionT={positionT} w={w} gameH={gameH} />
      ))}
    </svg>
  );
}

window.WorldRenderer = WorldRenderer;
