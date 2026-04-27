import { describe, expect, it } from 'vitest';
import { scoreSubmissionSchema } from '../schemas/scoreSubmission';

const validInput = {
  deviceId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  score: 42,
  tier: 5,
  deathSide: 'L' as const,
};

describe('scoreSubmissionSchema', () => {
  describe('GIVEN a valid payload', () => {
    it('WHEN validated THEN passes', async () => {
      await expect(scoreSubmissionSchema.validate(validInput)).resolves.toMatchObject(
        validInput,
      );
    });
  });

  describe('GIVEN an invalid deviceId', () => {
    it('WHEN not a UUID THEN rejects', async () => {
      await expect(
        scoreSubmissionSchema.validate({ ...validInput, deviceId: 'not-a-uuid' }),
      ).rejects.toThrow();
    });
  });

  describe('GIVEN an out-of-range score', () => {
    it.each([-1, 10001, 99999])('THEN rejects %d', async (score) => {
      await expect(scoreSubmissionSchema.validate({ ...validInput, score })).rejects.toThrow();
    });
    it('WHEN negative THEN rejects', async () => {
      await expect(
        scoreSubmissionSchema.validate({ ...validInput, score: -5 }),
      ).rejects.toThrow();
    });
    it('WHEN non-integer THEN rejects', async () => {
      await expect(
        scoreSubmissionSchema.validate({ ...validInput, score: 42.5 }),
      ).rejects.toThrow();
    });
  });

  describe('GIVEN an out-of-range tier', () => {
    it.each([0, 9, -1])('THEN rejects %d', async (tier) => {
      await expect(scoreSubmissionSchema.validate({ ...validInput, tier })).rejects.toThrow();
    });
  });

  describe('GIVEN deathSide', () => {
    it('WHEN empty string THEN accepts (out-of-bounds death)', async () => {
      await expect(
        scoreSubmissionSchema.validate({ ...validInput, deathSide: '' }),
      ).resolves.toBeDefined();
    });
    it.each(['L', 'R', 'both'])('WHEN %s THEN accepts', async (deathSide) => {
      await expect(
        scoreSubmissionSchema.validate({ ...validInput, deathSide }),
      ).resolves.toBeDefined();
    });
    it('WHEN invalid value THEN rejects', async () => {
      await expect(
        scoreSubmissionSchema.validate({ ...validInput, deathSide: 'Q' }),
      ).rejects.toThrow();
    });
  });

  describe('GIVEN a missing required field', () => {
    it('WHEN score is absent THEN rejects', async () => {
      const { score: _score, ...withoutScore } = validInput;
      await expect(scoreSubmissionSchema.validate(withoutScore)).rejects.toThrow();
    });
  });
});
