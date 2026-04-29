# Two Dots — Bug Audit (Stage 2.1)

_Started 27 Apr 2026, end of session 7. Updated as findings come in._

This file captures every issue found during the pre-submission audit. Each finding gets a status: **fix-now** (P0), **fix-this-stage** (P1), **defer** (P2), or **wontfix**.

The goal is not to fix everything — the goal is to know what's broken so we ship deliberately.

---

## Static checks — summary

| Check     | Command                | Result                               |
| --------- | ---------------------- | ------------------------------------ |
| Tests     | `npm test`             | ✅ 122 / 122 passing                 |
| Typecheck | `npm run typecheck`    | ❌ 9 errors in 3 files               |
| Lint      | `npm run lint`         | ❌ 6 errors, 2 warnings              |
| Format    | `npm run format:check` | ⚠️ 18 files need prettier (cosmetic) |

---

## P0 — fix before ship (anything below blocks release)

| #    | Source   | Area   | Description                                                                                                                                                        | Action                                                                                                                      |
| ---- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | Subagent | Render | `PipeScanlines` and `Dot.strokeCircle` allocate `Skia.Path.Make()` on every frame. Hundreds of line segments per pipe per frame. Sustained-run memory growth risk. | Memoize paths via `useMemo` or hoist to module-scope constants where geometry is static. **Needs verification** before fix. |

---

## P1 — fix this stage

### From typecheck (9 errors, 3 files)

| #    | File:Line                                                                             | Description                                                                                                                                                                                             | Fix sketch                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 | `src/app/index.tsx:85`                                                                | `WALL_L` declared but never read (also flagged by lint)                                                                                                                                                 | Delete the unused constant                                                                                                         |
| P1-2 | `src/app/index.tsx:387`                                                               | `laneAlpha` is `number \| undefined`; `alphaHex` expects `number`                                                                                                                                       | Provide default: `alphaHex(laneAlpha ?? 0)` or assert non-undefined upstream                                                       |
| P1-3 | `src/app/index.tsx:462`                                                               | `changedTouches[i]` possibly undefined under `noUncheckedIndexedAccess`                                                                                                                                 | Add null guard: `const t = changedTouches[i]; if (!t) continue;`                                                                   |
| P1-4 | `src/features/analytics/queue.ts:99`                                                  | Supabase insert payload type mismatch — `PendingEvent.payload: Record<string, unknown> \| null` doesn't satisfy `Json \| undefined`                                                                     | Either regenerate Supabase types via `supabase gen types` (handoff mentions this), or cast `batch as never` as a deliberate bridge |
| P1-5 | `src/features/game/engine/__tests__/step.test.ts` (5 places: 131, 213, 238, 262, 294) | Test fixtures construct `Pipe` objects missing the `id` field. Tests pass at runtime because `pipe.id` is `undefined` and not read by the asserted paths, but TypeScript correctly flags the violation. | Add `id: 0` (or sequential ints) to each fixture                                                                                   |

### From lint (6 errors, 2 warnings)

| #    | File:Line                                                       | Description                                                                                | Fix sketch                                                                                                      |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| P1-6 | `src/app/_layout.tsx:19-23`                                     | 4× `Unexpected any` on the crypto polyfill                                                 | Use `Crypto` type from lib.dom or define a minimal interface; `as { crypto?: { getRandomValues?: ... } }` works |
| P1-7 | `src/features/leaderboard/__tests__/scoreSubmission.test.ts:71` | `_score` unused (the `_` prefix usually exempts it but the rule isn't configured for that) | Either remove the binding or configure ESLint `argsIgnorePattern: '^_'`                                         |
| P1-8 | `src/app/index.tsx:228` (warning)                               | `sounds.current` cleanup pattern: ref value will likely have changed by cleanup time       | Copy `sounds.current` into a local variable inside the effect, use the local in cleanup                         |
| P1-9 | `src/app/index.tsx:286` (warning)                               | `useEffect` missing `replay` dep                                                           | Add `replay` to deps or inline the function                                                                     |

### From subagent code review

| #     | Area        | Description                                                                                                                                                                                                                                    | Status                                                                                                            |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P1-10 | Engine      | `gateInTier()` indexing fragility — relies on `TIER_STARTS[t-1] ?? 0` fallback; if tier boundaries shift the math silently breaks. Currently correct, but undefended.                                                                          | Add bounds check + a property test                                                                                |
| P1-11 | Engine      | `transitionToDead()` _overwrites_ `deathFlashL/R` to `DEATH_FLASH_FRAMES`. If collision had already set them earlier in the frame, they reset rather than extend. Causes a 1-frame visual glitch on simultaneous double-hit deaths.            | Use `Math.max(existing, DEATH_FLASH_FRAMES)` instead of bare assignment                                           |
| P1-12 | Render      | Close-call ring opacity decay vs. death-flash opacity decay differ in feel — close-call expands but stays opaque-ish; death-flash expands AND fades. Prototype reference unverified.                                                           | Open the prototype HTML, capture both states, decide whether to align                                             |
| P1-13 | Leaderboard | Score submission fires inside death-side-effect `useEffect` without awaiting. UI shows death screen instantly; if network is slow, server roundtrip lands after "BEST" text already rendered. Best-score state can race the submission result. | Refactor to: optimistic local update on death, server submission separate, reconcile via React Query invalidation |

### From device smoke tests (Stage 1.2 + Stage 2.1 wave-1)

| #     | Area | Description                                                                                                                                                       | Status                                                                                                                             |
| ----- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P1-14 | UX   | "DOTS" title truncated/wraps on idle screen — Space Mono Bold at 68px overflows the right lane. **Confirmed on iOS AND Pixel 7.** Cross-device, not iOS-specific. | Drop title size 4–6px, or shorten/split the text, or reduce letter-spacing. Verify against the prototype HTML.                     |
| P1-15 | UX   | Tier-progress dot indicator overlaps the pipe-count number. Discovered on Pixel 7 during Stage 2.1 wave-1 smoke test.                                             | Inspect score HUD layout — likely the progress-dots row needs a vertical offset, or the score number's bottom margin is too small. |

---

## P2 — defer

| #     | Area          | Description                                                                                                                           | Reason for deferral                                                                                  |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P2-1  | Render        | `LinearGradient` / `RadialGradient` Skia components recreated per frame (divider, pipes, dots, title). Skia likely caches internally. | Non-idiomatic but no observed perf issue. Memoize during refactor (Stage 5)                          |
| P2-2  | Render        | `dotRadiusEpsilon()` hardcodes 14, coupled to `DOT_R = 14`. If `DOT_R` changes, epsilon goes stale silently.                          | No tests. Add a coupling test in Stage 5                                                             |
| P2-3  | Engine        | Survival pulse fires on `score % 5 === 0 AND tier === 8`. Tier-7→8 transition at score 35 doesn't pulse; only 40 onwards.             | Undocumented; might be intentional. Verify against prototype later                                   |
| P2-4  | Engine        | `buildDeathParticles()` uses `Math.random()` directly instead of `rng`. Particles non-deterministic at the same score across runs.    | Cosmetic only                                                                                        |
| P2-5  | Layout        | Silent font fallback if `useFonts` errors — splash hides anyway, user sees system font with no signal.                                | Local fonts now bundled (Stage 1.2 done), so this only triggers on a corrupted install. Live with it |
| P2-6  | Accessibility | Skia Canvas has `pointerEvents="none"` but no `accessibilityLabel`. Dots/pipes/lanes invisible to screen readers.                     | Address in Stage 2.2 (UX/UI audit)                                                                   |
| P2-7  | Performance   | `snap()` deep-spreads pipes and particles every-other-frame. Quadratic in entity count.                                               | Fine for MVP scores <50; Stage 5 refactor candidate                                                  |
| P2-8  | Types         | `phase` field on `DisplaySnapshot` is set but only used in render — not driving conditionals on the snapshot itself                   | Cosmetic; clean up in Stage 5                                                                        |
| P2-9  | Format        | 18 files have prettier issues — markdown docs I added + a few sources                                                                 | Trivial: run `npm run format`. Bundle into next commit                                               |
| P2-10 | Tooling       | TypeScript `noUncheckedIndexedAccess` is finding real bugs (P1-3). Worth keeping enabled.                                             | Already enabled. Just need to fix the violations                                                     |

---

## Findings table (master log)

| ID          | Severity | Area        | Source               | Status                                                                                                                                                                      |
| ----------- | -------- | ----------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1        | P0       | Render      | Subagent             | ✅ fixed: Dot strokeCircle now uses `<Circle style="stroke">` (no Path); PipeScanlines memoizes path on (w,h), translates via Group transform — pending device verification |
| P1-1        | P1       | Lint+Type   | tsc / lint           | ✅ fixed (deleted `WALL_L`)                                                                                                                                                 |
| P1-2        | P1       | Type        | tsc                  | ✅ fixed (`?? 0x08` fallback on `laneAlpha`)                                                                                                                                |
| P1-3        | P1       | Type        | tsc                  | ✅ fixed (null-guard on `changedTouches[i]`)                                                                                                                                |
| P1-4        | P1       | Type        | tsc                  | ✅ bridged (`as never` cast + TODO for `supabase gen types`)                                                                                                                |
| P1-5        | P1       | Type (×5)   | tsc                  | ✅ fixed (added `id: 0..4` to all 5 Pipe fixtures)                                                                                                                          |
| P1-6        | P1       | Lint (×4)   | lint                 | ✅ fixed (`CryptoLike` local type instead of `any` in `_layout.tsx`)                                                                                                        |
| P1-7        | P1       | Lint        | lint                 | ✅ fixed (`varsIgnorePattern: '^_'` added to ESLint config)                                                                                                                 |
| P1-8        | P1       | Lint warn   | lint                 | ✅ fixed (`soundsMap` local capture in preload effect)                                                                                                                      |
| P1-9        | P1       | Lint warn   | lint                 | ✅ fixed (`replay` added to deps; stable via `useRef.current`)                                                                                                              |
| P1-10       | P1       | Engine      | Subagent             | ✅ fixed (added 2 property tests sweeping scores 0–99)                                                                                                                      |
| P1-11       | P1       | Engine      | Subagent             | ✅ fixed (`Math.max` defensive guard on `deathFlashL/R` extension)                                                                                                          |
| P1-12       | P1       | Render      | Subagent             | ✅ closed session 9 — Alec confirmed close-call ring + death-flash both work fine on device; no prototype side-by-side needed                                              |
| P1-13       | P1       | Leaderboard | Subagent             | deferred — Stage 2.3 (Leaderboard UI) deferred to future feature development; this race condition is moot until that ships                                                  |
| P1-14       | P1       | UX          | Screenshot + Pixel 7 | ✅ fixed (fontSize sx(68)→sx(60); fits screen on Pixel 7). Polish refinement deferred to Stage 2.2 — title still doesn't feel fully resolved aesthetically.                 |
| P1-15       | P1       | UX          | Pixel 7 smoke test   | ✅ fixed (progress-dots gap 22\*SCALE → 56px unscaled) — pending device verification                                                                                        |
| P2-1..P2-10 | P2       | various     | Subagent / Format    | deferred                                                                                                                                                                    |

---

## Decisions log

_Populate as we triage and fix._

- _none yet_

---

## Runtime audit (on device)

_Pending — to be filled after a 5-min long-play session._

| Check                               | Result    | Notes                                             |
| ----------------------------------- | --------- | ------------------------------------------------- |
| 5-min sustained 60 fps              | _pending_ | Watch for frame drops during high pipe count      |
| Memory growth over 5 min            | _pending_ | If P0-1 is real, expect linear growth             |
| Background → foreground 10×         | _pending_ | \_                                                |
| Pause/resume rapid-fire             | _pending_ | Check `expo-av` audio leaks                       |
| Deaths at every tier boundary (1→8) | _pending_ | Verify tier-name display + survival pulse trigger |
