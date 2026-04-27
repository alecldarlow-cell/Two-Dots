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
