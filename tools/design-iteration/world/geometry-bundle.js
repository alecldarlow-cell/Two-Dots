"use strict";
var WorldGeometry = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/features/game/world/geometry/index.ts
  var geometry_exports = {};
  __export(geometry_exports, {
    CLOUD_CLIP_RECT: () => CLOUD_CLIP_RECT,
    EARTH_CONTINENT_COLOR: () => EARTH_CONTINENT_COLOR,
    EARTH_HALO_COLOR: () => EARTH_HALO_COLOR,
    EARTH_HALO_RADIUS_MUL: () => EARTH_HALO_RADIUS_MUL,
    EARTH_ICE_COLOR: () => EARTH_ICE_COLOR,
    EARTH_ICE_OPACITY: () => EARTH_ICE_OPACITY,
    GRASS_DARK_STOPS: () => GRASS_DARK_STOPS,
    GRASS_LIGHT_STOPS: () => GRASS_LIGHT_STOPS,
    SILHOUETTE_PATH_BUILDERS: () => SILHOUETTE_PATH_BUILDERS,
    TERMINATOR_COLOR: () => TERMINATOR_COLOR,
    TERMINATOR_OFFSET_FRAC: () => TERMINATOR_OFFSET_FRAC,
    TERMINATOR_OPACITY: () => TERMINATOR_OPACITY,
    birdScreenX: () => birdScreenX,
    birdStrokeWidth: () => birdStrokeWidth,
    computeBirdWingPoints: () => computeBirdWingPoints,
    computeBladePoints: () => computeBladePoints,
    continentsSvgPath: () => continentsSvgPath,
    craterBowlBounds: () => craterBowlBounds,
    craterRimBounds: () => craterRimBounds,
    crateredHorizonSvgPath: () => crateredHorizonSvgPath,
    hillsSvgPath: () => hillsSvgPath,
    madagascarBounds: () => madagascarBounds,
    mountainsSvgPath: () => mountainsSvgPath,
    mulberry32: () => mulberry32,
    northIceCapBounds: () => northIceCapBounds,
    seedBirds: () => seedBirds,
    seedClouds: () => seedClouds,
    seedCraters: () => seedCraters,
    seedGrassBlades: () => seedGrassBlades,
    singleHillSvgPath: () => singleHillSvgPath,
    softCratersSvgPath: () => softCratersSvgPath,
    southIceCapBounds: () => southIceCapBounds,
    stormBandsSvgPath: () => stormBandsSvgPath,
    themeSeed: () => themeSeed
  });

  // src/features/game/world/geometry/prng.ts
  function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
      s = s + 1831565813 | 0;
      let z = s;
      z = Math.imul(z ^ z >>> 15, z | 1);
      z ^= z + Math.imul(z ^ z >>> 7, z | 61);
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    };
  }
  function themeSeed(id) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // src/features/game/world/geometry/paths.ts
  function mountainsSvgPath(width, heightPx, seed) {
    const rng = mulberry32(seed);
    const span = width * 2.5;
    const numNodes = 5;
    const nodes = [];
    for (let i = 0; i <= numNodes; i++) {
      const x = i / numNodes * span;
      const isPeak = i % 2 === 1;
      const heightFrac = isPeak ? 0.45 + rng() * 0.3 : 0.15 + rng() * 0.2;
      nodes.push([x, heightPx * (1 - heightFrac)]);
    }
    let d = `M ${nodes[0][0]},${heightPx} L ${nodes[0][0]},${nodes[0][1]}`;
    for (let i = 1; i < nodes.length; i++) {
      const p0 = nodes[i - 1];
      const p1 = nodes[i];
      const dx = p1[0] - p0[0];
      const c1x = p0[0] + dx * 0.4;
      const c1y = p0[1];
      const c2x = p1[0] - dx * 0.4;
      const c2y = p1[1];
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p1[0]},${p1[1]}`;
    }
    const last = nodes[nodes.length - 1];
    d += ` L ${last[0]},${heightPx} Z`;
    return d;
  }
  function hillsSvgPath(width, heightPx, seed) {
    const rng = mulberry32(seed);
    const j1 = rng() * 6;
    const j2 = rng() * 6;
    const points = 60;
    const span = width * 2.4;
    let d = `M 0,${heightPx}`;
    for (let i = 0; i <= points; i++) {
      const x = i / points * span;
      const y = Math.sin(x * 35e-4 + j1) * heightPx * 0.3 + Math.sin(x * 0.011 + j2) * heightPx * 0.13 + Math.sin(x * 0.045 + rng() * 6) * heightPx * 0.04 + heightPx * 0.55;
      d += ` L ${x},${y}`;
    }
    d += ` L ${span},${heightPx} Z`;
    return d;
  }
  function singleHillSvgPath(width, heightPx) {
    const span = width * 2;
    const peakX = span * 0.42;
    const peakY = heightPx * 0.55;
    const points = 120;
    let d = `M 0,${heightPx}`;
    for (let i = 0; i <= points; i++) {
      const x = i / points * span;
      const dx = (x - peakX) / (span * 0.55);
      const bell = 1 / (1 + dx * dx);
      const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
      const y = heightPx - (heightPx - peakY) * bell + tilt;
      d += ` L ${x},${y}`;
    }
    d += ` L ${span},${heightPx} Z`;
    return d;
  }
  function crateredHorizonSvgPath(width, heightPx, seed) {
    const rng = mulberry32(seed);
    const j1 = rng() * 6;
    const j2 = rng() * 6;
    const j3 = rng() * 6;
    const points = 96;
    const span = width * 2.4;
    let d = `M 0,${heightPx}`;
    for (let i = 0; i <= points; i++) {
      const x = i / points * span;
      const base = Math.sin(x * 0.018 + j1) * heightPx * 0.55 + Math.sin(x * 0.07 + j2) * heightPx * 0.2 + Math.sin(x * 0.18 + j3) * heightPx * 0.06 + heightPx * 0.4;
      const crater = Math.sin(x * 5e-3) > 0.85 ? -heightPx * 0.12 : 0;
      d += ` L ${x},${base + crater}`;
    }
    d += ` L ${span},${heightPx} Z`;
    return d;
  }
  function softCratersSvgPath(width, heightPx, seed) {
    const tileW = width * 2;
    const step = 4;
    let d = `M 0,${heightPx}`;
    for (let x = 0; x <= tileW; x += step) {
      const base = Math.sin(x * 0.012 + seed) * 0.5;
      const wobble = Math.sin(x * 0.04 + seed * 1.7) * 0.15;
      const yLocal = (0.5 + (base + wobble) * 0.5) * heightPx * 0.55;
      d += ` L ${x},${yLocal}`;
    }
    d += ` L ${tileW},${heightPx} Z`;
    return d;
  }
  function stormBandsSvgPath(width, heightPx, seed) {
    const tileW = width * 2;
    const step = 6;
    let d = `M 0,${heightPx}`;
    for (let x = 0; x <= tileW; x += step) {
      const flow = Math.sin(x * 8e-3 + seed) * 0.05 + Math.sin(x * 0.025 + seed * 1.4) * 0.025;
      const yLocal = flow * heightPx;
      d += ` L ${x},${yLocal}`;
    }
    d += ` L ${tileW},${heightPx} Z`;
    return d;
  }
  var SILHOUETTE_PATH_BUILDERS = {
    mountains: mountainsSvgPath,
    hills: hillsSvgPath,
    singleHill: (width, heightPx, _seed) => singleHillSvgPath(width, heightPx),
    "cratered-horizon": crateredHorizonSvgPath,
    "soft-craters": softCratersSvgPath,
    "storm-bands": stormBandsSvgPath
  };

  // src/features/game/world/geometry/craters.ts
  function seedCraters(width, yPx, heightPx, seed) {
    const rng = mulberry32(seed ^ 3735928559);
    const out = [];
    const targetCount = 32;
    for (let i = 0; i < targetCount; i++) {
      const sizeRoll = rng();
      let rx;
      let ry;
      if (sizeRoll < 0.75) {
        rx = 6 + rng() * 8;
        ry = 2 + rng() * 2;
      } else if (sizeRoll < 0.95) {
        rx = 14 + rng() * 14;
        ry = 4 + rng() * 3;
      } else {
        rx = 28 + rng() * 22;
        ry = 7 + rng() * 5;
      }
      let placed = false;
      for (let attempt = 0; attempt < 25 && !placed; attempt++) {
        const cx = rng() * width;
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
  function craterRimBounds(c) {
    return {
      x: c.x - c.rx * 1.08,
      y: c.y - c.ry * 1.08,
      width: c.rx * 1.08 * 2,
      height: c.ry * 1.08 * 2
    };
  }
  function craterBowlBounds(c) {
    return {
      x: c.x - c.rx * 0.85,
      y: c.y - c.ry * 0.15 - c.ry * 0.8,
      width: c.rx * 0.85 * 2,
      height: c.ry * 0.8 * 2
    };
  }

  // src/features/game/world/geometry/clouds.ts
  function seedClouds(width, visH, count, seed) {
    const rng = mulberry32(seed ^ 858993459);
    const out = [];
    for (let i = 0; i < count; i++) {
      const baseX = rng() * width * 1.4;
      const baseY = 0.06 * visH + rng() * 0.28 * visH;
      const driftPhase = rng() * 1e3;
      const scale = 0.85 + rng() * 0.55;
      const alpha = 0.75 + rng() * 0.2;
      const bubbleCount = 6 + Math.floor(rng() * 3);
      const baseR = (18 + rng() * 8) * scale;
      const stepX = baseR * 0.42;
      const totalSpan = stepX * (bubbleCount - 1);
      const bubbles = [];
      for (let b = 0; b < bubbleCount; b++) {
        const bx = b * stepX - totalSpan / 2 + (rng() - 0.5) * stepX * 0.3;
        const distFromCenter = Math.abs(b - (bubbleCount - 1) / 2) / ((bubbleCount - 1) / 2);
        const sizeFactor = 1 - distFromCenter * 0.3 + (rng() - 0.5) * 0.15;
        const br = baseR * sizeFactor;
        const by = -br + br * 0.12;
        bubbles.push({ bx, by, br });
      }
      out.push({ baseX, baseY, scale, driftPhase, bubbles, alpha });
    }
    return out;
  }
  var CLOUD_CLIP_RECT = {
    x: -300,
    y: -300,
    width: 600,
    height: 300
  };

  // src/features/game/world/geometry/birds.ts
  function seedBirds(width, visH, count, sizeMul, seed) {
    const rng = mulberry32(seed ^ 2004318071);
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        baseX: rng() * width * 1.2,
        baseY: 0.18 * visH + rng() * 0.25 * visH,
        driftPhase: rng() * 1e3,
        size: (4 + rng() * 3) * sizeMul,
        flapPhase: rng() * Math.PI * 2,
        alpha: 0.55 + rng() * 0.3
      });
    }
    return out;
  }
  function birdScreenX(bird, width, speed, nowMs) {
    const drift = (nowMs * 0.04 * speed + bird.driftPhase) % (width + 100);
    return (bird.baseX + drift) % (width + 100) - 50;
  }
  function computeBirdWingPoints(x, bird, nowMs) {
    const tipLift = Math.sin(nowMs * 8e-3 + bird.flapPhase) * 0.7;
    const tipY = bird.baseY + bird.size * tipLift;
    const curlMag = bird.size * 0.45;
    const lDx = bird.size;
    const lDy = bird.baseY - tipY;
    const lLen = Math.sqrt(lDx * lDx + lDy * lDy);
    const lPerpX = lDy / lLen;
    const lPerpY = -lDx / lLen;
    const lCtrlX = (x - bird.size + x) / 2 + lPerpX * curlMag;
    const lCtrlY = (tipY + bird.baseY) / 2 + lPerpY * curlMag;
    const rDx = bird.size;
    const rDy = tipY - bird.baseY;
    const rLen = Math.sqrt(rDx * rDx + rDy * rDy);
    const rPerpX = rDy / rLen;
    const rPerpY = -rDx / rLen;
    const rCtrlX = (x + x + bird.size) / 2 + rPerpX * curlMag;
    const rCtrlY = (bird.baseY + tipY) / 2 + rPerpY * curlMag;
    return {
      lTip: [x - bird.size, tipY],
      lCtrl: [lCtrlX, lCtrlY],
      body: [x, bird.baseY],
      rCtrl: [rCtrlX, rCtrlY],
      rTip: [x + bird.size, tipY]
    };
  }
  function birdStrokeWidth(bird) {
    return Math.max(0.9, bird.size * 0.18);
  }

  // src/features/game/world/geometry/grass.ts
  var GRASS_LIGHT_STOPS = [
    { t: 0, color: "#6a8458" },
    // dawn — cool muted green
    { t: 0.25, color: "#5aa040" },
    // day  — vivid grass green
    { t: 0.5, color: "#7a8038" },
    // dusk — warm olive
    { t: 0.75, color: "#0a1410" }
    // night — near-black green
  ];
  var GRASS_DARK_STOPS = [
    { t: 0, color: "#3e5430" },
    // dawn — deep moss
    { t: 0.25, color: "#356528" },
    // day  — saturated forest
    { t: 0.5, color: "#4f5020" },
    // dusk — dark olive
    { t: 0.75, color: "#050a08" }
    // night — almost black
  ];
  function seedGrassBlades(width, heightPx, seed) {
    const rng = mulberry32(seed ^ 1621975213);
    const span = width * 2;
    const peakX = span * 0.42;
    const peakY = heightPx * 0.55;
    const clumpSpacing = 22;
    const light = [];
    const dark = [];
    for (let x = 0; x <= span; x += clumpSpacing) {
      if (rng() < 0.18) continue;
      const dx = (x - peakX) / (span * 0.55);
      const bell = 1 / (1 + dx * dx);
      const tilt = x - peakX > 0 ? -dx * 0.04 * heightPx : 0;
      const yEdge = heightPx - (heightPx - peakY) * bell + tilt;
      const xJitter = (rng() - 0.5) * clumpSpacing * 0.4;
      const xPos = x + xJitter;
      const clumpScale = 0.7 + rng() * 0.7;
      light.push({
        xBase: xPos,
        yBase: yEdge,
        angle: (rng() - 0.5) * 0.5,
        // ±~14° wobble
        length: (16 + rng() * 10) * clumpScale,
        baseWidth: (1.8 + rng() * 0.6) * clumpScale,
        curlDir: (rng() - 0.5) * 1.2
      });
      dark.push({
        xBase: xPos - 2,
        yBase: yEdge,
        angle: -0.45 + (rng() - 0.5) * 0.45,
        length: (12 + rng() * 5) * clumpScale,
        baseWidth: (1.3 + rng() * 0.4) * clumpScale,
        curlDir: 0.5 + rng() * 0.5
      });
      dark.push({
        xBase: xPos + 2,
        yBase: yEdge,
        angle: 0.45 + (rng() - 0.5) * 0.45,
        length: (12 + rng() * 5) * clumpScale,
        baseWidth: (1.3 + rng() * 0.4) * clumpScale,
        curlDir: -(0.5 + rng() * 0.5)
      });
      if (rng() < 0.2) {
        light.push({
          xBase: xPos + (rng() - 0.5) * 4,
          yBase: yEdge,
          angle: (rng() - 0.5) * 1,
          length: (10 + rng() * 6) * clumpScale,
          baseWidth: (1.2 + rng() * 0.4) * clumpScale,
          curlDir: (rng() - 0.5) * 1.5
        });
      }
    }
    return { light, dark };
  }
  function computeBladePoints(blade) {
    const { xBase, yBase, angle, length, baseWidth, curlDir } = blade;
    const tipX = xBase + Math.sin(angle) * length;
    const tipY = yBase - Math.cos(angle) * length;
    const midX = xBase + Math.sin(angle) * length * 0.5;
    const midY = yBase - Math.cos(angle) * length * 0.5;
    const curlAmount = length * 0.15 * curlDir;
    const curlX = Math.cos(angle) * curlAmount;
    const curlY = Math.sin(angle) * curlAmount;
    const perpX = Math.cos(angle) * baseWidth * 0.5;
    const perpY = Math.sin(angle) * baseWidth * 0.5;
    return {
      baseLeft: [xBase - baseWidth, yBase],
      ctrl1: [midX + curlX - perpX, midY + curlY - perpY],
      tip: [tipX, tipY],
      ctrl2: [midX + curlX + perpX, midY + curlY + perpY],
      baseRight: [xBase + baseWidth, yBase]
    };
  }

  // src/features/game/world/geometry/continents.ts
  function continentsSvgPath(cx, cy, r) {
    const x = cx;
    const y = cy;
    const parts = [
      // Africa — taller than wide, distinct horn east, narrow Cape south.
      `M ${x - r * 0.08},${y - r * 0.46} L ${x + r * 0.14},${y - r * 0.44} Q ${x + r * 0.22},${y - r * 0.36} ${x + r * 0.22},${y - r * 0.18} Q ${x + r * 0.3},${y - r * 0.02} ${x + r * 0.26},${y + r * 0.1} Q ${x + r * 0.14},${y + r * 0.2} ${x + r * 0.06},${y + r * 0.35} Q ${x - r * 0.02},${y + r * 0.5} ${x - r * 0.06},${y + r * 0.58} Q ${x - r * 0.18},${y + r * 0.48} ${x - r * 0.22},${y + r * 0.32} Q ${x - r * 0.27},${y + r * 0.1} ${x - r * 0.25},${y - r * 0.12} Q ${x - r * 0.22},${y - r * 0.32} ${x - r * 0.16},${y - r * 0.42} Q ${x - r * 0.12},${y - r * 0.46} ${x - r * 0.08},${y - r * 0.46} Z`,
      // Europe — Iberian bump west, Italian boot middle, eastward Eurasia.
      `M ${x - r * 0.22},${y - r * 0.5} Q ${x - r * 0.3},${y - r * 0.62} ${x - r * 0.15},${y - r * 0.66} Q ${x + r * 0.05},${y - r * 0.72} ${x + r * 0.25},${y - r * 0.66} Q ${x + r * 0.4},${y - r * 0.6} ${x + r * 0.42},${y - r * 0.5} Q ${x + r * 0.34},${y - r * 0.46} ${x + r * 0.2},${y - r * 0.48} L ${x + r * 0.08},${y - r * 0.44} Q ${x + r * 0.04},${y - r * 0.4} ${x + r * 0},${y - r * 0.45} L ${x - r * 0.1},${y - r * 0.46} Q ${x - r * 0.18},${y - r * 0.44} ${x - r * 0.22},${y - r * 0.5} Z`,
      // South America fragment — western limb, wider top → narrow Patagonia.
      `M ${x - r * 0.85},${y - r * 0.1} Q ${x - r * 0.55},${y - r * 0.05} ${x - r * 0.48},${y + r * 0.08} Q ${x - r * 0.5},${y + r * 0.25} ${x - r * 0.55},${y + r * 0.4} Q ${x - r * 0.6},${y + r * 0.5} ${x - r * 0.65},${y + r * 0.42} Q ${x - r * 0.62},${y + r * 0.25} ${x - r * 0.68},${y + r * 0.1} Q ${x - r * 0.78},${y + r * 0} ${x - r * 0.85},${y - r * 0.1} Z`,
      // North America fragment — upper-left, partial.
      `M ${x - r * 0.85},${y - r * 0.5} Q ${x - r * 0.55},${y - r * 0.45} ${x - r * 0.42},${y - r * 0.3} Q ${x - r * 0.4},${y - r * 0.18} ${x - r * 0.5},${y - r * 0.12} Q ${x - r * 0.65},${y - r * 0.18} ${x - r * 0.78},${y - r * 0.3} Q ${x - r * 0.88},${y - r * 0.4} ${x - r * 0.85},${y - r * 0.5} Z`
    ];
    return parts.join(" ");
  }
  function madagascarBounds(cx, cy, r) {
    const rx = r * 0.04;
    const ry = r * 0.1;
    return {
      x: cx + r * 0.34 - rx,
      y: cy + r * 0.22 - ry,
      width: rx * 2,
      height: ry * 2
    };
  }
  function northIceCapBounds(cx, cy, r) {
    const rx = r * 0.55;
    const ry = r * 0.18;
    return {
      x: cx - rx,
      y: cy - r * 0.95 - ry,
      width: rx * 2,
      height: ry * 2
    };
  }
  function southIceCapBounds(cx, cy, r) {
    const rx = r * 0.5;
    const ry = r * 0.15;
    return {
      x: cx - rx,
      y: cy + r * 0.95 - ry,
      width: rx * 2,
      height: ry * 2
    };
  }
  var TERMINATOR_OFFSET_FRAC = { x: 0.35, y: 0.05 };
  var TERMINATOR_OPACITY = 0.22;
  var TERMINATOR_COLOR = "#000000";
  var EARTH_HALO_RADIUS_MUL = 1.8;
  var EARTH_HALO_COLOR = "#a8d0f0";
  var EARTH_CONTINENT_COLOR = "#3a7a3e";
  var EARTH_ICE_COLOR = "#ffffff";
  var EARTH_ICE_OPACITY = 0.85;
  return __toCommonJS(geometry_exports);
})();
window.WorldGeometry=WorldGeometry;
