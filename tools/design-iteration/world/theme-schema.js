/**
 * WorldTheme schema — the single asset format for parallax worlds.
 *
 * This file documents the shape; themes/<world>.js exports a value of this shape.
 * The renderer (WorldRenderer.jsx) is the only consumer.
 *
 * Time-of-day is parameter, not asset:
 *   t ∈ [0,1]   0=dawn, 0.25=day, 0.5=dusk, 0.75=night, 1.0=back to dawn
 *
 * Sky stops and per-layer tints are arrays of {t, color} keypoints we lerp between.
 */

// Lerp two hex colours in oklch-friendly RGB space (close enough for design preview;
// production renderer should lerp in oklch via Skia color interpolation).
function hexToRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = (x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

// Sample a keyframed colour curve at time t∈[0,1], wrapping at the seam.
function sampleColorCurve(stops, t) {
  // stops is sorted by .t ascending
  // wrap: append (stops[0].t + 1, stops[0].color) virtually
  const n = stops.length;
  for (let i = 0; i < n; i++) {
    const a = stops[i];
    const b = stops[(i + 1) % n];
    const aT = a.t;
    const bT = b.t > aT ? b.t : b.t + 1;
    const tt = t < aT ? t + 1 : t;
    if (tt >= aT && tt <= bT) {
      const u = (tt - aT) / (bT - aT);
      return lerpHex(a.color, b.color, u);
    }
  }
  return stops[0].color;
}

// Sample a numeric scalar curve (for opacities, particle density, etc.)
function sampleScalarCurve(stops, t) {
  const n = stops.length;
  for (let i = 0; i < n; i++) {
    const a = stops[i];
    const b = stops[(i + 1) % n];
    const aT = a.t;
    const bT = b.t > aT ? b.t : b.t + 1;
    const tt = t < aT ? t + 1 : t;
    if (tt >= aT && tt <= bT) {
      const u = (tt - aT) / (bT - aT);
      return lerp(a.value, b.value, u);
    }
  }
  return stops[0].value;
}

// ─── Cycle weighting ─────────────────────────────────────────────────────────
// Real worlds spend most of their time in DAY or NIGHT, with brief DAWN/DUSK
// transitions in between. The schema's color curves still use 4 keyframes at
// t=0/0.25/0.5/0.75 — those are *plateau anchors*. The renderer maps the
// player-visible global clock g∈[0,1] to a curve sample t∈[0,1] using the
// world's `cycleProfile`:
//
//   atmospheric (Earth-like): day 40% · dusk 10% · night 40% · dawn 10%.
//                             Smooth easing in/out of transitions.
//
//   airless (Moon-like):      day 47% · dusk 3% · night 47% · dawn 3%.
//                             Sharp snap at the horizon — no atmospheric scatter.
//
// The curve t held during a plateau is locked to its keyframe (e.g. anywhere
// in the day plateau samples t=0.25 exactly — color stops moving). Inside the
// transition window the curve t advances linearly across that keyframe pair.
function cycleProfileWeights(profile) {
  if (profile === 'airless') return { dawn: 0.03, day: 0.47, dusk: 0.03, night: 0.47 };
  return { dawn: 0.10, day: 0.40, dusk: 0.10, night: 0.40 }; // 'atmospheric' default
}

// Map global cycle position g∈[0,1] to a curve-sample t∈[0,1].
// Plateaus = held; transitions = linear interpolation.
// Layout (g axis):  [dawn-trans] [day-plateau] [dusk-trans] [night-plateau]
// Curve t targets:    0 → 0.25      0.25         0.25 → 0.5    0.5 → 0.75 → 0
function applyCycleProfile(g, profile) {
  const w = cycleProfileWeights(profile);
  const eDawn = w.dawn;
  const eDay = eDawn + w.day;
  const eDusk = eDay + w.dusk;
  const eNight = eDusk + w.night; // = 1
  if (g < eDawn) {
    // dawn transition: curve t goes 0 → 0.25
    return (g / eDawn) * 0.25;
  } else if (g < eDay) {
    // day plateau: hold t=0.25
    return 0.25;
  } else if (g < eDusk) {
    // dusk transition: curve t goes 0.25 → 0.5
    return 0.25 + ((g - eDay) / w.dusk) * 0.25;
  } else if (g < eNight) {
    // night plateau spans t=0.5 → 0.75 (hold? or drift?)
    // Drift slowly so night doesn't feel frozen — most of the band sits at 0.75.
    // First 30% of night plateau drifts from 0.5 → 0.75; remainder holds at 0.75.
    const np = (g - eDusk) / w.night;
    if (np < 0.3) return 0.5 + (np / 0.3) * 0.25;
    return 0.75;
  } else {
    // wrap (shouldn't normally happen since eNight=1, but for safety)
    return 0;
  }
}

// Get a human-readable phase label for the current global t.
function cyclePhaseLabel(g, profile) {
  const w = cycleProfileWeights(profile);
  const eDawn = w.dawn;
  const eDay = eDawn + w.day;
  const eDusk = eDay + w.dusk;
  if (g < eDawn) return 'Dawn';
  if (g < eDay) return 'Day';
  if (g < eDusk) return 'Dusk';
  return 'Night';
}

window.ThemeSchema = {
  lerpHex, sampleColorCurve, sampleScalarCurve, hexToRgb, rgbToHex,
  applyCycleProfile, cyclePhaseLabel, cycleProfileWeights,
};
