# Two Dots — Forward Dev Ideas Brief

_Compiled 29 Apr 2026, end of session 10 (dev chat). Refined after a critical review pass that verified specific claims against the codebase (`tiers.ts`, `step.ts`), `UX_AUDIT.md`, and the Decisions Log. Input sources: Confluence (Piers), live web research on hyper-casual game design best-practice (8 dimensions, sourced inline in the underlying report), a comparative profile of 12 similar games (training-data synthesis — specific quantitative claims from this stream are flagged), Alec's five seed ideas, and additions from this synthesis. This is a menu, not a roadmap — directional choices follow._

---

## 1. Where Two Dots is right now

- **v0.1.3-eas-preview-validated.** Fully playable on Pixel 7 dev build; preview APK distributed to first technical tester.
- **Engine** is pure TS, 124 tests pinning physics / tiers / spawn / collision invariants. Adding modes ≈ composing alternate `step.ts` paths.
- **Persistence layer is already richer than the UI uses it.** AsyncStorage holds `personalBest` only. Supabase has `devices` / `scores` / `analytics_events` (with `session_id`, `run_index`, JSONB `payload`) — Stage 6 progression has its data plumbing already done.
- **Engine emits semantic events** the loop maps to audio: `score-blip` (tier-aware), `tier-boundary-chord`, `every-five-chime`, `close-call`, `death`. `closeL/closeR` frame counters already detect near-misses but only drive a visual ring — they're not yet rewarded with score, juice, or analytics depth.
- **Visual semantics are locked**: orange (left dot) / cyan (right dot) / navy + sky-blue (pipes) / gold (reward moments).
- **Zero onboarding, zero settings, zero cosmetics, single best-score persistence** — these are the meta-game gaps.

---

## 2. What Piers wrote (Confluence)

The Business Case is clear about what Piers thinks matters beyond the MVP. Verbatim or near-verbatim:

- **Difficulty escalation in four phases.** Phase 1 single-axis (one dot at a time). Phase 2 simultaneous gaps (both jump at once). Phase 3 asymmetric timing (suppress the mirror impulse). Phase 4 "which" logic (priority decision under time pressure). _The current engine is mostly Phase 1+2 with some Phase 3 in late tiers. Phase 4 ("which") isn't implemented._
- **Cosmetic IAPs as a revenue stream**: dot skins, trail effects, background themes. £0.99–£2.99. No pay-to-win.
- **Acquisition strategy = short-form social content** showing failed attempts. _"This must be treated as a product design consideration: the game should make it easy for players to record and share their screen, and the visual of two independent dots failing in different ways at different times is inherently watchable content."_ This is the only acquisition lever Piers' research backs at zero ad-spend; it implies an in-app capture / shareable score card as a **product** feature, not a marketing afterthought.
- **Open question on monetisation model.** £1.99 upfront (Geometry Dash) vs. free-with-rewarded-ads + cosmetic IAP. Both are alive in 2026; pure ad-only hypercasual is in decline.
- **Visual language**: lighting, shadow, geometry — minimalist, no character art, distinct from photorealistic competitors. The constraint is the aesthetic.

The Decisions Log doesn't contain post-MVP feature ideas — it's purely technical decisions made during the build.

---

## 3. What the research said

Two independent investigations — one on hyper-casual design best-practice (eight dimensions, web-sourced inline), one on twelve neighbouring titles (Flappy Bird, Don't Touch the Spikes, Color Switch, Stack, Helix Jump, Geometry Dash, Crossy Road, Voodoo wave, Alto's Odyssey, Color Bump 3D, Magic Tiles 3, Two Brain Sides). _Note: the comparative-games study was a training-data synthesis rather than fresh web research, so its specific run-length and percentage numbers below are directionally reliable but not citable; the best-practice study has live citations in `outputs/game_design_research_report.md`._

The patterns that recur across winners:

1. **Micro-failure loops of seconds, not minutes.** Sessions in the genre tend to end in well under a minute; quick retries are part of the loop. Worth instrumenting Two Dots' actual run-time distribution from `analytics_events` to confirm.
2. **Cosmetic progression is the most-recurring soft layer.** Almost every successful title in the comparative set uses it. Visible progress on failed runs combats demoralisation; milestone-tied unlocks (Stack: blocks-to-unlock-next-skin) feel earned. Mystery-box mechanics (Crossy Road) drive more engagement than deterministic unlocks but bring an age-rating / gambling exposure — UK Gambling Commission and PEGI have tightened on loot-box mechanics; deterministic unlocks sidestep this entirely.
3. **Brutal honest difficulty beats dynamic adjustment.** Flappy's pipes never widen. Players blame themselves, not the game. Counter-intuitive lesson: don't soften the curve to be kind; tune the loop to feel fair, not easier.
4. **Hit-pause + audio stinger + particle burst on near-miss is the highest-ROI juice technique.** Single most cited intervention across the design literature, smallest implementation cost.
5. **Pick ONE primary retention hook.** Color Switch chose leaderboards. Magic Tiles 3 chose daily challenges. The patterns that share a hook well are the ones that combine a competitive surface (leaderboard or PB) with a soft progression layer (cosmetics) — not two competing engagement loops.
6. **Failure must feel cathartic, not punitive.** Stack's whole design thesis ("Polish as Progression," GDC 2016). Haptics + visual + audio so the moment of death is *satisfying* — drives instant retry.
7. **Premium pricing (£1.99) is alive and well in the minimalist arcade niche.** Geometry Dash is the canonical example. Buys editorial trust, eliminates ad integration entirely.
8. **Community / extensibility creates long tails.** Geometry Dash level editor. Magic Tiles weekly songs. Static-content games burn out faster than ones with content drops or community surfaces. Two Dots can't easily ship a level editor (procedural, not authored), but seasonal cosmetic drops or weekly fixed-seed challenges are the equivalent.
9. **Contextual onboarding beats forced tutorials when the mechanic is one sentence.** "Tap LEFT to jump orange" appears on first frame, fades after first successful jump. Avoids the patronising tutorial-level penalty for returning players.
10. **Accessibility settings are now a featuring signal.** Apple editorial and Play Store featuring lean toward titles with reduced-motion, colour-blind, dynamic-type-cap, sound/haptics toggles. Cost: low double-digit hours. Return: editorial visibility + a measurable increment of addressable audience.

Full reports preserved at `outputs/game_design_research_report.md` (best-practice, 8 sections, sources cited inline) and as an agent transcript on the comparative-games study.

---

## 4. Alec's five seed ideas — examined

### (i) Planetary gravity difficulty modes — Moon / Earth / Jupiter
**Strong.** Maps the existing `gravity` constant onto a difficulty axis the player understands intuitively. Lower gravity (Moon) = floatier dots, longer hang-time, more reaction window — easier. Higher gravity (Jupiter) = faster fall, tighter timing — harder. Score multiplier per planet (e.g. ×0.7 / ×1.0 / ×1.6) keeps the global leaderboard meaningful while letting easier modes serve as on-ramp.

**Architectural fit**: trivial. `engine/constants.ts` exposes a single gravity scalar. A planet enum threaded through `initState()` and into the scoring multiplier covers it.

**Risk**: leaderboard fragmentation. Mitigation — a single multiplier-adjusted "true score" feeds the global board; per-planet boards exist for vanity. Or: Jupiter is the canonical leaderboard, Moon/Earth are unranked training.

**Tone fit**: planets-as-difficulty also opens an aesthetic door for theming (palettes, particles, even SFX pitch shift) without breaking the established orange/cyan/navy/gold semantic system.

### (ii) Bottom-up inversion — pipes become planet surfaces
**Strong but treat as a distinct mode, not a replacement.** The core mechanic right now is "dots fall, taps push them up against gravity, pipes scroll down". Inverting to "dots are anchored to a surface, taps make them step up, terrain rises from below" is a fundamentally different feel — closer to Doodle Jump or a vertical Geometry Dash than the current Flappy lineage.

**Why ship it as a mode:** keeps the canonical Two Dots feel intact while opening a second flavour. Leverages the same engine primitives — collision, scoring, tier ramps — with re-skinned terrain.

**Visual payoff**: lunar craters / Earth horizon / Jovian storm bands as "pipes" gives art direction a strong hook. Pairs naturally with idea (i).

**Risk**: mode proliferation dilutes the leaderboard story. Solution — call this "Surface Mode" and gate the leaderboard separately.

### (iii) Cross-run currency + spend
**The right instinct, the spend question is the hard part.** Research is clear: cosmetics are the dominant spend across the genre (10 of 12 winners). The matrix of viable sinks for Two Dots:

| Sink | Maps to existing identity | Cost to produce | Player appeal |
|------|---------------------------|-----------------|---------------|
| Dot colour skins | ✅ Direct (orange / cyan are the brand — variants like blood-orange/teal stay on-brand) | Low (palette edits) | High (Stack model) |
| Trail particles | ✅ Already in the Skia layer | Medium (new particle systems) | High |
| Pipe palettes per tier | ✅ Tier system already exists | Low (palette work) | Medium |
| Background / starfield themes | ✅ Already navy `COL_BG` | Low | Medium |
| Death particle effects | ✅ Already implemented | Low | Medium (visible only on failure) |
| Audio packs (chord palette swap) | ✅ 16 procedural WAVs already | Medium | Low–medium |
| New planet unlocks (paired with idea i) | ✅ | Medium | High |

**Source**: per-run score, with a conversion ratio (start: half score → currency, tune from playtest) banked at end-of-run. **Sink**: the cosmetic shop only. _No pay-to-win sinks — no extra lives, no power-ups, no slowdowns._ Cosmetic-only protects the integrity of the leaderboard and the brand. **Naming** can be settled at design-time; lean into the brand semantics (e.g. "Sparks") rather than a generic "Coins / Gems" pattern.

### (iv) Flatten the difficulty curve to maximise "new best" hits
**Right instinct, but the actual curve is more nuanced than "flatten globally."** Pulled the verified values from `src/features/game/engine/tiers.ts`:

| Tier | Score | Gap (px) | Speed (px/frame) | Pause (ms) | Δ gap | Δ pause |
|---|---|---|---|---|---|---|
| 1 Warmup | 0–4 | 480 | 1.8 | 1000 | — | — |
| 2 Drift | 5–9 | 400 | 1.8 | 850 | −80 | −150 |
| 3 Swing | 10–14 | 340 | 2.0 | 700 | −60 | −150 |
| 4 Push | 15–19 | 290 | 2.0 | 560 | −50 | −140 |
| 5 Shift | 20–24 | 245 | 2.2 | 430 | −45 | −130 |
| 6 Rush | 25–29 | 210 | 2.2 | 320 | −35 | −110 |
| 7 Chaos | 30–34 | 185 | 2.5 | 270 | −25 | −50 |
| 8 Survival | 35+ | 165→140 | 2.5+ creep | 230 | −20→−45 | −40 |

Two observations from the data:

- **The pause-window does most of the heavy lifting** — collapses by 77% from tier 1→8 (1000ms → 230ms), versus 71% on the gap. Whatever feels like difficulty escalation is largely the time-to-react eroding, not the gap shrinking. If "new bests should feel reachable" is the goal, the highest-leverage knob is `pipePauseMs` for tiers 5–7.
- **Tier 7 → 8 already plateaus speed and gap softens.** The cliff isn't where it intuitively feels — players bounce at tier 5–7 because the pause window halves while the gap also tightens, simultaneously. There may be a real case to flatten _that_ specifically: hold pause at ~430ms through tier 6 instead of 320ms.

**Caveat in `tiers.ts`**: the file comment says _"Values MUST NOT be changed without updating the corresponding tests — the Phase 1 retry-rate gate is measured against this exact difficulty curve."_ A tuning pass needs to (a) update the relevant property tests, (b) acknowledge the Phase 1 retention gate's baseline shifts.

**Concrete proposal**: don't tune blindly. Instrument the existing `analytics_events` queue to log `gate_index_at_death` and `time_to_death_ms` per run, gather 200+ runs from testers, then make one curve-tuning pass with data. Two tasks: one-day instrumentation, one-day tuning post-data.

### (v) Sophisticated dynamics — double-press, near-pass bonus
**Two distinct ideas, treat separately.**

**Near-pass bonus** is the cheapest high-impact win in the brief. Verified against the engine: `step.ts:148-160` already runs `isCloseCall(...)` per dot per pipe, sets `closeCalledByL/R` to prevent re-firing, increments `closeL/closeR` frame counters, and pushes a `{ kind: 'close-call' }` audio event. The wiring exists; what's missing is (a) +1 to `s.score` inside the close-call branch, (b) a `score-blip` audio event alongside the close-call sound for a richer stinger, (c) a 1–2-frame hit-pause via the existing accumulator. All three changes touch `step.ts` and the `playAudioEvent` switch in `useGameLoop.ts`. Engine-test impact: tier-property tests stay green; one new test on the close-call score increment. **Estimate: ~2 hours including the test, not 1.**

**Double-press** is a meaningful design risk. The whole appeal of Two Dots is the one-sentence onboarding ("tap each side to jump the dot on that side"). Adding a hidden mechanic — double-tap left = dash, or double-tap centre = pause swap — fragments that simplicity. _Only do it if it unlocks a specific new gameplay layer that's worth the onboarding tax_, and even then, gate it behind an unlock so casuals never encounter it. Candidate uses: Phase 4 "which" logic obstacles where double-tap acts as a force-pulse to clear a chained pair. Worth prototyping in a feature branch before committing — and only if the planetary-modes work doesn't already absorb the variety budget.

---

## 5. My additions ("anything else sensible")

- **Tier-aware juice & audio.** The engine already labels tiers and emits tier-aware events. Right now visuals/audio change subtly with score but don't theatrically transform on tier boundaries. _Cheap upgrade_: per-tier pipe palettes (still in the navy/sky-blue family), per-tier ambient pad on the music bed, full screen-flash + audio swell at every tier boundary. Maps to "tier-transition theatrics" in `NEXT_CHAT_DEV_PROMPT.md` and to the "horizontal resequencing" pattern from the audio research.
- **Ghost run.** Overlay your previous best as semi-transparent dots running in lockstep — race yourself. Implementation cost is real but bounded: record `(frame, dotLY, dotRY)` triples for the best run only, store as compact array in AsyncStorage, replay during next run. Engine touches: a small recorder slot in `useGameLoop.ts`, two ghost-dot draw calls in `GameCanvas.tsx`. Mature pattern from racing games; not yet seen in the Flappy lineage.
- **Shareable death card.** Piers' explicit acquisition lever. Auto-generated 9:16 PNG of the death moment + score + tier + a "Beat me" caption, one-tap share via the OS sheet. Implementation: `react-native-view-shot` to snap the on-screen Skia canvas + composed React Native overlay, then `expo-sharing` (iOS share sheet) / `Share` API (cross-platform fallback). Not literally <1 day across iOS + Android — budget 2–3 days including layout, asset packaging, share-sheet edge cases.
- **Run-replay export.** A short silent video clip of the run leading into the death moment — exportable to camera roll as MP4. The watchable content Piers' acquisition strategy needs. Significantly more expensive than the death card (requires per-frame Skia capture or a separate replay-render pass) — consider for v2.
- **Telemetry-driven balancing.** Use the `analytics_events` queue we already have. Specific events to add to the existing `run_end` schema and as new types: `close_call` (per occurrence, with `tier`, `gate_index`, `dot_side`); `tier_crossed` (with `score`, `time_into_run_ms`); `time_to_first_tap_ms` on `run_start`; `gate_index_at_death` and `time_to_death_ms` on `run_end`; and a `rage_quit` flag (set if `time_since_last_tap_ms` < 1000 on `app_blur` from a `dead` phase). The schema lives in `src/features/analytics/events.ts`. After 200+ runs the balancing decisions about flatness (idea iv), gravity tuning (idea i), and tier feel become empirical, not intuitive. Estimate: one full session for instrumentation + a Supabase view to query the histograms.
- **Settings surface.** Sound on/off, haptics on/off, reduced-motion (kills screen shake + freeze ramp + close-call ring), high-contrast mode, dynamic-type cap (currently hardcoded 1.3× in `_layout.tsx` — make it adjustable). One full session of work. Unblocks accessibility-driven editorial featuring (research point 10).
- **Onboarding overlay** — "TAP LEFT to jump orange" lane-coloured text appears with a faint thumb circle the first time the user taps idle screen, fades after first successful obstacle. Persists "seen onboarding" flag to AsyncStorage. Lives in `_overlays/IdleScreen.tsx` + a new `_hooks/useOnboarding.ts`. ~1 day.
- **Pause polish.** Pause currently exists but is barebones. A pause panel showing live stats (score, gates, close-calls) plus a "Quit Run" option closes a real UX gap. Side benefit: parking a "Quit Run" exit eliminates the current can't-quit-without-dying frustration.
- **Single-dot training mode.** Optional unlock-able mode where one dot is parked safely off-screen and the player rehearses left-only or right-only timing. Lower-friction entry for new players (one-thumb, like Flappy) without watering down the canonical mode. Pairs with onboarding overlay. Useful for left-handed players who'd default to a single-thumb grip on the train.
- **Idle-screen polish (U11).** `UX_AUDIT.md:110` flags the thumb-circle + instruction cluster sits too high. Address as part of any aesthetic pass.

---

## 6. The 3-pillar framework

The recurring takeaway from both research streams. Every winner does these three things; every burnout failure neglects one.

| Pillar | What it means for Two Dots | Status |
|---|---|---|
| **Tight core loop** | Run-to-retry under ~1.5s. Failure feels fair. Difficulty consistent. | 🟢 broadly in place; retry latency unmeasured; tier-curve cliff at 5–7 (idea iv) is the open item |
| **Soft progression layer** | Visible cross-run accumulation (currency, cosmetics, achievements, OR daily challenges). _Pick one primary._ | 🔴 entirely absent |
| **Sensory payoff** | Juice, haptics, audio so the moment of death is satisfying, not punitive | 🟡 strong basics; near-miss reward not yet wired; tier-transition theatrics absent; audio depth shallow |

**The soft-progression-layer gap is the largest and most consequential.** Stage 6 in PLAN.md is the right name for it. The strategic question is what shape it takes.

---

## 7. Strategic options — five paths

These are mutually compatible but compete for sequencing. Pick the lead pillar, the others follow. Each path has rough effort and the dependencies it pulls in.

### Path A — Cosmetics & currency (depth, breadth)
Lead with the soft-progression layer. Build a currency that bank-deposits at end-of-run. Build a cosmetic shop with 12–20 unlocks across dot skins + trail particles + background palettes. Wire achievement showcase into the death screen. High retention impact. Requires sustained art / palette work — not just code. Effort: ~2–3 sessions plus art-direction time. Dependencies: monetisation decision (Piers Q2) — if free-with-IAP, ship a real IAP integration; if premium, currency becomes earn-only.

### Path B — Daily challenge & streaks (recurring engagement)
Lead with a fixed-seed daily run. Every player gets the same pipes today. Separate leaderboard. Streak counter for consecutive days played. Higher long-term retention multiplier per the research, lower aesthetic dependency. Effort: ~2 sessions for client + 0.5 session for the seed-publishing surface. Dependencies: a daily-seed source (Supabase Edge Function or scheduled job) and a tester pool large enough for a daily leaderboard to feel populated — current pool is too small to validate this on its own.

### Path C — Modes & variety (Alec's planetary direction)
Lead with idea (i) — Moon / Earth / Jupiter as gravity-defined difficulty modes with score multipliers. Then idea (ii) — Surface Mode as a second flavour. New aesthetic per planet. Reuses the engine. Best for marketing ("3 worlds!") and for short-form social content — visually distinct clips. Doesn't directly add a soft-progression layer but pairs naturally with one if added later. Effort: ~2 sessions for gravity-modes; idea (ii) is its own ~2 sessions. Dependencies: per-planet palette / asset pass.

### Path D — Polish & juice pass (felt quality)
Lead with hit-pause + close-call score bonus, tier-transition theatrics, vertical-layered music, accessibility / settings, onboarding overlay, share card. No new mechanics. Reads as a "v0.2 polish release." Lowest risk, highest per-day return on tester delight, but doesn't fix the meta-game gap. Effort: 1.5–2 sessions including the share-card cross-platform work.

### Path E — Premium pricing pivot (Geometry Dash model)
Not a feature; a pricing decision. Set Two Dots to £1.99 upfront and remove the entire ads-and-IAP engineering surface. Cosmetics still possible — but earned through play only, no shop, no currency. Buys editorial trust (Apple historically favours premium minimalist titles). Eliminates Path A's currency + IAP scope and most of its monetisation backend. Caps revenue ceiling significantly per Piers' Phase 2 forecast — but de-risks integration and keeps the product clean. Effort: design / pricing decision + a one-day app-config flip + an in-app "thank-you for buying" moment. Dependencies: this is the live open question from Piers' research; resolving it informs which of A / B / C is even shaped correctly.

### Anti-cheat dependency on any leaderboard-touching path (B, or C/A if they touch the global board)
The Decisions Log already flags this: _"RLS allows any client to write any score value. This is acceptable for Phase 1 (personal contacts). Before public launch, an Edge Function validating score plausibility (time-since-session-start × score consistency) should be added."_ Any path that materially expands leaderboard exposure should bring this validator with it, not afterwards.

---

## 8. Risks & open questions

- **Mode proliferation dilutes leaderboards.** Pick one canonical mode for the global board (the obvious choice: Earth gravity, current Two Dots), all others get their own boards or are unranked.
- **Cosmetic shop without art commitment becomes embarrassing.** Even palette-only cosmetics need taste. Budget art-direction time, not just code time.
- **Currency without a sink is pointless; sink without a source is pay-to-win.** Both have to ship together or not at all.
- **Double-press fragments the one-sentence onboarding.** Only do it if Phase 4 "which" logic genuinely needs a third gesture.
- **Inversion (Surface Mode) is an architectural fork.** Same engine, different gravity sign + spawn direction. Test on-device for any frame-rate regression — Skia paths and pipe scanlines were tuned for top-down scrolling.
- **Monetisation decision is still open** (Piers Q2). Path E exists specifically to crystallise this — if we don't decide it, we'll waste effort on whichever path turns out to be wrong.
- **Mystery-box / loot-box cosmetics carry age-rating exposure.** PEGI and the UK Gambling Commission have tightened on randomised paid unlocks since 2023. Stick to deterministic, milestone-tied unlocks to sidestep the policy risk and keep the rating clean.
- **Anti-cheat hardening required before any public leaderboard exposure** (see Path B / C / A note above). The Edge Function validator is a known-pending item from the Decisions Log.
- **Telemetry is necessary before tuning.** Don't flatten the curve, retune tiers, or rebalance close-call windows on intuition. Ship instrumentation first.
- **Apple Dev / iOS investment** is still gating Stage 3.2 per HANDOFF.md — none of the paths in §7 require iOS, but anything that bundles a "v0.2 launch moment" should know whether iOS is in or out for that release.

---

## 9. What "pick a path" looks like

Two decisions, in order:

**Decision 1 — pricing model (resolves Piers Q2).** Free-with-cosmetic-IAP (status quo assumption) or premium £1.99 (Path E). This is logically prior to Path A: if premium, the cosmetic _shop_ becomes redundant; cosmetics become play-earned only. Worth a short conversation rather than a research deep-dive.

**Decision 2 — lead path for the next 1–3 sessions.**

| Lead | Best for | Effort | Largest dependency |
|---|---|---|---|
| **D** (polish & juice) | Tester delight per dev-day. Buys time before the bigger decisions. | 1.5–2 sessions | None |
| **A** (cosmetics + currency) | Highest meta-game / retention lift | 2–3 sessions + art | Decision 1 |
| **C** (planetary modes) | Content / marketing reach; best short-form-video material | 2 sessions per mode | Per-planet asset pass |
| **B** (daily challenge) | Long-term DAU for an active tester base | 2 sessions + Edge Function | Tester pool size; anti-cheat |
| **D + C hybrid** | Both polish and content variety | 3.5–4 sessions | None blocking |

I have no strong preference between A / C / D — each is defensible. **D before any larger path** is the most defensible non-controversial sequence: the close-call score bonus, hit-pause, settings surface, onboarding overlay, and share card all unblock everything else (analytics depth, accessibility featuring, social sharing) and ship in their own ~2-session window with no architectural commitment. But if the goal of this chat is to build the meta-game, **A** is the directly-on-target path and the polish items can come back later.

**What "scope it concretely" means once you pick.** Before any code lands, I'll write a 1-page mini-spec covering: (a) feature surface (what user-visible behaviours change), (b) files touched + new files, (c) engine-test deltas (which tests need updating), (d) analytics event additions, (e) feature-branch name + tag-on-merge plan, (f) anything that'd want a CHANGELOG entry. That document is what we'd review before the first commit.

---

## 10. Appendix — input artefacts

- `outputs/game_design_research_report.md` — best-practice synthesis, 8 sections, sourced
- Comparative profile of 12 games — preserved in agent transcript (Flappy / Spikes / Color Switch / Stack / Helix Jump / Geometry Dash / Crossy Road / Voodoo wave / Alto / Color Bump / Magic Tiles / Two Brain Sides)
- Piers' [TD — Business Case](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/29196298/TD+Business+Case) (29196298)
- Alec's [TD — Research](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/40075295/TD+Research) (40075295)
- Piers' [TD — Project Requirements](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/29425667/TD+-+Project+Requirements) (29425667)
- Piers' [TD — Acceptance Criteria](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/29655041/TD+-+Acceptance+Criteria) (29655041)

Sources:
- [TD — Business Case](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/29196298/TD+Business+Case)
- [TD — Research](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/40075295/TD+Research)
- [TD — Project Requirements](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/29425667/TD+-+Project+Requirements)
- [TD — Acceptance Criteria](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/29655041/TD+-+Acceptance+Criteria)
- [TD — Decisions Log](https://piersarnold.atlassian.net/wiki/spaces/AP/pages/42532865/TD+Decisions+Log)
