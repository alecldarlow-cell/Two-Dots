# Two Dots — Handoff Notes

_Last updated: end of session 7 (27 Apr 2026). App deployed and running on Pixel 7._

---

## Current state

The app is **fully playable and deployed** on a Pixel 7 via `npx expo run:android` (development build). All four phases of the visual/game overhaul are complete and live.

| Phase                                    | Status              |
| ---------------------------------------- | ------------------- |
| S1 Scaffold                              | ✅                  |
| S2 Engine port (pure TS)                 | ✅ 90 tests passing |
| S5 Persistence (Supabase + React Query)  | ✅ 32 tests passing |
| S6 Analytics                             | ✅ 16 tests passing |
| Phase 1 — 60fps physics + HUD polish     | ✅ deployed         |
| Phase 2 — Death screen overhaul          | ✅ deployed         |
| Phase 3 — Idle screen overhaul           | ✅ deployed         |
| Phase 4 — Skia canvas migration          | ✅ deployed         |
| Polish pass (audio, fonts, visual fixes) | ✅ deployed         |
| EAS Build / TestFlight / Play Internal   | ⚠️ not started      |

---

## Key file locations

| File                                    | Purpose                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `src/app/index.tsx`                     | **Main game screen** — entire game UI (1300+ lines). All phases live here. |
| `src/app/_layout.tsx`                   | Root layout — font loading, splash screen, analytics bootstrap             |
| `src/features/game/engine/step.ts`      | Physics loop — `stepPlaying`, `stepDead`, `handleTap`                      |
| `src/features/game/engine/constants.ts` | All tuning constants (gravity, speeds, timings, colours)                   |
| `src/features/game/engine/tiers.ts`     | Tier/scoring logic                                                         |
| `src/features/game/engine/spawn.ts`     | Pipe spawning                                                              |
| `src/features/game/engine/collision.ts` | Hit detection                                                              |
| `src/features/game/engine/state.ts`     | `GameState` type definition                                                |
| `src/features/game/engine/index.ts`     | Barrel export                                                              |
| `src/features/analytics/`               | Analytics queue + event types                                              |
| `src/features/leaderboard/`             | Supabase score submission + hooks                                          |
| `src/features/monetisation/`            | Stubbed monetisation facade                                                |
| `src/providers.tsx`                     | React Query + SafeArea providers                                           |
| `assets/sounds/`                        | 16 WAV sound files (pre-generated, included)                               |
| `assets/fonts/`                         | Empty — fonts load via URI from GitHub CDN on first run                    |
| `deploy-android.bat`                    | `npx expo run:android` wrapper                                             |
| `run-deploy.vbs`                        | VBScript launcher for deploy (double-click in Explorer)                    |
| `package.json`                          | `expo-av ~14.0.0` for audio (NOT expo-audio)                               |
| `app.config.ts`                         | Expo config — bundle ID, icons, splash, plugins                            |
| `supabase/migrations/`                  | `001_devices.sql`, `002_scores.sql`, `003_analytics_events.sql`            |

**Prototype reference (read-only):**
`G:\My Drive\NewCo\Business ideas\Two Dots\TwoDots-38.html`
This is the canonical HTML prototype. Every physics constant, colour, timing, and draw call in the RN app is sourced from this file.

---

## Architecture

### Rendering model

The game uses a **hybrid React Native + Skia** rendering model:

- **Skia `<Canvas>`** (GPU layer, absolute-positioned, `pointerEvents="none"`): dots, pipes, particles, divider glow, title bloom, overlays (gold wash, freeze ramp)
- **React Native `<View>` + `<Text>`**: score display, progress dots, milestone pop text, idle screen text, pause overlay, death overlay text

### Game loop

```
requestAnimationFrame → loop()
  → fixed-timestep accumulator (16.667ms slices = 60fps regardless of display Hz)
  → stepPlaying(s) or stepDead(s) per accumulated slice
  → setDisplay(snap(s)) every other frame (halves React re-render cost)
```

`gsRef` is the live mutable `GameState`. `display` is the React state snapshot pushed for rendering. The game loop and all physics run outside React.

### State phases

`GameState.phase` can be `'idle' | 'playing' | 'dead'`.

- **idle**: dots bob via `Date.now()` sine wave, no physics steps
- **playing**: full physics, `stepPlaying` called each tick
- **dead**: particles + score count-up, `stepDead` called each tick

### Audio

Uses **`expo-av`** (`Audio.Sound`). All 16 sounds preloaded on mount into `sounds.current` (a `Record<string, Audio.Sound>`). Replay via `replayAsync()` — resets to 0 and plays, perfect for SFX.

**Why expo-av and not expo-audio:** `expo-audio ~0.1.0` has broken Android autolinking in SDK 51 — the native module never registers even after a clean rebuild. `expo-av ~14.0.0` is stable and battle-tested.

### Fonts

**Space Mono Bold** loaded via `expo-font` with URI-based loading from GitHub raw CDN:

```
https://raw.githubusercontent.com/googlefonts/spacemono/main/fonts/SpaceMono-Bold.ttf
```

Loaded once on first app launch, cached by expo-font. Splash screen held via `SplashScreen.preventAutoHideAsync()` until fonts ready. Falls back to system font gracefully if load fails.

---

## Colours and design constants

```ts
COL_L = '#FF5E35'; // orange — left lane, left dot
COL_R = '#2ECFFF'; // cyan — right lane, right dot
COL_BG = '#07070f'; // near-black background
GOLD = '#FFD046'; // milestone/score gold
WALL_R = '#10355c'; // pipe base colour (both halves — prototype draws WALL_L then overwrites with WALL_R)

W = 390; // logical canvas width (all coordinates in this space)
SCALE = SCREEN_W / W; // sx(n) = n * SCALE converts logical → screen px
```

---

## How to deploy

**Prerequisites:**

- Android device with USB or WiFi debugging enabled
- `adb devices` must show the device before running

```bash
cd "C:\Claude\Two Dots\two-dots"
npm install --legacy-peer-deps
npx expo run:android
```

Or double-click `run-deploy.vbs` in Explorer (runs the same command in a new cmd window).

**Always use `--legacy-peer-deps`** — peer dep conflicts between `@testing-library/react-native` and React 18 cause plain `npm install` to fail.

Build takes 3–5 minutes on first run, ~1 minute on subsequent runs (Gradle incremental).

---

## Intentional prototype divergences

These were reviewed and confirmed as deliberate choices — do NOT "fix" them:

1. **Fixed-timestep physics loop** — prototype runs raw `requestAnimationFrame` which runs faster on 90/120Hz. RN version uses a 16.667ms accumulator to keep physics at exactly 60fps on all devices.
2. **`DisplaySnapshot` pattern** — React state is a copy pushed every other frame; prototype mutates and reads state in the same loop. Required for React rendering model.
3. **`expo-av` instead of Web Audio API** — prototype generates tones programmatically; RN app uses pre-generated WAV files via expo-av.

---

## Remaining variances from prototype (not yet fixed)

These were identified during the variance audit but deliberately deferred or left as future work:

- **Milestone pop drift** — the milestone text currently drifts upward on a linear `mDriftY` value. The prototype has a slightly different easing curve. Minor visual difference.
- **Lane background during dead phase** — stays at `0x08` alpha; prototype fades it differently. Low priority.

---

## Known issues / gotchas

### `--legacy-peer-deps` always required

`@testing-library/react-native ^12.5.0` has a circular peer dep claim against `react@^19`. Use `--legacy-peer-deps` for all `npm install` operations.

### Font loading is network-dependent on first launch

The Space Mono Bold TTF is fetched from `raw.githubusercontent.com` on first launch and cached. If the device has no internet on first launch, the app falls back to system font (no crash). Subsequent launches use the cache.

**To eliminate this dependency:** download the TTF files manually and place them in `assets/fonts/`:

- `assets/fonts/SpaceMono-Regular.ttf`
- `assets/fonts/SpaceMono-Bold.ttf`

Then update `_layout.tsx` to use `require()` instead of URI:

```ts
SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
'SpaceMono-Bold': require('../assets/fonts/SpaceMono-Bold.ttf'),
```

### TypeScript: Supabase `never` errors in leaderboard hooks

`src/shared/supabase/types.ts` is hand-written and missing fields that Supabase v2's query builder expects. Causes ~10 typecheck errors in leaderboard/analytics hooks. Fix:

```bash
npm install -g supabase
supabase gen types typescript --project-id YOUR-REF > src/shared/supabase/types.ts
```

Engine, schemas, and all game code typecheck clean.

### `expo-doctor` warning about Skia version

`@shopify/react-native-skia@1.3.10` is newer than Expo SDK 51's expected `1.2.3`. This is intentional — `1.3.10` has required Skia APIs we use. Ignore the warning. Do not downgrade.

---

## What to build next

### EAS Build + store submission (S7)

The immediate next milestone is getting a build onto TestFlight (iOS) and Play Internal Testing (Android).

1. **Set up EAS:**
   ```bash
   npm install -g eas-cli
   eas login
   eas build:configure
   ```
2. **Populate `eas.json`** — it exists but has an empty `projectId`. Run `eas init` to fill it.
3. **Build for Android internal testing:**
   ```bash
   eas build --platform android --profile preview
   ```
4. **iOS:** requires Apple Developer account, provisioning profile, and Xcode on a Mac.

### Audio polish

The 16 WAV sound files in `assets/sounds/` were generated programmatically to match the prototype's Web Audio API synthesis. They're functional but could be refined:

- `blip_t1.wav` through `blip_t8.wav` — score blips, pitch rises with tier
- `chord_tier.wav`, `chord_five.wav` — milestone chimes
- `jump_l.wav`, `jump_r.wav` — dot jump sounds
- `tap.wav`, `pause_on.wav` — UI sounds
- `close_call.wav`, `death.wav` — events

### Leaderboard UI

The leaderboard data layer is complete (`useTopScores`, `usePersonalBest`, `useSubmitScore`). There's no UI for it yet. The death screen could show a live leaderboard rank after the count-up finishes.

### Monetisation

`src/features/monetisation/useMonetisation.ts` is a stub that always returns `showInterstitial: () => void`. Rewire to RevenueCat or Admob when ready.

---

## Engine test coverage

```
src/features/game/engine/__tests__/
  tiers.test.ts       — tier boundary scores, gateInTier, tierName
  collision.test.ts   — dotHitsPipe, isCloseCall, isOutOfBounds
  spawn.test.ts       — pipe spawning determinism, gap constraints

src/features/analytics/__tests__/
  serialise.test.ts   — event serialisation round-trips
  retryRate.test.ts   — retry rate gate calculation

src/features/leaderboard/__tests__/
  scoreSubmission.test.ts — score submission schema validation

src/shared/utils/__tests__/
  rng.test.ts         — deterministic RNG
```

Run with: `npm test`

---

## Supabase schema

Three tables, all with RLS enabled:

- **`devices`** — `device_id UUID PK`, `created_at`
- **`scores`** — `id`, `device_id FK`, `session_id`, `score`, `tier`, `death_side`, `created_at`
- **`analytics_events`** — `id`, `device_id FK`, `session_id`, `run_index`, `event_type`, `payload JSONB`, `created_at`

Migrations in `supabase/migrations/`. Connection via `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Session history summary

| Session | Work done                                                                                     |
| ------- | --------------------------------------------------------------------------------------------- |
| 1–4     | Scaffold, engine port, persistence, analytics                                                 |
| 5       | Phase 1: 60fps physics gate, idle bob, lane backgrounds, score pop, death flash               |
| 6       | Phase 2: death screen (big score, shadows, count-up, tier info, retry pill)                   |
| 6       | Phase 3: idle screen (TWO/DOTS title, instruction text, thumb circles)                        |
| 6       | Phase 4: Skia migration (dots with glow/pulse/rings, pipes with scanlines/caps, divider glow) |
| 7       | Polish pass: audio wiring, pause pulse, idle title bloom shadow                               |
| 7       | divPulse fix, Space Mono font loading, all StyleSheet text updated                            |
| 7       | P1 fixes: gold wash, freeze ramp, particle shrink, pipe shimmer, deathFlash decrement         |
| 7       | P2/P3 fixes: pipe colours/edges/glows, adaptive score Y, death Y offset, hint Y               |
| 7       | expo-audio → expo-av migration (fixed Android native module crash)                            |
| 7       | package.json prepare script removed (Windows `\|\| true` incompatibility)                     |
