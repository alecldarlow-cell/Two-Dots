import { describe, expect, it } from 'vitest';
import { planetForScore } from '../useCurrentPlanet';

describe('useCurrentPlanet', () => {
  describe('GIVEN planetForScore', () => {
    describe('WHEN score is in the Moon band (0-9)', () => {
      it.each([0, 1, 5, 9])('THEN score %d maps to moon', (score) => {
        expect(planetForScore(score)).toBe('moon');
      });
    });

    describe('WHEN score is in the Earth band (10-19)', () => {
      it.each([10, 11, 15, 19])('THEN score %d maps to earth', (score) => {
        expect(planetForScore(score)).toBe('earth');
      });
    });

    describe('WHEN score is in the Jupiter band (20+)', () => {
      it.each([20, 21, 35, 100, 999])('THEN score %d maps to jupiter', (score) => {
        expect(planetForScore(score)).toBe('jupiter');
      });
    });

    describe('WHEN score is at the Moon→Earth boundary', () => {
      it('THEN gate 9 is the last moon gate', () => {
        expect(planetForScore(9)).toBe('moon');
      });
      it('THEN gate 10 is the first earth gate', () => {
        expect(planetForScore(10)).toBe('earth');
      });
    });

    describe('WHEN score is at the Earth→Jupiter boundary', () => {
      it('THEN gate 19 is the last earth gate', () => {
        expect(planetForScore(19)).toBe('earth');
      });
      it('THEN gate 20 is the first jupiter gate', () => {
        expect(planetForScore(20)).toBe('jupiter');
      });
    });

    describe('WHEN score is negative (defensive)', () => {
      it('THEN it still returns moon (< check fall-through)', () => {
        // No production caller passes a negative score, but a defensive
        // mapping shouldn't throw or return undefined.
        expect(planetForScore(-1)).toBe('moon');
        expect(planetForScore(-100)).toBe('moon');
      });
    });
  });
});
