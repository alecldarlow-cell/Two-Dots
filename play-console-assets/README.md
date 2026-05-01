# Play Console upload assets — Two Dots

Everything Google Play Console will ask you to upload, in one folder. Companion to `PLAY_CONSOLE_PLAYBOOK.md` and `play-console-listing.md` in the repo root.

---

## What goes here

| Asset                                  | File                                                                 | Status                            | Notes                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| App icon (square)                      | `app-icon.html` (source) → `../assets/icon.png` (overwrite)          | source exists, PNG export pending | **Current `assets/icon.png` is a blank dark swatch — must replace.** Export from this folder, overwrite the placeholder, rebuild. |
| App icon (Android adaptive foreground) | `app-icon.html` (source) → `../assets/adaptive-icon.png` (overwrite) | source exists, PNG export pending | Same — current placeholder is blank. Adaptive icon foreground needs transparent background.                                       |
| Feature graphic                        | `feature-graphic.html` (source) → `feature-graphic.png` (export)     | ✅ ready to upload                | 1024×500 PNG generated via `export-feature-graphic.ps1`                                                                           |
| Phone screenshot 1 — Idle              | `screenshot-1-idle.png`                                              | needs copying from Pixel 7        | Captured session 9                                                                                                                |
| Phone screenshot 2 — Playing early     | `screenshot-2-playing.png`                                           | needs copying from Pixel 7        | Captured session 9                                                                                                                |
| Phone screenshot 3 — Death             | `screenshot-3-death.png`                                             | needs copying from Pixel 7        | Captured session 9 (score 7)                                                                                                      |
| Phone screenshot 4 — Pause             | `screenshot-4-pause.png`                                             | needs copying from Pixel 7        | Captured session 9                                                                                                                |

---

## How to export the feature graphic to PNG

### Option A — one-line PowerShell helper (recommended)

From the project root, in Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\play-console-assets\export-feature-graphic.ps1
```

(If you have PowerShell 7 installed, `pwsh .\play-console-assets\export-feature-graphic.ps1` works too. The script body is compatible with both.)

Drives headless Edge (or Chrome, whichever is installed) against `feature-graphic.html?export`, drops `feature-graphic.png` next to the HTML at exactly 1024×500, verifies the dimensions, and prints a confirmation. No DevTools clicking required.

### Option B — manual via Chrome DevTools

1. Open `feature-graphic.html` in Chrome (drag-and-drop the file onto a Chrome window, or right-click → Open with → Chrome)
2. Wait ~1 second for Space Mono to load from Google Fonts
3. Open DevTools: **Ctrl+Shift+I**
4. In the Elements panel, click the `<div id="graphic">` element to select it
5. Open DevTools command palette: **Ctrl+Shift+P**
6. Type "Capture node screenshot" and press Enter
7. PNG saves to your Downloads folder, exactly 1024×500
8. Move it into this folder as `feature-graphic.png`

If for any reason DevTools screenshot fails or includes the on-screen instruction overlay, fall back: take a regular screenshot of just the dark graphic area (Windows Snipping Tool → rectangular snip → save as PNG). Resize to 1024×500 in any image editor before uploading.

---

## How to copy the phone screenshots from your Pixel 7

You captured 4 screenshots during the session 9 device walkthrough. They're in the Pixel 7's `Pictures/Screenshots` folder. Easiest paths:

### Option A — `adb pull` (fastest if ADB is already paired)

```powershell
# From the project root
cd "C:\Claude\Two Dots\two-dots\play-console-assets"

# Pull all screenshots from a specific date range — replace YYYY-MM-DD with the day of capture
adb shell ls /sdcard/Pictures/Screenshots/ | Select-String "Screenshot_2026"

# Pull individual files (replace filenames with what `ls` returned above)
adb pull /sdcard/Pictures/Screenshots/Screenshot_XXXX.png ./screenshot-1-idle.png
adb pull /sdcard/Pictures/Screenshots/Screenshot_YYYY.png ./screenshot-2-playing.png
adb pull /sdcard/Pictures/Screenshots/Screenshot_ZZZZ.png ./screenshot-3-death.png
adb pull /sdcard/Pictures/Screenshots/Screenshot_AAAA.png ./screenshot-4-pause.png
```

### Option B — Google Photos / Drive

If they auto-uploaded to Google Photos: download from photos.google.com, drop into this folder, rename to the four target filenames above.

### Option C — USB cable + File Explorer

Plug the Pixel 7 in via USB, set USB mode to "File transfer" on the phone notification, navigate to `Pixel 7 > Internal shared storage > Pictures > Screenshots` in Windows File Explorer, copy the 4 files into this folder, rename.

### After copying

Verify each file is a clean portrait phone capture (typically 1080×2400 for Pixel 7). Play Console accepts:

- Min: 320px on the short side
- Max: 3840px on the long side
- Ratio: 16:9 to 9:16

Pixel 7 native captures fit easily. No resize needed.

---

## Upload order in Play Console

When you reach **Store presence → Main store listing → Graphics** in Play Console (playbook step 3.2):

1. **App icon** — drop `assets/icon.png`
2. **Feature graphic** — drop `feature-graphic.png` (after exporting from the HTML)
3. **Phone screenshots** — drop the 4 screenshot files in display order: idle first (most marketing-friendly), then playing, then a gameplay moment, then death

Optional 7"/10" tablet screenshots — skip; `app.config.ts` declares `supportsTablet: false` so tablet listings aren't relevant.

---

## What's intentionally NOT here

- `play-service-account.json` — IF you set up `eas submit` automation, the JSON service account key goes in the project root and is gitignored. Never commit it.
- Source assets for the feature graphic (Figma/Sketch files etc.) — the HTML file IS the source. Edit the HTML directly to iterate; re-export.
