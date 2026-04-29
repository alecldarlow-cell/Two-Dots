# Two Dots v0.3 — round 7 close-out

Jupiter design iteration concluded. This document is the source of truth for
what was settled this round and what the engine catch-up needs to port. Pair
with `handoff-shipwork.md` (task 1, engine catch-up) when starting that work.

Branch: `upgrade/sdk-54`. All round-7 changes committed.

---

## What's locked

### Bands — 4 cloud bands

Jupiter is now four `kind: 'cloudBand'` bands, tiling cleanly from yPct 0.22
to canvas bottom. Reduced from 6 in the layer-count audit (cut `farBand1` and
`midBand1` as redundant).

| id          | yPct | heightPct | parallax | turbulence | driftSpeed | streaks | role |
|-------------|------|-----------|----------|------------|------------|---------|------|
| `farBand2`  | 0.22 | 0.20      | 0.10     | 0.45       | -0.5       | 4       | distant ochre/cream zone |
| `midBand2`  | 0.41 | 0.20      | 0.32     | 0.55       |  0.7       | 5       | cream-zone belt; GRS hosts here |
| `nearBand1` | 0.60 | 0.20      | 0.50     | 0.65       | -0.9       | 6       | deep mahogany turbulent belt |
| `nearBand2` | 0.79 | 0.21      | 0.85     | 0.75       |  0.4       | 10      | foreground anchor — slowest, darkest, densest detail |

Each band has a 4-stop `colorCurve` and `streakCurve` across the ToD positions
0/0.25/0.5/0.75 (dawn/day/dusk/night). Streaks within bands render as wavy
3-octave paths in grey-tinted colour (`lerpHex(streakColor, '#808078', 0.55)`).

### Sky

Three-stop gradient (top/mid/bot) tinting through warm dusty rust → caramel →
burnt sienna → near-black. No "sky" in the terrestrial sense — Jupiter has
no surface horizon, just atmosphere all the way down.

### GRS — `kind: 'gasGiantSpot'`

- Radius 70, aspectRatio 1.35 (eased from 1.6 — was too stretched at frame size)
- xCurve `-0.15 / 0.20 / 0.50 / 0.85` — visible across most of the cycle, dusk-centred peak as signature
- yCurve flat at 0.50
- Internal swirl: 4 concentric ellipses + bright eye highlight
- Renders in a separate post-band pass so it sits on top of the cloud bands

### Storm cells — `kind: 'stormClouds'`

Cumulus-dome silhouette (5–7 overlapping circles) with a vertical
light→mid→dark linear gradient clipped inside. Three-tone shading derived
from the band-tone tint via `lerpHex` toward white (highlight) and black
(shadow). 6 cells per scene, drifting independently of bands at speed 0.55.

ToD palette: deep rust (dawn) → warm cream-tan (day) → warm burning orange
(dusk) → dim warm grey (night). Coverage `yMinPct 0.32` to `yMaxPct 0.72` so
cells ride the band region.

### Aurora — top-of-frame screen-blended overlay

Vertical linear gradient (green at top, violet at bottom), opacity scales
with density curve. Density: 0 at dawn/day → 0.25 at dusk → 1.0 at night.
mixBlendMode: 'screen' so it adds light to the bands rather than overlaying.

### Lightning — anchored to storm cells

Each flash originates from a storm cell's bottom edge (computed via the
shared `computeStormCellPositions` helper, which both StormClouds and
Lightning call to agree on positions). Bolt extends downward from the cell.

Three-layer rendering:
1. **Whole-scene ambient flash** — white rect, mixBlendMode screen, opacity
   sums per-flash intensities (capped at 0.18). Whole atmosphere brightens.
2. **Cool radial bloom** — white-cyan core fading through pale blue to violet.
3. **Jagged bolt + 0–2 branch forks** — 8–12 segment polyline with parabolic-
   tapered jitter, drawn twice (cyan-white halo + pure-white core).

Schedule: 8s loop, up to 6 flashes scheduled per loop, each 160–480ms.
Sharp 10% attack, exponential 90% decay. Density curve fires lightning
mostly at night.

### Sound, haptics, dot palette, pipe palette — locked elsewhere

- Pipes are being redesigned in a separate session. Theme palette currently
  holds the cross-world locked navy + ice (`#10355c` / `#7ac0e8`).
- Dot palette is the locked warm/cool amber + ice (`#FFB13B` / `#7FE5E8`).
- Sounds and haptics are scoped to `handoff-shipwork.md` task 7.

---

## Schema additions

These are all **additive** and don't break Moon/Earth. The engine catch-up
should add them to `src/features/game/world/types.ts`:

- **Band kind**: `'cloudBand'` added to the band-kind union (alongside
  existing `'silhouette'`, `'plain'`, `'craters'`).
- **Band properties**: `cloudBand` bands carry these new properties — all
  optional with sensible defaults:
  - `turbulence: number` — 0–1, top-edge wobble amplitude (default 0.25)
  - `driftSpeed: number` — independent horizontal drift, can be negative
  - `streaks: number` — count of wavy interior shear-streaks (default 0)
  - `streakCurve: ColorStop[]` — color curve for streaks
- **Celestial kind**: `'gasGiantSpot'` added to `Celestial.kind` union
  (alongside existing `'sun'`, `'moon'`, `'planet'`, `'storm-eye'`).
- **gasGiantSpot properties**: `aspectRatio: number`, `rimCurve: ColorStop[]`.
- **Particle kinds**: `'stormClouds'`, `'aurora'`, `'lightning'` added to
  the particle-kind union (alongside existing `'starfield'`, `'clouds'`,
  `'birds'`, `'horizontalDrift'`).
- **stormClouds properties**: `yMinPct`, `yMaxPct`, `colorCurve`, `speed`,
  `densityCurve`, `count`.
- **aurora properties**: `colorTopCurve`, `colorBotCurve`, `densityCurve`.
- **lightning properties**: `count`, `densityCurve` (no other config — schedule
  is currently hardcoded in the renderer).

The earlier `'storm-eye'` celestial kind is **dead code** in the renderer
(its branch still exists for future use, but no theme references it). Same
with the `'shearMotes'` particle kind — component still exported, no theme
uses it.

---

## Files modified this round

In the iteration tool only — engine catch-up is task 1 in `handoff-shipwork.md`:

- `tools/design-iteration/world/theme-jupiter.js` — full Jupiter theme
- `tools/design-iteration/world/world-renderer.jsx`:
  - `CloudBand` component — turbulent-edge solid-fill cloud bands
  - `StormClouds` component — illustrated cumulus with gradient shading
  - `Aurora` component — screen-blended top-of-frame overlay
  - `Lightning` component — three-layer cloud-anchored strikes
  - `ShearMotes` component — kept but unused (Jupiter doesn't reference it)
  - `gasGiantSpot` branch added to existing `Celestial`
  - Render-order changes: gasGiantSpot drawn AFTER bands; aurora drawn
    BETWEEN clouds and bands; storm cells AFTER bands; lightning LAST
  - New shared helper `computeStormCellPositions`
  - Old `stormBandsPath` and `'storm-eye'` Celestial branch left as dead code

Engine + production renderer (`src/`) was **not** touched this round. All
production-engine catch-up porting is task 1 in shipwork.

---

## Open follow-ups (NOT done this round)

- **Pipe redesign** — handled in a separate session. Result will land in
  `theme-jupiter.js`'s `palette.pipeWall` / `palette.pipeEdge` (currently
  navy+ice). Engine catch-up needs to keep an eye on whether per-world
  pipe palettes are wanted vs the universal lock.
- **Lightning verification** — implementation lands per spec but capturing
  a frame mid-strike was flaky. Worth eyeballing on device once the engine
  port is in.
- **Demo pipe overlay in iteration tool** — the "Show demo pipe" toggle is
  on by default and obscures the centre of every screenshot. Cosmetic; not
  a real-world issue, just a screenshot annoyance. Consider defaulting it
  off or moving the demo pipe off-centre.
- **Snapshot script prefix** — `.\tools\v0.3-snapshot.ps1` hardcodes a
  `round 6:` prefix to commit messages. Round 7 commits ended up titled
  "round 6: round 7: ...". Cosmetic; fix when convenient.

---

## Resuming in a new chat

Paste this whole document at the top of the new chat. The new chat should:

- If continuing **engine catch-up** — start with `handoff-shipwork.md` task 1.
  Jupiter is now ready to be ported alongside the round-6 Moon/Earth work.
- If continuing **further Jupiter polish** — load this doc plus the relevant
  files (`theme-jupiter.js`, `world-renderer.jsx`) and pick up from open
  follow-ups.

Round 7 closed.
