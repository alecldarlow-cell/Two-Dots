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

// ─── Cloud band (Jupiter) — horizontal stripe with shear/turbulence ─────────
// Each band is a solid fill with a single turbulent top edge that fills DOWN
// to the canvas bottom (Moon/Earth silhouette pattern). Bands paint in array
// order, so each one's lower portion gets overpainted by the next band's top
// — resulting in continuous atmospheric coverage with no sky leak between
// bands. The visible boundary between band[i] and band[i+1] is band[i+1]'s
// turbulent top, naturally festoon-like.
//
// Per-band driftSpeed scrolls the band horizontally independent of player
// scroll; alternating signs across bands produce the "banded shear" signature.
// Subtle interior streaks drift at a slightly different rate than the band
// itself for a hint of laminar flow.
//
// Per Jupiter point 1+2+5 + post-merge geometry fix (round 7).
function CloudBand({ band, theme, t, w, gameH, scrollX, scrollSpeed, nowMs }) {
  const color = sampleColorCurve(band.colorCurve, t);
  const y = band.yPct * gameH;
  const h = band.heightPct * gameH;
  // Distance from band top down to canvas bottom — path fills this whole
  // strip so the next band overpaints cleanly with no sky leak.
  const hExtended = gameH - y;
  const sx = scrollX * band.parallax * scrollSpeed;
  const driftPx = (nowMs * (band.driftSpeed || 0) * 0.02) % w;
  const totalX = sx + driftPx;

  const seed =
    band.id === 'farBand1'  ? 1100 :
    band.id === 'farBand2'  ? 1200 :
    band.id === 'midBand1'  ? 1300 :
    band.id === 'midBand2'  ? 1400 :
    band.id === 'nearBand1' ? 1500 :
    band.id === 'nearBand2' ? 1600 : 1700;
  const rng = mulberry32(seed);

  // Top edge — single 3-octave wave for organic festoon-style undulation.
  // Amplitude tightened from 0.85 → 0.45 of band height: bands now read as
  // zones with curling cloud-tops, not sausages.
  const points = 96;
  const span = w * 2.4;
  // Normalised offset in (-w, 0] regardless of totalX sign. JS modulo keeps
  // the sign of the dividend, so without the (+w)%w step a negative totalX
  // (which happens when band.driftSpeed is negative and outpaces scroll) would
  // yield a POSITIVE offset and leave an uncovered strip on the left edge of
  // the canvas — visible as a vertical seam where the band below shows through.
  const offset = -(((totalX % w) + w) % w);
  const ampTop = (band.turbulence != null ? band.turbulence : 0.25) * h * 0.45;

  const j1 = rng() * 6;
  const j2 = rng() * 6;
  const j3 = rng() * 6;

  const topPts = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * span;
    const o1 = Math.sin(x * 0.0035 + j1) * ampTop * 0.55;
    const o2 = Math.sin(x * 0.012  + j2) * ampTop * 0.30;
    const o3 = Math.sin(x * 0.045  + j3) * ampTop * 0.15;
    const yEdge = (o1 + o2 + o3) + ampTop;
    topPts.push([x + offset, yEdge]);
  }

  // Closed path: top-edge → down to canvas bottom → close. Fills band-local
  // y from turbulent top edge to hExtended (canvas bottom). Subsequent bands
  // overpaint the overflow.
  let d = `M ${topPts[0][0]},${hExtended}`;
  d += ` L ${topPts[0][0]},${topPts[0][1]}`;
  for (let i = 1; i < topPts.length; i++) d += ` L ${topPts[i][0]},${topPts[i][1]}`;
  d += ` L ${topPts[topPts.length - 1][0]},${hExtended}`;
  d += ' Z';

  // Interior shear streaks — wavy paths (sine undulation) in muted grey-tinted
  // colour. Was straight band-tinted lines that read as drawn pinstripes; now
  // gentle waves desaturated toward neutral grey, more like cloud striations
  // than band pigment. Per streak shape+colour pass (round 7).
  const streakColor = band.streakCurve ? sampleColorCurve(band.streakCurve, t) : null;
  const streakCount = band.streaks || 0;
  const streaks = [];
  if (streakCount > 0 && streakColor) {
    // Desaturate band-tinted streak colour toward atmospheric grey-haze.
    // 55% lerp toward #808078 strips most of the band's pigment so streaks
    // read as cloud detail rather than darker band.
    const { lerpHex } = window.ThemeSchema;
    const greyTint = lerpHex(streakColor, '#808078', 0.55);
    const streakDrift = (nowMs * (band.driftSpeed || 0) * 0.03) % w;
    for (let i = 0; i < streakCount; i++) {
      const yPct = 0.25 + (i / streakCount) * 0.55 + rng() * 0.1;
      const sxStreak = ((rng() * w * 2) - streakDrift) % (w * 2) - w * 0.2;
      const length = w * (0.4 + rng() * 0.6);
      const opacity = 0.10 + rng() * 0.10;
      const sw = 0.6 + rng() * 0.7;
      // Wavy path — gentle sin undulation along the streak's length.
      const phase = rng() * Math.PI * 2;
      const ampY = 1.2 + rng() * 1.8;             // peak vertical deviation
      const wavelength = length / (1.5 + rng() * 1.5); // 1.5-3 waves over length
      const y0 = h * yPct;
      const segments = 24;
      let pd = '';
      for (let j = 0; j <= segments; j++) {
        const tp = j / segments;
        const xj = sxStreak + tp * length;
        const wave = Math.sin((tp * length) / wavelength * Math.PI * 2 + phase) * ampY;
        pd += (j === 0 ? 'M ' : 'L ') + xj.toFixed(1) + ',' + (y0 + wave).toFixed(1) + ' ';
      }
      streaks.push({ d: pd.trim(), opacity, sw, color: greyTint });
    }
  }

  return (
    <g transform={`translate(0, ${y})`}>
      <path d={d} fill={color} />
      {streaks.length > 0 && (
        <g>
          {streaks.map((s, i) => (
            <path key={i} d={s.d} stroke={s.color} strokeWidth={s.sw} fill="none" opacity={s.opacity} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </g>
      )}
    </g>
  );
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

// ─── Lightning flashes (Jupiter night) ──────────────────────────────────────
// Three-layer storm flash:
//   1. Whole-scene ambient brightening (white rect, mixBlendMode screen,
//      decays with the flash) — sells "the whole atmosphere lit up"
//   2. Cool-tone radial bloom around each strike — local cloud illumination
//   3. Jagged bolt polyline with 0-2 branch forks — the actual electrical bolt,
//      drawn as a wide cyan-white halo stroke + narrow bright-white core
//
// Per-flash schedule keeps the original 8s loop with sharp attack (10%) and
// slow decay (90%). All visuals wrapped in a `mixBlendMode: 'screen'` group
// so light adds onto the underlying bands rather than overlaying as paint.
// Per Jupiter point 5 / lightning Option C (round 7 review).
function Lightning({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;

  // Find storm cells in the theme so bolts can originate from cloud bottoms
  // rather than random sky positions. Falls back to old random placement
  // if the theme has no stormClouds particle. Per round-7 anchored-lightning.
  const stormSpec = (theme.particles || []).find((p) => p.kind === 'stormClouds');
  const cloudCells = stormSpec ? computeStormCellPositions(stormSpec, w, gameH, nowMs) : [];

  const rng = mulberry32(909);
  const flashes = [];
  const cycleMs = 8000;
  const cyclePos = (nowMs % cycleMs) / cycleMs;

  for (let i = 0; i < spec.count; i++) {
    const startT = rng();
    const duration = 0.02 + rng() * 0.04;       // 160-480ms of the loop
    const boltLen = 60 + rng() * 80;            // shorter bolts — sit just below cloud
    const baseRadius = 80 + rng() * 80;

    // Pick origin: anchor to a cloud cell when available, else random sky.
    let cx, startY, endY;
    if (cloudCells.length > 0) {
      const cloudIdx = Math.floor(rng() * cloudCells.length);
      const cloud = cloudCells[cloudIdx];
      // Slight horizontal jitter from cloud centre so bolts emerge from
      // varied points along the cloud's bottom edge, not always the centre.
      cx = cloud.x + (rng() - 0.5) * cloud.baseR * 1.5;
      // Bolt origin: just below the cloud's nominal bottom edge.
      startY = cloud.y + cloud.cellHalfH * 0.6;
      endY = startY + boltLen;
    } else {
      cx = 60 + rng() * (w - 120);
      startY = gameH * (0.40 + rng() * 0.20);
      endY = startY + boltLen;
    }

    let dt = cyclePos - startT;
    if (dt < 0) dt += 1;
    if (dt < duration) {
      // Sharp attack (10%), exponential decay (90%) — feels like a real strike.
      const u = dt / duration;
      const intensity = u < 0.10 ? u / 0.10 : Math.pow(1 - (u - 0.10) / 0.90, 1.5);
      flashes.push({
        cx, startY, endY, baseRadius,
        alpha: intensity * density,
        geomSeed: 909 + i * 137,
      });
    }
  }

  if (flashes.length === 0) return null;

  // Whole-scene ambient flash — sum of all active flashes' contributions,
  // capped so multiple simultaneous strikes don't blow out the scene.
  const ambientAlpha = Math.min(0.18, flashes.reduce((sum, f) => sum + f.alpha * 0.08, 0));

  return (
    <g style={{ mixBlendMode: 'screen' }}>
      <defs>
        <radialGradient id={`lightning-bloom-${theme.id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"   stopColor="#e8f4ff" stopOpacity="0.9" />
          <stop offset="40%"  stopColor="#a8c0e8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#5a78b8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* whole-scene flash */}
      {ambientAlpha > 0.005 && (
        <rect x={0} y={0} width={w} height={gameH} fill="#ffffff" opacity={ambientAlpha} />
      )}

      {flashes.map((f, i) => {
        const r = mulberry32(f.geomSeed);
        const startY = f.startY;
        const endY = f.endY;
        // Bloom centre = midpoint of the bolt; used for radial gradient placement.
        const cy = (startY + endY) / 2;

        // Main bolt — jagged polyline anchored at start & end (cx), zigzag
        // through the middle. Tapered jitter (parabolic) so the bolt converges
        // cleanly to its endpoints rather than ending mid-zigzag.
        const segs = 8 + Math.floor(r() * 5);
        const boltPts = [];
        for (let s = 0; s <= segs; s++) {
          const tp = s / segs;
          const ty = startY + (endY - startY) * tp;
          const taper = 4 * tp * (1 - tp); // 0 at endpoints, 1 at midpoint
          const jitter = (r() - 0.5) * 24 * taper;
          boltPts.push([f.cx + jitter, ty]);
        }
        let boltD = `M ${boltPts[0][0].toFixed(1)},${boltPts[0][1].toFixed(1)}`;
        for (let s = 1; s < boltPts.length; s++) {
          boltD += ` L ${boltPts[s][0].toFixed(1)},${boltPts[s][1].toFixed(1)}`;
        }

        // 0-2 branch forks splitting off mid-bolt at random downward angles.
        const branches = [];
        for (let b = 0; b < 2; b++) {
          if (r() < 0.4) continue;
          const idx = 2 + Math.floor(r() * Math.max(1, boltPts.length - 4));
          if (idx >= boltPts.length) continue;
          const start = boltPts[idx];
          const sign = r() < 0.5 ? -1 : 1;
          const angle = sign * (Math.PI * 0.20 + r() * Math.PI * 0.30); // 36°–90° from vertical
          const len = 22 + r() * 35;
          const bSegs = 3 + Math.floor(r() * 3);
          const bPts = [start];
          for (let s = 1; s <= bSegs; s++) {
            const tp = s / bSegs;
            const bx = start[0] + Math.sin(angle) * len * tp;
            const by = start[1] + Math.abs(Math.cos(angle)) * len * tp; // always downward
            const j = (r() - 0.5) * 5;
            bPts.push([bx + j, by]);
          }
          let bd = `M ${bPts[0][0].toFixed(1)},${bPts[0][1].toFixed(1)}`;
          for (let s = 1; s < bPts.length; s++) {
            bd += ` L ${bPts[s][0].toFixed(1)},${bPts[s][1].toFixed(1)}`;
          }
          branches.push(bd);
        }

        const boltAlpha = Math.min(1, f.alpha * 1.6);
        const haloAlpha = Math.min(1, f.alpha * 0.65);
        const bloomFill = `url(#lightning-bloom-${theme.id})`;

        return (
          <g key={i}>
            {/* radial bloom — centred on the bolt's midpoint */}
            <circle
              cx={f.cx}
              cy={cy}
              r={f.baseRadius * 1.8}
              fill={bloomFill}
              opacity={f.alpha}
            />
            {/* bolt halo — wider, cyan-white */}
            <path d={boltD} stroke="#bfd8ff" strokeWidth="6" fill="none"
                  strokeLinecap="round" strokeLinejoin="round" opacity={haloAlpha} />
            {branches.map((bd, j) => (
              <path key={`h${j}`} d={bd} stroke="#bfd8ff" strokeWidth="3" fill="none"
                    strokeLinecap="round" strokeLinejoin="round" opacity={haloAlpha * 0.7} />
            ))}
            {/* bolt core — narrow, bright white */}
            <path d={boltD} stroke="#ffffff" strokeWidth="2" fill="none"
                  strokeLinecap="round" strokeLinejoin="round" opacity={boltAlpha} />
            {branches.map((bd, j) => (
              <path key={`c${j}`} d={bd} stroke="#ffffff" strokeWidth="1.2" fill="none"
                    strokeLinecap="round" strokeLinejoin="round" opacity={boltAlpha * 0.7} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

// ─── Aurora glow (Jupiter night, top of sky) ────────────────────────────────
// Subtle vertical gradient overlay — green/violet wash at top of frame,
// strongest at night. Pure additive bloom (mixBlendMode: screen), no animation
// needed. Per Jupiter point 5 (round 7 — Claude Design baseline merge).
function Aurora({ spec, theme, t, w, gameH }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  const colorTop = sampleColorCurve(spec.colorTopCurve, t);
  const colorBot = sampleColorCurve(spec.colorBotCurve, t);
  const id = `aurora-${theme.id}`;
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorTop} stopOpacity={0.65 * density} />
          <stop offset="60%" stopColor={colorBot} stopOpacity={0.25 * density} />
          <stop offset="100%" stopColor={colorBot} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={w} height={gameH * 0.55} fill={`url(#${id})`} />
    </g>
  );
}

// ─── Shear motes (small fast particles inside cloud bands) ──────────────────
// Per-mote turbulent path: horizontal drift + per-particle sinusoidal vertical
// wobble (random phase, frequency, amplitude) so motes don't move in lockstep
// — they swirl chaotically like particles caught in a storm rather than dust
// on a conveyor belt. Per Jupiter motes pass (round 7 — turbulent-paths +
// less-dense + broader-coverage feedback).
function ShearMotes({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  const tint = spec.colorCurve ? sampleColorCurve(spec.colorCurve, t) : '#fff8e0';
  const rng = mulberry32(404);
  const motes = [];
  const yMin = (spec.yMinPct != null ? spec.yMinPct : 0.4) * gameH;
  const yMax = (spec.yMaxPct != null ? spec.yMaxPct : 0.85) * gameH;
  for (let i = 0; i < spec.count; i++) {
    const baseY = yMin + rng() * (yMax - yMin);
    const baseX = rng() * w * 1.4;
    // Per-mote drift speed within ±50% of base
    const speedJ = 0.7 + rng() * 0.6;
    const drift = (nowMs * 0.05 * spec.speed * speedJ + rng() * 1000) % (w + 100);
    const xRaw = ((baseX + drift) % (w + 100)) - 50;
    // Per-mote turbulent vertical wobble — sinusoidal with per-particle phase
    // and frequency, layered with a slower secondary wave for chaos. Amplitude
    // scaled so wobble stays within the band region (~12–24px peak-to-peak).
    const wobblePhase = rng() * Math.PI * 2;
    const wobbleFreq1 = 0.0008 + rng() * 0.0010;   // primary wave
    const wobbleFreq2 = 0.0024 + rng() * 0.0030;   // secondary, faster
    const wobbleAmp1 = 6 + rng() * 8;              // primary amplitude
    const wobbleAmp2 = 2 + rng() * 4;              // secondary, smaller
    const wobble =
      Math.sin(nowMs * wobbleFreq1 + wobblePhase) * wobbleAmp1 +
      Math.sin(nowMs * wobbleFreq2 + wobblePhase * 0.7) * wobbleAmp2;
    const y = baseY + wobble;
    // Slight horizontal speed variation comes from speedJ above; add tiny
    // x-jitter so trails don't read as parallel lines.
    const xJitter = Math.sin(nowMs * wobbleFreq1 * 0.6 + wobblePhase * 1.3) * 4;
    const x = xRaw + xJitter;
    // Base size from spec; rendered as a horizontal dash 4× wider than tall.
    const r = spec.sizeRange[0] + rng() * (spec.sizeRange[1] - spec.sizeRange[0]);
    motes.push({ x, y, r, o: (0.25 + rng() * 0.3) * density });
  }
  return (
    <g>
      {motes.map((m, i) => (
        <ellipse key={i} cx={m.x} cy={m.y} rx={m.r * 4} ry={m.r * 0.9} fill={tint} opacity={m.o} />
      ))}
    </g>
  );
}

// Shared position helper for storm cells. Pure function of (spec, w, gameH,
// nowMs); returns the centre (x, y), scale, base radius, and approximate
// half-height of each cell at this moment. Decoupled from the cell's bubble
// geometry (which uses a per-cell seed) so other components — e.g. Lightning
// — can call this and agree with StormClouds on where each cell currently
// lives without duplicating the bubble math. Per anchored-lightning refactor.
function computeStormCellPositions(spec, w, gameH, nowMs) {
  const rng = mulberry32(55);
  const yMin = (spec.yMinPct != null ? spec.yMinPct : 0.30) * gameH;
  const yMax = (spec.yMaxPct != null ? spec.yMaxPct : 0.70) * gameH;
  const positions = [];
  for (let i = 0; i < spec.count; i++) {
    const baseX = rng() * w * 1.4;
    const baseY = yMin + rng() * (yMax - yMin);
    const drift = (nowMs * 0.008 * (spec.speed || 1) + rng() * 1000) % (w + 240);
    const x = ((baseX + drift) % (w + 240)) - 120;
    const scale = 0.7 + rng() * 0.7;
    const baseR = (14 + rng() * 7) * scale;
    // Approximate cell half-height: bubbles extend roughly baseR above the
    // centre and 0.5×baseR below, giving an envelope of ~1.5×baseR vertical.
    const cellHalfH = baseR * 1.0;
    positions.push({ x, y: baseY, scale, baseR, cellHalfH });
  }
  return positions;
}

// ─── Storm clouds (Jupiter) — illustrated cumulus with volume shading ───────
// Each cell is a cumulus dome silhouette (5-7 overlapping circles) with a
// vertical light→mid→dark linear gradient clipped inside. Result: defined
// cloud outline with cream highlight on top, mid-tone middle, deep shadow
// underneath — the look from the v3 review reference image. Drops the
// radial-fade-to-transparent of v3 (rendered as "barely visible") and the
// bubble-cluster of v1/v2 (rendered as "pebble piles").
//
// No flat-bottom clip — cumulus floats in atmosphere rather than sitting on
// a horizon. Wider than tall (zonal stretch). yMin/yMaxPct configurable.
// Per Jupiter particle cohesion v4 (round 7 — illustrated cumulus reference).
function StormClouds({ spec, theme, t, w, gameH, nowMs }) {
  const density = sampleScalarCurve(spec.densityCurve, t);
  if (density < 0.05) return null;
  const tint = spec.colorCurve ? sampleColorCurve(spec.colorCurve, t) : '#b48868';
  const { lerpHex } = window.ThemeSchema;
  const lightTint = lerpHex(tint, '#fff5e0', 0.50);
  const darkTint  = lerpHex(tint, '#1a0a08', 0.45);

  // Get canonical positions from shared helper. Each cell then uses a
  // dedicated per-cell seed for bubble generation — keeps cell positions
  // stable while bubbles can vary between cells.
  const positions = computeStormCellPositions(spec, w, gameH, nowMs);

  const clouds = positions.map((pos, i) => {
    const cellRng = mulberry32(155 + i * 31);
    const cellOpacity = (0.85 + cellRng() * 0.12) * density;
    const bubbleCount = 5 + Math.floor(cellRng() * 3); // 5-7 bubbles
    const stepX = pos.baseR * 0.55;
    const totalSpan = stepX * (bubbleCount - 1);
    const bubbles = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let b = 0; b < bubbleCount; b++) {
      const bx = b * stepX - totalSpan / 2 + (cellRng() - 0.5) * stepX * 0.2;
      const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
      const sizeFactor = 1 - distFromCenter * 0.32 + (cellRng() - 0.5) * 0.10;
      const br = pos.baseR * sizeFactor;
      const by = -br * 0.18 + (cellRng() - 0.5) * br * 0.18;
      bubbles.push({ bx, by, br });
      if (bx - br < minX) minX = bx - br;
      if (bx + br > maxX) maxX = bx + br;
      if (by - br < minY) minY = by - br;
      if (by + br > maxY) maxY = by + br;
    }
    return { x: pos.x, y: pos.y, bubbles, opacity: cellOpacity, minX, maxX, minY, maxY };
  });

  return (
    <g>
      <defs>
        {clouds.map((c, i) => (
          <linearGradient key={`g${i}`} id={`stormcell-grad-${theme.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lightTint} />
            <stop offset="55%"  stopColor={tint} />
            <stop offset="100%" stopColor={darkTint} />
          </linearGradient>
        ))}
        {clouds.map((c, i) => (
          <clipPath key={`cl${i}`} id={`stormcell-clip-${theme.id}-${i}`}>
            {c.bubbles.map((b, j) => (
              <circle key={j} cx={b.bx} cy={b.by} r={b.br} />
            ))}
          </clipPath>
        ))}
      </defs>
      {clouds.map((c, i) => (
        <g key={i} transform={`translate(${c.x},${c.y})`} opacity={c.opacity}>
          <rect
            x={c.minX - 2}
            y={c.minY - 2}
            width={c.maxX - c.minX + 4}
            height={c.maxY - c.minY + 4}
            fill={`url(#stormcell-grad-${theme.id}-${i})`}
            clipPath={`url(#stormcell-clip-${theme.id}-${i})`}
          />
        </g>
      ))}
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

  // Great Red Spot — large oval drifting across with internal swirl arcs.
  // Treat as a celestial because it arcs (xCurve drives it from off-screen-left
  // → centered at dusk → off-screen-right at night). Per Jupiter point 3
  // (round 7 — Claude Design baseline merge). Renders ON TOP of the cloud
  // bands via a separate post-band pass in WorldRenderer below.
  if (spec.kind === 'gasGiantSpot') {
    const rim = spec.rimCurve ? sampleColorCurve(spec.rimCurve, t) : color;
    const clipId = id + '-clip';
    const rx = r * (spec.aspectRatio || 1.4);
    const ry = r;
    return (
      <g opacity={glow}>
        <defs>
          <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="65%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={rim} stopOpacity="0.7" />
          </radialGradient>
          <clipPath id={clipId}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} />
          </clipPath>
        </defs>
        {/* Soft outer halo — bleeds into surrounding bands */}
        <ellipse cx={x} cy={y} rx={rx * 1.25} ry={ry * 1.25} fill={color} opacity={0.18} />
        {/* Body */}
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${id})`} />
        {/* Internal swirl — concentric arcs suggesting rotation */}
        <g clipPath={`url(#${clipId})`} fill="none" stroke={rim} strokeLinecap="round">
          <ellipse cx={x} cy={y} rx={rx * 0.78} ry={ry * 0.62} strokeWidth={1.2} opacity={0.45} />
          <ellipse cx={x - rx * 0.05} cy={y + ry * 0.05} rx={rx * 0.55} ry={ry * 0.42} strokeWidth={1.1} opacity={0.38} />
          <ellipse cx={x + rx * 0.08} cy={y - ry * 0.03} rx={rx * 0.32} ry={ry * 0.24} strokeWidth={0.9} opacity={0.32} />
          <ellipse cx={x} cy={y} rx={rx * 0.12} ry={ry * 0.10} strokeWidth={0.8} opacity={0.4} />
        </g>
        {/* Bright eye highlight */}
        <ellipse cx={x - rx * 0.15} cy={y - ry * 0.18} rx={rx * 0.12} ry={ry * 0.08} fill="#ffe8d0" opacity={0.25} />
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

      {/* celestials sit between sky and silhouettes — except gasGiantSpot
          (Jupiter's Great Red Spot), which lives IN the cloud layer rather
          than behind it. We render that one after the bands below. */}
      {visible('celestials') && theme.celestials.filter((c) => c.kind !== 'gasGiantSpot').map((c) => (
        <Celestial key={c.id} spec={c} theme={theme} t={t} positionT={positionT} w={w} gameH={gameH} />
      ))}

      {/* stars in sky region */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'starfield').map((p) => (
        <Starfield key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* clouds (Earth) — friendly cumulus in the upper sky, render before
          silhouettes so mountain bands occlude them at the horizon line. */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'clouds').map((p) => (
        <CloudField key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* aurora — Jupiter night-only screen-blended overlay above the sky */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'aurora').map((p) => (
        <Aurora key={p.id} spec={p} theme={theme} t={t} w={w} gameH={gameH} />
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
        if (band.kind === 'cloudBand') {
          // Jupiter atmospheric bands — top + bottom turbulent edges, internal
          // eddies and shear streaks, independent driftSpeed.
          return <CloudBand key={band.id} band={band} theme={theme} t={t} w={w} gameH={gameH} scrollX={scrollX} scrollSpeed={scrollSpeed} nowMs={nowMs} />;
        }
        return null;
      })}

      {/* dust drifts above the regolith */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'horizontalDrift').map((p) => (
        <DustField key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* shear motes — fast small particles inside cloud bands (Jupiter) */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'shearMotes').map((p) => (
        <ShearMotes key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* stormClouds — Jupiter-specific dark amorphous cells riding on top of
          the cloud bands. Distinct kind from Earth's 'clouds' so the two don't
          collide; Earth's CloudField still dispatches earlier in the tree. */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'stormClouds').map((p) => (
        <StormClouds key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* gasGiantSpot (Jupiter's Great Red Spot) — drawn after the cloud bands
          so it sits on top of them as a cloud-layer feature. */}
      {visible('celestials') && theme.celestials.filter((c) => c.kind === 'gasGiantSpot').map((c) => (
        <Celestial key={c.id} spec={c} theme={theme} t={t} positionT={positionT} w={w} gameH={gameH} />
      ))}

      {/* lightning flashes (Jupiter night) — sit on top of bands and GRS */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'lightning').map((p) => (
        <Lightning key={p.id} spec={p} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}
    </svg>
  );
}

window.WorldRenderer = WorldRenderer;
