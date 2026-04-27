import { describe, expect, it } from 'vitest';
import { circleRect, dotHitsPipe, isCloseCall, isOutOfBounds } from '../collision';
import { CLOSE_CALL_PX, DOT_R, LANE_L, PIPE_W } from '../constants';

describe('collision', () => {
  describe('GIVEN circleRect', () => {
    describe('WHEN circle centre is inside rect', () => {
      it('THEN returns true', () => {
        expect(circleRect(50, 50, 10, 0, 0, 100, 100)).toBe(true);
      });
    });
    describe('WHEN circle is far from rect', () => {
      it('THEN returns false', () => {
        expect(circleRect(500, 500, 10, 0, 0, 100, 100)).toBe(false);
      });
    });
    describe('WHEN circle just grazes rect edge', () => {
      it('THEN returns true when overlapping by any amount', () => {
        // Circle at (105, 50) radius 10 — reaches x=95, rect right edge at 100 → overlap.
        expect(circleRect(105, 50, 10, 0, 0, 100, 100)).toBe(true);
      });
      it('THEN returns false when exactly touching (distance == radius)', () => {
        // Circle at (110, 50) radius 10 — reaches x=100 exactly, distance from near point (100,50) is 10.
        // The implementation uses strict less-than, so exactly-touching is false.
        expect(circleRect(110, 50, 10, 0, 0, 100, 100)).toBe(false);
      });
    });
  });

  describe('GIVEN dotHitsPipe', () => {
    // Use realistic game values.
    const visH = 700;
    const pipeX = 200;
    const gapCY = 350;
    const gap = 200;

    describe('WHEN dot is safely inside the gap', () => {
      it('THEN returns false', () => {
        expect(dotHitsPipe(pipeX, gapCY, pipeX, gapCY, gap, visH)).toBe(false);
      });
    });
    describe('WHEN dot is above the gap (hits top segment)', () => {
      it('THEN returns true', () => {
        const topEdgeY = gapCY - gap / 2; // 250
        // Dot centre 50px above top edge — clearly hitting top segment.
        expect(dotHitsPipe(pipeX, topEdgeY - 50, pipeX, gapCY, gap, visH)).toBe(true);
      });
    });
    describe('WHEN dot is below the gap (hits bottom segment)', () => {
      it('THEN returns true', () => {
        const botEdgeY = gapCY + gap / 2; // 450
        expect(dotHitsPipe(pipeX, botEdgeY + 50, pipeX, gapCY, gap, visH)).toBe(true);
      });
    });
    describe('WHEN dot is horizontally clear of pipe', () => {
      it('THEN returns false regardless of Y', () => {
        const farLeft = pipeX - PIPE_W / 2 - DOT_R - 10;
        expect(dotHitsPipe(farLeft, 0, pipeX, gapCY, gap, visH)).toBe(false);
        expect(dotHitsPipe(farLeft, visH, pipeX, gapCY, gap, visH)).toBe(false);
      });
    });
    describe('WHEN gap fills entire playfield (topH and botH both 0 or negative)', () => {
      it('THEN returns false — degenerate case handled safely', () => {
        // gapCY centred, gap > visH means both segments have negative height.
        expect(dotHitsPipe(pipeX, 100, pipeX, visH / 2, visH * 2, visH)).toBe(false);
      });
    });
  });

  describe('GIVEN isCloseCall', () => {
    const pipeX = 200;
    const gapCY = 350;
    const gap = 200;

    describe('WHEN dot is far from pipe horizontally', () => {
      it('THEN returns false regardless of vertical proximity', () => {
        const farLeft = pipeX - PIPE_W / 2 - DOT_R - 10;
        expect(isCloseCall(gapCY + gap / 2 - 5, farLeft, pipeX, gapCY, gap, CLOSE_CALL_PX)).toBe(
          false,
        );
      });
    });
    describe('WHEN dot is comfortably centred in gap', () => {
      it('THEN returns false', () => {
        expect(isCloseCall(gapCY, LANE_L, pipeX, gapCY, gap, CLOSE_CALL_PX)).toBe(false);
      });
    });
    describe('WHEN dot is within CLOSE_CALL_PX of bottom edge', () => {
      it('THEN returns true', () => {
        const botEdge = gapCY + gap / 2;
        // Dot centre such that bottom of dot is ~10px from bottom edge.
        const dotY = botEdge - DOT_R - 10;
        expect(isCloseCall(dotY, pipeX, pipeX, gapCY, gap, CLOSE_CALL_PX)).toBe(true);
      });
    });
    describe('WHEN dot is touching the edge (minClear = 0)', () => {
      it('THEN returns false — already a collision, not a close-call', () => {
        const botEdge = gapCY + gap / 2;
        const dotY = botEdge - DOT_R;
        expect(isCloseCall(dotY, pipeX, pipeX, gapCY, gap, CLOSE_CALL_PX)).toBe(false);
      });
    });
  });

  describe('GIVEN isOutOfBounds', () => {
    const visH = 700;
    describe('WHEN dot is safely inside the canvas', () => {
      it('THEN returns false', () => {
        expect(isOutOfBounds(350, visH)).toBe(false);
        expect(isOutOfBounds(100, visH)).toBe(false);
      });
    });
    describe('WHEN dot falls below the bottom', () => {
      it('THEN returns true', () => {
        expect(isOutOfBounds(visH, visH)).toBe(true);
        expect(isOutOfBounds(visH + 100, visH)).toBe(true);
      });
    });
    describe('WHEN dot launches well above the top', () => {
      it('THEN returns true only past the -30px forgiveness zone', () => {
        expect(isOutOfBounds(-10, visH)).toBe(false); // still within -30 tolerance
        expect(isOutOfBounds(-50, visH)).toBe(true);
      });
    });
  });
});
