# World System — Design ↔ Engine Contract

_Spec for the v0.3 planetary-modes work. This document is the contract between the design exploration (HTML, in `Moon.html` + `world/`) and the production Skia renderer (TS, to land in `src/app/_canvas/`)._

_Authoring conventions: schema agreement happens here first; design iterates against it; the renderer implements against it; both sides cross-check via a side-by-side diff before signing off Moon._

---

## 1. The schema (TypeScript interface)

Place at `src/features/game/world/types.ts`. Frozen `as const` per planet — never mutated per-frame.

```ts
export type ColorStop = { t: number; color: string }; // t∈[0,1]
export type ScalarStop = { t: number; value: number };

/** Time-of-day cycle position. 0=dawn, 0.25=day, 0.5=dusk, 0.75=night, 1=back to dawn. */
export type ToD = number;

export type SkyGradient = {
  topCurve: ColorStop[]; // 3 stops, top-of-sky colour over ToD
  midCurve: ColorStop[]; // 3 stops, mid-sky
  bottomCurve: ColorStop[]; // 3 stops, where sky meets horizon
};

export type Band =
  | {
      id: string;
      kind: 'silhouette';
      yPct: number;
      heightPct: number;
      parallax: number;
      profile: 'soft-craters' | 'cratered-horizon' | 'mountains' | 'storm-bands';
      colorCurve: ColorStop[];
    }
  | {
      id: string;
      kind: 'plain';
      yPct: number;
      heightPct: number;
      parallax: number;
      colorCurve: ColorStop[];
      hazeCurve?: ColorStop[];
    }
  | {
      id: string;
      kind: 'craters';
      yPct: number;
      heightPct: number;
      parallax: number;
      colorCurve: ColorStop[];
    };

export type ParticleSpec =
  | { id: string; kind: 'starfield'; count: number; densityCurve: ScalarStop[]; twinkle: boolean }
  | {
      id: string;
      kind: 'horizontalDrift';
      count: number;
      densityCurve: ScalarStop[];
      speed: number;
      sizeRange: [number, number];
    };

export type Celestial = {
  id: string;
  kind: 'planet' | 'sun' | 'storm-eye';
  xPct: number;
  yPct: number;
  radius: number;
  colorCurve: ColorStop[];
  glowCurve: ScalarStop[];
};

export type WorldTheme = {
  id: 'moon' | 'earth' | 'jupiter';
  label: string;
  tagline: string;
  gravityMul: number; // engine knob — feeds initState()
  scoreMul: number; // scoring multiplier
  sky: SkyGradient;
  bands: Band[]; // ordered far→near
  particles: ParticleSpec[];
  celestials: Celestial[];
  palette: {
    pipeWall: string; // override of WALL_R within taste
    pipeEdge: string; // override of PIPE_EDGE within taste
    dotL: string; // per-world dot tint (still warm)
    dotR: string; // per-world dot tint (still cool)
    dividerGlowL: string;
    dividerGlowR: string;
    bgFlash: string; // death-flash colour
  };
};
```

**Open schema decisions** (to settle before Cowork starts implementing):

- Should the celestial be a top-level `Celestial[]` or a band entry? **Decision: top-level.** Rationale — celestials don't share band semantics (no parallax-with-scroll, no terrain interaction).
- Are gradient stops linear-RGB or sRGB? **Decision: sRGB hex strings as input; renderer interpolates in oklch (Skia supports this via colour-space-aware blending).** Documented because CSS does sRGB by default and the HTML mockup will band slightly differently than Skia.

---

## 2. Mount point

```tsx
// src/app/_canvas/GameCanvas.tsx
import { WorldRenderer } from './WorldRenderer';

<Canvas pointerEvents="none" style={...}>
  <WorldRenderer theme={currentTheme} t={timeOfDay} scrollX={worldScrollX} />
  {/* existing divider, pipes, dots, particles render ON TOP — order preserved */}
  ...
</Canvas>
```

Single subtree, first child, behind everything. No engine changes.

---

## 3. Planet selection — app state, not engine state

New hook `src/app/_hooks/useCurrentPlanet.ts`. Same pattern as `bestScore`:

```ts
export function useCurrentPlanet(): [WorldTheme, (id: WorldTheme['id']) => void] {
  // AsyncStorage round-trip on mount; setter persists immediately.
  // Default: 'earth' (canonical leaderboard).
}
```

Threaded into `GameCanvas` as a prop. The engine's `initState()` reads `gravityMul` from the chosen theme.

---

## 4. Three guardrails (per Cowork's perf review)

### 4.1 Co-fix P0-1 in the same release

`Path.Make()` allocations per-frame in `PipeScanlines.tsx` and `Dot.strokeCircle` are still open. Memoize static path geometry with `useMemo`, pass the same `SkPath` instance frame to frame. Bundle this into the `feat/v0.3-worlds` PR — adding `WorldRenderer` without fixing P0-1 is incremental GC pressure.

### 4.2 Mid-range Android device test gate

Pixel 7 has substantial GPU headroom. Real proof gate: **60-second sustained-play test on a non-flagship Android (Pixel-5-class, 4GB RAM) with frame-rate overlay**. Must hold ≥58fps. PLAN.md Stage 4. No production tag without this.

### 4.3 Memoization patterns from day one

- `useMemo` for static-per-planet geometry (silhouette outlines, crater positions, particle base positions)
- `WorldTheme` objects defined `as const` and frozen; never mutated
- Stable references on gradient stop arrays (Skia rebuilds shaders on identity change)
- `useDerivedValue` (Skia reactive primitive) for genuinely per-frame values — **never** React state

---

## 5. Five Skia-vs-CSS translation gotchas

Flagged by Cowork. The HTML mockup will diverge from Skia in these areas; resolve at translation, not at design.

| Gotcha                      | Symptom                                                       | Mitigation                                                                      |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Gradient interpolation mode | Long sky gradients band differently sRGB vs. linear-RGB       | Render Skia in oklch; HTML mockup is reference for _intent_, not pixel-identity |
| Path AA defaults            | Silhouette edges may shimmer or look softer/harder            | Use Skia `antiAlias` explicit on all paths                                      |
| Blend-mode subset           | CSS modes (e.g. `screen`, `overlay`) without Skia equivalents | Stick to `srcOver`, `multiply`, `plus` — pre-checked in renderer                |
| Pattern fills               | Tile/repeat semantics differ                                  | Avoid pattern fills; use procedural draw                                        |
| Blur radii                  | `filter: blur(Npx)` ≠ `BlurMask(N)`                           | Calibrate against Skia, not CSS, when porting glow                              |

---

## 6. Acceptance: side-by-side diff

The artifact that locks Moon in: an HTML screenshot of `Moon.html` next to a Skia screenshot of the production app, both at same logical resolution, both at the same ToD value (slider at 0.25 / 0.5 / 0.75 / 1.0 — four pairs).

When all four pairs read as "same intent, allowable Skia/CSS divergence", schema is **proven** and Earth + Jupiter design proceeds.

---

## 7. Iteration loop (Path B, loose)

1. Schema (this doc) reviewed & agreed
2. Cowork scaffolds `WorldRenderer.tsx` + `types.ts` against schema
3. Design hands over Moon JSON (`world/theme-moon.js` → transcribe to `themes/moon.ts`)
4. Cowork renders Moon in Skia; flags any field that doesn't translate
5. Design adjusts schema or the Moon JSON; Cowork re-renders
6. ~3–5 cycles to converge. Side-by-side diff at each cycle.
7. Lock Moon → design Earth + Jupiter against now-proven schema
8. Cowork implements Earth + Jupiter with same loop, but faster (schema risk gone)

No blocking dependencies with v0.2 polish work — fully parallelisable.

---

## 8. Files this work touches (estimate)

```
src/features/game/world/
  types.ts                   ← schema (this doc §1)
  themes/moon.ts             ← from world/theme-moon.js
  themes/earth.ts            ← from world/theme-earth.js (TBD)
  themes/jupiter.ts          ← from world/theme-jupiter.js (TBD)
  index.ts
src/app/_canvas/
  WorldRenderer.tsx          ← new, reads schema, draws via Skia primitives
  PipeScanlines.tsx          ← MODIFIED (P0-1 fix: memoize Path.Make)
  Dot.tsx                    ← MODIFIED (P0-1 fix: memoize stroke path)
src/app/_hooks/
  useCurrentPlanet.ts        ← new, AsyncStorage-backed selection
src/shared/storage/
  keys.ts                    ← add StorageKeys.currentPlanet
src/app/index.tsx            ← thread currentTheme into GameCanvas
src/features/game/engine/
  state.ts                   ← read gravityMul from theme on initState (only engine touch — verify against existing tests)
```

Engine tests (124) stay green. New tests:

- `WorldRenderer` snapshot tests for Moon at four ToD keypoints
- `useCurrentPlanet` round-trip persistence test
- `themes/*.ts` shape validation against schema (compile-time via TS)

---

## 9. Out of scope (for now)

- Per-world music / SFX pitch shift
- Per-world pipe palettes beyond the navy family
- Mountains/terrain as gameplay obstacles (you flagged this as future direction; the schema supports it via `kind: 'silhouette'` with collision data — but **collision off the silhouette** is engine-touching work and lives in v0.4)
- Daily-challenge integration with planets
- Cosmetic/skin layer on dots
