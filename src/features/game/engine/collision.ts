/**
 * Collision primitives.
 *
 * Ported 1:1 from prototype TwoDots.html lines 78-95.
 */

import { DOT_R, PIPE_W } from './constants';

/**
 * Circle vs axis-aligned rectangle intersection test.
 * Returns true if the circle at (cx, cy) with radius cr overlaps the rect
 * at (rx, ry) with size (rw, rh).
 */
export function circleRect(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}

/**
 * Returns true if a dot at (dotX, dotY) collides with either the top or bottom
 * segment of a pipe centred horizontally at pipeX with a vertical gap of size
 * `gap` centred at gapCY. `visH` is the logical playable height.
 */
export function dotHitsPipe(
  dotX: number,
  dotY: number,
  pipeX: number,
  gapCY: number,
  gap: number,
  visH: number,
): boolean {
  const pLeft = pipeX - PIPE_W / 2;
  const topH = gapCY - gap / 2;
  const botY = gapCY + gap / 2;
  const botH = visH - botY;
  if (topH > 0 && circleRect(dotX, dotY, DOT_R, pLeft, 0, PIPE_W, topH)) return true;
  if (botH > 0 && circleRect(dotX, dotY, DOT_R, pLeft, botY, PIPE_W, botH)) return true;
  return false;
}

/**
 * Close-call detection. Fires true when the dot is horizontally overlapping the
 * pipe AND has less than `closeCallPx` of clearance from the nearer gap edge.
 * Caller is responsible for deduplicating firings per pipe-per-dot per run.
 */
export function isCloseCall(
  dotY: number,
  laneX: number,
  pipeX: number,
  gapCY: number,
  gap: number,
  closeCallPx: number,
): boolean {
  const pLeft = pipeX - PIPE_W / 2;
  const pRight = pipeX + PIPE_W / 2;
  // Horizontal overlap check — dot must be within pipe's x-range (with DOT_R margin).
  if (laneX + DOT_R < pLeft || laneX - DOT_R > pRight) return false;
  const topEdge = gapCY - gap / 2;
  const botEdge = gapCY + gap / 2;
  const clearTop = dotY - DOT_R - topEdge; // positive = below top wall
  const clearBottom = botEdge - (dotY + DOT_R); // positive = above bottom wall
  const minClear = Math.min(clearTop, clearBottom);
  return minClear > 0 && minClear < closeCallPx;
}

/**
 * Out-of-bounds death check. Either dot exiting the playable area (bottom or
 * significantly above the top) ends the run.
 */
export function isOutOfBounds(dotY: number, visH: number): boolean {
  return dotY + DOT_R > visH || dotY - DOT_R < -30;
}
