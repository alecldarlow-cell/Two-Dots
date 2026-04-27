# Changelog

All notable changes to Two Dots are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/) with pre-release suffixes: `-internal`, `-beta`, `-rc`.

---

## [Unreleased]

### Added
- `CHANGELOG.md` (this file).
- `CONTRIBUTING.md` describing branch model, commit conventions, and release process.
- `.github/PULL_REQUEST_TEMPLATE.md` with a PR checklist.
- `git-audit.bat` script for verifying git hygiene before each release tag.

### Changed
- _(nothing yet)_

### Fixed
- _(nothing yet)_

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
