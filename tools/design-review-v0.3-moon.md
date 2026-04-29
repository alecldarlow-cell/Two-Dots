# Context for fresh chat — v0.3-worlds Moon, design review (loop cycle 1)

You authored `themes/moon.ts` and the `WORLD_SYSTEM_REFERENCE/*.png` set in a
previous chat. Engineering scaffolded `WorldRenderer` + `types.ts` + the OKLCh
interpolation pipeline + procedural silhouette generators against the locked
schema (`world-system.md` §1). We're at step 4–5 of the loop in
`world-system.md` §7: engine has rendered Moon, time to diff before locking
the schema and starting Earth.

I'm starting a fresh chat with you because the prior context is no longer needed.

## What's attached

* `engineering-render-t000.png` … `t075.png` — four captures from the
  engineering-side HTML preview at `tools/world-preview.html`. Same
  `themes/moon.ts` data, same OKLCh maths, same procedural silhouette and
  particle seeders the production Skia renderer uses (see
  `src/app/_canvas/WorldRenderer.tsx`).
* `moon-t000-dawn.png` … `moon-t075-night.png` — your original reference set
  from the first design round.
* `world-system.md` — the locked schema spec (the §6 acceptance gate).
* `themes/moon.ts` — the theme data as committed.

## Engineering-side notes from first contact with Skia (no action for design)

* Browser preview uses sRGB linear-RGB gradient interpolation; production
  Skia will use OKLCh on the worklet thread. Long sky gradients will be
  marginally smoother in Skia (less mid-tone banding). Documented expected
  divergence. **Don't reject on this.**
* Glow falloff in the browser preview uses CSS `radial-gradient` ramps;
  Skia will use `RadialGradient` / `BlurMask`. Glow shape and intensity will
  recalibrate at the device-render step. **Don't reject on this either.**
* `'soft-craters'` and `'cratered-horizon'` silhouette generators are real
  (procedural sin-based with crater dips). `'mountains'` (Earth) and
  `'storm-bands'` (Jupiter) are stub fallbacks pending your next round.

## What's settled (do not relitigate)

* `WorldTheme` schema — types.ts is verbatim from `world-system.md` §1.
* ToD wrap (4 stops at 0/0.25/0.5/0.75; t=1 → t=0).
* Particle `count` = seeded positions; `densityCurve` = alpha multiplier.
* Coordinate units (yPct/heightPct of VIS_H, xPct of canvas, radius raw px,
  speed px/sec).
* OKLCh-on-worklet for production interpolation.
* Warm/cool dot palette locked across all worlds (Q2 sign-off).

## What I need from you

For each of the four ToD pairs (engineering vs. reference at the same `t`),
return **one** of:

**(1) Same intent.** Skia/CSS divergence acceptable. No action.

**(2) Drift.** Identify the category — silhouette amplitude / celestial
placement / band stops / colour curve / star density / glow / dust — and
propose the fix as one of:

* (a) **Theme-data tweak** — change a colour stop, yPct, parallax, particle
  count, glowCurve value in `themes/moon.ts`. Most fixes will be here.
* (b) **Procedural-shape adjustment** — say what's off about a silhouette
  shape (e.g. "soft-craters peaks read too sharp; want gentler undulation
  with shallower crater dips"); engineering tunes the generator params.
* (c) **Schema change** — only if the schema literally can't express the
  intent. Rare. We said no relitigation but a real gap is real.

If all four pairs are (1), schema is proven; we lock Moon and you start Earth.
If any are (2), list the specific fixes and we cycle.

Per spec §6: **"same intent, allowable Skia/CSS divergence"** is the bar.

Go when ready.
