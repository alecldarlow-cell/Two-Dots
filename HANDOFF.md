# Two Dots — Handoff Notes

_Last updated: end of session 8 (27 Apr 2026). Stages 1.1–2.1 closed; Stage 2.2 ~80% done; live and verified on Pixel 7 via Wi-Fi ADB._

---

## Quick orientation for the next session

Three living docs hold the active state — read them in this order:

1. **`PLAN.md`** — the sequenced roadmap of remaining stages and the open questions for Apple Dev / monetisation / tester pool.
2. **`BUG_AUDIT.md`** — Stage 2.1 audit log; closed and open findings with status.
3. **`UX_AUDIT.md`** — Stage 2.2 audit log; same shape as the bug audit.

`HANDOFF.md` (this file) is the architectural snapshot. `CHANGELOG.md` records every release-bound change. `CONTRIBUTING.md` documents the branch model and pre-commit checks.

---

## Current state

The app is **fully playable, polished, and Stage-2-audited** on a Pixel 7 dev client. Wi-Fi ADB is paired and working (firewall rule `ADB Wireless Debug` opens TCP 37000–44000 inbound).

| Stage                                              | Status                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| S1–S6 (scaffold → engine → persistence)            | ✅ from sessions 1–4                                                                     |
| Phases 1–4 + polish pass                           | ✅ deployed in sessions 5–7                                                              |
| Stage 1.1 — Git process hardening                  | ✅ session 8 (changelog, contributing guide, PR template, `git-audit.bat`)               |
| Stage 1.2 — Bundle Space Mono TTF locally          | ✅ session 8 (no more runtime CDN dependency)                                            |
| Stage 1.3 — Resolve duplicate `app/` vs `src/app/` | ✅ session 8 (dead `app/` removed; `babel-preset-expo` resolves `src/app/`)              |
| Stage 2.1 — Bug audit                              | ✅ session 8 (13 of 17 findings closed; carry-overs deliberately routed)                 |
| Stage 2.2 — UX/UI audit                            | ✅ session 9 (device walkthrough on Pixel 7, idle-title kerning landed, P1-12 closed)   |
| Stage 2.3 — Leaderboard UI on death screen         | 🔵 deferred to future feature development (session 9) — data layer ready, UI not built  |
| Stage 3.1 — EAS Android → Play Internal            | 🟡 in progress; preview APK validated on Pixel 7, icons fixed, listing docs ready, **blocked on Google Play account verification** |
| Stage 3.2 — EAS iOS → TestFlight                   | ⏳ blocked on confirming Apple Dev tier (asked Piers; iOS local builds may already work) |
| Stage 4 — Real-device testing via Wi-Fi            | ⏳ pending                                                                               |
| Stage 5 first pass — index.tsx screen split        | ✅ session 9 (1540 → ~278 lines; 11 new files in _shared/_canvas/_overlays/_hooks)      |
| Stage 5 second pass — deeper refactor              | ⏳ pending; gsRef/audio/constants/supabase-types — defer until tester feedback          |
| Stage 6 — Cross-run progression and rewards        | ⏳ pending; scoped post-Phase-1 retry-rate gate                                          |

**Tag baseline:** `v0.1.2-refactor-split` (session 9) — Stage 5 first-pass refactor verified on Pixel 7. Subsequent session-9 work (EAS preview pipeline, icon fix, Play Console listing/playbook docs, privacy policy live) lands on `v0.1.3-eas-preview-validated` once the icon-fix build is verified on device. Stage 2.3 deferred to future feature development. Next tag after that moves when the production AAB is uploaded to Play Internal Testing (post-Google-verification).

---

## What's open in Stage 2.2 (next-session pickup)

From `UX_AUDIT.md`:

- **Device walkthrough** — the checklist in UX_AUDIT.md was never fully exercised. Needs ~15-20 min walking every screen and capturing screenshots.
- **P1-12 (carry from Stage 2.1)** — close-call ring vs death-flash opacity feel. Needs side-by-side with the prototype HTML.
- **P1-14 polish** — the idle title fits now, but the user noted it doesn't feel fully resolved aesthetically. Variants worth trying: tighter letter-spacing, different baseline alignment, weight tweaks.
- **Audio click-fix regen** — `generate-sounds.js` already has the release-ramp fix committed. **Next session needs to run `node generate-sounds.js`** to regenerate the WAVs and ear-test the click is gone.
- **U10 → Stage 6** — full progression mechanics (achievements, daily challenges, cosmetics, social) deferred to a dedicated stage post-EAS.

---

## Key file locations

| File                                                                  | Purpose                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/index.tsx`                                                   | **GameScreen orchestrator** (~278 lines as of session-9 refactor). Calls `useGameLoop`, computes per-frame derived render values, mounts the canvas + phase-specific overlays. |
| `src/app/_layout.tsx`                                                 | Root layout — local font loading, splash, analytics bootstrap, global font-scale cap      |
| `src/app/_shared/{constants,snapshot,styles}.ts`                      | Pure data + types + StyleSheet shared across canvas / overlays / hook (session-9 split)   |
| `src/app/_canvas/{Dot,PipeScanlines,TitleBloom,GameCanvas}.tsx`       | Skia primitives + the wrapping `<Canvas>` with the full in-game visual layer              |
| `src/app/_overlays/{IdleScreen,PlayingHUD,DeathScreen}.tsx`           | Phase-specific RN overlay components (idle title, live HUD + pause, death screen)         |
| `src/app/_hooks/useGameLoop.ts`                                       | Owns 9 refs, gsRef + display state, audio loading, rAF physics+render loop, death side-effect, multi-touch handler. Returns `{ display, handleTouch, bestScore, wasNewBest }` |
| `src/providers.tsx`                                                   | React Query + GestureHandler + SafeAreaProvider                                           |
| `src/features/game/engine/step.ts`                                    | Physics loop — `stepPlaying`, `stepDead`, `handleTap`                                     |
| `src/features/game/engine/{constants,tiers,spawn,collision,state}.ts` | engine internals (pure TS, no React)                                                      |
| `src/features/analytics/`                                             | Analytics queue + event types                                                             |
| `src/features/leaderboard/`                                           | Supabase score submission + hooks (UI not yet built — Stage 2.3)                          |
| `src/features/monetisation/`                                          | Stubbed monetisation facade                                                               |
| `src/shared/storage/`                                                 | Typed AsyncStorage wrapper (used for persistent best score, device ID)                    |
| `assets/sounds/`                                                      | 16 WAV sound files. **Regenerate via `node generate-sounds.js`** after editing the script |
| `assets/fonts/`                                                       | `SpaceMono-Regular.ttf`, `SpaceMono-Bold.ttf` — bundled locally as of Stage 1.2           |
| `generate-sounds.js`                                                  | Procedural WAV generator. ADSR-style envelope (atk + decay + release).                    |
| `deploy-android.bat` / `run-deploy.vbs`                               | `npx expo run:android` wrappers                                                           |
| `reconnect-adb.bat`                                                   | Wi-Fi ADB pair + connect helper. Now prompts for connection port (Android 11+ aware).     |
| `git-audit.bat`                                                       | Git hygiene audit. Run before tagging a release.                                          |
| `package.json`                                                        | `expo-audio ~1.1.x` for audio (migrated from `expo-av` during the SDK 54 upgrade)         |
| `app.config.ts`                                                       | Expo config — bundle ID `com.newco.twodots`, icons, splash, plugins                       |
| `eas.json`                                                            | EAS profiles (dev/preview/prod). `projectId` empty until `eas init`                       |
| `supabase/migrations/`                                                | `001_devices.sql`, `002_scores.sql`, `003_analytics_events.sql`, `004_analytics_kpi_views.sql` (superseded), `005_kpi_functions_and_invoker_views.sql` (current public-aggregate surface), `006_devices_role_and_kpi_filter.sql` (adds `role` column to devices + filters), `007_kpi_filter_param.sql` (single-arg `p_filter`, superseded by 008), `008_kpi_date_filter_param.sql` (current — `p_filter` + `p_since` two-arg signature), `009_drop_no_arg_kpi_signatures.sql` (cleanup — drops the zero-arg overloads from 005 so each kpi_* function has one canonical signature) |
| `docs/dashboard.html`                                                 | Static read-only KPI dashboard. Calls `supabase.rpc('kpi_overview' \| 'kpi_retention' \| 'kpi_drop_off_by_tier')`. Anon key + URL baked in; safe because RLS on `analytics_events` is service-role-only and the RPC functions only return aggregates. **Footgun:** local variable holding the client must NOT be named `supabase` — collides with the `@supabase/supabase-js@2` UMD's top-level `let supabase`. We use `sb`. |
| `PLAN.md`                                                             | Sequenced roadmap of remaining stages                                                     |
| `BUG_AUDIT.md`                                                        | Stage 2.1 audit log                                                                       |
| `UX_AUDIT.md`                                                         | Stage 2.2 audit log                                                                       |
| `CHANGELOG.md`                                                        | Release-bound changes. Update on every PR.                                                |
| `CONTRIBUTING.md`                                                     | Branch model, commit conventions, pre-commit checks                                       |
| `.github/PULL_REQUEST_TEMPLATE.md`                                    | PR checklist                                                                              |

**Prototype reference (read-only):** `G:\My Drive\NewCo\Business ideas\Two Dots\TwoDots-38.html` — the canonical HTML. Every physics constant, colour, timing, and draw call originated here.

---

## Architecture (unchanged from session 7 except where noted)

### Rendering model

Hybrid React Native + Skia:

- **Skia `<Canvas>`**: dots, pipes, particles, divider glow, title bloom, overlays (gold wash, freeze ramp). `pointerEvents="none"`.
- **React Native `<View>` + `<Text>`**: HUD (score, milestone, idle text, pause overlay, death overlay).

### Game loop

```
requestAnimationFrame → loop()
  → fixed-timestep accumulator (16.667ms slices = 60fps regardless of display Hz)
  → stepPlaying(s) or stepDead(s) per accumulated slice
  → setDisplay(snap(s)) every other frame (halves React re-render cost)
```

### State phases

`'idle' | 'playing' | 'dead'`. Best score now persists across app kill via AsyncStorage (`StorageKeys.personalBest`).

### Audio

`expo-audio` (`createAudioPlayer`). All 16 sounds preloaded into a `useRef` map. Replay via `seekTo(0)` + `play()` (expo-audio has no equivalent of expo-av's `replayAsync`). **Critical gotcha:** bundled `require()`-ed assets must be passed through `Asset.fromModule(src).downloadAsync()` before `createAudioPlayer`, otherwise the native module silently creates a no-op player and audio is completely silent. expo-av handled this internally; expo-audio does not.

**As of Stage 2.2:** the `sine()` envelope in `generate-sounds.js` now has a 5ms release ramp (eliminates the click on every sound). Frequencies tuned to:

- Jump pair: 380 Hz / 507 Hz (perfect fourth, was a near-tritone before)
- Score blips: pentatonic ladder C5..E6 (was an arithmetic +40 Hz ladder before)
- Chord chimes + death sound: untouched (already musically aligned)

**The new sounds only take effect after `node generate-sounds.js` is re-run.** Script is committed; regenerated WAVs are not. Next session should regenerate and ear-test.

### Fonts

Space Mono Regular + Bold loaded via `expo-font` from local `assets/fonts/` (no network dependency as of Stage 1.2). Splash held until fonts ready. `_layout.tsx` also sets `Text.defaultProps.maxFontSizeMultiplier = 1.3` globally to cap Dynamic Type scaling at 1.3× — prevents the fixed-pixel HUD from breaking on accessibility settings.

---

## Colours and design constants

```ts
COL_L = '#FF5E35'; // orange — left dot, left lane background, left score shadow
COL_R = '#2ECFFF'; // cyan — right dot, right lane background, right score shadow
COL_BG = '#07070f'; // near-black background
GOLD = '#FFD046'; // milestone screen wash, score gold core, NEW BEST ribbon
WALL_R = '#10355c'; // pipe body — dark navy
PIPE_EDGE = '#7ac0e8'; // gap kill-line edge — bright sky blue (Stage 2.2)

W = 390; // logical canvas width
SCALE = SCREEN_W / W; // sx(n) = n * SCALE converts logical → screen px
```

**Visual language as of Stage 2.2:** orange/cyan are reserved exclusively for "left dot / right dot" semantics. Pipes are entirely in the blue family (`WALL_R` body, `PIPE_EDGE` gap). Gold marks reward moments only.

---

## How to deploy

**Prerequisites:** Android device with Wi-Fi debugging enabled, paired via `reconnect-adb.bat` (one-time per network).

```bash
cd "C:\Claude\Two Dots\two-dots"
npm install --legacy-peer-deps  # legacy-peer-deps required for @testing-library/react-native
npx expo run:android            # or just .\deploy-android.bat
```

If wireless ADB has dropped: `.\reconnect-adb.bat` and follow the prompts (answer `y` for first-time pair, paste the IP and connection port from the phone's Wireless Debugging screen). The Windows firewall rule `ADB Wireless Debug` (TCP 37000–44000 inbound) is required and was added in session 8.

---

## Pre-commit checks

```bash
npm test           # 124 tests passing as of session 8
npm run typecheck  # 0 errors
npm run lint       # 0 errors / 0 warnings (--max-warnings 0)
npm run format     # auto-fix prettier
```

All four are clean on `main` at the end of session 8.

---

## Known issues / gotchas

### `--legacy-peer-deps` always required

`@testing-library/react-native ^12.5.0` has a circular peer dep claim against `react@^19`. Use `--legacy-peer-deps` for all `npm install` operations.

### Supabase types — 1 spot still bridged with `as never` cast

`src/features/analytics/queue.ts:99` casts the insert payload `as never` because the hand-written `src/shared/supabase/types.ts` doesn't match the generated `Json` union. **TODO:** regenerate types properly:

```bash
npm install -g supabase
supabase gen types typescript --project-id YOUR-REF > src/shared/supabase/types.ts
```

Then remove the cast. Until then it's a marked TODO comment on that line.

### `expo-doctor` warning about Skia version

Resolved by the SDK 54 upgrade — Skia is now on the SDK-pinned 2.x line. No manual override needed.

### `expo-audio` migration (now active — was previously `expo-av`)

The SDK 51 advice to "stay on `expo-av`" is **obsolete**. As of SDK 54 we run `expo-audio ~1.1.x`. The migration carries one footgun documented above (Audio section): bundled assets must be `downloadAsync()`-ed before `createAudioPlayer` or playback is silent.

### Audio click-fix is in the script but not yet in the WAVs

Next session: `node generate-sounds.js` to apply.

### Git remote status

Confirm with `git remote -v`. If empty, the project is local-only — set up a GitHub repo before Stage 3.1 (EAS needs a source). See PLAN.md Stage 3.1 notes.

### CONTRIBUTING.md and the branch name

CONTRIBUTING.md describes the branch model as `main`. Local branch was `master` for some of session 8. If still `master`, rename with `git branch -M main` before pushing to GitHub for the first time.

---

## What to build next

See **`PLAN.md`** for the sequenced roadmap. The first concrete moves for the next session:

1. **Finish Stage 2.2:** regenerate audio (`node generate-sounds.js`), do the device walkthrough checklist in `UX_AUDIT.md`, decide on idle-title polish + close-call/death-flash opacity.
2. **Tag Stage 2 closure:** when 2.2 + 2.3 are done, tag `v0.1.1-pre-eas`.
3. **Stage 3.1 (EAS Android):** confirm GitHub remote, `eas init`, build preview APK, sideload smoke test, then production AAB → Play Console Internal Testing.
4. **Stage 3.2 (iOS):** depends on what Piers reports about Apple Dev tier. Local iOS builds may already work via Xcode + free Apple ID.

---

## Engine test coverage (124 tests as of session 8)

```
src/features/game/engine/__tests__/
  tiers.test.ts        — 37 (added P1-10 property sweeps in Stage 2.1)
  collision.test.ts    — 16
  spawn.test.ts        — 16
  step.test.ts         — 19 (added `id` field to fixtures in Stage 2.1)

src/features/analytics/__tests__/
  serialise.test.ts    — 7
  retryRate.test.ts    — 9

src/features/leaderboard/__tests__/
  scoreSubmission.test.ts — 16

src/shared/utils/__tests__/
  rng.test.ts          — 4
```

Run with `npm test`.

---

## Supabase schema

Three tables, all with RLS enabled:

- **`devices`** — `device_id UUID PK`, `created_at`, `role` (`'tester'` default | `'internal'`, added in 006). Internal devices are excluded from the public dashboard's default view.
- **`scores`** — `id`, `device_id FK`, `session_id`, `score`, `tier`, `death_side`, `created_at`
- **`analytics_events`** — `id`, `device_id FK`, `session_id`, `run_index`, `event_type`, `payload JSONB`, `created_at`

Two leaderboard views over `scores` + `devices` (publicly readable, `WITH (security_invoker = on)` since migration 005):

- **`personal_bests`** — one row per device with best score / best tier / total runs / last played
- **`top_scores`** — top-100 leaderboard with rank

Three RPC functions over `analytics_events` (`SECURITY DEFINER`, `EXECUTE` granted to `anon`, `search_path = ''` pinned — see migration 005). They are the *only* public read surface for analytics; the underlying table is service-role-read-only:

- **`kpi_overview(p_filter, p_since)`** — singleton row: total_runs, total_devices, total_sessions, retry_rate_pct, mean_run_length_ms, mean_close_calls_per_run
- **`kpi_drop_off_by_tier(p_filter, p_since)`** — death histogram by tier (1–8)
- **`kpi_retention(p_filter, p_since)`** — D1 / D7 retention plus eligible-cohort sizes

All three accept the same two optional parameters: `p_filter` ∈ `'all' | 'tester' | 'internal'` (default `'tester'`) and `p_since timestamptz` (default NULL = all time). The dashboard exposes both as toggle rows.

Migrations in `supabase/migrations/` (currently 001–005). Connection via `.env` (gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Anon key is safe to ship — RLS is the security boundary. Stage 1.1 audit confirmed the key was never committed to git history.

---

## Session history summary

| Session | Work done                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–4     | Scaffold, engine port, persistence, analytics                                                                                                                                  |
| 5       | Phase 1: 60fps physics gate, idle bob, lane backgrounds, score pop, death flash                                                                                                |
| 6       | Phases 2–4: death screen, idle screen, Skia migration                                                                                                                          |
| 7       | Polish pass: audio wiring, fonts, visual fixes, expo-av migration                                                                                                              |
| 8       | Stage 1.1: git hardening (changelog, contributing, PR template, audit script)                                                                                                  |
| 8       | Stage 1.2: local Space Mono TTFs                                                                                                                                               |
| 8       | Stage 1.3: removed dead `app/` directory; runtime confirmed using `src/app/`                                                                                                   |
| 8       | Stage 2.1: bug audit — 13 findings fixed (Skia path memo, gateInTier property tests, deathFlash math.max, all mechanical lint/type errors)                                     |
| 8       | Stage 2.2 wave 1: blue pipe palette, persistent best score (AsyncStorage), audio harmonic retune (perfect-fourth jump pair, pentatonic blip ladder), audio click-fix in script |
| 8       | Stage 2.2 wave 2: a11y labels on root touch View, safe-area inset offset (notch-only), global font-scale cap at 1.3×, ADB script port-prompt patch                             |
| 8       | Stage 2.2 fix: HUD top position regression — only offset by inset excess over standard status bar                                                                              |
| 8       | Wi-Fi ADB pairing fixed (firewall rule `ADB Wireless Debug` for TCP 37000–44000 inbound)                                                                                       |
