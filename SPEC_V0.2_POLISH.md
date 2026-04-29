# Two Dots v0.2-polish — Mini-Spec

_Branch target: `feat/v0.2-polish`. Tag on merge: `v0.2.0-polish`. Estimated effort: 3–4 days. Locked-in stance: free-to-play, no monetisation in v1, no cosmetics, no IAP, no ads. This release is purely felt-quality + accessibility + onboarding + idle-position fix._

---

## 1. Close-call score bonus + audio stinger + hit-pause

### Feature surface
- When a dot passes within `CLOSE_CALL_PX` of a pipe edge, score increments by 1 (in addition to the existing per-pipe score on full pass).
- Audio: existing `close-call` sound plays *and* a `score-blip` event fires together — richer sonic stinger than the current single-sample close-call.
- Visual: 1–2 frame hit-pause (the physics accumulator skips one slice on close-call activation, freezing the screen for ~17–33ms). Conveys weight without losing the retry rhythm.
- The existing `closeCalledByL/R` per-pipe flags continue to prevent re-firing within a single pipe.

### Files touched
- `src/features/game/engine/state.ts` — add `hitPauseFrames: number` to `GameState`; init to 0; reset in `centreDotsForIdle` / `initState`.
- `src/features/game/engine/step.ts` — in the close-call branch (currently around lines 148–160 for L, 156–161 for R): add `s.score += 1`; push both `{ kind: 'close-call' }` and `{ kind: 'score-blip', tier: tierFor(s.score) }` to `effects.audio`; set `s.hitPauseFrames = 2`.
- `src/features/game/engine/step.ts` (near loop boundary, ~line 207): decrement `hitPauseFrames` per frame; while `hitPauseFrames > 0`, skip the physics integration but keep timers/decrement loops running so animations don't desync.
- `src/app/_hooks/useGameLoop.ts` — no change; the accumulator already drives `stepPlaying` per slice and the engine handles the freeze internally.

### Engine-test deltas
- New test in `step.test.ts`: "close-call increments score by 1 and emits both close-call and score-blip events"
- New test in `step.test.ts`: "hit-pause counter decrements each frame and gates physics integration"
- Existing tier-property tests should stay green; if any baseline-score test fails, the failure is the score-curve shift and is the expected behaviour change.
- Test count: 124 → 126.

### Risk note
The score curve shifts upward in proportion to close-call frequency. The Phase 1 retry-rate gate in HANDOFF.md was measured against the pre-bonus curve — the next round of tester PBs will not be directly comparable. Document in CHANGELOG.

---

## 2. Onboarding overlay (first-tap teach)

### Feature surface
- Idle screen on first-ever app launch: orange-coloured "TAP LEFT to jump" text + thumb-pointer arrow appears under the left thumb-circle; cyan mirror on the right ("TAP RIGHT to jump").
- After the first successful jump (any side) during the first run, the overlay fades out smoothly (300ms) and never appears again.
- Persisted via `seenOnboarding: boolean` in AsyncStorage.

### Files touched
- New: `src/app/_hooks/useOnboarding.ts` — exposes `{ shouldShow: boolean, markSeen: () => void }`; reads/writes the flag.
- New constant in `src/shared/storage/keys.ts`: `StorageKeys.seenOnboarding`.
- `src/app/_overlays/IdleScreen.tsx` — accepts `showOnboarding: boolean` prop; renders the overlay text + arrow conditionally beneath the thumb-circles using lane colours.
- `src/app/_hooks/useGameLoop.ts` — on the `tap` event (first jump after `idle → playing`), call `markSeen()` once.

### Engine-test deltas
- None (engine untouched).
- `useOnboarding` smoke test in `__tests__/useOnboarding.test.ts`: round-trip persistence (returns `true` initially, returns `false` after `markSeen`).

---

## 3. Settings screen

### Feature surface
- New gear icon top-right of idle screen (small, lane-neutral colour).
- Tap → settings panel slides in. Toggles for: **Sound** (on/off), **Haptics** (on/off), **Reduced Motion** (on/off — kills close-call ring, freeze ramp, and hit-pause).
- Tap-outside or back-button closes panel.
- All three settings persist to AsyncStorage; loaded on app launch.

### Files touched
- New: `src/app/_hooks/useSettings.ts` — exposes `{ soundOn, hapticsOn, reducedMotion, setSoundOn, setHapticsOn, setReducedMotion }` with AsyncStorage round-trip.
- New: `src/app/_overlays/SettingsPanel.tsx` — the slide-in panel UI.
- `src/app/_overlays/IdleScreen.tsx` — gear icon + panel mount.
- `src/app/_hooks/useGameLoop.ts` — gate `replay(...)` calls on `soundOn`; gate `Haptics.*` calls on `hapticsOn`.
- `src/app/_canvas/GameCanvas.tsx` and `_canvas/Dot.tsx` — gate close-call ring + freeze ramp draw branches on `!reducedMotion`.
- `src/features/game/engine/step.ts` — when `reducedMotion` is true, skip the `hitPauseFrames` write (or zero it on read at the loop level — TBD which is cleaner).
- New constant in `src/shared/storage/keys.ts`: `StorageKeys.settings`.

### Engine-test deltas
- None directly (engine settings-agnostic).
- `useSettings` smoke test for round-trip persistence + default values.

---

## 4. Idle-screen U11 fix (cluster vertical position)

### Feature surface
- Thumb-circle + "keep both dots alive" + LEFT/RIGHT control hints move down 8–12% of screen height (`VIS_H`) so the cluster sits more centrally, not visually-top.

### Files touched
- `src/app/_overlays/IdleScreen.tsx` — adjust `thumbY` constant + instruction text top offset.
- `UX_AUDIT.md` — mark U11 closed with the after-screenshot reference.

### Tests
- None (visual-only). On-device QA pass at end of the polish branch.

---

## 5. Branch + commit + tag plan

- **Feature branch:** `feat/v0.2-polish` (cuts from `main`).
- **Sub-branches** (optional, for cleaner blame): `feat/close-call-score`, `feat/onboarding-overlay`, `feat/settings-panel`, `feat/u11-idle-position`. Each merges into `feat/v0.2-polish`.
- **Per-PR gates:** `npm test` clean (engine 124→126), `npm run typecheck` clean, `npm run lint` clean, manual on-device QA of the touched surface.
- **Final merge:** PR `feat/v0.2-polish → main`. After merge, tag `v0.2.0-polish` and run an EAS preview build for tester sign-off before any production cut.
- **CHANGELOG.md:** append a new `## [0.2.0-polish]` section (see template below).

---

## 6. CHANGELOG entry (provisional)

```markdown
## [0.2.0-polish] — 2026-MM-DD

### Added
- Close-call score bonus (+1) with combined close-call + score-blip stinger and 1–2 frame hit-pause.
- Settings screen (gear icon on idle): Sound, Haptics, Reduced Motion toggles with AsyncStorage persistence.
- First-time onboarding overlay teaching LEFT/RIGHT taps; persists seenOnboarding flag and fades after first successful jump.
- New engine field hitPauseFrames + 2 new step.ts tests (124 → 126 tests).

### Changed
- Idle-screen thumb-circle + instruction cluster moved down ~10% of VIS_H (UX_AUDIT.md U11 closed).
- replay() / Haptics calls gated on settings; close-call ring + freeze ramp + hit-pause gated by Reduced Motion flag.

### Notes
- Score curve shifts upward by close-call frequency × bonus. Phase 1 retry-rate baseline therefore shifts; pre-bonus PBs are not directly comparable. Document expected at next tester check-in.
```

---

## 7. Out of scope (parked for v0.3 or later)

- Share card / death-card auto-PNG (parked, would-be ~2–3 days cross-platform)
- Tier-transition theatrics (visual swell + audio stinger on tier boundary)
- Vertical-layered music
- High-contrast palette mode
- Dynamic-type cap user setting (still hardcoded 1.3× in `_layout.tsx`)
- Pause-panel polish (live stats, Quit Run option)
- Telemetry-driven balancing instrumentation

These remain in `DEV_IDEAS_BRIEF.md` §5 and §7 as candidates for the v0.3 (Path C — planetary modes) cycle or beyond.
