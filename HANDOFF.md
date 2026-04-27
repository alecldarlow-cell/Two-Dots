# Handoff Notes — Two Dots

**Read this file first.** It covers what's in the box, how to get the repo running locally, and the exact three actions that must happen before any further build work.

For day-to-day reference (architecture, scripts, etc.) see `README.md`.

---

## What this repo contains

| | | |
|---|---|---|
| **Scaffold** | S1 | ✅ complete |
| **Engine port** (pure TS) | S2 | ✅ complete, 90 tests passing |
| **Persistence layer** (Supabase + React Query + Yup) | S5 | ✅ complete, 32 tests passing |
| **Analytics** (Phase 1 gate instrumentation) | S6 | ✅ complete, 16 tests passing |
| **Monetisation facade** | — | ✅ stubbed for Phase 2 |
| **App entry** (`app/_layout.tsx`, `app/index.tsx`) | — | ✅ scaffolded, engine wired to placeholder view |
| **Skia render** | S3 | ⚠️ not started — next major block |
| **Audio / haptics wiring** | S4 | ⚠️ not started |
| **EAS Build + TestFlight + Play Internal** | S7 | ⚠️ not started |

**Total: 122 tests passing across 8 suites. Engine coverage: 98% statements, 86.58% branches, 100% functions.**

---

## First run — exact steps

These assume macOS. Adjust for Linux/Windows as needed — Expo works on all three.

### 1. Install dependencies

```bash
cd two-dots
npm install --legacy-peer-deps
```

**Why `--legacy-peer-deps`:** React Native 0.74 + `@testing-library/react-native@12` + `@react-native-async-storage/async-storage@1.23.1` have circular peer-dep claims that npm's strict resolver rejects. They actually work together at runtime; `--legacy-peer-deps` tells npm to believe me.

### 2. Regenerate Supabase types (**do this first**)

My hand-written `src/shared/supabase/types.ts` hits a `never`-inference edge case in Supabase v2's query builder generics. The fix is to use Supabase's own type generator instead of hand-maintaining:

```bash
# Once your Supabase project is created (see step 4):
npm install -g supabase
supabase login
supabase gen types typescript --project-id YOUR-PROJECT-REF > src/shared/supabase/types.ts
```

Until this is done, `npm run typecheck` will show ~10 errors in the leaderboard/analytics hooks — all variants of "Argument of type X is not assignable to parameter of type 'never'". The engine, schemas, analytics serialiser, and retry-rate math all typecheck clean.

### 3. Run the tests

```bash
npm test
```

Expect 122 passing. If fewer, something broke in transit — check git status, diff against the HANDOFF-time commit.

### 4. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com/).
2. Copy the three migration files from `supabase/migrations/` into the SQL Editor and run them in order: `001_devices.sql`, `002_scores.sql`, `003_analytics_events.sql`.
3. Verify RLS is enabled on all three tables (Table Editor → each table → RLS toggle).
4. Copy your project URL and `anon` key from Project Settings → API.
5. Populate `.env` (gitignored):
   ```
   cp .env.example .env
   # edit .env with real values
   ```
6. Re-run step 2 above now that the project exists.

### 5. First device run

You need one of:
- **iOS:** Xcode 15+, iOS simulator
- **Android:** Android Studio, Android emulator (API 33+), or a physical device in USB debugging mode

Then:

```bash
npm run ios       # first time: builds the dev client (~5–10 min)
# or
npm run android
```

The placeholder game screen should open: black background, white "TWO DOTS" title, "tap to start" hint. Tapping anywhere triggers engine events (check the JS console / Flipper). Tapping twice (to start playing, then to die by falling) will fire a `run_end` analytics event and submit a score to Supabase.

**You can verify persistence is working by:**
1. Play once (let a dot fall off-screen to die instantly)
2. Open Supabase dashboard → Table Editor → `scores`
3. You should see one row with your device ID and score 0

---

## Known pitfalls

### TypeScript: the `never` issue in Supabase hooks

**Symptom:** `tsc --noEmit` reports errors in `useSubmitScore.ts`, `useDeviceId.ts`, `queue.ts` — all of the form "Argument of type X is not assignable to parameter of type 'never'".

**Cause:** Hand-written `src/shared/supabase/types.ts` is missing some field the Supabase v2 generator produces. I spent a session trying to reverse-engineer the exact shape — it's not worth it.

**Fix:** `supabase gen types typescript --project-id YOUR-REF > src/shared/supabase/types.ts` (see step 2 above).

### The Expo `tsconfig.base` trap

**Don't change `tsconfig.json`** to extend `expo/tsconfig.base` even though that's the Expo docs recommendation. Vitest (via Vite's esbuild loader) auto-discovers `tsconfig.json` from CWD and parses the extends chain during test runs. If it can't resolve Expo's base (because, say, vitest starts faster than the Expo cache is warm), the whole test run fails before a single test executes.

The current self-contained `tsconfig.json` with strict mode and the `@/` / `@features/` / `@shared/` path aliases is what Expo CLI looks for anyway, and it works for both `expo start` and `vitest`.

### Peer-dep conflicts around React versions

`npm install` without `--legacy-peer-deps` fails loudly at React Native 0.85/0.76 wanting React 19, which conflicts with React 18 transitively expected by other packages. As of April 2026, the stable working combination is:

| Package | Pin |
|---|---|
| `expo` | `~51.0.0` |
| `react` | `18.2.0` |
| `react-native` | `0.74.5` |
| `@shopify/react-native-skia` | `1.3.10` |
| `@testing-library/react-native` | `^12.5.0` |

Do not upgrade any one of these without testing the full matrix. If you move to Expo SDK 52, everything in that list bumps together.

### The "factory" comment style is deliberate

Comments in the engine (`src/features/game/engine/*.ts`) are unusually prose-heavy — they reference the HTML prototype line numbers and explain why certain refactors happened (module-global `lastSide` → explicit `SpawnerState`). Don't strip them. When you need to tune physics later (pipe speed, gap size, pause duration), those comments tell you exactly what part of the prototype you're changing and what behaviour it affects.

---

## The three immediate actions

In order. Don't skip ahead.

### Action 1: Package into your own repo and commit

This is the first commit of the Two Dots project. Before anything else:

```bash
git init
git add .
git commit -m "Initial scaffold + engine port + persistence layer"
git remote add origin <your-repo>
git push -u origin main
```

The `.gitignore` already excludes `node_modules`, `.env`, `.expo/`, `coverage/`, and the iOS/Android native folders Expo generates on first build.

### Action 2: Regenerate Supabase types (see "First run" step 2)

This closes the `never` typecheck errors. Once done, `npm run typecheck` should pass clean, and `npm run lint`, `npm test`, and `npm run format:check` should all be green. That's the state you want before touching any more code.

### Action 3: First device run (see "First run" step 5)

Confirms that:
- Expo actually builds the dev client against this `package.json`
- `@shopify/react-native-skia` resolves native modules on both iOS and Android
- Analytics events flow through to Supabase end-to-end
- The placeholder game screen launches and taps are registered

If any of those fail, the issue is in the S1 scaffold — not in the S3 render work you're about to start. Catch it now, not after you've written 500 lines of Skia.

---

## What to build next — S3 Skia render

Once actions 1–3 are done, the next work is replacing the `<View>` placeholder in `app/index.tsx` with real rendering.

**The engine already emits everything the renderer needs.** `stepPlaying()` returns `FrameEffects` (audio/haptic events + scored/died flags). `GameState` exposes `pipes`, `dotLY`, `dotRY`, `deathParticles`, `scorePop`, `closeL`, `closeR`, `survivalPulse` — every visual counter the prototype uses. All are mutated in place by the engine; the renderer reads from `stateRef.current` on every frame.

**Expected new files:**

```
src/features/game/components/
  GameCanvas.tsx         — Skia <Canvas> mounting point + useFrameCallback loop
  Dot.tsx                — renders one dot with radial gradient + pulse scaling
  Pipe.tsx               — renders one pipe with scanline wall pattern + clearFlash glow
  Particle.tsx           — renders one death particle (if extracted; may be inlined)
  DeathOverlay.tsx       — RN Views on top of Skia canvas: score count-up, tier name, retry pill
  IdleOverlay.tsx        — RN Views: "TWO DOTS" title, "tap to start", thumb circles

src/features/game/hooks/
  useGameLoop.ts         — Reanimated useFrameCallback → stepPlaying / stepDead
  useTapInput.ts         — gesture-handler Tap + runOnJS → handleTap
  useAudio.ts            — expo-audio wrapper, consumes AudioEvent[] from FrameEffects
  useHaptics.ts          — expo-haptics wrapper, consumes HapticEvent[] from FrameEffects
```

**Port the prototype's draw calls 1:1.** They're at lines 909–1294 of the original `TwoDots.html`. Canvas2D → Skia translation is mostly mechanical:

| Canvas2D | Skia |
|---|---|
| `ctx.fillRect(x, y, w, h)` | `<Rect x={x} y={y} width={w} height={h} />` |
| `ctx.arc(x, y, r, 0, 2*PI); ctx.fill()` | `<Circle cx={x} cy={y} r={r} />` |
| `ctx.createRadialGradient(...)` | `<RadialGradient c={vec(x,y)} r={r} colors={[...]} />` |
| `ctx.globalAlpha = a` | `opacity={a}` prop on the shape |
| `ctx.createPattern(offscreen, 'repeat')` | `<ImageShader image={...} tx="repeat" ty="repeat" />` |

**Performance gotcha:** don't create Skia paint objects per frame. Memoise with `useMemo` and mutate colour/opacity per frame if needed.

**First milestone to aim for:** dots and pipes rendering at 60fps on an iPhone 12 / Pixel 5 equivalent. No audio, no haptics, no particles yet. If that holds, everything else is additive. If it drops frames, fall back to flat colours (no radial gradients) before anything else — the prototype's gradients are cheap on Canvas2D but expensive on per-frame Skia paint construction.

---

## Decisions Log candidates

When you next update the TD Confluence page, these five decisions from the build sessions are worth recording:

1. **Stack: Expo + Supabase, not Expo + FastAPI.** Reason: Two Dots is a mobile game, not a SaaS. `technical-requirements.md` §9 names Supabase as the production end state. Skipping the dev-time Postgres/Docker/Alembic layer saves weeks with no loss.

2. **Render: Skia, not RN Game Engine.** Reason: the prototype is an imperative Canvas2D loop. Skia ports 1:1. RNGE would require rewriting the game loop as a React component tree — weeks of work for equivalent output.

3. **Testing: Maestro, not Playwright.** Reason: `technical-requirements.md` §4.4 specifies Playwright for E2E but Playwright doesn't support React Native. Maestro is the mobile equivalent; YAML flows; CI-runnable.

4. **Engine state mutates in place.** Reason: functional-style per-frame copy would allocate ~8 objects per frame at 60fps. The mutation is contained inside the engine module, and the boundary is tested via effects-as-data. See `src/features/game/engine/step.ts` top comment.

5. **Supabase types must be generated, not hand-written.** Reason: I hit this the hard way. The Supabase v2 query-builder generics rely on a specific shape that hand-written types consistently miss in subtle ways. Use `supabase gen types typescript`.

---

## Contact points

- **The HTML prototype** — `TwoDots.html`, ~1344 lines. Every engine value in `src/features/game/engine/constants.ts` is sourced from a specific line range in this file. If physics ever need re-tuning, start there.
- **The Confluence pages** — business case at page ID 29196298, research page at 40075295. Both should be updated after the first playable build is on TestFlight.
- **The Drive KB** — `New Co / Knowledge Base / Two Dots — Knowledge Base.md`. Log material decisions here via ingest.

---

*Last updated: end of session 4. Ready for handoff.*
