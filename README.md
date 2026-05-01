# Two Dots

A dual-control minimalist reflex game. Each lane has a dot falling under gravity; taps on the left or right send the corresponding dot upward. Thread both dots through the shared gap in every pipe. A death ends the run; the retry pill appears immediately.

**Status:** v0.3-worlds shipped, audio fixed, full audit pass complete. Fully playable Skia-rendered game with three worlds (Moon → Earth → Jupiter at gates 0 / 10 / 20), audio + haptics wired via expo-audio, persistent best score, analytics queue. Verified on Pixel 7 via EAS preview build.

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
src/
  app/                        — expo-router app dir
    _layout.tsx               — root layout: fonts + analytics bootstrap + global Text-scale cap
    index.tsx                 — GameScreen orchestrator (~280 lines after Stage 5 split)
    providers.tsx             — QueryClient + GestureHandler + SafeArea
    _shared/                  — constants, DisplaySnapshot, StyleSheet
    _canvas/                  — Skia: Dot, GameCanvas, WorldRenderer, TitleBloom, PipeScanlines
    _overlays/                — RN Views: IdleScreen, PlayingHUD, DeathScreen
    _hooks/                   — useGameLoop, useCurrentPlanet, useWorldTod
  features/
    game/
      engine/                 — pure TS, no React. step, tiers, spawn, collision, state, constants
      world/                  — themes (moon, earth, jupiter), cycle profile easing, OKLCh colour utils, schema types
    leaderboard/
      api/                    — React Query hooks against Supabase (useSubmitScore is wired; usePersonalBest + useTopScores are scaffold awaiting UI consumer)
      schemas/                — Yup validation
      hooks/                  — useDeviceId
    analytics/                — event catalogue, serialiser, offline queue, retry-rate compute
    monetisation/             — facade hook; ads/IAP deliberately deferred to Phase 2
    ads/                      — empty stub, see README
    iap/                      — empty stub, see README
  shared/
    supabase/                 — client singleton + DB types
    storage/                  — AsyncStorage wrapper with typed keys
    utils/                    — rng (seedable mulberry32; canonical implementation, used by both engine spawn and world renderer)

assets/
  fonts/                      — Fraunces-Regular, Fraunces-Bold (.ttf, bundled locally)
  sounds/                     — 16 .wav files (jumps, blips, chords, close-call, death)
  icon.png, adaptive-icon.png, splash.png

supabase/
  migrations/                 — raw SQL files applied via Supabase dashboard
    001_devices.sql
    002_scores.sql            — includes personal_bests + top_scores views
    003_analytics_events.sql  — Phase 1 gate instrumentation
    004_analytics_kpi_views.sql                — superseded by 005
    005_kpi_functions_and_invoker_views.sql    — current public-aggregate surface

docs/
  analytics.md                — SQL queries for the Phase 1 retry-rate gate
  dashboard.html              — read-only KPI dashboard (calls Supabase RPCs)
  privacy.html                — privacy policy (served via GitHub Pages)

WORLD_SYSTEM.md               — world-renderer schema doc (v0.3 → v0.7 evolution)
HANDOFF.md                    — historical handover snapshot (note: pre-v0.3-worlds, due for refresh)
CHANGELOG.md, CONTRIBUTING.md, .github/PULL_REQUEST_TEMPLATE.md
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

Pure-TS logic is tested with Vitest. Run `npm test` for the live count and pass/fail summary; `npm run test:coverage` produces the coverage report. As of the post-audit refactor pass, suites cover:

```
src/features/game/engine/__tests__/
  tiers.test.ts         — tier boundaries, gap/speed/pause curves, gateInTier
  collision.test.ts     — circleRect, dotHitsPipe, isCloseCall, isOutOfBounds
  spawn.test.ts         — pipeGapCY patterns, reachability clamp, deterministic sequences
  step.test.ts          — phase transitions, scoring, milestone events, death sequence
src/features/game/world/__tests__/
  cycle.test.ts         — applyCycleProfile (atmospheric / airless), plateau anchors, monotonicity
  color.test.ts         — OKLCh round-trip, sampleOklchCurve, sampleScalarCurve, modular wrap
src/features/analytics/__tests__/
  retryRate.test.ts     — Phase 1 gate computation against curated event sequences
  serialise.test.ts     — event-shape → DB-column mapping
src/features/leaderboard/__tests__/
  scoreSubmission.test.ts — Yup schema acceptance / rejection paths
src/shared/utils/__tests__/
  rng.test.ts           — mulberry32 determinism + distribution
src/app/_hooks/__tests__/
  useCurrentPlanet.test.ts — planetForScore boundary mapping (gates 0/9/10/19/20/21+)
```

**Not directly tested (factual current state):**

- The four custom React hooks themselves — see "Hook-test policy" below.
- Skia render components — visual correctness verified on-device only.
- E2E flows (Maestro YAML) — core-path flow (idle → first run → death → retry) in progress, not yet landed.

### Hook-test policy

The four custom hooks (`useGameLoop`, `useDeviceId`, `useWorldTod`, `useCurrentPlanet`) deliberately have no `@testing-library/react-native` integration tests at this stage. The org spec §4.3 says "test hooks separately"; we honour that partially — pure functions inside hooks are tested directly — and defer the rest with explicit re-trigger conditions.

**Why deferred:**

- **Pure logic inside hooks is tested.** `planetForScore` (extracted from `useCurrentPlanet`) has direct coverage. `applyCycleProfile` + `cycleProfileWeights` (the math `useWorldTod` consumes) have direct coverage. Engine math throughout is covered. Where hook logic is purifiable, it has been.
- **The remaining hook bodies are integration glue** — refs, `useEffect`s, audio loading, the rAF lifecycle, Supabase calls, AppState handling. Mocking the dependencies (`expo-audio`, `expo-haptics`, AsyncStorage, the engine, the Supabase client, `AppState`) for hook-mounting tests buys low-confidence coverage at high maintenance cost — the mocks would need to track every API-surface change in those libraries.
- **Integration regressions in this codebase are visible on-device.** Audio not playing, dots not moving, screen not updating, score not persisting — none of those modes slip past a working pure-function test suite undetected; they're caught the moment the APK is sideloaded. The Phase 1 cohort will exercise the hook surface harder than any reasonable mock could simulate.

**Add hook tests when any of the following becomes true:**

1. A regression appears in hook integration that pure-function tests didn't catch — that's the canary that mocks are now worth maintaining.
2. A new non-trivial hook is added with logic that can't reasonably be extracted as a pure function.
3. Before Phase 2 public launch — shipping past friends-and-family scope raises the bar on regression discipline.

This is a deliberate deferral, not an oversight. Recorded here, in the Confluence handover doc §6, and tracked as task #27.

### Test pattern

Follows the org spec §4.3:

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

| Deviation                            | Reason                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No FastAPI backend                   | Two Dots is a mobile game. §9 of tech-requirements names Supabase as the production target. The dev-time Postgres/Docker/Alembic pattern is shaped for SaaS, which this isn't.                                               |
| Mobile-only repo, no monorepo        | §3.1 describes the monorepo for backend-paired products. §1.3 allows mobile in a separate repo. No backend means no monorepo.                                                                                                |
| No SQLAlchemy ORM                    | §1.4 mandates SQLAlchemy ORM models. No Python service means no ORM layer to write — the Supabase JS client is the data-access layer. Same root cause as "no FastAPI backend."                                               |
| No Alembic migrations                | §1.4 mandates Alembic for every schema change. Two Dots ships raw `.sql` files in `supabase/migrations/` applied via the Supabase dashboard. Alembic is a Python migration tool; with no Python it'd be dead infra.          |
| No Docker / Docker Compose           | §1.5 requires Docker for all services + Compose for local dev. Two Dots builds via Expo + EAS (cloud). The dev-time Docker pattern is shaped for the FastAPI+Postgres+Frontend trifecta; mobile-only has nothing to compose. |
| Maestro (not Playwright) for E2E     | §4.4 specifies Playwright; Playwright doesn't support React Native. Maestro is the mobile equivalent. Still device-runnable in CI.                                                                                           |
| Skia (not RN Game Engine) for render | Business case mentioned RN Game Engine. The HTML prototype is Canvas2D imperative — Skia is a direct port. RNGE is a React component tree per entity, which would require rewriting the game loop from scratch.              |
| Engine mutates state in place        | Functional-style per-frame copy would allocate ~8 objects/frame at 60fps. Not worth the GC pressure for a pure-logic module with one call site. Mutation is contained; the boundary is tested via effects-as-data.           |

---

## The Phase 1 gate — how we know when to ship or kill

Per the Two Dots research page in Confluence (page ID 40075295):

> 70%+ of testers return unprompted to play again after dying.

This is measured, not felt. After a cohort of 20–30 testers has played for a week:

1. Run the cohort query in `docs/analytics.md`
2. If rate ≥ 70%, promote to Phase 2: polish, monetisation, wider invite
3. If rate < 70%, kill or pivot. Do not throw more effort at a mechanic that isn't hooking

`features/analytics/retryRate.ts` has the same computation in JS so we can sanity-check against the SQL.
