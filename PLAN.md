# Two Dots — Forward Plan

_Created: 27 Apr 2026, end of session 7. Sequencing for the 9 remaining workstreams listed in the handoff._

> Read this alongside `HANDOFF.md`. The handoff describes what _exists_; this plan describes what to _do next_ and in what order.

---

## TL;DR — recommended order

| #   | Stage               | Workstream                              | Source item | Why here                                                       |
| --- | ------------------- | --------------------------------------- | ----------- | -------------------------------------------------------------- |
| 1   | Foundation          | Git hygiene + branch model              | (4)         | Everything downstream benefits; do once, reap forever          |
| 2   | Foundation          | Bundle Space Mono TTF locally           | (2)         | Removes a network dependency before reviewers see the app      |
| 3   | Pre-submission gate | Bug audit (Claude-led)                  | (9)         | Cheaper to fix now than via tester reports                     |
| 4   | Pre-submission gate | UX/UI audit                             | (7)         | Same logic — first impressions matter for v1 testers           |
| 5   | Pre-submission gate | Leaderboard UI on death screen          | (3)         | Data layer already done; ship a complete experience to testers |
| 6   | Ship                | EAS Android → Play Internal Testing     | (1)         | Faster path; no Mac/Apple Dev gating                           |
| 7   | Ship                | EAS iOS → TestFlight                    | (1, 5)      | Requires Apple Developer + Mac                                 |
| 8   | Validate            | Real-device testing via Wi-Fi debugging | (6)         | In parallel with tester feedback                               |
| 9   | Iterate             | Code refactor                           | (8)         | Informed by what audits + testers actually found               |

**Rationale for re-ordering:** the user's list had EAS first. I'm pushing it to step 6 because (a) git hygiene is a prerequisite for clean release tagging, (b) the local-font fix is a 30-minute change that removes a real App Store review risk, and (c) audits are dramatically cheaper before a build is in tester hands. The whole pre-submission block should take <2 sessions.

---

## Stage 1 — Foundation

### 1. Git process hardening — _item (4)_

**Goal:** clean, predictable git state so refactors and releases are safe to do.

**Concrete steps:**

1. Audit current state: `git status`, `git log --oneline -20`, `git branch -a`, check `.gitignore` for build artifacts (`android/`, `ios/`, `.env`, `node_modules/`).
2. Decide branch model. Recommendation: **trunk-based with short-lived feature branches**.
   - `main` is always deployable.
   - Feature branches: `feat/<short-slug>`, merged via PR or direct fast-forward.
   - Tag every release: `v0.1.0-internal`, `v0.1.1-internal`, etc.
3. Add a `CHANGELOG.md` keyed to tags. Even a 1-line-per-release log is enough.
4. Add a `.github/PULL_REQUEST_TEMPLATE.md` if pushing to GitHub — forces a checklist on every PR.
5. Configure git hooks (optional): pre-commit `npm test` for the engine tests. Husky + lint-staged is overkill for a solo project; a plain `.git/hooks/pre-commit` script is fine.
6. Verify `.env` is gitignored and rotate the Supabase anon key if there's any chance it was committed historically.

**Done when:**

- `git status` is clean.
- `main` has a tag for current state (`v0.1.0-pre-eas`).
- Build artifacts confirmed excluded from history.
- A README section or `CONTRIBUTING.md` documents the branch model.

**Estimated effort:** 1–2 hours.

**Risks:** if `.env` was ever committed, the Supabase key is leaked publicly. Check `git log -p -- .env` and rotate if needed.

---

### 2. Bundle Space Mono TTF locally — _item (2)_

**Goal:** kill the runtime CDN fetch from `raw.githubusercontent.com`. Currently the font loads from GitHub on first launch — fine in dev, awful for App Store reviewers on flaky hotel wifi.

**Concrete steps:**

1. Download the two TTFs to `assets/fonts/`:
   - `SpaceMono-Regular.ttf`
   - `SpaceMono-Bold.ttf`
2. Update `src/app/_layout.tsx` font loader from URI to `require()` (snippet already in `HANDOFF.md` line 167–170).
3. Verify the Metro bundler picks up `.ttf` (it should by default; if not, add to `metro.config.js` assetExts).
4. Test cold launch on the Pixel 7 with airplane mode on — fonts must still render.
5. Commit on a branch (`feat/bundle-fonts`), tag, merge.

**Done when:**

- App renders Space Mono Bold with no network connection on first launch.
- Bundle size increase is acceptable (~50KB for both TTFs combined — negligible).

**Estimated effort:** 30 minutes.

**Risks:** none material. This is one of the safest changes in the plan.

---

## Stage 2 — Pre-submission quality gates

### 3. Bug audit — _item (9)_

**Goal:** find and fix everything Claude can find before testers do.

**Concrete steps:**

1. **Static analysis sweep:**
   - `npx tsc --noEmit` — fix the ~10 Supabase `never` errors flagged in handoff (regenerate types via `supabase gen types`).
   - `npx eslint .` if configured; otherwise spot-check for unused imports, missing `useEffect` deps, stale closures in the game loop.
2. **Test suite:** `npm test` — confirm all 90+138 tests pass. Investigate any flake.
3. **Runtime audit on device:**
   - Long-play session (>5 min) watching for memory growth or frame drops in `adb logcat` / Flipper.
   - Background/foreground cycle 10× — verify audio doesn't double-play, game state doesn't desync.
   - Rapid pause/resume — check for `expo-av` leaks.
   - Force a death state with score over each tier boundary — verify tier name display.
4. **Edge cases listed in handoff variance section:** decide whether milestone pop drift and dead-phase lane bg are still "deferred" or should be fixed now.
5. **Delegate the deep audit:** spawn a subagent ("Explore very thorough") to read `src/app/index.tsx`, `src/features/game/engine/*`, and the prototype HTML side-by-side and report behavioural divergences not yet logged.

**Done when:**

- TypeScript clean (`tsc --noEmit` exits 0).
- All tests pass.
- A `BUG_AUDIT.md` file lists every issue found with status (fixed / deferred / won't-fix).

**Estimated effort:** half a session (3–4 hours), most of it the subagent run + review.

---

### 4. UX/UI audit — _item (7)_

**Goal:** catch usability and visual issues that the prototype-comparison audits would miss because they're about _new_ RN-only surfaces.

**Concrete steps:**

1. Walk every screen and capture screenshots: idle, playing, paused, death, leaderboard (once built).
2. Verify on both portrait orientations — does anything break in safe-area-inset edge cases (notch, gesture bar)?
3. Tap target audit: every interactive element ≥44×44 logical px (iOS HIG / Android M3).
4. Accessibility pass: `accessibilityLabel`s on all touchables, contrast ratios on text (especially the gold-on-dark in the death screen).
5. Cold-launch perception test: time from icon tap → idle screen interactive. Splash should hide cleanly with no font flash.
6. Sound audit: every SFX fires when expected, none fire when unexpected (e.g. score blips during `dead` phase).
7. Capture findings in `UX_AUDIT.md`.

**Done when:**

- A prioritised list exists (P0 fix-before-ship / P1 fix-this-stage / P2 backlog).
- All P0s fixed.

**Estimated effort:** 2–3 hours.

---

### 5. Leaderboard UI on death screen — _item (3)_ — 🔵 DEFERRED (session 9)

**Status:** deferred to future feature development. Data layer (hooks + 16 passing tests) is built and ready; UI block on death screen and `useSubmitScore` wiring on `playing → dead` are NOT yet implemented. When this stage is revived, the design and concrete steps below remain valid.

**Goal:** ship a complete, satisfying death screen that shows the player's rank against the global board.

**Design:**

After the score count-up finishes on the death screen, fade in:

- Player's personal best (from `usePersonalBest`).
- Player's rank in top 100 (from `useTopScores` + comparison).
- Top 5 scores list (small, below the retry pill).

If the player just set a new PB, flash a "NEW BEST" ribbon over the score.

**Concrete steps:**

1. Wire `useTopScores` and `usePersonalBest` into the death-screen view block in `src/app/index.tsx`.
2. Submit-on-death path: confirm `useSubmitScore` is invoked at phase transition `playing → dead`. If not, add it.
3. Build the visual block — match the existing death-screen typography (Space Mono Bold, gold accents).
4. Loading state: skeleton bars while the query resolves; never block the retry pill on network.
5. Error state: silently degrade (no leaderboard shown) — never break the retry flow on connectivity issues.
6. New-PB ribbon: detect via `score > previousBest`, animate in.

**Done when:**

- Death screen always shows leaderboard data within 1s of the count-up finishing, or silently omits it if the network failed.
- A new PB triggers the ribbon.
- Score submission is confirmed to fire on every death (check Supabase `scores` table after a few runs).

**Estimated effort:** half a session.

**Risks:** the Supabase query might be slow on cold connection. Mitigate with cached `staleTime` in React Query.

---

## Stage 3 — Ship

### 6. EAS Android → Play Internal Testing — _item (1)_

**Goal:** an installable APK/AAB in the hands of 5–10 testers via Play Console internal track.

**Concrete steps:**

1. **EAS setup** (handoff lines 192–197):
   ```bash
   npm install -g eas-cli
   eas login
   eas init   # fills in projectId in eas.json
   eas build:configure
   ```
2. **Verify `app.config.ts`:** bundle ID, version, versionCode, icons, splash all production-ready.
3. **Build:**
   ```bash
   eas build --platform android --profile preview
   ```
   Wait 15–25 min. Download the APK.
4. **Sideload test:** install APK on the Pixel 7, smoke-test idle → play → death → leaderboard.
5. **Production profile:** once preview works, build with `--profile production` to get an AAB for Play Console.
6. **Play Console:**
   - Create app entry (one-time, $25 dev fee if not already paid).
   - Upload AAB to Internal Testing track.
   - Add tester emails to the internal tester list.
   - Fill in the bare-minimum store listing (title, short desc, screenshots, content rating questionnaire).
7. **Distribute:** share the opt-in URL with testers.

**Done when:**

- ≥1 tester (other than the dev) has installed via Play Internal Testing and confirmed it runs.
- A `RELEASES.md` entry logs the build number, EAS build URL, and Play Console version code.

**Estimated effort:** 1 full session (most of it is Play Console form-filling and waiting for builds).

**Risks:**

- First Android build often fails on a missing native module config — `expo-av` and Skia both need their plugins listed in `app.config.ts`. Verify before building.
- Play's content rating questionnaire is tedious; budget 30 min.

---

### 7. EAS iOS → TestFlight — _item (1) + (5)_

**Goal:** TestFlight build distributed to internal testers.

**Prerequisites that may be blockers:**

- Apple Developer account ($99/year).
- Mac for at least the initial Xcode setup, certificates, provisioning. EAS can handle most of this in the cloud, but you'll need a Mac for any local debug.
- App Store Connect app entry created.

**Concrete steps:**

1. Apple Developer enrollment if not already done. Allow 24–48h for verification.
2. Bundle identifier registered in Apple Developer portal — must match `app.config.ts`.
3. App Store Connect app record created.
4. ```bash
   eas credentials   # let EAS manage certs/profiles
   eas build --platform ios --profile preview
   ```
5. Once built, EAS can submit directly:
   ```bash
   eas submit --platform ios --latest
   ```
6. Add internal testers in App Store Connect → TestFlight.
7. Wait for TestFlight processing (10–30 min after upload).

**Done when:**

- Internal testers receive the TestFlight invite and can install.
- iOS smoke-test passes (idle → play → death → leaderboard).

**Estimated effort:** 1 session if Apple Dev is already set up; 2+ sessions if enrollment is fresh.

**Risks:**

- iOS-specific bugs not caught on Android: safe-area inset differences, audio session category (`expo-av` defaults usually fine), font loading timing.
- TestFlight processing failures usually mean a missing privacy declaration in `Info.plist` — EAS surfaces this in the build log.

---

## Stage 4 — Validate

### 8. Real-device testing via Wi-Fi debugging — _item (6)_

**Goal:** validate on hardware diversity beyond the Pixel 7.

**Concrete steps:**

1. **Wi-Fi debugging setup** (Android):
   ```bash
   adb tcpip 5555
   adb connect <device-ip>:5555
   ```
   Then `npx expo run:android` works wirelessly.
2. **Device matrix to test:**
   - Pixel 7 (already validated).
   - Older Android (something with 4GB RAM, mid-range chip — frame rate stress).
   - Newer iPhone (15-class).
   - Older iPhone (SE 2nd gen if available — small screen + low-DPI test).
3. **Per device, capture:**
   - Cold launch time.
   - Sustained FPS over 60s of play (Skia overlay metrics or `react-native-performance`).
   - Audio latency between tap and SFX.
   - Memory after 5 minutes of play (should be stable, no leak).
4. **Log results in `DEVICE_TESTING.md`.**

**Done when:**

- ≥3 devices tested, all hit ≥58 fps sustained on the playing phase.
- No crashes in 10 minutes of play on any device.

**Estimated effort:** half a session per device pair.

---

## Stage 5 — Iterate

### 9. Code refactor — _item (8)_

**Goal:** address the technical-debt hotspots that surfaced during stages 3–4 audits.

**Likely candidates** (informed by handoff and intuition; refine after audits):

1. **`src/app/index.tsx` is 1300+ lines.** Split into:
   - `IdleScreen.tsx`
   - `PlayingScreen.tsx` (the Skia canvas + HUD)
   - `DeathScreen.tsx`
   - A `useGameLoop` hook encapsulating the rAF + step pipeline.
2. **`gsRef` mutation pattern** is fast but easy to misuse. Consider whether a small reducer-like API on top would prevent future bugs without sacrificing perf.
3. **Audio module:** the `sounds.current` Record is fine but tightly coupled to the screen. Extract `useAudio()` hook or a `SoundBank` singleton.
4. **Constants file:** `constants.ts` is the single source of truth — keep it that way, but consider grouping (physics, colours, timings, dimensions) into nested objects for readability.
5. **Supabase types:** stop hand-writing `src/shared/supabase/types.ts`; add a `npm run gen:types` script that calls `supabase gen types`.

**Approach:** do this on a `refactor/screen-split` branch, keep all engine tests green throughout, and tag a release before merging in case a regression slips in.

**Done when:**

- `src/app/index.tsx` is <300 lines.
- All tests still pass.
- A senior code review (subagent or human) signs off.

**Estimated effort:** 1–2 sessions.

**Risks:** the React + Skia + rAF loop is tightly coupled; splitting it can introduce stale-closure bugs. Manual on-device QA after refactor is mandatory.

---

## Cross-cutting practices

These apply to every stage:

- **Tag every release:** `git tag -a vX.Y.Z -m "..."` before each EAS build.
- **Keep `CHANGELOG.md` current:** one bullet per merged PR.
- **Run `npm test` before every commit.** The engine tests are the safety net.
- **Never refactor and add features in the same PR.** Audit-fix PRs go in clean; refactor PRs go in clean; new-feature PRs go in clean.
- **Document gotchas as you find them** in `HANDOFF.md` so the next session inherits them.

---

## Effort summary

| Stage                                            | Sessions         | Calendar time           |
| ------------------------------------------------ | ---------------- | ----------------------- |
| 1. Foundation (git + fonts)                      | 0.5              | 1 day                   |
| 2. Pre-submission gates (bug + UX + leaderboard) | 1.5              | 2–3 days                |
| 3. Ship (Android + iOS)                          | 1.5–3            | 3–7 days (Apple gating) |
| 4. Real-device validation                        | 0.5–1            | 1–2 days                |
| 5. Refactor                                      | 1–2              | 2–4 days                |
| **Total**                                        | **5–8 sessions** | **~2 weeks calendar**   |

---

## Answers to open questions (27 Apr 2026)

1. **Apple Developer enrollment** — _unsure, asked Piers_. iOS work is **blocked** until confirmed. If not active, allow 24–48h for enrollment. Stage 3.2 cannot start until this is resolved; Stage 3.1 (Android) is unblocked.
2. **Supabase anon key in git history** — _unsure_. Treat as potentially leaked. Stage 1.1 must include `git log --all -p -- .env .env.local` to verify, and rotate the key in Supabase dashboard regardless if there's any doubt. Anon keys are designed for client exposure, but rotation is cheap insurance.
3. **Monetisation in v1** — _deferred to v2_. Confirms the handoff: `useMonetisation.ts` stays stubbed for internal testing. Removed from this plan's scope entirely.
4. **Tester pool** — _both platforms, Android first_. Reinforces Stage 3 ordering: ship Android, gather feedback, then ship iOS. Stage 4 (real-device matrix) can also lead with Android devices.

## Implications for sequencing

- **Add to Stage 1.1 git audit:** explicit check of `.env` history + Supabase key rotation step.
- **Stage 3.2 (iOS) is blocked on Piers' answer.** Don't sit idle waiting — Stage 3.1 (Android) → Stage 4 (Android device matrix) is a full session of unblocked work.
- **No monetisation work this cycle.** If `src/features/monetisation/` causes any noise during the bug audit, suppress rather than fix.
