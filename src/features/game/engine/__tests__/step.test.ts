import { beforeEach, describe, expect, it } from 'vitest';
import { handleTap, stepDead, stepPlaying } from '../step';
import type { FrameInput } from '../step';
import { initState } from '../state';
import type { GameState } from '../state';
import { DEATH_FREEZE_FRAMES, GRAVITY, JUMP_VY, LANE_L, LANE_R, PIPE_W, W } from '../constants';
import { mulberry32 } from '@shared/utils/rng';

const VIS_H = 700;

function makeInput(overrides: Partial<FrameInput> = {}): FrameInput {
  return {
    now: 1000,
    visH: VIS_H,
    rng: mulberry32(42),
    ...overrides,
  };
}

describe('step', () => {
  let s: GameState;

  beforeEach(() => {
    s = initState();
  });

  describe('GIVEN a fresh state', () => {
    describe('WHEN stepPlaying is called in idle phase', () => {
      it('THEN no physics runs', () => {
        const initialY = s.dotLY;
        stepPlaying(s, makeInput());
        expect(s.dotLY).toBe(initialY);
        expect(s.pipes).toHaveLength(0);
      });
    });

    describe('WHEN handleTap is called in idle phase', () => {
      it('THEN transitions to playing and primes both dots with JUMP_VY', () => {
        const events = handleTap(s, LANE_L, 1000, VIS_H);
        expect(s.phase).toBe('playing');
        expect(s.vyL).toBe(JUMP_VY);
        expect(s.vyR).toBe(JUMP_VY);
        expect(events).toEqual([{ kind: 'tap-start' }]);
      });
      it('THEN resets spawner lastGapCY', () => {
        s.spawner.lastGapCY = 999;
        handleTap(s, LANE_L, 1000, VIS_H);
        expect(s.spawner.lastGapCY).toBeNull();
      });
    });
  });

  describe('GIVEN state is in playing phase', () => {
    beforeEach(() => {
      handleTap(s, LANE_L, 1000, VIS_H);
    });

    describe('WHEN a left-lane tap occurs', () => {
      it('THEN only the left dot jumps', () => {
        s.vyL = 3;
        s.vyR = 3;
        handleTap(s, LANE_L, 1050, VIS_H);
        expect(s.vyL).toBe(JUMP_VY);
        expect(s.vyR).toBe(3);
      });
    });

    describe('WHEN a right-lane tap occurs', () => {
      it('THEN only the right dot jumps', () => {
        s.vyL = 3;
        s.vyR = 3;
        handleTap(s, LANE_R, 1050, VIS_H);
        expect(s.vyL).toBe(3);
        expect(s.vyR).toBe(JUMP_VY);
      });
    });

    describe('WHEN a tap lands within ±22px of the divider', () => {
      it('THEN toggles pause rather than jumping', () => {
        const beforeVyL = s.vyL;
        const beforeVyR = s.vyR;
        const events = handleTap(s, W / 2 + 10, 1050, VIS_H);
        expect(s.paused).toBe(true);
        expect(s.vyL).toBe(beforeVyL);
        expect(s.vyR).toBe(beforeVyR);
        expect(events).toEqual([{ kind: 'tap-pause', paused: true }]);
      });
    });

    describe('WHEN paused and a lane tap occurs', () => {
      it('THEN unpauses without jumping', () => {
        s.paused = true;
        const beforeVyL = s.vyL;
        handleTap(s, LANE_L, 1050, VIS_H);
        expect(s.paused).toBe(false);
        expect(s.vyL).toBe(beforeVyL);
      });
    });

    describe('WHEN stepPlaying runs in unpaused state', () => {
      it('THEN applies gravity each frame', () => {
        s.vyL = 0;
        const beforeY = s.dotLY;
        stepPlaying(s, makeInput());
        expect(s.vyL).toBe(GRAVITY);
        expect(s.dotLY).toBeCloseTo(beforeY + GRAVITY, 5);
      });
      it('THEN spawns a pipe on the first step with empty pipe list', () => {
        expect(s.pipes).toHaveLength(0);
        stepPlaying(s, makeInput());
        expect(s.pipes).toHaveLength(1);
      });
    });

    describe('WHEN paused', () => {
      it('THEN stepPlaying does not apply physics', () => {
        s.paused = true;
        s.vyL = 0;
        const beforeY = s.dotLY;
        stepPlaying(s, makeInput());
        expect(s.dotLY).toBe(beforeY);
      });
    });
  });

  describe('GIVEN the dot hits a pipe', () => {
    it('WHEN collision occurs THEN phase transitions to dead and emits effects', () => {
      handleTap(s, LANE_L, 1000, VIS_H);
      // Force-spawn a pipe exactly at the left lane with an impossibly small gap.
      s.pipes = [
        {
          x: LANE_L,
          pauseUntil: 0, // pre-expired
          gapCY: 0,
          gap: 10, // tiny gap nowhere near the dot
          speed: 0,
          scored: false,
          clearFlash: 0,
          closeCalledByL: false,
          closeCalledByR: false,
        },
      ];
      s.dotLY = VIS_H / 2; // dot in middle, gap at top — will collide with bottom segment
      const effects = stepPlaying(s, makeInput());
      expect(effects.died).toBe(true);
      expect(s.phase).toBe('dead');
      expect(effects.audio).toContainEqual({ kind: 'death' });
      expect(effects.haptics).toContainEqual({ kind: 'death' });
    });
  });

  describe('GIVEN a dot falls out of bounds', () => {
    it('WHEN dot Y exceeds visH THEN phase transitions to dead', () => {
      handleTap(s, LANE_L, 1000, VIS_H);
      s.dotLY = VIS_H + 10;
      const effects = stepPlaying(s, makeInput());
      expect(effects.died).toBe(true);
      expect(s.phase).toBe('dead');
      expect(s.deathSide).toBe('L');
    });
  });

  describe('GIVEN state is dead', () => {
    beforeEach(() => {
      handleTap(s, LANE_L, 1000, VIS_H);
      s.dotLY = VIS_H + 10;
      stepPlaying(s, makeInput());
      expect(s.phase).toBe('dead');
    });

    describe('WHEN taps come during the freeze window', () => {
      it('THEN are ignored', () => {
        const before = s.phase;
        const events = handleTap(s, LANE_L, 2000, VIS_H);
        expect(s.phase).toBe(before);
        expect(events).toHaveLength(0);
      });
    });

    describe('WHEN stepDead runs enough frames', () => {
      it('THEN deathCountFrames counts down and scoreDisplay increments', () => {
        // Seed a non-zero score so the count-up has something to do.
        s.score = 10;
        s.deathCountFrames = DEATH_FREEZE_FRAMES + 20;
        s.scoreCountFrames = 20;
        // Run past the freeze window.
        for (let i = 0; i < DEATH_FREEZE_FRAMES; i++) stepDead(s);
        // Now we're in the count-up phase.
        const midway = Math.floor(s.scoreCountFrames / 2);
        for (let i = 0; i < midway; i++) stepDead(s);
        expect(s.scoreDisplay).toBeGreaterThan(0);
        expect(s.scoreDisplay).toBeLessThanOrEqual(s.score);
      });
    });

    describe('WHEN tap comes after freeze window and count-up complete', () => {
      it('THEN resets for a new run', () => {
        s.deathCountFrames = 0;
        s.scoreCountFrames = 0;
        s.score = 10;
        handleTap(s, LANE_L, 3000, VIS_H);
        expect(s.phase).toBe('playing');
        expect(s.score).toBe(0);
      });
    });
  });

  describe('GIVEN scoring', () => {
    it('WHEN a pipe passes the left lane THEN score increments and scored flag sets', () => {
      handleTap(s, LANE_L, 1000, VIS_H);
      s.pipes = [
        {
          x: LANE_L - 50, // already past left lane
          pauseUntil: 0,
          gapCY: VIS_H / 2,
          gap: 500, // huge gap — won't collide with dots
          speed: 0,
          scored: false,
          clearFlash: 0,
          closeCalledByL: false,
          closeCalledByR: false,
        },
      ];
      const effects = stepPlaying(s, makeInput());
      expect(s.score).toBe(1);
      expect(effects.scored).toBe(true);
      const scoredPipe = s.pipes[0];
      if (!scoredPipe) throw new Error('pipe should still exist');
      expect(scoredPipe.scored).toBe(true);
      expect(effects.audio.some((e) => e.kind === 'score-blip')).toBe(true);
    });

    it('WHEN score hits a tier boundary THEN fires tier-boundary-chord audio', () => {
      handleTap(s, LANE_L, 1000, VIS_H);
      s.score = 4; // next score will be 5 — tier 2 boundary
      s.pipes = [
        {
          x: LANE_L - 50,
          pauseUntil: 0,
          gapCY: VIS_H / 2,
          gap: 500,
          speed: 0,
          scored: false,
          clearFlash: 0,
          closeCalledByL: false,
          closeCalledByR: false,
        },
      ];
      const effects = stepPlaying(s, makeInput());
      expect(s.score).toBe(5);
      expect(effects.audio.some((e) => e.kind === 'tier-boundary-chord')).toBe(true);
      expect(effects.haptics.some((e) => e.kind === 'milestone')).toBe(true);
    });

    it('WHEN score hits a non-boundary multiple of 5 THEN fires every-five-chime', () => {
      // Score 40 is a multiple of 5 but also a Survival speed-step — should still emit every-five-chime
      // since it is not in [5,10,15,20,25,30,35].
      handleTap(s, LANE_L, 1000, VIS_H);
      s.score = 39;
      s.pipes = [
        {
          x: LANE_L - 50,
          pauseUntil: 0,
          gapCY: VIS_H / 2,
          gap: 500,
          speed: 0,
          scored: false,
          clearFlash: 0,
          closeCalledByL: false,
          closeCalledByR: false,
        },
      ];
      const effects = stepPlaying(s, makeInput());
      expect(s.score).toBe(40);
      expect(effects.audio.some((e) => e.kind === 'every-five-chime')).toBe(true);
    });
  });

  describe('GIVEN pipes leave the screen', () => {
    it('WHEN a pipe drifts fully off-left THEN it is culled from the array', () => {
      handleTap(s, LANE_L, 1000, VIS_H);
      const offscreenPipe = {
        x: -200, // well off-screen left
        pauseUntil: 0,
        gapCY: VIS_H / 2,
        gap: 300,
        speed: 0,
        scored: true, // already scored — culling test only
        clearFlash: 0,
        closeCalledByL: false,
        closeCalledByR: false,
      };
      s.pipes = [offscreenPipe];
      stepPlaying(s, makeInput());
      // The off-screen pipe must no longer be in the array.
      // (A new pipe may have spawned in its place — that's expected, since the
      // rightmost pipe at x=-200 is well past PIPE_SPACING from the right edge.)
      expect(s.pipes).not.toContain(offscreenPipe);
      for (const p of s.pipes) {
        expect(p.x + PIPE_W / 2).toBeGreaterThan(0);
      }
    });
  });
});
