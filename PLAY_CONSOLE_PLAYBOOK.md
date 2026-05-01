# Play Console Submission Playbook — Two Dots

The end-to-end walkthrough for getting Two Dots onto Google Play Internal Testing once your developer-account verification clears. Designed so a future-you can open this file, work top-to-bottom, and never need to look anything up.

Companion files:

- `play-console-listing.md` — the **data** you'll paste into Play Console (titles, descriptions, content-rating answers, data-safety form answers).
- `docs/privacy.html` — the privacy policy, served live at https://alecldarlow-cell.github.io/Two-Dots/privacy.html

---

## Table of contents

1. [What you need before starting](#what-you-need-before-starting)
2. [Check verification status](#check-verification-status)
3. [Step 1 — Create the app entry](#step-1--create-the-app-entry)
4. [Step 2 — App content section](#step-2--app-content-section)
5. [Step 3 — Store listing](#step-3--store-listing)
6. [Step 4 — Set up Internal Testing track](#step-4--set-up-internal-testing-track)
7. [Step 5 — Build the production AAB via EAS](#step-5--build-the-production-aab-via-eas)
8. [Step 6 — Upload the AAB](#step-6--upload-the-aab)
9. [Step 7 — Promote to testers](#step-7--promote-to-testers)
10. [Step 8 — Verify a tester install works](#step-8--verify-a-tester-install-works)
11. [Troubleshooting](#troubleshooting)

---

## What you need before starting

Quick checklist — most of these are already done from session 9.

- [x] EAS CLI installed and logged in (`eas whoami` returns `smellyoldog`)
- [x] EAS project initialised (`projectId` in `app.config.ts`: `5a274a99-3b35-4261-b7fc-da1895d17847`)
- [x] `.npmrc` with `legacy-peer-deps=true` (in repo root)
- [x] `expo-updates` installed and configured
- [x] Preview APK built and sideload-tested on Pixel 7 (validates the EAS pipeline)
- [x] Privacy policy live: https://alecldarlow-cell.github.io/Two-Dots/privacy.html
- [x] All listing copy drafted in `play-console-listing.md`
- [x] App icon at `assets/icon.png` (verify it's 512×512 — see step 3)
- [x] Feature graphic (1024×500 PNG) — at `play-console-assets/feature-graphic.png`, generated via `export-feature-graphic.ps1`
- [ ] Phone screenshots — 4 captured in session 9; consider re-shooting one death-screen with a higher score so it shows a real number (e.g. 50+) rather than 7
- [ ] Google Play developer-account identity verification complete
- [ ] (Optional, for `eas submit` automation) Google Play service account JSON key — covered in step 5

If anything is unchecked, take care of it before working through the steps below.

---

## Check verification status

Before doing anything else, confirm verification has actually cleared:

1. https://play.google.com/console
2. Top-right gear icon → **Account details**
3. Scroll to "Identity verification" — should say "Verified" (or similar)

If it still says "Pending" or shows a form, you're blocked. Verification typically completes within 2-7 days of submission. If it's been longer, contact Play Console support — there's a "Get help" link in the account details page.

---

## Step 1 — Create the app entry

1. Play Console home → **Create app** (button is greyed out until verification clears)
2. Fill in:
   - **App name**: `Two Dots`
   - **Default language**: `English (United Kingdom)`
   - **App or game**: `Game`
   - **Free or paid**: `Free`
3. Acknowledge the Declarations checkboxes:
   - ✓ Developer Program Policies
   - ✓ US export laws
4. Click **Create app**

You're now on the app's dashboard. The left sidebar has the menu you'll use for everything below. The dashboard shows a "Start testing now" panel and a list of "Set up your app" tasks — those tasks map roughly to the steps below.

---

## Step 2 — App content section

Sidebar: **Policy and programs → App content**. Work down the list. Most have "No" / minimal answers for Two Dots.

### 2.1 Privacy policy

- URL: `https://alecldarlow-cell.github.io/Two-Dots/privacy.html`
- Save

### 2.2 App access

- "All or some functionality is restricted" → **No, all functionality is available without restrictions**
- Save

### 2.3 Ads

- "Does your app contain ads?" → **No**
- Save

### 2.4 Content rating

- Click **Start questionnaire**
- Email address: `alecreeder@gmail.com`
- Category: **Game**
- Then walk the questionnaire. **All answers are NO.** Pre-filled details and screen-by-screen guidance live in `play-console-listing.md` → "Content rating questionnaire — pre-filled answers".
- Submit. Expected outcome: **Everyone / 3+ / PEGI 3 / E**.

### 2.5 Target audience and content

- Target age groups: select **13 and over** (the safest default — selecting "Under 13" triggers extra COPPA/Designed-For-Families requirements that aren't worth the friction unless you want kids' Play Store visibility)
- "Is your app appealing to children?" → **No**
- "Does your app store contain images of children?" → **No**
- Submit

### 2.6 News app

- "Is this a news app?" → **No**
- Save

### 2.7 COVID-19 contact tracing and status apps

- **No** to all
- Save

### 2.8 Data safety

- Click **Start** or **Manage**
- Walk through the form. Pre-filled answers in `play-console-listing.md` → "Data Safety form — pre-filled answers".
- Key answers:
  - Data collected: **Yes** — anonymous device ID + game-event data
  - Data shared with third parties: **No**
  - Data encrypted in transit: **Yes** (HTTPS via Supabase JS SDK)
  - Users can request deletion: **Yes** (via email — alecreeder@gmail.com)
  - Independent security review: **No**
- Submit and confirm

### 2.9 Government apps

- "Is this app developed by or on behalf of a government?" → **No**
- Save

### 2.10 Financial features

- "Does your app provide any financial features?" → **No**
- Save

### 2.11 Health

- "Does your app provide health features?" → **No**
- Save

### 2.12 Actors

- Skip — not applicable for a non-narrative game

After all of these are complete, the App Content sidebar items will all show green checks. Proceed to store listing.

---

## Step 3 — Store listing

Sidebar: **Grow → Store presence → Main store listing**. This is the customer-facing page.

### 3.1 App details

- **App name**: `Two Dots`
- **Short description**: paste from `play-console-listing.md` → "Short description":
  ```
  Two dots. Two thumbs. Endless reflex arcade — no ads, no IAP at launch.
  ```
- **Full description**: paste from `play-console-listing.md` → "Full description" (the long block)

### 3.2 Graphics

All upload assets live in `play-console-assets/` (sibling to this playbook). See that folder's `README.md` for per-file status, export instructions, and how to copy screenshots off your Pixel 7.

| Asset             | Required size                   | Source                                                                                                                                      |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| App icon          | 512×512 PNG                     | `assets/icon.png` — confirm resolution                                                                                                      |
| Feature graphic   | 1024×500 PNG                    | `play-console-assets/feature-graphic.html` → export to PNG via Chrome DevTools (instructions inside the HTML file and in the assets README) |
| Phone screenshots | Native Pixel 7 size (1080×2400) | Captured session 9 — copy from device into `play-console-assets/` (see README)                                                              |

**App icon resolution check:**

```powershell
# Run from project root — confirms icon dimensions
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("$PWD\assets\icon.png")
"Icon: $($img.Width) x $($img.Height)"
$img.Dispose()
```

If it's not 512×512, upscale (or recreate) before uploading. Play Console rejects icons that are the wrong size.

**Feature graphic export (one-time):**

Easy path (Windows PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\play-console-assets\export-feature-graphic.ps1
```

(If you have PowerShell 7, `pwsh .\play-console-assets\export-feature-graphic.ps1` also works.)

The script drives headless Edge/Chrome against `feature-graphic.html?export`, drops `play-console-assets/feature-graphic.png` at exactly 1024×500, and prints OK on success.

Manual fallback (if the helper can't find a browser, etc.):

1. Open `play-console-assets/feature-graphic.html` in Chrome
2. DevTools (Ctrl+Shift+I) → click the `<div id="graphic">` element in Elements panel
3. Command palette (Ctrl+Shift+P) → "Capture node screenshot"
4. PNG saves to Downloads, exactly 1024×500
5. Move to `play-console-assets/feature-graphic.png`

**Screenshots:**

You have 4 from the session 9 walkthrough on the Pixel 7 (idle / playing / death at score 7 / pause). Score 7 on the death overlay is fine — reviewers and players don't expect dev-record scores. The four shots are sufficient for first internal-testing release.

Screenshot copy commands (and alternative paths) are in `play-console-assets/README.md`.

Screenshots must be uploaded as PNG or JPEG. Drop them on the Play Console upload area; the console validates sizing. Pixel 7 native captures (typically 1080×2400) fit well within Play's 320px–3840px / 9:16–16:9 acceptance window.

### 3.3 Categorization

- Application category: **Game**
- Game category: **Arcade**

### 3.4 Contact details

- **Website**: link to your GitHub repo (https://github.com/alecldarlow-cell/Two-Dots) or any landing page. Required field — can't be left blank.
- **Email**: `alecreeder@gmail.com`
- **Phone**: optional, leave blank
- **External marketing**: leave unchecked

### 3.5 Privacy policy

- Already set in step 2.1; should auto-populate here.

Save the page when done.

---

## Step 4 — Set up Internal Testing track

Sidebar: **Test and release → Testing → Internal testing**.

1. Click **Create new release** (you can also do this AFTER uploading the AAB; either order works)
2. The page asks you to upload an AAB. Hold off — that's step 6. First, set up the testers list.
3. Switch to the **Testers** tab on the same Internal testing page.
4. Click **Create email list**
   - List name: `Internal testers`
   - Email addresses: comma-separated. Start with just yourself (`alecreeder@gmail.com`) — you can add more after the first install proves it works.
   - Save
5. Tick the box for the new list under "Testers"
6. Note the **Copy link** under "How testers join your test" — this is the opt-in URL. Save it; testers click this URL, accept the invitation, then install via Play Store.

---

## Step 5 — Build the production AAB via EAS

Back to PowerShell:

```powershell
cd "C:\Claude\Two Dots\two-dots"

# Confirm git is clean and on main
git status
git branch --show-current

# Trigger production build (takes 15-25 min in EAS cloud)
eas build --profile production --platform android
```

The production profile in `eas.json` has `autoIncrement: true` — `versionCode` will be bumped from whatever the last build used. EAS will print the build URL; the artifact when done is an `.aab` (Android App Bundle), not an APK. AAB is what Play Store expects.

Wait for the build to finish. EAS will email you when it's done.

### Optional: set up `eas submit` for automated upload

If you want EAS to auto-upload the AAB to Play Console without a manual download/upload step, you need a Google Cloud service account with Play Developer API access. This is a one-time setup, ~15 minutes.

1. Google Cloud Console → create a service account in any project (or create a new project specifically for this)
2. Grant the service account "Service Account User" role
3. Download the JSON key
4. In Play Console → Setup → API access → Link the service account → grant it permission to upload AABs to your apps
5. Save the JSON key file as `play-service-account.json` in the project root (it's referenced by `eas.json` already at `submit.production.android.serviceAccountKeyPath`)
6. Add `play-service-account.json` to `.gitignore` — IT IS A SECRET, NEVER COMMIT IT

For the first upload, the manual path (step 6) is simpler. Set up `eas submit` later if you find yourself uploading repeatedly.

---

## Step 6 — Upload the AAB

### Manual path (recommended for first upload)

1. From the EAS build page (linked in the build email), download the `.aab` file to your Downloads folder
2. Play Console → **Test and release → Testing → Internal testing → Create new release** (if not already in flight)
3. Drag-and-drop the `.aab` file onto the upload area, OR click "Upload" and select it
4. Wait for Play Console to validate it (~30 seconds)
5. Fill in the **Release name** (Play Console will pre-suggest the version code — accept or rename)
6. Fill in the **Release notes** for the language tab(s) you set up. Suggested first-release notes:

   ```
   First Internal Testing release.

   - Two-thumb arcade core loop.
   - Eight tiers, persistent personal best.
   - Custom synth audio (16 SFX).
   - No ads, no in-app purchases.
   ```

7. Click **Next** to review, then **Save** (don't roll out yet — that's step 7)

### Automated path (if `eas submit` is set up)

```powershell
eas submit --platform android --profile production --latest
```

`--latest` picks the most recent build. EAS uploads it directly to the Internal Testing track configured in `eas.json` (`submit.production.android.track: "internal"`).

---

## Step 7 — Promote to testers

Still on Internal testing → your draft release:

1. Click **Review release** at the top right
2. Play Console runs final pre-flight validation — fix any errors it surfaces (most likely: missing field somewhere in App Content, which would have been caught in step 2)
3. Click **Start rollout to Internal testing**
4. Confirm the rollout

Within 5-15 minutes, the build is live on the Internal Testing track. Anyone on your tester list can now install via the opt-in URL from step 4.

---

## Step 8 — Verify a tester install works

The Stage 3.1 done-criterion is "≥1 tester (other than the dev) has installed via Play Internal Testing and confirmed it runs."

For your own first install (using yourself as the tester):

1. Open the opt-in URL from step 4 on your phone (or any device with the same Google account as the tester email)
2. Click **Become a tester** → **Accept**
3. Wait ~1 minute (sometimes longer on first install — Play Store needs to propagate)
4. Click the install link from the same page (it opens Play Store)
5. Install
6. Launch — verify it works exactly as the sideloaded preview did

If "Two Dots" doesn't appear in Play Store search yet, that's normal for Internal Testing — it doesn't show in search until the app is in Production. The opt-in URL is the only entry point.

After your first install confirms, add more testers to the email list (step 4). They'll need to accept the opt-in URL too.

**That closes Stage 3.1.** Update `HANDOFF.md` and tag a new release:

```powershell
git tag -a v0.1.3-play-internal -m "Stage 3.1 closed: shipped to Play Internal Testing"
git push origin --tags
```

---

## Troubleshooting

### "Create app" button is still greyed out

Verification hasn't cleared. Re-check Account details (top-right gear). If it's stuck for more than a week, contact Play Console support.

### Content rating questionnaire failed (rated higher than Everyone)

Probably misclicked one of the questions. Click **Recategorise** to redo. All answers should be **No** for Two Dots. Refer to `play-console-listing.md` for the full pre-filled grid.

### AAB upload rejected with "version code conflict"

The version code in your AAB matches one already uploaded. Either bump `android.versionCode` in `app.config.ts` and rebuild, or the production profile's `autoIncrement: true` should handle this — verify it ran. (If you manually triggered without `autoIncrement`, you may need to bump manually.)

### Internal Testing release saved but not visible to testers

- Did you click **Start rollout to Internal testing**? "Save" alone doesn't roll out.
- Did the tester accept the opt-in URL? They have to explicitly become a tester first.
- Wait 5-15 min — first-install propagation isn't instant.

### EAS build fails on `npm install`

The `.npmrc` should mean `--legacy-peer-deps` is implicit. Verify it exists:

```powershell
Get-Content .npmrc
# Should print: legacy-peer-deps=true
```

If missing, recreate it. Then rebuild.

### Privacy policy URL returns 404

GitHub Pages config:

1. https://github.com/alecldarlow-cell/Two-Dots/settings/pages
2. Source: "Deploy from a branch"
3. Branch: `main`, folder: `/docs`
4. Save → wait ~1 min

Verify file exists at `docs/privacy.html` on the `main` branch.

### "App is not signed by the upload key" error during upload

Means EAS used a different keystore than Play Console expects (only relevant if you've previously uploaded to this app entry from a different machine or keystore source). Run:

```powershell
eas credentials
```

to inspect / sync. For a first upload this won't hit you.

---

## Quick command reference (copy-paste blocks)

**Build production AAB:**

```powershell
cd "C:\Claude\Two Dots\two-dots"
eas build --profile production --platform android
```

**Submit to Play Internal Testing (if `eas submit` configured):**

```powershell
eas submit --platform android --profile production --latest
```

**Build a new preview APK for ad-hoc sideload testing:**

```powershell
eas build --profile preview --platform android
```

**See all your past builds:**

```powershell
eas build:list
```

**See your EAS credentials state:**

```powershell
eas credentials
```

**Open the EAS dashboard for this project:**
https://expo.dev/accounts/smellyoldog/projects/two-dots
