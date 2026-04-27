# Two Dots — Handover Note

_Last updated: April 2026_

## What this project is

A React Native / Expo SDK 51 mobile game ported from an HTML prototype (`TwoDots.html`, located at `C:\Claude\Two Dots\TwoDots.html` or similar — one level above the repo). The port uses expo-router v3 with a single game screen at `src/app/index.tsx`. The engine is a straight TypeScript port of the HTML prototype's physics and spawning logic.

---

## Current state — end of session 2

**Everything is working on device.** The app builds and runs via WiFi ADB / Expo Go on a physical Android phone (Snapdragon Windows laptop — emulator not viable on this machine).

### Completed this session

- Fixed `_layout.tsx`: `Crypto.randomUUID()` → `ExpoCrypto.randomUUID()` (was crashing on launch)
- Fixed `src/app/index.tsx`: replaced `GestureDetector + Gesture.Tap().onBegin()` with `Pressable.onPressIn` — taps now register reliably
- Fixed `src/features/game/engine/spawn.ts`: added `id: number` field to `Pipe` interface + `pipeCount` counter on `SpawnerState` — fixes the React "unique key" console warning
- Removed debug strip (`phase:`/`taps:` overlay), `tapCount` state, and `console.log` from `index.tsx`

### How to run

```
# Ensure ADB is connected to phone over WiFi first, then:
cd "C:\Claude\Two Dots\two-dots"
npx expo run:android
```

Or use the existing helper: `run-app.ps1` in the repo root.

### ADB WiFi (Snapdragon machine — no emulator)

Android Emulator is not available on Snapdragon/ARM Windows (x86_64 system images require Intel/AMD virtualisation). Physical device over WiFi ADB is the only path:

1. Phone → Developer Options → Wireless Debugging → Pair device with pairing code
2. `adb pair <ip>:<pairing-port>` (enter pairing code)
3. `adb connect <ip>:5555`
4. Then `npx expo run:android`

---

## Next task — gameplay parity audit vs HTML prototype

The goal is to play both games side by side and check that all gameplay mechanics, feel, and difficulty match the original HTML prototype.

### Suggested audit checklist

**Physics**

- [ ] Gravity feels the same (GRAVITY = 0.12, JUMP_VY = -4.2)
- [ ] Dot jump arc height and curve match
- [ ] Left tap → left dot jumps, right tap → right dot jumps (tap threshold is `W/2 = 195` logical px)
- [ ] Both dots jump simultaneously when tapping near centre? (check `handleTap` in engine)

**Pipes**

- [ ] Pipe width, gap size, and spacing feel the same
- [ ] Pipe speed progression across tiers feels identical
- [ ] Pause window before each pipe feels right (pipes freeze briefly before moving)
- [ ] Tier 1: centred gaps with tiny jitter — pipes easy, nearly centred
- [ ] Tier 2–5: alternating pattern visible and readable
- [ ] Tier 6+: fully random gaps

**Difficulty / tiers**

- [ ] Score thresholds for tier transitions feel correct (check `src/features/game/engine/tiers.ts`)
- [ ] Gap size narrows correctly as score increases

**Death**

- [ ] Collision detection fires at the right moment (not too early/late)
- [ ] Death flash + particles play correctly
- [ ] Death overlay shows score, tier name, which dot died
- [ ] "Tap to retry" resets and restarts correctly

**Idle screen**

- [ ] Dots bob gently while idle (sinusoidal, period ~900ms, slightly out of phase)
- [ ] "TWO DOTS / tap to start" text visible and centred

**Score**

- [ ] Score increments each time a pipe is cleared (both dots through)
- [ ] Live score display visible during play
- [ ] Death overlay animates score count-up

**Visual polish (not in HTML prototype — added in RN port)**

- [ ] Lane tints (subtle left/right background tones) visible
- [ ] Dot pulse on tap (brief size flash)
- [ ] Close-call ring (not yet rendered — see below)

### Known gaps / not yet implemented in RN version

The React Native render layer (`index.tsx`) uses plain `View` components. Several visual features from the engine are computed but **not yet rendered**:

| Feature              | Engine field                    | Render status                              |
| -------------------- | ------------------------------- | ------------------------------------------ |
| Close-call gold ring | `closeL`, `closeR` on GameState | Not rendered                               |
| Score pop animation  | `scorePop`                      | Not rendered                               |
| Milestone pop        | `milestonePop`                  | Not rendered                               |
| Survival pulse       | `survivalPulse`                 | Not rendered                               |
| Clear flash on pipe  | `clearFlash` on Pipe            | Not rendered                               |
| Lane alpha by tier   | `LANE_ALPHA_BY_TIER`            | Hardcoded `#ffffff18`, not tier-responsive |
| Audio (blips/chimes) | Constants in `constants.ts`     | Not implemented                            |

These are deferred to the S3 milestone (Skia canvas render layer). The plan in the codebase comments is to replace all `View`-based rendering with a Skia canvas in S3 — at that point all these visuals come for free.

---

## Key files

| File                                    | Purpose                                        |
| --------------------------------------- | ---------------------------------------------- |
| `src/app/index.tsx`                     | Game screen — all render + tap wiring          |
| `src/app/_layout.tsx`                   | Root layout, providers                         |
| `src/features/game/engine/index.ts`     | Engine public API (re-exports)                 |
| `src/features/game/engine/constants.ts` | All tunable constants — physics, timing, audio |
| `src/features/game/engine/state.ts`     | GameState type + initState()                   |
| `src/features/game/engine/step.ts`      | stepPlaying(), stepDead() — frame loop         |
| `src/features/game/engine/spawn.ts`     | Pipe spawning + SpawnerState                   |
| `src/features/game/engine/tiers.ts`     | Tier thresholds, speed/gap curves              |
| `src/features/game/engine/collision.ts` | Dot-pipe collision detection                   |

---

## Tech stack

- React Native 0.74.5 / Expo SDK 51
- expo-router v3 (file-based routing, single screen)
- TypeScript strict mode
- Supabase (leaderboard + analytics — not a blocker for gameplay parity)
- `expo-haptics` for tap feedback
- No audio implementation yet
