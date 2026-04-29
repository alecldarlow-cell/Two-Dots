# Opening prompt for the dev-focused Cowork chat

A separate chat from the feedback-iteration one (`NEXT_CHAT_PROMPT.md`). That chat handles "fix what testers flag." THIS chat handles "build what we want next."

Copy-paste the whole block below as the first message in your new dev chat.

---

```
Working directory: C:\Claude\Two Dots\two-dots

Read these files first to ground yourself, in this order:

1. HANDOFF.md — architectural snapshot + stage status table.
2. PLAN.md — sequenced roadmap; pay special attention to Stage 6 (cross-run progression and rewards).
3. CHANGELOG.md — what shipped in v0.1.3 and earlier.
4. src/app/index.tsx — the orchestrator; ~278 lines after the session-9 refactor.
5. src/app/_canvas/, _overlays/, _hooks/ — the extracted modules. Familiarise with the architecture before proposing changes.
6. src/features/game/engine/ — pure-TS engine (state, step, tiers, spawn, collision). The 124-test safety net lives here.

Where Two Dots is right now (v0.1.3-eas-preview-validated):

- Fully playable arcade reflex game on Android (Pixel 7 validated). EAS preview APK distributed to first technical tester. iOS pending Apple Dev investment decision.
- Stage 5 first-pass refactor is complete: index.tsx split from 1540 → 278 lines into _shared/_canvas/_overlays/_hooks. Engine stays as pure TS in src/features/game/engine.
- Play Console submission docs ready (PLAY_CONSOLE_PLAYBOOK.md + play-console-listing.md + privacy policy live at https://alecldarlow-cell.github.io/Two-Dots/privacy.html). Blocked on Google identity verification.
- Tester-feedback iteration is happening in a SEPARATE chat (NEXT_CHAT_PROMPT.md). That chat handles reactive changes. Don't duplicate its scope.

Your job in this chat:

Help me proactively advance Two Dots beyond MVP — new features, improved aesthetics, and the meta-game progression layer that makes the app worth opening twice. Specifically:

- **Stage 6 — Cross-run progression and rewards.** PLAN.md item 12. Right now persistence is a single "best score." Stage 6 introduces total runs counter, longest streak, achievements, possibly daily challenges, possibly cosmetic unlocks. The data layer (Supabase devices/scores/analytics_events tables) already exists; the UI layer + reward loops need designing.
- **Aesthetic iteration.** The visual language (orange/cyan lane semantics, gold reward moments, navy pipes with sky-blue gap kill-lines) is established. Iterate on: particle systems, screen-shake/squash-stretch animation, pipe variety per tier, idle screen polish (U11 in UX_AUDIT.md flags the cluster sits too high), tier-transition theatrics.
- **Audio depth.** Currently 16 procedurally-generated WAVs. Could add: ambient music in idle, dynamic mixing during high-tier play, more SFX variety per tier, accessibility option to disable.
- **New game modes.** Speedrun (fixed seed, race the clock), daily challenge (everyone gets the same seed today), time attack (60-second sprint), zen (no death, no scoring).
- **Onboarding / tutorial.** Currently zero. Could add: first-run "tap LEFT to jump orange" overlay that fades after first successful jump.
- **Settings.** Sound on/off, haptics on/off, dynamic-type cap (currently hardcoded 1.3×), high-contrast mode.

You don't have to address all of these — they're a menu. I'll direct.

Working style:

- Solo dev, Windows + PowerShell + Pixel 7 dev device.
- EAS Build cloud is wired; gates run locally (npm test, npm run typecheck, npm run lint — see CONTRIBUTING.md for the discipline).
- Anthropic sandbox is sometimes flaky for me — when down I run commands locally and paste output. Work with whichever path is available.
- I prefer small concrete steps over batched walls of instructions. Ask me to confirm or run something between meaningful actions. Never propose more than 3-4 commands at once before checking back in.
- Feature branches with semantic names (feat/stage-6-progression, feat/idle-screen-polish, etc.). Tag releases when meaningful work lands. CHANGELOG entries on every PR.

Coordination with the feedback chat:

If you touch something the feedback chat is also iterating on — particularly the engine, the audio, or the visible HUD layout — note it in CHANGELOG.md as you go so the feedback chat sees it next time it reads the file. Don't both edit the same file in parallel without coordinating; if I'm running both chats simultaneously, I'll keep the lanes distinct (feedback chat = small fixes, dev chat = bigger features).

First task whenever you're ready: read the six files above, summarise the current architecture in 5-7 lines so I can confirm you've understood it, then ask me which menu item to pursue first. Don't propose a roadmap before checking.
```

---

## Maintenance notes

- This file lives at the repo root alongside `NEXT_CHAT_PROMPT.md` (the feedback-iteration chat prompt). Both are maintained as independent handovers — when either chat ends with significant updates, refresh the relevant prompt file with new context (current tag, new architectural notes, completed menu items moved out of scope).
- If a feature menu item ships, strike it from the list above and move it to CHANGELOG.md.
