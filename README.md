# Two Dots

A dual-control minimalist reflex game. Each lane has a dot falling under gravity; taps on the left or right send the corresponding dot upward. Thread both dots through the shared gap in every pipe. A death ends the run; the retry pill appears immediately.

**Status:** S2 scaffold + engine port + persistence layer (no renderer yet). First playable build (S3) needs Skia wired on a development build.

**Gate this project exists to validate:** 70%+ unprompted retry behaviour across 20–30 testers on TestFlight + Play Internal Testing. See `docs/analytics.md`.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Set up Supabase (see Supabase setup below)
cp .env.example .env
# edit .env with your Supabase URL and anon key

# 3. Run the dev client (iOS simulator or Android emulator)
npm run ios
# or
npm run android
```

You need a dev client build, not Expo Go — `@shopify/react-native-skia` is a native module. First run of `npm run ios`/`android` produces the dev client; subsequent runs just start the bundler.

---

## Scripts

```bash
npm start            # bundler only
npm run ios          # build + run iOS dev client
npm run android      # build + run Android dev client
npm run lint         # eslint, fails on any warning
npm run format       # prettier --write
npm run format:check # prettier --check (CI)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (engine + pure-TS tests)
npm run test:watch
npm run test:coverage
```

All four of `lint`, `typecheck`, `test`, and `format:check` must pass in CI before merge. Per `../technical-requirements.md` §4.1.

---

## Architecture

Single mobile-only repo (not a monorepo). The "backend" is Supabase — no FastAPI service. See `../technical-requirements.md` §9; Supabase is the documented production end-state for auth + DB, and Two Dots is not a SaaS product so the dev-time local-Postgres pattern doesn't pay back here.

### Feature-first layout

```
app/                          — expo-router entry
  _layout.tsx                 — providers + analytics bootstrap
  index.tsx                   — GameScreen (S2 placeholder)

src/
  features/
    game/
      engine/                 — pure TS, no React. Tier math, spawn, collision, step.
      components/             — Skia render layer (S3, not yet built)
      hooks/                  — useGameLoop, useTapInput, useAudio, useHaptics (S3)
    leaderboard/
      api/                    — React Query hooks against Supabase
      schemas/                — Yup validation
      hooks/                  — useDeviceId
    analytics/                — event catalogue, serialiser, offline queue, retry-rate compute
    monetisation/             — facade hook; ads/IAP deliberately deferred to Phase 2
    ads/                      — empty stub, see README
    iap/                      — empty stub, see README
  shared/
    supabase/                 — client singleton + DB types
    storage/                  — AsyncStorage wrapper with typed keys
    utils/                    — rng (seedable mulberry32)
  app/
    providers.tsx             — QueryClient + GestureHandler + SafeArea

supabase/
  migrations/                 — SQL files applied in Supabase dashboard
    001_devices.sql
    002_scores.sql            — includes personal_bests and top_scores views
    003_analytics_events.sql  — Phase 1 gate instrumentation

docs/
  analytics.md                — SQL queries for the Phase 1 retry-rate gate
```

### Engine

Pure TypeScript. No React, no React Native, no DOM. Testable in Node.

The engine owns game state (`GameState` in `state.ts`) and exposes three functions:

- `handleTap(state, tapX, now, visH)` — dispatches taps across idle/playing/dead phases
- `stepPlaying(state, frameInput)` — advances one frame of physics + spawn + collision; returns `FrameEffects` (audio events, haptic events, died/scored flags)
- `stepDead(state)` — advances the death overlay (particles, score count-up)

Effects are data, not callbacks — the renderer translates them into audio/haptics. This is what makes the engine Node-testable.

Determinism is guaranteed when `rng` is seeded via `mulberry32(seed)`. Used in spawn tests to assert the reachability clamp across arbitrary sequences.

### Analytics and the Phase 1 gate

Every death, retry, run start, and session start/end is logged to `analytics_events`. The Phase 1 metric is computed in `features/analytics/retryRate.ts` (JS, runnable in tests) and mirrored in `docs/analytics.md` (SQL, run against live data in the Supabase dashboard). The JS version is the source of truth for the computation.

Events are fire-and-forget. The queue (`features/analytics/queue.ts`) batches in memory, flushes every 5s, and persists failed batches to AsyncStorage so a flaky network doesn't drop signal.

### Monetisation

Deliberately stubbed. `useMonetisation()` returns `hasRemovedAds: true` and no-op functions. Wiring real ads/IAP is Phase 2 work, gated on the Phase 1 retry-rate measurement passing. See `features/ads/README.md` and `features/iap/README.md`.

---

## Supabase setup

1. Create a new project at [supabase.com](https://supabase.com/).
2. In the SQL Editor, run the three files in `supabase/migrations/` in order.
3. From the project settings, copy the URL and anon key into `.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. Verify RLS is enabled on all three tables (`devices`, `scores`, `analytics_events`). The migrations enable it; double-check in the Supabase dashboard's Table Editor.

The anon key is safe to ship in the mobile bundle — RLS in the DB is the security boundary, not the key.

---

## Testing

Pure-TS logic is tested with Vitest. Engine, analytics math, and schemas have 100% of the critical paths covered.

```
src/features/game/engine/__tests__/tiers.test.ts         (35 tests)
src/features/game/engine/__tests__/collision.test.ts    (16 tests)
src/features/game/engine/__tests__/spawn.test.ts        (16 tests)
src/features/game/engine/__tests__/step.test.ts         (19 tests)
src/features/analytics/__tests__/retryRate.test.ts       (9 tests)
src/features/analytics/__tests__/serialise.test.ts       (7 tests)
src/features/leaderboard/__tests__/scoreSubmission.test (16 tests)
src/shared/utils/__tests__/rng.test.ts                   (4 tests)
———
Total: 122 tests, 98% statement coverage on engine
```

**Not yet tested:**

- React components and hooks — will use `@testing-library/react-native` in S3 (Skia render phase)
- Device smoke tests — Maestro flows, also in S3

The per-frame physics of the engine is validated; it's the render-layer and device integration that still need exercise.

Test pattern follows `../technical-requirements.md` §4.3:

```
describe('GIVEN <condition>', () => {
  describe('WHEN <action>', () => {
    it('THEN <expected outcome>', () => {});
  });
});
```

---

## Distribution

EAS Build profiles are configured in `eas.json`:

- `development` — dev client, internal distribution
- `preview` — release build, internal distribution (TestFlight + Play Internal)
- `production` — store submission

Before first build:

```bash
npm install -g eas-cli
eas login
eas init     # populates projectId in app.config.ts -> extra.eas.projectId
```

Then:

```bash
eas build --profile preview --platform all    # first internal testing build
eas submit --profile production --platform ios    # Apple review (~24h)
eas submit --profile production --platform android --track internal
```

Bundle IDs:

- iOS: `com.newco.twodots`
- Android: `com.newco.twodots`

Both stores require a privacy policy URL. A minimal one disclosing anonymous device ID + Supabase analytics is sufficient.

---

## Deviations from technical-requirements.md

Documented deliberately so the Decisions Log in Confluence can reference them:

| Deviation                            | Reason                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No FastAPI backend                   | Two Dots is a mobile game. §9 of tech-requirements names Supabase as the production target. The dev-time Postgres/Docker/Alembic pattern is shaped for SaaS, which this isn't.                                     |
| Mobile-only repo, no monorepo        | §3.1 describes the monorepo for backend-paired products. §1.3 allows mobile in a separate repo. No backend means no monorepo.                                                                                      |
| Maestro (not Playwright) for E2E     | §4.4 specifies Playwright; Playwright doesn't support React Native. Maestro is the mobile equivalent. Still device-runnable in CI.                                                                                 |
| Skia (not RN Game Engine) for render | Business case mentioned RN Game Engine. The HTML prototype is Canvas2D imperative — Skia is a direct port. RNGE is a React component tree per entity, which would require rewriting the game loop from scratch.    |
| Engine mutates state in place        | Functional-style per-frame copy would allocate ~8 objects/frame at 60fps. Not worth the GC pressure for a pure-logic module with one call site. Mutation is contained; the boundary is tested via effects-as-data. |

---

## The Phase 1 gate — how we know when to ship or kill

Per the Two Dots research page in Confluence (page ID 40075295):

> 70%+ of testers return unprompted to play again after dying.

This is measured, not felt. After a cohort of 20–30 testers has played for a week:

1. Run the cohort query in `docs/analytics.md`
2. If rate ≥ 70%, promote to Phase 2: polish, monetisation, wider invite
3. If rate < 70%, kill or pivot. Do not throw more effort at a mechanic that isn't hooking

`features/analytics/retryRate.ts` has the same computation in JS so we can sanity-check against the SQL.
