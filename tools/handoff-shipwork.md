# Two Dots v0.3 — non-design work session

Companion to `handoff-round-7.md`, which covers Jupiter design iteration in a
separate chat. This handover scopes the **non-design** work needed to ship the
v0.3 planetary refresh: engine catch-up, cycle and world-transition mechanics,
pipes, effects/sounds, shell screens, and naming.

Branch: `upgrade/sdk-54`. Same as design.

---

## Out of scope here

Jupiter design iteration. That continues in a separate chat off
`handoff-round-7.md`. **Don't touch** `tools/design-iteration/world/theme-jupiter.js`
or any storm-bands renderer code — those are still in flight. When Jupiter
locks, the design changes flow into the engine via task 1 below.

---

## Tasks, in order

### 1. Engine catch-up — port iteration-tool work to production

The iteration tool (`tools/design-iteration/`) is a full design round ahead of
the production renderer (`src/app/_canvas/WorldRenderer.tsx`) and engine themes
(`src/features/game/world/themes/*.ts`). This blocks everything downstream.

What's missing:

- **Renderer features** in `WorldRenderer.tsx`: new crater field (32 craters,
  two-shade depth, power-law sizing), updated cratered-horizon path (96 pts +
  3 octaves), updated singleHill (flat peak, no ripple), gentler mountains,
  updated bird flap (wingtip oscillation, perpendicular curl), clip-path
  flat-bottom clouds, grass tufts, `kind: 'earth'` celestial — plus the
  storm-bands renderer once Jupiter locks.
- **Schema**: add `'earth'` to `Celestial.kind` union in
  `src/features/game/world/types.ts`; switch Moon's earth-from-Moon celestial
  to use it instead of `'planet'`.
- **Theme TS**: `themes/moon.ts` and `themes/earth.ts` don't reflect round-6
  numerical updates (yPct, heightPct, parallax, removed bands). Diff against
  the matching `theme-*.js` and port.
- **Skia preview standin** (`tools/world-preview.html`) is on round 2 /
  Moon-only. Retire or update.
- **Verify** with `.\tools\v0.3-checks.ps1`, then on device.

### 2. Seamless cycle wrap (position 4 → 1)

Each world has a 4-stop day/night cycle at t=0/0.25/0.5/0.75 documented as
wrapping t=1 → t=0. Verify the visual is genuinely seamless on all three
worlds — both color curves (sky, bands) and scalar curves (densityCurve,
glowCurve, xCurve/yCurve for celestials). Implementation lives in
`src/features/game/world/cycle.ts`. Test by leaving the game running and
watching for visible cuts each loop.

This makes the worlds infinite, which task 3 then connects.

### 3. World-to-world transition

Needs a product decision before architecture. Three options:

- **Discrete picker** — menu, player chooses world.
- **Linear progression** — beat one world to unlock the next, transition
  animation between.
- **Continuous flight** — visual warp from one atmosphere into another,
  gameplay continuous across the boundary.

Once chosen, build a transition primitive (likely a `<WorldTransition>` shell
that cross-fades two `<WorldRenderer>` instances over N seconds while damping
the `worldTheme` prop) and wire it to whatever event triggers transitions.
`src/app/_hooks/useCurrentPlanet.ts` already handles planet selection — extend
or replace.

### 4. Pipes — adopt new visual language

Current pipe palette is locked navy + ice across all three worlds
(`palette.pipeWall = #10355c`, `palette.pipeEdge = #7ac0e8`). The schema
already supports per-world palettes — the values just happen to be identical
in the three theme files. Two open questions:

- **Per-world pipes?** Pull pipe palette from each world's tone (lunar greys
  for Moon, mossy greens for Earth, rust/cream for Jupiter), or keep navy+ice
  as a universal identity element across worlds?
- **Pipe styling** — wall thickness, edge highlight, end caps, any internal
  pattern. Probably wants its own design pass in a `Pipes.html` alongside the
  world iteration tool, then port to engine.

### 5. Split-screen tint (blue/red) — remove

User position: *ideally remove entirely.* The warm/cool dot palette
(amber + ice, locked) plus per-side divider glow (`palette.dividerGlowL/R`)
should be enough to disambiguate the two dots without tinting the playfield.
Drop the half-screen tint, then verify dots are readable across all three
worlds at all four cycle positions. If anything is borderline at night-frame
darkest, lift the dot lightness or divider glow before reintroducing tint.

Pairs naturally with task 4 — both reduce visual noise around gameplay.

### 6. Effects — collisions, scoring, dot transitions

Audit current particle/visual effects. Align to the new aesthetic: warm-cool
spark palette matching the dot pair, particle scale tuned to each world's
gravity (chunkier sparks on Jupiter, finer dust on Moon). Don't reuse
Earth-only effects elsewhere without thought.

### 7. Sound + haptics pass

Audit current SFX (collision, score tick, dot transitions, menu). Replace
anything off-tone. Consider a per-world ambient bed: low rumble for Jupiter,
wind hush for Earth, near-silence with impact ticks for Moon. Universal
effect sounds; world-specific ambient. Haptics — different feedback weight
per world's gravity?

### 8. Start screen

Title screen on launch. Likely a slow auto-cycling world preview behind the
title. Sets the visual tone for everything that follows. Naming decision
(task 11) gates the logo treatment.

### 9. Game-over / end screen

Same aesthetic family as start screen. Score reveal, retry CTA, route back to
wherever task 3 lands the player. Prefer overlay over a separate screen so
the world keeps cycling behind it.

### 10. In-game UI — score, level, indicators

Current preview shows a small uppercase mono tagline at the bottom
("JUPITER · DAY · ×1.5"). Decide on layout for score, current level, score
multiplier, pause button, optional streak/lives indicator. Keep typography
quiet (low-contrast uppercase mono) so it reads as part of the world rather
than UI chrome. Anchor positions need to clear the dot pair's vertical
travel zone.

### 11. Naming

"Two Dots" still works with the planetary theme — the dot pair survives as
the core mechanic. Alternatives if a rebrand is on the table: *Orbit*,
*Two Moons*, *Pair of Worlds*, *Conjunction*, or kept-mechanic compounds
(*Two Dots: Worlds*, *Two Dots: Orbit*). This is a product/marketing call,
not engineering. Once decided, fan out: app icon, splash, store metadata,
in-game logo treatment, end-screen flourish.

---

## Probably also needed (not in the user's list)

Surfaced for the new chat to confirm with the user before committing time:

- **Production switch-on** — `app/index.tsx` has a `WORLDS_ENABLED = false`
  guard. Flip when ready to ship the v0.3 background. Probably wants a feature
  flag rather than a hardcoded const.
- **Pause screen.**
- **Settings / preferences screen** — sound, haptics, reduce-motion,
  colourblind mode.
- **Persistence** — high score, last-played world, settings. AsyncStorage
  already used in `useCurrentPlanet`.
- **Splash / loading screen** — likely needed once asset preload grows with
  three worlds' worth of theme data.
- **App icon** — almost certainly a redesign for v0.3.
- **Onboarding / tutorial** — how does a new player learn the dot pair
  mechanic? Currently presumably none, or stale.
- **Per-world difficulty** — `gravityMul` and `scoreMul` already in schema,
  but is the spawn cadence / difficulty curve also world-aware?
- **Accessibility** — dot contrast at every cycle position per world
  (night frames are darkest), `prefers-reduced-motion` for band drift and
  bird/cloud animation.
- **Performance on device** — three worlds × particles × cycle animation
  is more work than the v0.2 background. Profile on a mid-range Android.

---

## Tooling

(Mirror of `handoff-round-7.md`.)

- `.\tools\v0.3-checks.ps1` — typecheck + lint + tests + Skia preview.
- `.\tools\v0.3-snapshot.ps1 "<message>"` — git add+commit. Use a phase
  prefix per task (`engine-catchup:`, `cycle-wrap:`, `pipes:`, etc.) instead
  of the `round 6:` / `round 7:` prefixes used in the design chats.
- `.\tools\serve-design-iteration.ps1` — design iteration server.
  **Don't edit Jupiter or storm-bands code from this chat.**
- **Don't run** `.\tools\copy-design-iteration.ps1` — would clobber the
  Jupiter design work in flight.

---

## Recommended first move

Task 1 (engine catch-up). It's gating, and parts of it (theme TS diffs)
are quick wins. Tasks 2 and 5 are cheap follow-ups — verification work and
a delete respectively. Tasks 3, 8, 9, 11 want a product decision before
engineering, so flag those to the user before scoping.

Go when ready.
