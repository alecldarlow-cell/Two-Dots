# Changelog

All notable changes to Two Dots are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/) with pre-release suffixes: `-internal`, `-beta`, `-rc`.

---

## [Unreleased]

### Added

- `assets/fonts/SpaceMono-Regular.ttf` and `assets/fonts/SpaceMono-Bold.ttf` bundled locally (~98 KB each, downloaded from `google/fonts`).

### Changed

- `src/app/_layout.tsx`: Space Mono now loads from local `require()` instead of fetching from `raw.githubusercontent.com` at runtime. App now renders correct typography on first launch with no network — works in airplane mode and removes a flaky-wifi failure mode for App Store reviewers.

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
