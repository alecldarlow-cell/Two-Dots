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
// Shared path generators (mountains, hills, singleHill, cratered-horizon,
// soft-craters) live in @features/game/world/geometry/paths — built into
// window.WorldGeometry by `npm run build:geometry` (auto-rebuilt by
// serve-design-iteration.ps1). Single source of truth with the Skia
// production renderer.
//
// Storm-bands stays inline below — Jupiter design is in flight (round 7);
// don't share until it locks.
//
// Scroll offset is now applied at the SilhouetteBand wrapper via translate(),
// not baked into the path coordinates. The shared geometry returns paths in
// band-local coords (y=0 at top, y=heightPx at bottom) with no scroll bake-in.

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
function renderGrassTufts(band, h, t, w) {
  // Blade specs + colour stops + computeBladePoints all live in the shared
  // geometry bundle (window.WorldGeometry). Returns band-local coords; the
  // SilhouetteBand wrapper applies translate(dx, y) so blades scroll with
  // the silhouette and sit on the bell-curve top edge.
  const G = window.WorldGeometry;
  const grassLight = sampleColorCurve([...G.GRASS_LIGHT_STOPS], t);
  const grassDark = sampleColorCurve([...G.GRASS_DARK_STOPS], t);
  const seed = 7777;
  const { light: lightBlades, dark: darkBlades } = G.seedGrassBlades(w, h, seed);

  function bladeToPath(blade) {
    const pts = G.computeBladePoints(blade);
    return (
      `M ${pts.baseLeft[0]},${pts.baseLeft[1]} ` +
      `Q ${pts.ctrl1[0].toFixed(2)},${pts.ctrl1[1].toFixed(2)} ` +
      `${pts.tip[0].toFixed(2)},${pts.tip[1].toFixed(2)} ` +
      `Q ${pts.ctrl2[0].toFixed(2)},${pts.ctrl2[1].toFixed(2)} ` +
      `${pts.baseRight[0]},${pts.baseRight[1]} Z`
    );
  }

  return (
    <g>
      {/* Dark side blades render first (behind) */}
      <g fill={grassDark}>
        {darkBlades.map((b, i) => (
          <path key={i} d={bladeToPath(b)} />
        ))}
      </g>
      {/* Light center blades render on top */}
      <g fill={grassLight}>
        {lightBlades.map((b, i) => (
          <path key={i} d={bladeToPath(b)} />
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

  // Interior shear streaks — wavy paths (sine undulation) in muted band-tinted
  // colour. Was straight band-tinted lines (round 6 — read as drawn pinstripes),
  // then desaturated 55% toward grey at low opacity (round 7 — too subtle to
  // read), now: keep the wavy shape, lift opacity + stroke width, and drop the
  // grey lerp from 55% → 25% so streaks retain band pigment for contrast
  // without sliding back into pinstripe territory. Per round 8 visibility pass.
  const streakColor = band.streakCurve ? sampleColorCurve(band.streakCurve, t) : null;
  const streakCount = band.streaks || 0;
  const streaks = [];
  if (streakCount > 0 && streakColor) {
    // Light desaturation only — pulls about a quarter of the way toward
    // atmospheric grey, leaving most of the band's pigment so streaks read
    // as cloud striations against the band fill.
    const { lerpHex } = window.ThemeSchema;
    const greyTint = lerpHex(streakColor, '#808078', 0.25);
    const streakDrift = (nowMs * (band.driftSpeed || 0) * 0.03) % w;
    for (let i = 0; i < streakCount; i++) {
      const yPct = 0.25 + (i / streakCount) * 0.55 + rng() * 0.1;
      const sxStreak = ((rng() * w * 2) - streakDrift) % (w * 2) - w * 0.2;
      const length = w * (0.4 + rng() * 0.6);
      // Opacity 0.25–0.45 (was 0.10–0.20) and stroke 1.2–2.2 (was 0.6–1.3)
      // so streaks actually read against the band fill at frame size.
      const opacity = 0.25 + rng() * 0.20;
      const sw = 1.2 + rng() * 1.0;
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

  // Streaks are clipped to the band's own fill path so they can never breach
  // the turbulent top edge. Without the clip, a streak whose y-position sits
  // above a low spot in the wavy top edge would render OUTSIDE the band on
  // top of whatever's behind (sky, or the band above) — visible as "lines
  // overlapping layers". Per round 8 streak-containment pass.
  const clipId = `cloudband-clip-${theme.id}-${band.id}`;

  return (
    <g transform={`translate(0, ${y})`}>
      {streaks.length > 0 && (
        <defs>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
        </defs>
      )}
      <path d={d} fill={color} />
      {streaks.length > 0 && (
        <g clipPath={`url(#${clipId})`}>
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

  // Storm-bands stays inline (Jupiter — round-7, in flight). All other
  // profiles dispatch to the shared geometry bundle, which produces band-
  // local paths (no scroll bake-in). Scroll offset moves to the wrapper
  // translate below.
  let d, dx;
  if (band.profile === 'storm-bands') {
    d = stormBandsPath(w, h, sx, seed);
    dx = 0; // storm-bands bakes scroll into path; wrapper doesn't translate
  } else {
    const builder = window.WorldGeometry.SILHOUETTE_PATH_BUILDERS[band.profile];
    d = builder(w, h, seed);
    dx = -(sx % w);
  }

  // Grass tufts — only for the closest foreground band (singleHill profile).
  // renderGrassTufts now produces band-local geometry too, so it lives inside
  // the same translate(dx, y) wrapper.
  const grassTufts = band.profile === 'singleHill' ? renderGrassTufts(band, h, t, w) : null;

  // Optional internal vertical gradient (lighter top edge, darker base —
  // adds depth so the silhouette doesn't read as a flat shape).
  if (band.gradientCurve) {
    const topColor = sampleColorCurve(band.gradientCurve, t);
    const gradId = `silgrad-${theme.id}-${band.id}`;
    const clipId = `silclip-${theme.id}-${band.id}`;
    return (
      <g transform={`translate(${dx}, ${y})`}>
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
    <g transform={`translate(${dx}, ${y})`}>
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
  // Crater seeding (count, sizing, overlap rejection) lives in the shared
  // geometry bundle. Rendering primitives stay here (SVG <ellipse>).
  const bowlColor = sampleColorCurve(band.colorCurve, t);
  const rimColor = window.ThemeSchema.lerpHex(bowlColor, '#ffffff', 0.25);
  const y = band.yPct * gameH;
  const h = band.heightPct * gameH;
  const craters = window.WorldGeometry.seedCraters(w, y, h, 42);
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
            opacity={c.opacity * 0.4}
          />
          {/* Inner bowl — darker, offset slightly upward to suggest depth. */}
          <ellipse
            cx={c.x}
            cy={c.y - c.ry * 0.15}
            rx={c.rx * 0.85}
            ry={c.ry * 0.8}
            fill={bowlColor}
            opacity={c.opacity}
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
  // Cloud bubble layout (positions, radii, baseline) lives in the shared
  // geometry bundle. Drift + rendering primitives stay here.
  const density = sampleScalarCurve(spec.densityCurve, t);
  const tint = spec.colorCurve ? sampleColorCurve(spec.colorCurve, t) : '#ffffff';
  const G = window.WorldGeometry;
  const seeds = G.seedClouds(w, gameH, spec.count, 33);
  return (
    <g>
      {seeds.map((c, i) => {
        const drift = (nowMs * 0.01 * spec.speed + c.driftPhase) % (w + 240);
        const x = ((c.baseX + drift) % (w + 240)) - 120;
        const opacity = c.alpha * density;
        const clipId = `cloudclip-${theme.id}-${i}`;
        const r = G.CLOUD_CLIP_RECT;
        return (
          <g key={i} transform={`translate(${x},${c.baseY})`} opacity={opacity}>
            <defs>
              <clipPath id={clipId}>
                <rect x={r.x} y={r.y} width={r.width} height={r.height} />
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
  // Bird seeding + per-frame wing geometry live in the shared geometry
  // bundle. Drift wrap and rendering primitives stay here.
  const density = sampleScalarCurve(spec.densityCurve, t);
  const tint = spec.colorCurve ? sampleColorCurve(spec.colorCurve, t) : '#1a1a2a';
  if (density < 0.05) return null;
  const sizeMul = spec.sizeMul || 1;
  const G = window.WorldGeometry;
  const birds = G.seedBirds(w, gameH, spec.count, sizeMul, 77);
  return (
    <g>
      {birds.map((b, i) => {
        const x = G.birdScreenX(b, w, spec.speed, nowMs);
        const pts = G.computeBirdWingPoints(x, b, nowMs);
        const sw = G.birdStrokeWidth(b);
        return (
          <path
            key={i}
            d={
              `M ${pts.lTip[0]},${pts.lTip[1]} ` +
              `Q ${pts.lCtrl[0].toFixed(2)},${pts.lCtrl[1].toFixed(2)} ${pts.body[0]},${pts.body[1]} ` +
              `Q ${pts.rCtrl[0].toFixed(2)},${pts.rCtrl[1].toFixed(2)} ${pts.rTip[0]},${pts.rTip[1]}`
            }
            stroke={tint}
            strokeWidth={sw}
            fill="none"
            opacity={b.alpha * density}
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
  const cloudCells = stormSpec ? computeStormCellPositions(stormSpec, w, gameH, nowMs, t) : [];

  const rng = mulberry32(909);
  const flashes = [];
  const cycleMs = 8000;
  const cyclePos = (nowMs % cycleMs) / cycleMs;

  for (let i = 0; i < spec.count; i++) {
    const startT = rng();
    const duration = 0.02 + rng() * 0.04;       // 160-480ms of the loop
    // Cells now sit in the top half (yMaxPct 0.45) — bolts drop further so
    // they reach into the dimmer mid/lower bands where they read against the
    // dark night palette. Was 60-140; lifted to 90-200 per round 8.
    const boltLen = 90 + rng() * 110;
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
// nowMs, t); returns the centre (x, y), scale, base radius, and approximate
// half-height of each cell at this moment. Decoupled from the cell's bubble
// geometry (which uses a per-cell seed) so other components — e.g. Lightning
// — can call this and agree with StormClouds on where each cell currently
// lives without duplicating the bubble math. Per anchored-lightning refactor.
//
// Round 8 — adds one ToD-driven scalar on top of the original layout:
//   • sizeMulCurve scales every cell's baseR (and cellHalfH derived from it)
//     so storm-peak cells dome larger than fair-weather wisps.
// Note: count is HELD CONSTANT across ToD — cells should only enter/leave the
// frame by drifting in/out at the edges, never by popping in or out of
// existence on screen. A previous iteration tied visible count to densityCurve
// which made cells appear/disappear at fixed positions; reverted per design
// feedback. densityCurve still governs the early-bail in StormClouds for
// edge cases.
function computeStormCellPositions(spec, w, gameH, nowMs, t) {
  const rng = mulberry32(55);
  const yMin = (spec.yMinPct != null ? spec.yMinPct : 0.30) * gameH;
  const yMax = (spec.yMaxPct != null ? spec.yMaxPct : 0.70) * gameH;
  // Sample size modulator if curve is present (older themes that pre-date
  // round 8 don't have it — fall back to 1.0 so behaviour is unchanged).
  const sizeMul = spec.sizeMulCurve && t != null
    ? sampleScalarCurve(spec.sizeMulCurve, t)
    : 1.0;
  const positions = [];
  for (let i = 0; i < spec.count; i++) {
    const baseX = rng() * w * 1.4;
    const baseY = yMin + rng() * (yMax - yMin);
    const drift = (nowMs * 0.008 * (spec.speed || 1) + rng() * 1000) % (w + 240);
    const x = ((baseX + drift) % (w + 240)) - 120;
    const scale = 0.7 + rng() * 0.7;
    const baseR = (14 + rng() * 7) * scale * sizeMul;
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
  // stable while bubbles can vary between cells. Pass `t` so the helper
  // can apply sizeMulCurve / densityCurve modulation in lockstep with how
  // the lightning component sees the cells.
  const positions = computeStormCellPositions(spec, w, gameH, nowMs, t);

  const clouds = positions.map((pos, i) => {
    const cellRng = mulberry32(155 + i * 31);
    // Opacity is density-independent now that densityCurve drives the visible
    // COUNT inside computeStormCellPositions (round 8). Fewer cells at off-peak
    // ToDs reads as "calmer" already; double-dimming the survivors made them
    // washy at day. Each kept cell renders at its full per-cell opacity.
    const cellOpacity = 0.85 + cellRng() * 0.12;
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
    // Continent path strings + ice cap / madagascar bounds + halo/terminator
    // constants live in the shared geometry bundle. Rendering primitives
    // (clip path, halo gradient, body fill, terminator circle) stay here.
    const G = window.WorldGeometry;
    const continent = spec.continentCurve ? sampleColorCurve(spec.continentCurve, t) : G.EARTH_CONTINENT_COLOR;
    const clipId = id + '-clip';
    const haloR = r * G.EARTH_HALO_RADIUS_MUL;
    const continentsD = G.continentsSvgPath(x, y, r);
    const mB = G.madagascarBounds(x, y, r);
    const nB = G.northIceCapBounds(x, y, r);
    const sB = G.southIceCapBounds(x, y, r);
    return (
      <g>
        <defs>
          <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={G.EARTH_HALO_COLOR} stopOpacity="1" />
            <stop offset="100%" stopColor={G.EARTH_HALO_COLOR} stopOpacity="0" />
          </radialGradient>
          <clipPath id={clipId}>
            <circle cx={x} cy={y} r={r} />
          </clipPath>
        </defs>
        {/* Atmospheric glow halo */}
        <circle cx={x} cy={y} r={haloR} fill={`url(#${id})`} opacity={glow} />
        {/* Ocean body */}
        <circle cx={x} cy={y} r={r} fill={color} />
        {/* Land + ice caps — all clipped to body so excess gets trimmed at edge */}
        <g clipPath={`url(#${clipId})`}>
          {/* Africa + Europe + S.America + N.America (combined SVG path from geometry) */}
          <path fill={continent} d={continentsD} />
          {/* Madagascar */}
          <ellipse
            cx={mB.x + mB.width / 2}
            cy={mB.y + mB.height / 2}
            rx={mB.width / 2}
            ry={mB.height / 2}
            fill={continent}
          />
          {/* North polar ice cap */}
          <ellipse
            cx={nB.x + nB.width / 2}
            cy={nB.y + nB.height / 2}
            rx={nB.width / 2}
            ry={nB.height / 2}
            fill={G.EARTH_ICE_COLOR}
            fillOpacity={G.EARTH_ICE_OPACITY}
          />
          {/* South polar ice cap */}
          <ellipse
            cx={sB.x + sB.width / 2}
            cy={sB.y + sB.height / 2}
            rx={sB.width / 2}
            ry={sB.height / 2}
            fill={G.EARTH_ICE_COLOR}
            fillOpacity={G.EARTH_ICE_OPACITY}
          />
        </g>
        {/* Soft terminator — dark crescent on lower-right of the body */}
        <circle
          cx={x + r * G.TERMINATOR_OFFSET_FRAC.x}
          cy={y + r * G.TERMINATOR_OFFSET_FRAC.y}
          r={r}
          fill={G.TERMINATOR_COLOR}
          opacity={G.TERMINATOR_OPACITY}
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

      {/* gasGiantSpot (Jupiter's Great Red Spot) — drawn after the cloud bands
          so it sits on top of them as a cloud-layer feature. Round 8: GRS now
          renders BEFORE stormClouds (was after) so storm cells drift IN
          FRONT of the GRS — the GRS reads as a deeper feature in the
          atmosphere with weather passing across it, rather than a sticker on
          top of everything. */}
      {visible('celestials') && theme.celestials.filter((c) => c.kind === 'gasGiantSpot').map((c) => (
        <Celestial key={c.id} spec={c} theme={theme} t={t} positionT={positionT} w={w} gameH={gameH} />
      ))}

      {/* stormClouds — Jupiter-specific dark amorphous cells riding on top of
          the cloud bands. Distinct kind from Earth's 'clouds' so the two don't
          collide; Earth's CloudField still dispatches earlier in the tree.
          Renders AFTER gasGiantSpot so cells layer in front of the GRS. */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'stormClouds').map((p) => (
        <StormClouds key={p.id} spec={{ ...p, count: Math.floor(p.count * particleMul) }} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}

      {/* lightning flashes (Jupiter night) — sit on top of bands and GRS */}
      {visible('particles') && theme.particles.filter(p => p.kind === 'lightning').map((p) => (
        <Lightning key={p.id} spec={p} theme={theme} t={t} w={w} gameH={gameH} nowMs={nowMs} />
      ))}
    </svg>
  );
}

window.WorldRenderer = WorldRenderer;
