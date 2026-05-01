// Note: usePersonalBest and useTopScores are wired but currently have no
// UI consumer — they're scaffolded for the future leaderboard view.
// useSubmitScore still invalidates their query keys on success so the
// data is fresh when a consumer wires up. If you decide a leaderboard UI
// is out of scope, both hooks (and the invalidation calls in
// useSubmitScore) can be removed.

export { useSubmitScore, __submitScoreImplForTests } from './useSubmitScore';
export type { SubmittedScore } from './useSubmitScore';
export {
  usePersonalBest,
  personalBestQueryKey,
  __fetchPersonalBestForTests,
} from './usePersonalBest';
export { useTopScores, topScoresQueryKey, __fetchTopScoresForTests } from './useTopScores';
