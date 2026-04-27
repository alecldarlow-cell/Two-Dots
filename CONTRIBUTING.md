# Contributing to Two Dots

This is a small, primarily solo project. The conventions here are calibrated to keep the repo predictable across sessions and safe to release from at any time, without imposing process overhead that doesn't earn its keep.

---

## Branch model — trunk-based with short-lived feature branches

```
main ────────●──────●──────●──────●──→  (always deployable)
              \    /        \    /
               feat/x        fix/y
```

- **`main`** is always deployable. Every commit on `main` should be a state we'd be willing to ship to internal testers.
- **Feature branches** are short-lived (hours to a few days) and named:
  - `feat/<slug>` — new behaviour (`feat/leaderboard-ui`, `feat/local-fonts`)
  - `fix/<slug>` — bug fixes (`fix/audio-double-play`)
  - `refactor/<slug>` — non-behavioural changes (`refactor/screen-split`)
  - `chore/<slug>` — tooling, deps, docs (`chore/eas-config`)
- **Merge to `main`** via fast-forward or squash. Avoid merge commits — they obscure history on a single-author project.
- **Delete branches after merge.** No long-lived feature branches.

---

## Commit messages

Lower-case imperative-mood subject, one logical change per commit:

```
add leaderboard UI to death screen
fix expo-av double-play on rapid retry
refactor: split index.tsx into screen components
chore: bundle Space Mono TTF locally
```

The first word is the action. If a category prefix helps readability (`fix:`, `refactor:`, `chore:`), use it — but don't be pedantic about Conventional Commits. The goal is a scannable `git log --oneline`, not a parseable changelog.

If a commit needs explanation, add a body separated by a blank line. Reserve bodies for genuinely non-obvious changes — most commits don't need one.

---

## Pull requests

Even on a solo project, raise a PR for any change touching more than two files or any change that adds a feature. The PR is the place to:

1. Run the checklist in `.github/PULL_REQUEST_TEMPLATE.md`.
2. Pause for self-review of the diff before merging.
3. Capture context that's not obvious from the commits.

Self-merge is fine. The PR exists for hygiene, not gatekeeping.

---

## Release process

Releases are tagged on `main` after the relevant work is merged. Versioning is semver with pre-release suffixes:

| Suffix | Meaning |
|---|---|
| `vX.Y.Z-internal.N` | Cut for Play Internal Testing or TestFlight internal track |
| `vX.Y.Z-beta.N` | Wider beta cohort |
| `vX.Y.Z-rc.N` | Release candidate, regression tested |
| `vX.Y.Z` | Production release on stores |

### Cutting a release

1. Confirm `main` is at the intended state. Run `npm test`, smoke-test on device.
2. Update `CHANGELOG.md`: move `[Unreleased]` items into a new dated section.
3. Bump `version` in `package.json` and `app.config.ts` (`version` and `runtimeVersion` if relevant).
4. Commit: `chore: release vX.Y.Z-internal.N`.
5. Tag: `git tag -a vX.Y.Z-internal.N -m "Release vX.Y.Z-internal.N"`.
6. Push: `git push origin main --tags`.
7. Trigger the EAS build off the tag.
8. Append the build number / EAS build URL / Play Console version code to `RELEASES.md` once the build lands.

---

## Pre-commit checks

Run before pushing:

```bash
npm test                    # engine + analytics + leaderboard tests
npm run lint                # eslint, fails on warnings
npm run format:check        # prettier
npm run typecheck           # tsc --noEmit (note: ~10 known Supabase errors until types regenerated)
```

A `pre-commit` hook to run `npm test` automatically is optional — see `.git/hooks/pre-commit.example` if it exists, or add one yourself with:

```bash
echo "npm test" > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## Things that must never be committed

`.gitignore` already excludes the items below, but it's worth knowing what they are so a manual `git add <file>` doesn't sneak one through:

- **Secrets:** `.env`, `.env.local`, any file containing API keys.
- **Certificates and provisioning profiles:** `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `play-service-account.json`.
- **Native build outputs:** `android/`, `ios/` (Expo regenerates these on every build).
- **Build artifacts:** `dist/`, `web-build/`, `.expo/`, `node_modules/`, `coverage/`.
- **OS junk:** `.DS_Store`, `Thumbs.db`.

If any of these are ever found in history, run `git-audit.bat` (or its successor) and rotate the affected secrets even if the repo is private. Anon keys for Supabase are designed for client exposure and don't require rotation, but cert keys and service-account JSONs absolutely do.

---

## Pairing this with `HANDOFF.md` and `PLAN.md`

- `HANDOFF.md` — the "where things are" snapshot. Updated at session end.
- `PLAN.md` — the "where we're going" sequencing. Updated when priorities shift.
- `CHANGELOG.md` — the "what changed when" record. Updated on every PR.
- `RELEASES.md` — the "what we shipped" record. Updated on every tagged build.
