# Two Dots — Maestro E2E flows

> **Status (May 2026):** Maestro is retained only for the single-tap `core-path.yaml` smoke flow. Multi-tap gameplay tests have been migrated to a bash + ADB framework — see `tools/e2e/` and the post-mortem at the bottom of this file.

Single Maestro flow today: `core-path.yaml` — covers the minimum game loop (launch → idle → tap to start → let dots die → death screen → tap to retry → back to idle).

## Running locally

Maestro CLI doesn't officially support Windows. Three options:

### Option 1 — WSL (recommended for Windows dev)

```bash
# Inside WSL Ubuntu:
curl -fsSL "https://get.maestro.mobile.dev" | bash
export PATH="$PATH":"$HOME/.maestro/bin"

# Connect your Android device via WSL ADB or run an emulator. Then:
cd /mnt/c/Claude/Two\ Dots/two-dots
maestro test .maestro/core-path.yaml
```

ADB-over-WSL pairs the device once and persists across sessions.

### Option 2 — Mac / Linux

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
maestro test .maestro/core-path.yaml
```

### Option 3 — CI only

Skip local Maestro entirely. Add a GitHub Actions job that uses [`reactivecircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner) to boot an Android emulator, sideload the preview APK, and run `maestro test .maestro/`. This is the right end-state — local Maestro is most useful for debugging flows, not for routine validation.

The CI integration job is intentionally not in `.github/workflows/ci.yml` yet — it adds 5–10 minutes per run and needs the preview APK or an emulator-friendly debug build. Worth doing once the flow set grows beyond `core-path.yaml`.

## What the flow expects

- **App package:** `com.newco.twodots` (per `app.config.ts`).
- **Build:** preview APK (sideloaded) or a dev-client build with the GameScreen reachable. Skia render layer must be live.
- **Device:** any Android with API 24+. Tested on Pixel 7.
- **State:** `clearState: true` wipes AsyncStorage so the persistent best score doesn't render a "BEST N" footer that could change between runs.

## Adding flows

When adding a new YAML, drop it next to `core-path.yaml`. Convention is one flow per critical path. Maestro picks up everything matching `.maestro/*.yaml` if you run `maestro test .maestro/` (no specific file).

## Multi-tap gameplay tests — see `tools/e2e/`

Multi-tap replay tests live in `tools/e2e/` as bash scripts that drive the device via ADB and verify outcomes via Supabase analytics. The Maestro-based seeded replay (`generate-maestro-fixture.mjs`) was retired after we discovered Maestro's `tapOn: point` doesn't reliably dispatch in-game taps on Android (post-mortem below).

The seeded build mechanism, the captured-tap analytics payload, the per-fixture ranking logic — all of that is preserved and now feeds the bash framework instead. See `tools/e2e/README.md` for the current workflow.

## Post-mortem: why Maestro for multi-tap was abandoned

We spent meaningful effort trying to get Maestro to replay captured tap streams against the seeded build. The flow worked end-to-end at the pipeline level (capture → generate → execute) but the dots reliably died at gate 1. After narrowing down, the root cause was a **Maestro tap-dispatch issue specific to Android + this app**:

- The outer touch View has `accessibilityRole="button"` (deliberate, for screen readers).
- Maestro's `tapOn: { point: 'X%, Y%' }` on Android routes through the OS accessibility framework.
- The first tap (idle→playing transition) registers fine. **Subsequent taps during the playing phase are swallowed** — confirmed by a controlled test: `adb shell input tap` works for the same coordinates that Maestro can't reach.

Two compounding issues we also identified along the way:

- Maestro's per-`tapOn` overhead is ~150ms (screen capture + a11y tree fetch + dispatch), too slow for this app's intra-gate timing budget even when dispatch worked.
- `waitForAnimationToEnd` doubled as a sleep but was a hack — Maestro has no pure sleep command.

The replacement framework uses ADB for input dispatch (~30ms per tap, bypasses accessibility) and Supabase queries for verdicts (works regardless of Skia rendering or accessibility tree contents). See `tools/e2e/lib.sh`.

**Privacy / cost note (still applies):** tap streams only attach to `run_end` payloads on seeded builds. Production builds (no `EXPO_PUBLIC_E2E_SEED`) carry zero tap data — payloads stay byte-identical to pre-E2E. Only people running the `e2e` APK contribute fixture data, and only when their score crosses the threshold. See `src/features/analytics/events.ts` (`TapsRecord` type) and `src/app/_hooks/useGameLoop.ts` (the gating logic).

**Future flows worth adding (lower priority):**

- **pause-resume** — tap the centre divider mid-run, confirm pause overlay, tap to resume. Doesn't need seeding (pause behaviour is independent of pipe layout).
- **persist-best-score** — score N, kill app, relaunch, confirm "BEST N" footer. Needs seeding to reach a known score reliably.
