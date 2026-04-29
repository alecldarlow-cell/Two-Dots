/**
 * Bird flock geometry — shared between the Skia production renderer AND
 * the HTML/SVG iteration tool.
 *
 * Two-stage split:
 *   1. seedBirds(...)        — static per-theme: position, size, flap phase
 *   2. computeBirdWingPath() — per-frame: signed wingtip oscillation +
 *                               perpendicular control-point curl. Round 6.
 *
 * Round 6 wing flap rewrite: wingtips oscillate UP/DOWN (signed tipLift,
 * swings through zero) — body stays fixed. Each wing's control point is
 * placed PERPENDICULAR to the tip→body line at consistent magnitude
 * (size × 0.45), so the arc magnitude stays consistent regardless of
 * where the wing is in the flap cycle. Curl always points upward —
 * gives each wing a clear soft arc rather than a chevron straight line.
 * Slowed to ~1.3 Hz (sin × 0.008) — more like real flight, less frantic.
 */

import { mulberry32 } from './prng';

export type BirdSeed = {
  baseX: number;
  baseY: number;
  driftPhase: number;
  size: number;
  flapPhase: number;
  /** Per-bird alpha (0.55-0.85). Production batches into one Path so the
   *  per-bird value is not currently honored in the Skia render path —
   *  preserved here for renderers that can render birds individually. */
  alpha: number;
};

/**
 * Seed a bird flock.
 *
 * @param width   canvas width — birds wrap horizontally across this region
 * @param visH    visible canvas height — birds fly in 18-43% of this region
 * @param count   number of birds
 * @param sizeMul per-bird size multiplier (Earth uses 2.2 to read at 390px)
 * @param seed    deterministic seed
 */
export function seedBirds(
  width: number,
  visH: number,
  count: number,
  sizeMul: number,
  seed: number,
): BirdSeed[] {
  const rng = mulberry32(seed ^ 0x77777777);
  const out: BirdSeed[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      baseX: rng() * width * 1.2,
      baseY: 0.18 * visH + rng() * 0.25 * visH,
      driftPhase: rng() * 1000,
      size: (4 + rng() * 3) * sizeMul,
      flapPhase: rng() * Math.PI * 2,
      alpha: 0.55 + rng() * 0.3,
    });
  }
  return out;
}

/**
 * Per-frame bird position after drift wrap.
 *
 * Drift wraps the bird across (width + 100) px so off-screen birds reappear
 * on the opposite edge.
 */
export function birdScreenX(
  bird: BirdSeed,
  width: number,
  speed: number,
  nowMs: number,
): number {
  const drift = (nowMs * 0.04 * speed + bird.driftPhase) % (width + 100);
  return ((bird.baseX + drift) % (width + 100)) - 50;
}

/**
 * Compute a bird's two-Q-curve wing path data for the current frame.
 *
 * Returns the seven points needed to draw the wing path:
 *   M (lTip)
 *   Q (lCtrl) (body)
 *   Q (rCtrl) (rTip)
 *
 * Both renderers can build their native primitive from this:
 *   - Skia:    path.moveTo(...lTip); path.quadTo(...lCtrl, ...body);
 *              path.quadTo(...rCtrl, ...rTip)
 *   - SVG:     `M ${lTip} Q ${lCtrl} ${body} Q ${rCtrl} ${rTip}`
 *
 * @param x      bird's screen x (from birdScreenX)
 * @param bird   bird seed (provides baseY, size, flapPhase)
 * @param nowMs  current time for flap animation
 */
export function computeBirdWingPoints(
  x: number,
  bird: BirdSeed,
  nowMs: number,
): {
  lTip: readonly [number, number];
  lCtrl: readonly [number, number];
  body: readonly [number, number];
  rCtrl: readonly [number, number];
  rTip: readonly [number, number];
} {
  const tipLift = Math.sin(nowMs * 0.008 + bird.flapPhase) * 0.7; // signed
  const tipY = bird.baseY + bird.size * tipLift;
  const curlMag = bird.size * 0.45;

  // Left wing: tip → body. Perpendicular to (body - tip), curl points up.
  const lDx = bird.size; // body.x - tip.x = (x) - (x - size) = size
  const lDy = bird.baseY - tipY;
  const lLen = Math.sqrt(lDx * lDx + lDy * lDy);
  const lPerpX = lDy / lLen;
  const lPerpY = -lDx / lLen; // always negative (points up)
  const lCtrlX = (x - bird.size + x) / 2 + lPerpX * curlMag;
  const lCtrlY = (tipY + bird.baseY) / 2 + lPerpY * curlMag;

  // Right wing: body → tip (mirror).
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
    rTip: [x + bird.size, tipY],
  };
}

/** Stroke width for a single bird — proportional to size, with floor 0.9. */
export function birdStrokeWidth(bird: BirdSeed): number {
  return Math.max(0.9, bird.size * 0.18);
}
