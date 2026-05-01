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

Next candidates (when the surface area grows):

- **multi-tier-survival** — actually play to gate 5 or 10, verify the milestone pop appears, the world swap happens, and tier audio fires (audio assertions are tricky in Maestro; would need a different probe).
- **persist-best-score** — play to score N, die, re-launch the app, confirm "BEST N" footer appears on death screen.
- **pause-resume** — tap the centre divider mid-run, confirm pause overlay, tap to resume.

These are deferred — they'd add value but cost more flow-maintenance overhead than core-path on its own.
