# Two Dots — Maestro E2E flows

Single flow today: `core-path.yaml` — covers the minimum game loop (launch → idle → tap to start → let dots die → death screen → tap to retry → back to idle).

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

## Analytics-driven fixtures (seeded multi-tier flows)

Hand-recorded multi-tier flows are brittle: production builds use `Math.random` in the engine spawner, so pipe layouts differ on every run, so taps tuned to one layout don't clear the next.

The fix is a deterministic-seed build (the `e2e` profile in `eas.json`, which sets `EXPO_PUBLIC_E2E_SEED=42`) plus a generator that converts a real recorded run into a YAML flow.

**End-to-end workflow:**

1. **Build the seeded APK:**
   ```
   eas build --profile e2e --platform android --message "e2e-seed-42"
   ```
2. **Sideload and play.** Either yourself or any tester. Reach a score ≥ 20 (the fixture-worthy threshold). Each death sends a `run_end` analytics event; if the build was seeded AND the run scored ≥ 20, the captured tap stream rides along in the payload.
3. **Generate the flow:**
   ```
   $env:SUPABASE_URL = "https://biwhjzebrmhvtkjaqsay.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<paste from Supabase dashboard>"
   node tools/generate-maestro-fixture.mjs
   ```
   Defaults: `--seed 42 --min-score 20 --out .maestro/seeded-survival.yaml`. Override any of those.
4. **Run the generated flow** (against the same seeded APK):
   ```
   maestro test .maestro/seeded-survival.yaml
   ```

The generator picks the most recent qualifying run and rebuilds the YAML against it. **Re-run after engine-tuning changes** (`JUMP_VY`, `GRAVITY`, tier values) — recorded tap timings drift when physics shift, so you'll need a new source run.

**Privacy / cost note:** tap streams only attach to `run_end` payloads on seeded builds. Production builds (no `EXPO_PUBLIC_E2E_SEED`) carry zero tap data — payloads stay byte-identical to pre-E2E. Only people running the `e2e` APK contribute fixture data, and only when their score crosses the threshold. See `src/features/analytics/events.ts` (`TapsRecord` type) and `src/app/_hooks/useGameLoop.ts` (the gating logic).

**Future flows worth adding (lower priority):**

- **pause-resume** — tap the centre divider mid-run, confirm pause overlay, tap to resume. Doesn't need seeding (pause behaviour is independent of pipe layout).
- **persist-best-score** — score N, kill app, relaunch, confirm "BEST N" footer. Needs seeding to reach a known score reliably.
