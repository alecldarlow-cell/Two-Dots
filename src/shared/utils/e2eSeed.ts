/**
 * E2E seed — read once from EXPO_PUBLIC_E2E_SEED env var (Expo inlines at
 * build time). When set to a finite integer, the engine's RNG becomes
 * deterministic so pipe layouts are reproducible across runs of the same
 * build.
 *
 * Production builds don't set this var, so E2E_SEED is null and engines
 * use defaultRng (Math.random) — identical to pre-E2E behaviour. Zero
 * runtime cost when null.
 *
 * The seed flows into:
 *   - useGameLoop: wraps mulberry32(seed) and feeds it to stepPlaying.
 *     Recreated on every idle→playing transition so each run has the
 *     same pipe layout (vs. continuous state across runs).
 *   - _layout AnalyticsBootstrap: includes the seed in session_start so
 *     downstream queries can filter to seeded runs only.
 *   - Death-side-effect run_end: attaches captured tap stream + seed to
 *     the run_end payload IF score >= 20 (fixture-worthy threshold).
 *     The Maestro fixture generator queries on (seed, score) to find
 *     replayable sequences.
 *
 * See also: ../../app/_hooks/useGameLoop.ts (rng ref + tap buffer),
 * ../../features/analytics/events.ts (TapsRecord type),
 * tools/generate-maestro-fixture.mjs (the consumer script).
 */

const raw = process.env.EXPO_PUBLIC_E2E_SEED;
const parsed = raw ? parseInt(raw, 10) : NaN;

export const E2E_SEED: number | null = Number.isFinite(parsed) ? parsed : null;
