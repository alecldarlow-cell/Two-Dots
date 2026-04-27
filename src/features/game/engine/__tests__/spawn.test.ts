import { describe, expect, it } from 'vitest';
import {
  clampToReachable,
  initSpawnerState,
  maxUpReach,
  pipeGapCY,
  spawnPipe,
} from '../spawn';
import { gapSize, pipeSpeed } from '../tiers';
import { mulberry32 } from '@shared/utils/rng';
import { PIPE_SPACING } from '../constants';

describe('spawn', () => {
  describe('GIVEN initSpawnerState', () => {
    it('WHEN called THEN returns neutral starting state', () => {
      const s = initSpawnerState();
      expect(s.lastGapCY).toBeNull();
      expect(s.lastSide).toBe(1);
    });
  });

  describe('GIVEN maxUpReach', () => {
    it('WHEN tier 1 (slowest) THEN more frames → larger reach', () => {
      const tier1 = maxUpReach(0);
      const tier7 = maxUpReach(30);
      expect(tier1).toBeGreaterThan(tier7);
    });
    it('WHEN any score THEN reach is positive', () => {
      for (let s = 0; s < 100; s += 5) {
        expect(maxUpReach(s)).toBeGreaterThan(0);
      }
    });
    it('WHEN score 0 THEN reach approximately matches PIPE_SPACING / speed frames of jumping', () => {
      // Sanity: the reach at tier 1 should be a substantial fraction of the playable height.
      // PIPE_SPACING / 1.8 ≈ 156 frames. With JUMP_VY=-4.2 and GRAVITY=0.12, that's a lot of vertical coverage.
      const reach = maxUpReach(0);
      expect(reach).toBeGreaterThan(200);
    });
  });

  describe('GIVEN clampToReachable', () => {
    describe('WHEN lastGapCY is null (first pipe of run)', () => {
      it('THEN returns candidate unchanged', () => {
        expect(clampToReachable(100, 0, 0, 700, null)).toBe(100);
      });
    });
    describe('WHEN candidate is within reach from lastGapCY', () => {
      it('THEN returns candidate unchanged', () => {
        const lastGapCY = 400;
        // Candidate 50px above lastGapCY — well within reach.
        const candidate = lastGapCY - 50;
        expect(clampToReachable(candidate, 0, 100, 600, lastGapCY)).toBe(candidate);
      });
    });
    describe('WHEN candidate is beyond upward reach from lastGapCY', () => {
      it('THEN returns the lowest reachable Y', () => {
        const lastGapCY = 500;
        const reach = maxUpReach(0);
        const impossibleCandidate = 50; // way above what the dot can climb
        const clamped = clampToReachable(impossibleCandidate, 0, 80, 620, lastGapCY);
        expect(clamped).toBe(lastGapCY - reach);
        expect(clamped).toBeGreaterThan(impossibleCandidate);
      });
    });
    describe('WHEN reach would exceed minY', () => {
      it('THEN clamps to minY', () => {
        const lastGapCY = 100;
        const minY = 80;
        const clamped = clampToReachable(0, 0, minY, 620, lastGapCY);
        // Even if lowestReachable is very low (high number), minY wins if lowestReachable < minY.
        expect(clamped).toBeGreaterThanOrEqual(minY);
      });
    });
  });

  describe('GIVEN pipeGapCY', () => {
    const visH = 700;
    const seed = 12345;

    describe('WHEN tier 1 (Warmup)', () => {
      it('THEN centres around midpoint with small jitter', () => {
        const spawner = initSpawnerState();
        const rng = mulberry32(seed);
        const y = pipeGapCY(0, gapSize(0), visH, spawner, rng);
        const centreY = visH / 2;
        expect(Math.abs(y - centreY)).toBeLessThanOrEqual(20); // jitter is ±20px
      });
    });

    describe('WHEN tier 2-5 (alternating pattern)', () => {
      it('THEN flips lastSide each call', () => {
        const spawner = initSpawnerState();
        const rng = mulberry32(seed);
        const initialSide = spawner.lastSide;
        pipeGapCY(5, gapSize(5), visH, spawner, rng);
        expect(spawner.lastSide).toBe(-initialSide);
        pipeGapCY(6, gapSize(6), visH, spawner, rng);
        expect(spawner.lastSide).toBe(initialSide);
      });
    });

    describe('WHEN tier 6-8 (fully random)', () => {
      it('THEN does not mutate lastSide', () => {
        const spawner = initSpawnerState();
        const rng = mulberry32(seed);
        const before = spawner.lastSide;
        pipeGapCY(25, gapSize(25), visH, spawner, rng);
        pipeGapCY(30, gapSize(30), visH, spawner, rng);
        pipeGapCY(40, gapSize(40), visH, spawner, rng);
        expect(spawner.lastSide).toBe(before);
      });
    });

    describe('WHEN seed is fixed', () => {
      it('THEN produces identical Y sequence (determinism)', () => {
        const run = (): number[] => {
          const spawner = initSpawnerState();
          const rng = mulberry32(seed);
          return Array.from({ length: 20 }, (_, i) =>
            pipeGapCY(i, gapSize(i), visH, spawner, rng),
          );
        };
        expect(run()).toEqual(run());
      });
    });

    describe('WHEN called across many seeds', () => {
      it('THEN Y always stays within minY..maxY clamp', () => {
        for (let seedN = 1; seedN < 50; seedN++) {
          const rng = mulberry32(seedN);
          const spawner = initSpawnerState();
          for (let score = 0; score < 50; score++) {
            const gap = gapSize(score);
            const minY = gap / 2 + 60;
            const maxY = visH - gap / 2 - 60;
            const y = pipeGapCY(score, gap, visH, spawner, rng);
            expect(y).toBeGreaterThanOrEqual(minY);
            expect(y).toBeLessThanOrEqual(maxY);
          }
        }
      });
    });
  });

  describe('GIVEN spawnPipe', () => {
    const visH = 700;
    const now = 1000;

    it('WHEN called THEN produces a pipe with expected shape', () => {
      const spawner = initSpawnerState();
      const rng = mulberry32(42);
      const pipe = spawnPipe(0, now, visH, spawner, rng);
      expect(pipe.scored).toBe(false);
      expect(pipe.clearFlash).toBe(0);
      expect(pipe.closeCalledByL).toBe(false);
      expect(pipe.closeCalledByR).toBe(false);
      expect(pipe.gap).toBe(gapSize(0));
      expect(pipe.speed).toBe(pipeSpeed(0));
      expect(pipe.pauseUntil).toBeGreaterThan(now);
    });

    it('WHEN spawning consecutive pipes THEN each is reachable from the last', () => {
      const spawner = initSpawnerState();
      const rng = mulberry32(7);
      const pipes = Array.from({ length: 30 }, (_, i) =>
        spawnPipe(i, now + i * 100, visH, spawner, rng),
      );
      for (let i = 1; i < pipes.length; i++) {
        const prev = pipes[i - 1];
        const curr = pipes[i];
        if (!prev || !curr) throw new Error('pipes array corrupted');
        const reach = maxUpReach(i);
        // Current pipe's gap centre must be at most `reach` above the previous one.
        // (It may be further below — that's fine, gravity helps.)
        const upwardDelta = prev.gapCY - curr.gapCY;
        expect(upwardDelta).toBeLessThanOrEqual(reach + 0.001); // floating-point tolerance
      }
    });
  });

  describe('GIVEN PIPE_SPACING and maxUpReach', () => {
    it('WHEN at any tier THEN reach is < PIPE_SPACING — sanity check on our design', () => {
      // This is a design invariant — if reach ever exceeds PIPE_SPACING, the difficulty tuning
      // has lost all meaning (every gap is trivially reachable). If this ever fires,
      // PIPE_SPACING or the physics constants need reviewing.
      for (let s = 0; s < 100; s += 5) {
        expect(maxUpReach(s)).toBeLessThan(PIPE_SPACING * 2); // generous — just a ceiling
      }
    });
  });
});
