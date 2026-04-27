import { describe, expect, it } from 'vitest';
import {
  gateInTier,
  gapSize,
  pipePauseMs,
  pipeSpeed,
  tierFor,
  tierName,
  TIER_STARTS,
} from '../tiers';

describe('tiers', () => {
  describe('GIVEN tierFor', () => {
    describe('WHEN score is within each tier boundary', () => {
      it.each([
        [0, 1],
        [4, 1],
        [5, 2],
        [9, 2],
        [10, 3],
        [14, 3],
        [15, 4],
        [19, 4],
        [20, 5],
        [24, 5],
        [25, 6],
        [29, 6],
        [30, 7],
        [34, 7],
        [35, 8],
        [100, 8],
        [999, 8],
      ])('THEN score %d maps to tier %d', (score, expected) => {
        expect(tierFor(score)).toBe(expected);
      });
    });
  });

  describe('GIVEN tierName', () => {
    describe('WHEN tier is 1-7', () => {
      it('THEN returns LVL N format', () => {
        expect(tierName(0)).toBe('LVL 1');
        expect(tierName(20)).toBe('LVL 5');
        expect(tierName(34)).toBe('LVL 7');
      });
    });
    describe('WHEN tier is 8 (Survival)', () => {
      it('THEN returns LVL 8', () => {
        expect(tierName(35)).toBe('LVL 8');
        expect(tierName(50)).toBe('LVL 8');
      });
    });
  });

  describe('GIVEN gapSize', () => {
    describe('WHEN within fixed tiers 1-7', () => {
      it('THEN returns the flat tier value', () => {
        expect(gapSize(0)).toBe(480);
        expect(gapSize(4)).toBe(480);
        expect(gapSize(5)).toBe(400);
        expect(gapSize(9)).toBe(400);
        expect(gapSize(10)).toBe(340);
        expect(gapSize(15)).toBe(290);
        expect(gapSize(20)).toBe(245);
        expect(gapSize(25)).toBe(210);
        expect(gapSize(30)).toBe(185);
      });
    });
    describe('WHEN in Survival (tier 8)', () => {
      it('THEN starts at 165 and creeps toward 140 floor over 20 gates', () => {
        expect(gapSize(35)).toBe(165);
        expect(gapSize(45)).toBe(152.5);
        expect(gapSize(55)).toBe(140);
        // Past the creep window — floor holds.
        expect(gapSize(100)).toBe(140);
      });
      it('THEN never drops below the 140 floor', () => {
        for (let s = 55; s < 200; s++) {
          expect(gapSize(s)).toBeGreaterThanOrEqual(140);
        }
      });
    });
    describe('WHEN crossing a tier boundary', () => {
      it('THEN gap steps down discretely (not interpolated)', () => {
        expect(gapSize(4) - gapSize(5)).toBe(80); // 480 → 400
        expect(gapSize(29) - gapSize(30)).toBe(25); // 210 → 185
      });
    });
  });

  describe('GIVEN pipeSpeed', () => {
    it('WHEN within each fixed tier THEN returns the flat speed', () => {
      expect(pipeSpeed(0)).toBe(1.8);
      expect(pipeSpeed(5)).toBe(1.8);
      expect(pipeSpeed(10)).toBe(2.0);
      expect(pipeSpeed(15)).toBe(2.0);
      expect(pipeSpeed(20)).toBe(2.2);
      expect(pipeSpeed(25)).toBe(2.2);
      expect(pipeSpeed(30)).toBe(2.5);
    });
    it('WHEN in Survival THEN creeps up 0.1 per 5 gates past 35', () => {
      expect(pipeSpeed(35)).toBe(2.5);
      expect(pipeSpeed(39)).toBe(2.5);
      expect(pipeSpeed(40)).toBeCloseTo(2.6, 5);
      expect(pipeSpeed(45)).toBeCloseTo(2.7, 5);
      expect(pipeSpeed(50)).toBeCloseTo(2.8, 5);
    });
    it('WHEN score increases THEN speed is monotonically non-decreasing', () => {
      let prev = 0;
      for (let s = 0; s < 100; s++) {
        const v = pipeSpeed(s);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });
  });

  describe('GIVEN pipePauseMs', () => {
    it('WHEN tier advances THEN pause reduces monotonically', () => {
      const tiers = [0, 5, 10, 15, 20, 25, 30, 35];
      const pauses = tiers.map(pipePauseMs);
      for (let i = 1; i < pauses.length; i++) {
        const curr = pauses[i];
        const prev = pauses[i - 1];
        if (curr === undefined || prev === undefined) {
          throw new Error(`pauses array corrupted at index ${i}`);
        }
        expect(curr).toBeLessThan(prev);
      }
    });
    it('WHEN tier 1 THEN returns 1000ms baseline', () => {
      expect(pipePauseMs(0)).toBe(1000);
    });
    it('WHEN Survival THEN returns 230ms floor', () => {
      expect(pipePauseMs(35)).toBe(230);
      expect(pipePauseMs(100)).toBe(230);
    });
  });

  describe('GIVEN gateInTier', () => {
    it('WHEN tier 1 score 0 THEN returns gate 1', () => {
      expect(gateInTier(0)).toBe(1);
    });
    it('WHEN tier 1 score 4 THEN returns gate 5', () => {
      expect(gateInTier(4)).toBe(5);
    });
    it('WHEN tier 4 score 18 THEN returns gate 4', () => {
      expect(gateInTier(18)).toBe(4);
    });
    it('WHEN Survival score 35 THEN returns gate 0', () => {
      expect(gateInTier(35)).toBe(0);
    });
    it('WHEN Survival score 50 THEN returns gate 15', () => {
      expect(gateInTier(50)).toBe(15);
    });

    // P1-10: property-style sweep. Locks the contract that across every score
    // a player can reach in tiers 1-7, gateInTier returns a value in [1, 5].
    // If anyone changes TIER_STARTS or the indexing arithmetic, this fails fast.
    it('WHEN any score in tiers 1-7 THEN returns a gate in [1, 5]', () => {
      for (let score = 0; score < 35; score++) {
        const gate = gateInTier(score);
        expect(gate).toBeGreaterThanOrEqual(1);
        expect(gate).toBeLessThanOrEqual(5);
      }
    });

    it('WHEN any Survival score (>=35) THEN returns a non-negative gate', () => {
      for (let score = 35; score < 100; score++) {
        expect(gateInTier(score)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GIVEN TIER_STARTS', () => {
    it('WHEN read THEN has 8 entries aligned with tierFor', () => {
      expect(TIER_STARTS).toHaveLength(8);
      TIER_STARTS.forEach((start, idx) => {
        expect(tierFor(start)).toBe(idx + 1);
      });
    });
  });
});
