# Two Dots — UX/UI Audit (Stage 2.2)

_Started 27 Apr 2026 after Stage 2.1 closed._

This audit looks at the app the way a tester or reviewer will — visually, physically, and emotionally. The goal isn't to "make it pretty" but to find things that will land badly on a stranger's screen.

Every finding gets a priority: **P0** (blocks ship), **P1** (fix this stage), **P2** (defer to Stage 5 / future polish).

Carries-over from Stage 2.1:

- **P1-12** (close-call ring vs death-flash opacity feel) — needs prototype side-by-side. Folded in here.
- **P1-14 polish** (idle title still doesn't feel fully resolved) — folded in here.

---

## Screens to walk

| Screen                              | Captured? | Notes                                                     |
| ----------------------------------- | --------- | --------------------------------------------------------- |
| Idle (boot)                         | _pending_ | Pre-tap state. TWO/DOTS title, instruction, thumb circles |
| Playing — early (tier 1, score 0–4) | _pending_ | HUD visible, lane backgrounds at base alpha               |
| Playing — mid (tier 4, score ~17)   | _pending_ | Pipes denser, lane background tinted                      |
| Playing — Survival (score ≥35)      | _pending_ | Tier indicator becomes pulsing single dot                 |
| Close-call moment                   | _pending_ | Gold ring on dot                                          |
| Death — first frame                 | _pending_ | Particle burst, flash rings                               |
| Death — count-up phase              | _pending_ | Big score, tier info, retry pill                          |
| Death — NEW BEST                    | _pending_ | Ribbon visible                                            |
| Pause overlay                       | _pending_ | If exists / triggerable                                   |

---

## Findings

| #   | Source                       | Severity | Area          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Static analysis              | P1       | Accessibility | Zero `accessibilityLabel` / `accessibilityRole` anywhere in `index.tsx`. Screen readers cannot describe the game. The root touch View — which is how the user starts, plays, and retries — has no role or label.                                                                                                                                                                                                                                                                                                             | ✅ fixed (root View now has `accessibilityRole="button"` + label "Two Dots game" + hint describing left/right tap controls).                                                                                                                                                                                                                                                |
| U2  | Static analysis              | P1       | Layout        | `useSafeAreaInsets()` is never called. HUD positions are computed from `GAME_H * 0.09`, with no awareness of the iOS notch / Dynamic Island or Android gesture-nav bar. On tall iOS devices the score may render under the notch.                                                                                                                                                                                                                                                                                            | ✅ fixed (`useSafeAreaInsets()` consumed in GameScreen; `insets.top` added to score, progress-dots, and milestone HUD positions).                                                                                                                                                                                                                                           |
| U3  | Static analysis              | P1       | Layout        | No `allowFontScaling={false}` on any `<Text>`. Game is a fixed-pixel design; iOS Dynamic Type at 200% will explode the score, milestone text, and idle title outside their containers.                                                                                                                                                                                                                                                                                                                                       | ✅ fixed (global `Text.defaultProps.maxFontSizeMultiplier = 1.3` set in `_layout.tsx` — caps Dynamic Type scaling at 1.3× across the whole app).                                                                                                                                                                                                                            |
| U4  | Static analysis              | P2       | UX            | Retry fires on tap anywhere during the dead phase. No deliberate delay or pill-bounded hit target — accidental retry possible if user shifts grip while reading the score. Worth checking whether the existing post-death freeze window already gates this.                                                                                                                                                                                                                                                                  | wontfix — verified fine in user testing; the existing death-freeze window adequately gates accidental retries.                                                                                                                                                                                                                                                              |
| U5  | User feedback                | P1       | Visual        | Pipe gap cap reads as jarring — bicolor half/half (orange + cyan) at the gap edge looks separate from the pipe body, with hard transition from dark navy to bright lane colours. The gap is the death-contact zone; needs a solid readable edge that integrates with the body.                                                                                                                                                                                                                                               | ✅ shape verified on device; colour iterated. Final: stripped all orange/cyan from pipes (outer glows, hard edges, scanline texture) and recoloured cap + inner-glow from gold to sky-blue (`PIPE_EDGE = #7ac0e8`). Reduces pipe palette from 4 colours to 2; reserves orange/cyan exclusively for "left dot / right dot". Pending device verification of the final colour. |
| U6  | Audio research               | P1       | Audio         | Jump sounds form a near-tritone (380 Hz + 520 Hz, ratio 1.368). Mild dissonance when both dots jump near-simultaneously. Tritone is the [most-avoided interval](https://en.wikipedia.org/wiki/Tritone) in consonant harmony.                                                                                                                                                                                                                                                                                                 | ✅ applied (`jump_r` retuned 520 → 507 Hz, perfect fourth above `jump_l`). Pending `node generate-sounds.js` regen + ear test.                                                                                                                                                                                                                                              |
| U7  | Audio research               | P1       | Audio         | Score blip ladder (`blip_t1`..`blip_t8` at 500..780 Hz, +40 Hz per tier) is arithmetic, not musical. Each step is 1.3–1.6 semitones — no recognisable interval pattern as the player levels up.                                                                                                                                                                                                                                                                                                                              | ✅ applied (replaced linear ladder with pentatonic C5..E6 = 523, 587, 659, 784, 880, 1047, 1175, 1319 Hz). Pending regen + ear test.                                                                                                                                                                                                                                        |
| U8  | Audio research               | P2       | Audio         | Tier-boundary chord (660 + 880 + 1320 Hz ≈ E5 + A5 + E6) and five-chime (880 + 1320 ≈ A5 + E6) are musically aligned (open fifth + octave). Death (240 + 160 ≈ B3 + E3) is a perfect fourth in the bass.                                                                                                                                                                                                                                                                                                                     | wontfix — already pleasant.                                                                                                                                                                                                                                                                                                                                                 |
| U9  | User feedback                | P1       | Persistence   | Best score lives in component memory only (`useRef<number>(0)`). App kill resets it — tester sees "★ NEW BEST ★" on score 1 the next day.                                                                                                                                                                                                                                                                                                                                                                                    | ✅ verified on device — best persisted across app-kill.                                                                                                                                                                                                                                                                                                                     |
| U10 | Scope conversation           | n/a      | Progression   | Beyond persistent best, no cross-run progression: no total-runs counter, no longest-streak metric, no achievements, no daily challenges, no cosmetic unlocks.                                                                                                                                                                                                                                                                                                                                                                | deferred to **Stage 6** (post-EAS, post-Phase-1 retry-rate gate). Phase 1 measurement is cleaner with the simplest possible loop; richer progression earns its place once retention is proven.                                                                                                                                                                              |
| U11 | Session 9 device walkthrough | P2       | Layout        | Idle screen: title, instruction, control hints, and thumb circles all read cleanly individually but the cluster sits too high vertically — feels like there's too much empty space below the thumb circles relative to above the title. Current `top` values: title sx(170), instruction sx(268), hints sx(296), thumbs below. Worth iterating: drop the whole cluster ~sx(40-60), or rebalance so the title gets more headroom and the thumbs sit closer to the screen's optical centre. Aesthetic / polish, not a blocker. | open — defer to a focused idle-layout polish pass. Could pair with the next idle-title revisit if "tighten kerning only" doesn't fully resolve the feel.                                                                                                                                                                                                                    |

---

## Static analysis (Claude-led, before device walkthrough)

_Findings from reading the source for layout / accessibility / tap-target issues._

### Tap targets

The game uses a single `onTouchStart` on the root View. Entire screen is touch-receptive; tapX < SCREEN_W/2 distinguishes left vs right lane. **No small tap targets exist** — there's nothing the user has to aim for precisely. This passes the iOS HIG / M3 ≥44px guideline by virtue of being a full-screen touch surface.

The "retry pill" on the death screen is purely visual; touching anywhere on screen retries. See **U4** above for the accidental-retry concern.

### Accessibility labels

Zero `accessibilityLabel` or `accessibilityRole` in `index.tsx`. The Skia `<Canvas>` correctly carries `pointerEvents="none"` (so it isn't a fake touch target), but the root touch View — which IS the touch target — has no role or label. A VoiceOver / TalkBack user has no way to know how to interact with the game. See **U1**.

### Contrast / readability

Visual inspection during walkthrough required. Suspect contrast issues:

- Idle instruction text `rgba(255,255,255,0.6)` on `#07070f` — likely passes AA at 18px+ but borderline at smaller sizes.
- Gold (`#FFD046`) on `#07070f` — passes AA easily.
- Lane colours (orange `#FF5E35`, cyan `#2ECFFF`) on dark backgrounds — passes AA.
- The half-translucent shadow text (orange/cyan offsets behind score) layered with gold core needs visual confirmation; theoretically fine but worth a screenshot.

### Font scaling

**No `<Text>` has `allowFontScaling={false}`.** The game is fixed-pixel by design — `fontSize: sx(60)` and similar are absolute layout values. With iOS Dynamic Type at "Large" or "Extra Large", the title, score, milestone text, and instruction text will all scale up and break the carefully-positioned layout. See **U3**.

### Safe-area handling

`SafeAreaProvider` is wired in `providers.tsx`, but `index.tsx` never calls `useSafeAreaInsets()`. HUD Y-positions are computed with no awareness of the iOS notch / Dynamic Island or Android gesture nav bar. On a Pixel 7 (small chin, narrow nav bar) the visual impact is minimal; on an iPhone 14 Pro the score number could collide with the Dynamic Island. See **U2**.

---

## Carry-overs from Stage 2.1

### P1-12 — close-call vs death-flash opacity feel

The two animation rings expand outward. Subagent flagged that they decay differently — close-call appears to stay opaque while expanding, death-flash fades AND expands. Need a side-by-side with the HTML prototype to decide whether to align.

**Action:** Open `G:\My Drive\NewCo\Business ideas\Two Dots\TwoDots-38.html` in a browser, trigger both states, capture short clips. Compare to the RN port. Decide: align to prototype, or keep RN's version if it feels better.

### P1-14 polish — idle title

`fontSize: sx(60)` fits on screen but the user noted it doesn't feel fully resolved. Possible directions:

- Try a tighter `letterSpacing` (current: 4 → maybe 2 or 3) to give characters more visual weight relative to their inter-character space.
- Try a different baseline alignment between TWO and DOTS.
- Try a different font weight or color treatment.

**Action:** Iterate on device, screenshot each variant, pick the one that lands.

**Resolution (session 9):** chose "tighten kerning only" — `letterSpacing` 4 → 2. Smallest-diff variant. Characters now group so TWO and DOTS each read as a single unit; cross-lane colored shadow ghost retained for the slow opacity pulse. Pending device verification.

---

## Device audit checklist

To be filled in by walking the app on Pixel 7 (and iPhone if available):

- [x] **Cold launch perception** — time from icon tap to interactive idle screen. Should be <2s. Watch for font flash, splash judder. _Session 9 device check: okay._
- [x] **Idle screen** — both TWO and DOTS render fully (P1-14 fix verified). Thumb circles breathe. Instruction text reads cleanly. _Session 9: title renders fully (kerning fix verified), thumb circles breathe and instructions read cleanly. **However:** vertical positioning of the thumb-circle + instruction block feels too high on screen — see new finding **U11**._
- [x] **First tap** → playing transition is instant; no audio glitch. _Session 9: confirmed instant, no glitch._
- [x] **Score 1–4** — score number readable; progress dots clear of score (P1-15 fix verified). _Session 9: confirmed readable._
- [~] **Tier transitions** (5, 10, 15, 20, 25, 30, 35) — milestone pop fires; tier name updates; chord audio correct. _Session 9: tier 5 confirmed firing. Tiers 10 / 15 / 20 / 25 / 30 / 35 deferred (Alec's call) — non-blocking; will be exercised naturally during Stage 4 device-matrix runs._
- [x] **Close-call** — gold ring visible on the dot that came close. _Session 9: ring fires._
- [x] **Death** — particle burst, dot freezes, score count-up runs to final. _Session 9: all three confirmed._
- [x] **Death overlay** — score number large and readable; tier+gate info correct; retry pill in killed dot's colour. _Session 9: score is large and readable, gate info correct on the deaths triggered (only low-tier deaths observed; high-tier overlay still to verify alongside the higher tier transitions)._
- [x] **Pause** — does the app pause cleanly on background? Does foregrounding resume mid-game or dump to idle? _Session 9: pause works on middle-screen press (Pixel 7). "PAUSED" / "tap to resume" overlay renders at optical centre cleanly. Minor polish: the cyan dot can land on top of the centred "PAUSED" text mid-bob — could nudge text ~sx(20) down to clear the dots' typical y-band. Background→foreground state preservation also confirmed working._
- [x] **Sound** — every SFX fires when expected:
  - Tap to start: `tap`
  - Each pipe cleared: `blip_t<tier>`
  - Tier boundary: `chord_tier`
  - Every 5 (non-tier-boundary): `chord_five`
  - Close call: `close_call`
  - Death: `death`

  _Session 9 (post-`generate-sounds.js` regen): all sounds played._

- [x] **Sound — none fire when unexpected:** no score blip during the dead phase, no audio leak after rapid pause/resume. _Session 9: no unexpected sounds fired._
- [x] **Background → foreground** — game state preserved; no double-play of audio. _Session 9: worked._
- [~] **Font scaling** — tilt Dynamic Type/Display Size up; layout doesn't break. _Session 9: deferred (Alec's call) — non-blocking. The global `Text.defaultProps.maxFontSizeMultiplier = 1.3` cap should hold; will exercise on Pixel 7 via Display Size and on iOS via Dynamic Type during Stage 4 device matrix._

---

## Decisions log

- **Session 9 — idle-title polish (P1-14):** chose `letterSpacing` 4 → 2. Smallest-diff option from a 4-way pick (tighten only / tighten + drop ghost / tighten + bigger sx(64) / loose-and-small sx(54) + spacing 6). Rationale: lowest-risk change that addresses the "characters read independently" feel; preserves the cross-lane shadow ghost and the existing opacity pulse. If on-device verification still doesn't feel resolved, the next escalation is "tighten + drop ghost" — visually more confident but loses the pulse.
