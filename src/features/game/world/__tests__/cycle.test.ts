import { describe, expect, it } from 'vitest';
import { applyCycleProfile, cycleProfileWeights } from '../cycle';

describe('cycle', () => {
  describe('GIVEN cycleProfileWeights', () => {
    describe('WHEN profile is "atmospheric"', () => {
      it('THEN weights are 10/40/10/40 (dawn/day/dusk/night)', () => {
        const w = cycleProfileWeights('atmospheric');
        expect(w.dawn).toBeCloseTo(0.1);
        expect(w.day).toBeCloseTo(0.4);
        expect(w.dusk).toBeCloseTo(0.1);
        expect(w.night).toBeCloseTo(0.4);
      });
      it('THEN weights sum to 1.0', () => {
        const w = cycleProfileWeights('atmospheric');
        expect(w.dawn + w.day + w.dusk + w.night).toBeCloseTo(1.0);
      });
    });

    describe('WHEN profile is "airless"', () => {
      it('THEN weights are 3/47/3/47 (sharp horizon snap)', () => {
        const w = cycleProfileWeights('airless');
        expect(w.dawn).toBeCloseTo(0.03);
        expect(w.day).toBeCloseTo(0.47);
        expect(w.dusk).toBeCloseTo(0.03);
        expect(w.night).toBeCloseTo(0.47);
      });
      it('THEN weights sum to 1.0', () => {
        const w = cycleProfileWeights('airless');
        expect(w.dawn + w.day + w.dusk + w.night).toBeCloseTo(1.0);
      });
    });
  });

  describe('GIVEN applyCycleProfile', () => {
    describe('WHEN profile is "atmospheric"', () => {
      it('THEN g=0 returns curve t=0 (dawn anchor)', () => {
        expect(applyCycleProfile(0, 'atmospheric')).toBeCloseTo(0);
      });

      it('THEN g=0.05 (mid-dawn) is between 0 and 0.25', () => {
        const t = applyCycleProfile(0.05, 'atmospheric');
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThan(0.25);
      });

      it('THEN g=0.1 (end of dawn) returns curve t=0.25 (day anchor)', () => {
        expect(applyCycleProfile(0.1, 'atmospheric')).toBeCloseTo(0.25);
      });

      it('THEN day plateau holds curve t at 0.25', () => {
        // day spans g ∈ [0.1, 0.5] in atmospheric
        expect(applyCycleProfile(0.2, 'atmospheric')).toBeCloseTo(0.25);
        expect(applyCycleProfile(0.4, 'atmospheric')).toBeCloseTo(0.25);
        expect(applyCycleProfile(0.49, 'atmospheric')).toBeCloseTo(0.25);
      });

      it('THEN g=0.5 (start of dusk) returns curve t≈0.25 (boundary)', () => {
        expect(applyCycleProfile(0.5, 'atmospheric')).toBeCloseTo(0.25);
      });

      it('THEN g=0.6 (end of dusk) returns curve t=0.5 (night anchor)', () => {
        expect(applyCycleProfile(0.6, 'atmospheric')).toBeCloseTo(0.5);
      });

      it('THEN night plateau drifts 0.5 → 0.75 over its first 30%, then holds', () => {
        // night spans g ∈ [0.6, 1.0]; first 30% is g ∈ [0.6, 0.72]
        const start = applyCycleProfile(0.6, 'atmospheric');
        const drift = applyCycleProfile(0.66, 'atmospheric'); // mid-drift
        const past = applyCycleProfile(0.72, 'atmospheric'); // end of drift
        const hold = applyCycleProfile(0.9, 'atmospheric');
        expect(start).toBeCloseTo(0.5);
        expect(drift).toBeGreaterThan(0.5);
        expect(drift).toBeLessThan(0.75);
        expect(past).toBeCloseTo(0.75);
        expect(hold).toBeCloseTo(0.75);
      });

      it('THEN curve t is monotonic within each transition', () => {
        // Dawn: g=0 → 0.1 should be strictly increasing
        const samples = [0, 0.025, 0.05, 0.075, 0.099];
        const ts = samples.map((g) => applyCycleProfile(g, 'atmospheric'));
        for (let i = 1; i < ts.length; i++) {
          expect(ts[i]!).toBeGreaterThan(ts[i - 1]!);
        }
      });
    });

    describe('WHEN profile is "airless"', () => {
      it('THEN dawn ends at g=0.03 (sharper transition)', () => {
        // Airless dawn is just g ∈ [0, 0.03]; full transition compressed.
        const t = applyCycleProfile(0.03, 'airless');
        expect(t).toBeCloseTo(0.25);
      });

      it('THEN day plateau spans g ∈ [0.03, 0.50]', () => {
        expect(applyCycleProfile(0.03, 'airless')).toBeCloseTo(0.25);
        expect(applyCycleProfile(0.25, 'airless')).toBeCloseTo(0.25);
        expect(applyCycleProfile(0.49, 'airless')).toBeCloseTo(0.25);
      });

      it('THEN night anchor reached at g=0.53 (after 3% dusk)', () => {
        expect(applyCycleProfile(0.53, 'airless')).toBeCloseTo(0.5);
      });
    });

    describe('WHEN g is at exactly 1.0 (defensive wrap)', () => {
      it('THEN returns 0 (the dawn anchor)', () => {
        expect(applyCycleProfile(1.0, 'atmospheric')).toBe(0);
        expect(applyCycleProfile(1.0, 'airless')).toBe(0);
      });
    });
  });
});
