import { describe, expect, it } from 'vitest';
import { defaultRng, mulberry32 } from '../rng';

describe('rng', () => {
  describe('GIVEN mulberry32', () => {
    describe('WHEN called with the same seed twice', () => {
      it('THEN produces identical sequences', () => {
        const a = mulberry32(12345);
        const b = mulberry32(12345);
        const seq1 = Array.from({ length: 100 }, () => a());
        const seq2 = Array.from({ length: 100 }, () => b());
        expect(seq1).toEqual(seq2);
      });
    });
    describe('WHEN called with different seeds', () => {
      it('THEN produces different sequences', () => {
        const a = mulberry32(1);
        const b = mulberry32(2);
        expect(a()).not.toBe(b());
      });
    });
    describe('WHEN invoked many times', () => {
      it('THEN all values fall in [0, 1)', () => {
        const rng = mulberry32(99);
        for (let i = 0; i < 10000; i++) {
          const v = rng();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      });
    });
  });

  describe('GIVEN defaultRng', () => {
    it('WHEN called THEN returns a value in [0, 1)', () => {
      for (let i = 0; i < 100; i++) {
        const v = defaultRng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });
});
