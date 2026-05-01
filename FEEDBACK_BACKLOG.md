# Feedback Backlog — Two Dots

Raw user feedback lands here, gets triaged, then either becomes an issue / PR / next-build item or gets explicitly deferred / dropped.

The point of this file: **avoid the trap of feeling every individual piece of feedback is urgent**. Batch into a weekly-ish triage, then ship.

---

## How to log new feedback

When a tester messages something on WhatsApp, files a GitHub Issue, or you observe something yourself: drop it in the **Inbox** section below as a new bullet. Don't react immediately. Don't engineer the wording. Just capture.

Format:

```markdown
- **[YYYY-MM-DD] [tester name or "self"]** — verbatim or paraphrased feedback. Note context if useful (device, build number, what they were doing).
```

Triage rhythm (suggested): once a week, walk the Inbox top-to-bottom and move each item to one of:

- **In progress** — currently being worked on for the next build
- **Backlog** — confirmed, will do but not now
- **Wontfix** — declined with a brief reason (so you don't re-litigate it next week)
- **Done** — shipped in a build, with the build version noted

---

## Triage criteria

When deciding what to do with each item:

1. **Is this blocking?** — does it prevent the player from understanding or completing a run? P0, fix immediately.
2. **Is this confusing first-impression?** — does it make new players quit in the first 30 seconds? P1, fix in next build.
3. **Is this a pattern across multiple testers?** — single complaint = noise; 3+ saying the same = signal. P2 if pattern, defer if isolated.
4. **Is this a feature request?** — capture in Backlog, don't action yet. Feature requests against an unfinished MVP are usually a distraction.
5. **Is this aesthetic?** — judgement call. If you agree it's worse than what testers expect, fix; if it's their preference vs your design intent, defend the design.

---

## Inbox (untriaged)

_Drop new items here as they come in. Don't worry about order._

- **[2026-04-29] Chloe** — "Really like the game, quite addictive. Had no problems. Played repeatedly ~6 times before interrupted by life. It helped that I got a high score first time so I just want to beat it now." (Tester via WhatsApp / EAS preview APK; device/build not specified — presumably Android, v0.1.3 preview.)
- **[2026-04-29] Chloe** (follow-up) — "Adding a feature where you can see friends' high scores or share them with each other would be good. Makes it competitive. I now want to beat your 25." (Feature request — social / competitive layer. Two adjacent shapes: cheap = shareable score card / text, expensive = friend graph + accounts. Adjacent to Stage 2.3 deferred leaderboard UI and Stage 6 progression scope.)
- **[2026-04-29] Will** — "Veeerry good. Love the colours and design. I played twice but only because I'm in the office, I'll play more later and give more feedback." (Tester via WhatsApp / EAS preview APK. Positive signal on visual identity specifically — validates Stage 2.2 colour overhaul. More feedback expected.)
- **[2026-04-29] Will** (follow-up) — "An improvement note: where the next wall appears on the right side of the screen, it would look great if there was something like a glowing indicator before the walls pop in, and ideally the gate would crawl in from the side not appear fully formed." (UX/polish — pipe spawn behaviour. Two suggested fixes: (1) telegraph glow before the wall lands, (2) smooth slide-in from off-screen vs. pop-in at edge. Likely a small render-loop / spawn-position change in `src/features/game/engine/spawn.ts` + canvas draw — investigate at triage. Fairness implication too: pop-in shortens reaction window unfairly.)
- **[2026-04-29] Piers** (first-pass, deeper writeup promised tomorrow) — "Really addictive. A lot more like Flappy Bird than I envisioned. But a really great clone/remake of it. Looks pretty good so far but I think we can really polish it." (Three signals: confirms addictive-loop pattern (3/3 testers now), positions perception as Flappy-Bird-adjacent — neutral framing but worth watching if other testers echo it (differentiation question), and flags polish ceiling. Real engineering writeup expected next-day; treat this as placeholder.)
- **[2026-04-29] self (dashboard signal)** — First read of the live KPI dashboard after migration 005 landed: ~120 runs / 2 testers / ~50 sessions over the first ~48 hours of telemetry. **Phase 1 retry-rate gate is provisionally above target** (mid-70%s vs ≥70%) — directional only; cohort is far too small to call the gate. Mean close-calls/run sitting around 0.75 vs the ≥1.0 engagement target — needs more data and instrumentation cross-check (see BUG_AUDIT P1-16) before deciding if this is a design signal. Source: `docs/dashboard.html`.
- **[2026-04-29] self (dashboard signal)** — Difficulty curve is heavily front-loaded: **~86% of all deaths happen in Tier 1**, ~9% in T2, ~5% across T3–4. Testers aren't getting near the pause-window cliff at T5–7 that DEV_IDEAS_BRIEF §4(iv) was worried about — they're dying before they get there. Possible reads: (a) onboarding/early tier too steep, (b) tier 1 spawn parameters aren't actually easier than later tiers, (c) self-selection — testers quit after early deaths so we under-sample late-tier behaviour. Worth confirming against `analytics.md`'s death-tier-distribution query and a tier-1 spawn-rate audit before changing anything. Adjacent to P1-12 (close-call vs death-flash feel).

---

## In progress (this iteration)

- _none yet_

---

## Backlog (confirmed, deferred)

- _none yet_

---

## Wontfix (declined)

_Each entry needs a one-line reason._

- _none yet_

---

## Done

_Ship-version reference: each item shows which build it landed in._

- _none yet_

---

## Notes

- The current EAS preview build URL is the latest `eas build:list` entry. Distribute via that URL for ad-hoc testing; once Google verification clears, distribute via the Play Internal Testing opt-in URL instead (see `PLAY_CONSOLE_PLAYBOOK.md`).
- For Piers and other technical testers, point them at https://github.com/alecldarlow-cell/Two-Dots/issues — Issues are individually triaged and easier to track than aggregate WhatsApp chat.
- For non-technical testers, capture WhatsApp messages here verbatim. Don't ask follow-up questions in the moment; capture, then think about what to ask in the next message.
