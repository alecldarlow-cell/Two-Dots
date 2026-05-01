# Context for fresh chat — Two Dots v0.3-worlds (round 7 onward)

I'm continuing the v0.3 planetary-modes work. We have three worlds (Moon,
Earth, Jupiter) with full v0.5 schema implementation in both engine
(`src/features/game/world/`) and iteration tool (`tools/design-iteration/`).
Through round 6 we did a comprehensive design review pass on Moon and
Earth — six review points each, all addressed and confirmed. Jupiter is
authored but not yet design-reviewed.

I'm starting a fresh chat because the prior conversation got long. All
work is committed to git on branch `upgrade/sdk-54`.

---

## Repo layout

```
src/features/game/world/        ← engine schema + helpers + themes (TS)
  types.ts                       ← v0.5 WorldTheme schema
  color.ts                       ← OKLCh interpolation helpers
  cycle.ts                       ← cycleProfile (atmospheric/airless) helpers
  themes/{moon,earth,jupiter}.ts ← three frozen WorldTheme instances
  themes/index.ts                ← registry
  index.ts                       ← barrel
src/app/_canvas/
  WorldRenderer.tsx              ← Skia production renderer
  GameCanvas.tsx                 ← mount point (worldTheme prop, currently feature-flag-gated)
src/app/_hooks/useCurrentPlanet.ts  ← AsyncStorage planet selection
tools/design-iteration/         ← live HTML/React iteration tool
  Earth.html / Moon.html / Jupiter.html   ← entry points
  app.jsx, frames/*, world/*    ← React + theme-schema + JS-format themes + JSX renderer
tools/world-preview.html         ← Skia-faithful preview standin (frozen at round 2 — Moon-only)
tools/{copy-design-iteration,serve-design-iteration,v0.3-checks,v0.3-snapshot}.ps1
```

The iteration tool runs over a local http-server (`serve-design-iteration.ps1`).
Tweaks panel auto-activates on standalone via a small bootstrap in each HTML.

---

## Schema v0.5 (locked)

`WorldTheme` shape per `src/features/game/world/types.ts`:

```ts
{
  id: 'moon' | 'earth' | 'jupiter';
  label, tagline: string;
  gravityMul, scoreMul: number;
  cycleProfile: 'atmospheric' | 'airless';   // plateau-weighted day/night timing
  sky: { topCurve, midCurve, bottomCurve };  // 3-stop ColorStop[] each
  bands: Band[];                              // far → near
  particles: ParticleSpec[];
  celestials: Celestial[];
  palette: { pipeWall, pipeEdge, dotL, dotR, dividerGlowL, dividerGlowR, bgFlash };
}
```

- `Band` kinds: `silhouette` | `plain` | `craters`. Silhouettes carry a `profile`
  enum: `'soft-craters' | 'cratered-horizon' | 'mountains' | 'hills' | 'singleHill' | 'storm-bands'`.
  Optional `gradientCurve?` for internal vertical shading on silhouettes.
- `ParticleSpec` kinds: `starfield | horizontalDrift | clouds | birds`.
  Optional `sizeMul?` on starfield/birds.
- `Celestial.kind`: `planet | sun | moon | storm-eye`.
  Optional `xCurve` / `yCurve` (sample raw t — continuous arcing position),
  `phaseCurve` (terminator).
- Renderer rule: `glow=0` hides body+halo for sun/moon kinds only;
  storm-eye/planet always visible.

**Note: iteration tool's renderer ALSO supports `kind: 'earth'`** — special-case
rendering with stylised continents, ice caps, atmospheric halo. **The engine
schema's Celestial.kind union does NOT include `'earth'` yet.** Moon's earth-
from-Moon celestial uses `kind: 'earth'` in `theme-moon.js` (iteration tool)
but `kind: 'planet'` in `themes/moon.ts` (engine). One outstanding port.

---

## What's settled (do not relitigate)

- Warm/cool dot palette locked across all worlds (amber + ice).
- Pipe palette navy family (#10355c wall, #7ac0e8 edge).
- ToD wrap: 4 stops at 0/0.25/0.5/0.75; t=1 wraps to 0.
- Particle `count` = fixed seeded positions; `densityCurve` = alpha multiplier.
- Coordinate units: yPct/heightPct of VIS_H, xPct of canvas width.
- OKLCh interpolation in renderer.
- Per-world cycle profile (Moon airless, Earth atmospheric, Jupiter atmospheric).
- No schema additions for Jupiter — used hardcoded storm-eye rendering instead.

---

## Round 6 design review — six points each, all confirmed

### Moon

1. ✅ Divider glow removed from `game-overlay.jsx` + toggle removed from app panel.
2. ✅ farRidge band removed from `theme-moon.js`.
3. ✅ Craters made static (no scroll drift), two-shade depth (lighter rim halo
   - darker bowl offset upward), power-law size distribution (32 craters,
     75% small, 20% medium, 5% large, sizes 6-50px wide, with overlap rejection
     buffer of 1.1×). Crater band extended to cover the full regolith plain
     (foreground band yPct 0.78 / heightPct 0.22).
4. ✅ Stars confined to sky region — Starfield reads the topmost band's `yPct`
   as the ceiling instead of hardcoded 0.55. Lunar dust particle removed
   (was reading as misplaced stars in regolith area).
5. ✅ Mid mountains raised + taller (yPct 0.61, heightPct 0.17). Cratered-
   horizon path generator rewritten: 96 points, three octaves + crater dip
   events, peaks reach further into sky.
6. ✅ Earth-from-Moon now renders via `kind: 'earth'` → recognisable
   continents (sharp Africa with east-coast horn, lobed Europe, North +
   South America fragments on western limb, Madagascar dot) + white polar
   ice caps + atmospheric halo + soft terminator.

### Earth

1. ✅ Divider glow (same fix as Moon point 1).
2. ✅ rollingHills band removed from `theme-earth.js`. Toggle + showNearPlain
   default removed from `app.jsx`.
3. ✅ Foreground hill smoother + lower: ripple removed, peakY raised from
   `h*0.05` to `h*0.55` (much flatter rise), 120 path points. Then nearHill
   yPct 0.82 → 0.86 / heightPct 0.18 → 0.14 (band starts lower, smaller).
   Parallax 0.85 → 0.30 (slowed to fit other bands' speeds). Mid mountains
   heightPct 0.40 → 0.45 (extends to canvas bottom, covers gap at edges).
   **Plus grass tufts on the hill top edge** — 3-blade clumps with two-tone
   light/dark green, ToD-aware colours, ~22px clump spacing, ~18% gaps,
   wide angle/curl jitter, 20% chance of 4th rogue blade per clump.
4. ✅ Mountains less steep — peak heightFrac range 0.65-0.95 → 0.45-0.75.
5. ✅ Birds: wingtips now actually move (oscillate around body y by
   `b.size * sin(phase) * 0.7`) — the body stays anchored. Each wing's
   control point displaced PERPENDICULAR to the tip→body line by 0.45×size,
   giving a consistent visible curve regardless of flap phase. Frequency
   slowed from ~2 Hz to ~1.3 Hz. Body anchor handled by the geometry of two
   curves meeting at a fixed point — no separate body element (we tried, it
   floated above the wings, reverted).
6. ✅ Clouds: bubble bottoms aligned at a common baseline (`by = -br + br*0.12`
   so all bubbles extend slightly below the clip line), then a clip-path
   truncates everything below y=0 in cloud-local coords. Result is
   geometrically flat bottoms regardless of bubble curve scalloping.
   Removed the previous flat-rect underline that read as a discrete bar.

### Jupiter — not yet design-reviewed

Authored in round 5, has 6 atmospheric bands (storm-bands profile),
Great Red Spot (storm-eye, oval with concentric rings + slow rotation),
distant sun, Io + Europa as moon-kind celestials with arcing xCurve/yCurve.
Negative parallax on alternating bands for zonal flow.

---

## Tooling

- **`.\tools\v0.3-snapshot.ps1 "<message>"`** — git add+commit with `round 6:`
  prefix. Run after every confirmed change. (Or change the prefix for round 7.)
- **`.\tools\v0.3-checks.ps1`** — typecheck + lint + tests + open Skia preview.
- **`.\tools\serve-design-iteration.ps1`** — http-server on port 8080
  serving the iteration tool. Open Earth/Moon/Jupiter.html.
- **`.\tools\copy-design-iteration.ps1`** — copies design's working folder
  (`C:\Claude\Two Dots\Design Files`) into `tools\design-iteration`.
  **Don't run mid-iteration** — overwrites local edits.

Hard-refresh the browser after edits (Ctrl+F5) — Babel-standalone caches
compiled JSX in the browser.

---

## What's NOT yet done

1. **Engine-side renderer catch-up.** Round 6 changes were all in the
   iteration tool (`tools/design-iteration/world/world-renderer.jsx`). The
   production Skia renderer (`src/app/_canvas/WorldRenderer.tsx`) doesn't
   yet have:
   - The new crater field (32 craters, two-shade depth, power-law sizing)
   - Updated cratered-horizon path (96 points + 3 octaves)
   - Updated singleHill (flat peak, no ripple)
   - Updated mountains (less steep peaks)
   - Updated bird flap (wingtip oscillation, perpendicular curl)
   - Updated cloud (clip-path flat bottom)
   - Grass tufts (currently iteration-tool only)
   - `kind: 'earth'` celestial rendering (currently iteration-tool only;
     also requires schema addition to Celestial.kind union)
2. **Engine-side theme catch-up.** `themes/moon.ts` and `themes/earth.ts`
   don't reflect the round 6 numerical changes (yPct, heightPct, parallax,
   band removals). Manual port from `theme-*.js` to `themes/*.ts` needed.
3. **Jupiter design review.** Not been through the design pass that
   Moon and Earth have completed.
4. **Skia-faithful preview HTML** (`tools/world-preview.html`) is on
   round 2 / Moon-only. Either retire or update.
5. **Production wiring**: `app/index.tsx` has `WORLDS_ENABLED = false`
   guard. Flip when ready to ship the v0.3 background.

---

## Recommended next moves

- **Snapshot baseline and engine catch-up port** — single PR. Iteration
  tool numbers and renderer behaviours, ported into engine themes/renderer.
  Includes the schema additions (Celestial.kind: 'earth').
- **Jupiter design review** — same 4-frame side-by-side pattern as Moon
  - Earth. I have the iteration tool ready; Jupiter.html serves it.
- **Production switch-on** — flip WORLDS_ENABLED, run gates on device.

---

## Versioning workflow we settled on (round 6 lesson)

Files in `tools/design-iteration/` were getting reverted unpredictably
mid-iteration (likely from re-runs of the copy script). Solution: git is
the source of truth. Commit after every confirmed change via
`.\tools\v0.3-snapshot.ps1`. Branch is `upgrade/sdk-54`. To audit current
state vs HEAD: `git diff` or `git status`.

Last round 6 commit message convention: `round 6: <world> point N — <summary>`.

Go when ready.
