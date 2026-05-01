import { describe, expect, it } from 'vitest';
import {
  oklchToHex,
  preprocessHexCurve,
  sampleOklchCurve,
  sampleScalarCurve,
  type Oklch,
} from '../color';

describe('color', () => {
  describe('GIVEN preprocessHexCurve + oklchToHex round-trip', () => {
    describe('WHEN given pure greys', () => {
      it.each(['#000000', '#808080', '#ffffff'])(
        'THEN %s round-trips back to itself',
        (hex) => {
          const stops = preprocessHexCurve([{ t: 0, color: hex }]);
          const back = oklchToHex(stops[0]![1]);
          expect(back).toBe(hex);
        },
      );
    });

    describe('WHEN given saturated primaries', () => {
      // OKLCh round-trip is approximate due to gamut clipping for vivid
      // sRGB colours. Tolerate up to ±2 per channel.
      const compareApprox = (a: string, b: string, tol = 2): void => {
        const ar = parseInt(a.slice(1, 3), 16);
        const ag = parseInt(a.slice(3, 5), 16);
        const ab = parseInt(a.slice(5, 7), 16);
        const br = parseInt(b.slice(1, 3), 16);
        const bg = parseInt(b.slice(3, 5), 16);
        const bb = parseInt(b.slice(5, 7), 16);
        expect(Math.abs(ar - br)).toBeLessThanOrEqual(tol);
        expect(Math.abs(ag - bg)).toBeLessThanOrEqual(tol);
        expect(Math.abs(ab - bb)).toBeLessThanOrEqual(tol);
      };

      it.each(['#ff0000', '#00ff00', '#0000ff', '#ffd046'])(
        'THEN %s round-trips approximately',
        (hex) => {
          const stops = preprocessHexCurve([{ t: 0, color: hex }]);
          const back = oklchToHex(stops[0]![1]);
          compareApprox(back, hex);
        },
      );
    });

    describe('WHEN given a 3-char hex shorthand', () => {
      it('THEN expands to the 6-char form on round-trip', () => {
        const stops = preprocessHexCurve([{ t: 0, color: '#fff' }]);
        const back = oklchToHex(stops[0]![1]);
        expect(back).toBe('#ffffff');
      });
    });
  });

  describe('GIVEN sampleOklchCurve', () => {
    const blackOklch: Oklch = [0, 0, 0];
    const whiteStops = preprocessHexCurve([
      { t: 0, color: '#000000' },
      { t: 0.5, color: '#ffffff' },
    ]);

    describe('WHEN t lands exactly on a stop', () => {
      it('THEN returns the stop value', () => {
        const result = sampleOklchCurve(whiteStops, 0);
        expect(result[0]).toBeCloseTo(blackOklch[0], 3);
      });
    });

    describe('WHEN t is between two stops', () => {
      it('THEN lerps the L channel', () => {
        // Midpoint between black and white in OKLCh L should be ~0.5.
        const result = sampleOklchCurve(whiteStops, 0.25);
        // White is L≈1.0, black is L=0; midpoint ~0.5.
        expect(result[0]).toBeGreaterThan(0.4);
        expect(result[0]).toBeLessThan(0.6);
      });
    });

    describe('WHEN t is past the last stop (wrap)', () => {
      it('THEN wraps back to first stop', () => {
        // t=0.9 with stops at [0, 0.5] — wraps from 0.5 back to 0+1=1.
        const result = sampleOklchCurve(whiteStops, 0.9);
        // Should be partway between white (last stop) and black (first stop wrapped).
        expect(result[0]).toBeGreaterThan(0);
        expect(result[0]).toBeLessThan(1);
      });
    });

    describe('WHEN t is fractional > 1 (modular)', () => {
      it('THEN treats t = t - floor(t) (i.e. wraps modulo 1)', () => {
        const a = sampleOklchCurve(whiteStops, 0.3);
        const b = sampleOklchCurve(whiteStops, 1.3);
        expect(a[0]).toBeCloseTo(b[0], 3);
        expect(a[1]).toBeCloseTo(b[1], 3);
      });
    });
  });

  describe('GIVEN sampleScalarCurve', () => {
    const stops = [
      { t: 0, value: 0 },
      { t: 0.5, value: 1 },
    ];

    describe('WHEN t lands exactly on a stop', () => {
      it('THEN returns that stop value', () => {
        expect(sampleScalarCurve(stops, 0)).toBeCloseTo(0);
      });
    });

    describe('WHEN t is between two stops', () => {
      it('THEN linearly interpolates', () => {
        expect(sampleScalarCurve(stops, 0.25)).toBeCloseTo(0.5);
      });
    });

    describe('WHEN t wraps past the last stop', () => {
      it('THEN interpolates last → first across the wrap', () => {
        // At t=0.5 we have value=1; first stop is value=0 at t=0 (wraps to 1).
        // At t=0.75 (midway through the wrap) value should be 0.5.
        expect(sampleScalarCurve(stops, 0.75)).toBeCloseTo(0.5);
      });
    });

    describe('WHEN t is negative (defensive)', () => {
      it('THEN treats it modulo 1 (e.g. -0.25 == 0.75)', () => {
        const a = sampleScalarCurve(stops, 0.75);
        const b = sampleScalarCurve(stops, -0.25);
        expect(a).toBeCloseTo(b);
      });
    });
  });

  describe('GIVEN preprocessHexCurve', () => {
    describe('WHEN converting stops', () => {
      it('THEN preserves t values exactly', () => {
        const stops = preprocessHexCurve([
          { t: 0, color: '#000000' },
          { t: 0.25, color: '#ff0000' },
          { t: 0.5, color: '#00ff00' },
          { t: 0.75, color: '#0000ff' },
        ]);
        expect(stops.map(([t]) => t)).toEqual([0, 0.25, 0.5, 0.75]);
      });

      it('THEN returns one entry per input stop', () => {
        const input = [
          { t: 0, color: '#000' },
          { t: 1, color: '#fff' },
        ];
        const out = preprocessHexCurve(input);
        expect(out.length).toBe(input.length);
      });
    });
  });
});
