# Context for fresh chat — v0.3-worlds (Moon scaffolded; Earth + Jupiter design)

I'm continuing the v0.3 planetary-modes work with you (design role). The engine
side has scaffolded the schema + Moon theme + `WorldRenderer` + `useCurrentPlanet`
hook, and rendered an HTML stand-in of Moon at the four ToD keypoints to read
ahead of the Skia run on a real device.

I'm starting a fresh chat with you because the prior context is no longer needed.
Attached: this doc + `tools/world-preview.html` (engineering-side render of Moon)

- the locked schema bundle from before (`world-system.md`, `themes/moon.ts`,
  `WORLD_SYSTEM_REFERENCE/*.png`).

## What's settled (do not re-litigate)

- Schema: `WorldTheme` interface in `world-system.md` §1 is the agreement, now
  implemented at `src/features/game/world/types.ts`. Nothing changed at first
  contact with Skia — the schema is proven against the renderer skeleton.
- `themes/moon.ts` drops in cleanly with `as const satisfies WorldTheme`.
- ToD wrap is renderer convention: 4 stops at 0/0.25/0.5/0.75; t=1 lerps to t=0.
- Particle `count` = fixed seeded positions; `densityCurve` = alpha multiplier.
  No pop-in.
- Coordinate units: `yPct`/`heightPct` of `VIS_H`; `xPct` of canvas width;
  celestial `radius` raw px; `speed` px/sec; twinkle = independent random phase
  per star, ~1Hz, deterministic seed.
- Colour space: hex strings sRGB → preprocessed to OKLCh at module-load →
  interpolated in OKLCh on the worklet thread (production); HTML preview does
  the same in JS.
- Warm/cool dot palette is locked across all worlds (Q2 sign-off): amber-L /
  ice-R hue family, chroma + lightness flex per-world only.
- PR scope: `feat/v0.3-worlds`. Branch cut, will tag `v0.3.0-worlds-moon` once
  the side-by-side diff passes.

## What to look at

Open `tools/world-preview.html` in a browser. You'll see four Moon frames at
ToD 0/0.25/0.5/0.75 plus a live ToD scrubber. The preview reads `themes/moon.ts`
through the same OKLCh math, the same procedural silhouette generator, and the
same particle seeder the production Skia renderer uses (see
`src/app/_canvas/WorldRenderer.tsx`). Diff against `WORLD_SYSTEM_REFERENCE/*.png`
for the §6 acceptance gate.

## What I learned at first contact (Skia/CSS divergences worth knowing for

authoring Earth + Jupiter)

- HTML preview gradients band slightly more than Skia OKLCh through dawn/dusk —
  Skia is the truth source. Author colour curves to read well in Skia, not the
  HTML preview.
- `'mountains'` (Earth) and `'storm-bands'` (Jupiter) silhouette profiles are
  currently stub fallbacks in the renderer. The procedural shape generator is
  ~30 lines per profile in `WorldRenderer.tsx`; if you want particular peak
  jaggedness or band undulation, send me a sketch and I'll tune the params
  rather than you specifying procedural numbers in JSON.
- Glow falloff: HTML uses `radial-gradient` ramps; Skia uses RadialGradient or
  BlurMask. Calibrate `glowCurve` values against Skia screenshots, not HTML.
- Celestial `radius: 28` for Earth-from-Moon reads as the right scale; treat
  that as a sanity anchor when sizing Earth's sun and Jupiter's storm-eye.

## What I need from you

For Earth (and then Jupiter), produce `themes/earth.ts` (and `themes/jupiter.ts`)
in the exact shape of `themes/moon.ts`. Same `as const satisfies WorldTheme`.
Include:

- 4-stop sky/band/celestial/glow curves at ToD 0.0 / 0.25 / 0.5 / 0.75
- `yPct` / `heightPct` / `parallax` for each band
- Particle counts + `densityCurve`s (starfield, horizontalDrift)
- Pipe palette (`pipeWall` + `pipeEdge` in the navy/blue family per locked
  decision; minor variation per world is fine)
- Dot palette stays warm-L / cool-R — keep amber + ice; chroma + lightness
  flex per-world

Earth-specific notes: `gravityMul: 1.0` (canonical; Earth is the leaderboard
baseline); `scoreMul: 1.0`. Day-cycle should hit a true blue daytime sky and
a believable sunset palette. Silhouette `profile: 'mountains'` triggers the
mountain generator.

Jupiter-specific notes: high-gravity feel — `gravityMul: 1.4` is a starting
point, we'll tune in playtest. `scoreMul: 1.5` matches the gameplay tax.
Storm-eye celestial is the obvious anchor; bands can use `kind: 'plain'`
stacked with `hazeCurve`s if you want flowing gas-giant ribbons rather than
silhouettes.

When ready, drop the theme file + four reference PNGs at the matching ToD
keypoints. I'll feed it through the same render-and-diff loop. Same
~3-5 cycles to converge per planet, but faster than Moon now that schema risk
is gone.

Go when ready.
