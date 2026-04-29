# Opening prompt for the next Cowork chat

Copy-paste this whole block as the first message in your next Cowork session. It briefs the new chat on where things stand and what its job is.

---

```
Working directory: C:\Claude\Two Dots\two-dots

Read these files first to ground yourself, in this order:

1. HANDOFF.md — architectural snapshot + stage status table.
2. PLAN.md — sequenced roadmap of remaining stages.
3. FEEDBACK_BACKLOG.md — current user feedback, triaged.
4. play-console-listing.md and PLAY_CONSOLE_PLAYBOOK.md — Play Console submission state.

Where the project is right now:

- Two Dots v0.1.3 is built and validated end-to-end. The EAS preview APK runs cleanly on Pixel 7. Stage 5 first-pass refactor completed last session: index.tsx is 278 lines down from 1540, split into _shared/ + _canvas/ + _overlays/ + _hooks/ subdirectories.
- Stage 3.1 (Play Internal Testing) is blocked on Google Play account verification — separate timeline, nothing actionable on the dev side.
- I'm distributing the EAS preview APK to 3-5 trusted testers via WhatsApp for raw feedback. Technical testers (e.g. Piers) file via GitHub Issues at https://github.com/alecldarlow-cell/Two-Dots/issues.

Your job in this chat:

Help me iterate the app rapidly based on tester feedback. As feedback arrives in FEEDBACK_BACKLOG.md or as GitHub Issues, your role is to:

1. Help triage incoming items (must-fix vs nice-to-have vs ignore) using the criteria in FEEDBACK_BACKLOG.md.
2. Propose engine / UX / audio / visual changes that address the must-fix and high-pattern items.
3. Implement those changes on feature branches following the same gate-run discipline (npm test, typecheck, lint clean before merge — see CONTRIBUTING.md).
4. Validate manually on Pixel 7 via the EAS preview build pipeline I already have set up.
5. Queue them up for the next EAS preview build to push out to testers.

Working style:

- Solo dev, no team.
- I'm on Windows + PowerShell + a Pixel 7 dev device. EAS Build cloud is wired up; gates are local on Windows.
- Anthropic sandbox can be flaky for me — sometimes you can run shell commands, sometimes not. When the sandbox is down, I run commands locally and paste output.
- I prefer one concrete action at a time, not batched walls of instructions. Ask me when you need me to run something or make a decision.

First task whenever you're ready: read the four files above, summarise the current state in 5 lines, and tell me what's queued in the inbox. Then we'll pick up from there.
```

---

## What goes in this folder for the new chat

The new chat will pick up everything from the repo as-is. Make sure these are committed and pushed before starting:

- All code under `src/`
- `HANDOFF.md`, `PLAN.md`, `CHANGELOG.md`, `CONTRIBUTING.md`
- `FEEDBACK_BACKLOG.md` (this session)
- `PLAY_CONSOLE_PLAYBOOK.md`, `play-console-listing.md`, `play-console-assets/`
- `docs/privacy.html`
- `BUG_AUDIT.md`, `UX_AUDIT.md` (audit logs from previous sessions)

The new chat will see these via the workspace folder mount. No additional handoff steps required.
