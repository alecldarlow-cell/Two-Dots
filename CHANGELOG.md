# Changelog

All notable changes to Two Dots are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/) with pre-release suffixes: `-internal`, `-beta`, `-rc`.

---

## [Unreleased]

### Fixed

- **EAS preview/production builds now ship with Supabase env vars** (`eas.json`): added `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to both profiles' `env` sections. Previously the EAS Build cloud had no access to local `.env` (gitignored), so preview APKs distributed to testers shipped with `extra.supabaseUrl: undefined`. The supabase client threw "Supabase env missing" on every flush, errors were silently caught upstream in the analytics queue and leaderboard hooks, and no tester data ever reached Supabase. Confirmed via `select device_id, count(*) from analytics_events` returning a single dev-device row. Anon key is safe to commit — RLS is the security boundary, JWT decodes to `"role":"anon"`.

### Added

- **Telemetry instrumentation + KPI dashboard** (session 10, branch `feat/telemetry-instrumentation`):
  - `AudioEvent` `close-call` extended with `side: 'L' | 'R'` so the analytics layer can attribute close-calls per dot. Engine emission sites in `src/features/game/engine/step.ts:153,160` updated.
  - `RunEndEvent` (`src/features/analytics/events.ts`) extended with `timeToDeathMs` (run-start to death) and `closeCallsInRun` (per-run close-call counter). Serialiser writes both into the existing JSONB payload — no schema migration needed for the events table.
  - `useGameLoop.ts` now tracks `runStartTimeRef` and `closeCallsInRunRef`, both reset on every idle→playing transition. The close-call analytics emission was previously absent — wiring added in `playAudioEvent` so each engine-emitted close-call now writes a row to `analytics_events`. Death side-effect populates the new `run_end` payload fields.
  - `supabase/migrations/004_analytics_kpi_views.sql` adds three aggregate-only views (`kpi_overview`, `kpi_drop_off_by_tier`, `kpi_retention`) with `SELECT` granted to `anon`. `analytics_events` itself stays service-role-read-only — the views are the only public surface, and they expose only counts / rates / histograms, never per-event row data.
  - `docs/dashboard.html` — static HTML KPI dashboard served alongside `docs/privacy.html` on GitHub Pages. Dark theme matching the game palette. KPI cards (total runs, retry rate %, mean run length, close-calls/run, total devices, D1 / D7 retention, sessions) each show their value alongside an industry-benchmark target threshold (Adjust 2026 / GameAnalytics arcade / Tenjin 2025 sourced inline). Drop-off-by-tier bar chart powered by Chart.js. Reads via the public Supabase URL + anon key.
  - `serialise.test.ts` updated for the extended `RunEndEvent` payload (still 7 tests, all green).
- `assets/fonts/SpaceMono-Regular.ttf` and `assets/fonts/SpaceMono-Bold.ttf` bundled locally (~98 KB each, downloaded from `google/fonts`).
- **Stage 5 first-pass refactor** (session 9): `src/app/index.tsx` split from 1540 lines (monolith) to ~278 lines (orchestrator only) — beats PLAN.md's <300-line target. 11 new files under `src/app/`:
  - `_shared/constants.ts`, `_shared/snapshot.ts`, `_shared/styles.ts` — pure data + types + stylesheet shared across all screens.
  - `_canvas/Dot.tsx`, `_canvas/PipeScanlines.tsx`, `_canvas/TitleBloom.tsx`, `_canvas/GameCanvas.tsx` — Skia primitives + the wrapping `<Canvas>` with the full in-game visual layer.
  - `_overlays/IdleScreen.tsx`, `_overlays/PlayingHUD.tsx`, `_overlays/DeathScreen.tsx` — phase-specific RN overlay components.
  - `_hooks/useGameLoop.ts` — encapsulates 9 refs, gsRef + display state, audio loading, the rAF physics+render loop, the death side-effect, and the multi-touch handler. Returns `{ display, handleTouch, bestScore, wasNewBest }`.
  - Underscore prefix on subdirectories signals "not a route" to expo-router.
  - Engine tests stayed green throughout the four extraction groups (124 passing). Lint and typecheck clean at every gate.
  - Deeper second-pass items (gsRef pattern rework, audio module extraction, constants regrouping, supabase type-gen) deferred until tester feedback informs them.
- **Stage 3.1 EAS preview pipeline validated** (session 9): EAS CLI installed + logged in as `smellyoldog`, project initialised (`projectId 5a274a99-3b35-4261-b7fc-da1895d17847`), `expo-updates` wired in via `eas update:configure`. First preview APK built end-to-end and sideload-tested on Pixel 7: gameplay, SFX, score persistence, death sequence, retry flow all match the dev build identically.
- **`.npmrc`** with `legacy-peer-deps=true` — durable fix for the `@testing-library/react-native ^12.5.0` peer-dep conflict. Applies to local installs, EAS Build cloud, and any future CI without anyone needing to remember the `--legacy-peer-deps` flag.
- **`expo-updates`** installed and configured — required for the channel reference in `eas.json`'s preview/production profiles. Wires `app.config.ts > expo.updates.url` automatically.
- **Play Console submission docs** added to repo root:
  - `play-console-listing.md` — short + full descriptions, content-rating questionnaire pre-filled answers, Data Safety form pre-filled answers, listing prep checklist.
  - `PLAY_CONSOLE_PLAYBOOK.md` — step-by-step click-by-click walkthrough from "verification clears" through "tester installs and plays".
  - `play-console-assets/` folder with `README.md` (asset inventory + screenshot copy commands), `feature-graphic.html` (1024×500 source for the feature graphic; PNG export via Chrome DevTools), and `app-icon.html` (1024×1024 sources for `icon.png` + `adaptive-icon.png`; one-click PNG download via embedded buttons).
- **`docs/privacy.html`** — privacy policy live at https://alecldarlow-cell.github.io/Two-Dots/privacy.html (GitHub Pages serving from `main` branch `/docs` folder; repo made public to enable Pages on free GitHub tier).

### Changed

- `src/app/_layout.tsx`: Space Mono now loads from local `require()` instead of fetching from `raw.githubusercontent.com` at runtime. App now renders correct typography on first launch with no network — works in airplane mode and removes a flaky-wifi failure mode for App Store reviewers.
- `src/app/index.tsx` `idleWord` style: `letterSpacing` reduced from 4 to 2 (Stage 2.2 P1-14 polish). At sx(60) bold the wider kerning made each character read independently; the tightened spacing groups TWO and DOTS so each word reads as a single unit on the idle screen. Cross-lane shadow ghost retained.
- `assets/icon.png` and `assets/adaptive-icon.png` regenerated from `play-console-assets/app-icon.html` — replaces the blank `#07070f` placeholders that were causing the installed app to show no icon. Icons feature the orange + cyan dots motif on the dark background, matching the in-game lane-colour identity.
- `eas.json`: empty `submit.production.ios.{appleId,ascAppId,appleTeamId}` fields removed — they failed schema validation in `eas init`. Will be re-added when iOS submission is set up.
- `app.config.ts`: `extra.eas.projectId` populated with the registered EAS project ID.
- Repository visibility changed from private → public (required for free-tier GitHub Pages serving the privacy policy). Audit confirmed no secrets in code or git history.

### Removed

- Dead `app/_layout.tsx` and `app/index.tsx` (an old debug stub from S2). The live entry point is `src/app/`, which `babel-preset-expo` auto-resolves via `EXPO_ROUTER_APP_ROOT`.

### Fixed

- `git-audit.bat` section 8: the original `findstr /V` pipe failed when the script was launched from PowerShell. Replaced with a simpler binary-archive scan that's PowerShell-safe.
- **Stage 2.1 audit P1 fixes** — bug audit shipped: `BUG_AUDIT.md` lists every finding with status. Cleared all mechanical typecheck and lint failures:
  - Deleted unused `WALL_L` constant.
  - Added `?? 0x08` fallback on `laneAlpha` to satisfy `noUncheckedIndexedAccess`.
  - Added null-guard on `changedTouches[i]` in multi-touch handler.
  - Added `id` field to all 5 Pipe fixtures in `step.test.ts`.
  - Replaced 4× `any` in crypto polyfill with a local `CryptoLike` type.
  - Updated ESLint `no-unused-vars` to honor `^_` for variables, not just args.
  - Captured `sounds.current` into local `soundsMap` in audio preload effect (cleanup now ESLint-safe).
  - Added stable `replay` to game-loop `useEffect` deps.
  - Bridged Supabase `analytics_events.insert` type mismatch with `as never` cast + TODO marker pending `supabase gen types`.
- Prettier-formatted 18 documentation and source files.

### Known issues (still open)

- **P0-1**: Skia `Path.Make()` allocated per-frame in `PipeScanlines` and `Dot.strokeCircle` — needs verification + memoization. Subagent finding from audit.
- **P1-10..P1-14**: engine, render, leaderboard, and UX findings from the audit subagent / device screenshot — see `BUG_AUDIT.md`.

---

## [0.1.0-pre-eas] — 2026-04-27

First tagged state. Marks the cut-over from "build the game" to "ship the game". Everything below this line was the work of sessions 1–7.

### Added

- Full game implementation (idle, playing, dead phases) running at 60 fps on Pixel 7 via dev client.
- Skia rendering layer for dots, pipes, particles, divider glow, title bloom, overlays.
- React Native HUD layer for score, milestone pop, idle text, pause overlay, death overlay.
- Pure-TS engine: `stepPlaying`, `stepDead`, `handleTap`, tier math, spawn, collision (90 tests).
- Persistence layer: Supabase + React Query for scores, devices, analytics events (32 tests).
- Analytics queue with offline retry and Phase 1 retry-rate gate computation (16 tests).
- Audio system: 16 pre-generated WAV files via `expo-av`, all SFX wired.
- Space Mono Bold typography loaded via `expo-font` (currently URI-based from GitHub CDN).
- Visual polish pass matching the canonical HTML prototype.

### Known issues (deferred to subsequent releases)

- Space Mono TTF loaded from GitHub raw CDN at runtime — not yet bundled locally.
- ~10 TypeScript `never` errors in Supabase leaderboard hooks (hand-written `types.ts` is stale).
- Milestone pop drift uses a linear easing curve; prototype uses a slightly different curve.
- Lane background alpha during dead phase fades differently from the prototype.

[Unreleased]: https://github.com/YOUR-ORG/two-dots/compare/v0.1.0-pre-eas...HEAD
[0.1.0-pre-eas]: https://github.com/YOUR-ORG/two-dots/releases/tag/v0.1.0-pre-eas
