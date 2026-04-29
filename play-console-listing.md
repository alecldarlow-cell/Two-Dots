# Play Console Listing — Two Dots

Reference doc for filling in the Google Play Console listing once identity verification clears. Drafted in session 9 (Stage 3.1). Edit freely before publishing.

---

## Bundle / package

`com.newco.twodots`

## Title

Two Dots

## Default language

English (United Kingdom)

## App / game category

Game → Arcade

## Pricing

Free

---

## Short description (limit 80 chars)

```
Two dots. Two thumbs. Endless reflex arcade — no ads, no IAP at launch.
```

(71 characters)

### Alternatives if you want to swap

- `Keep both dots alive. A pure-reflex arcade with no ads or IAP.` (62 chars)
- `Tap left, tap right. Survive endless pipes with both dots alive.` (64 chars)

---

## Full description (limit 4000 chars)

```
Two dots. Two thumbs. Endless reflex arcade.

Two dots fall. Your job is to keep them both alive.

Tap the LEFT half of the screen to jump the orange dot. Tap the RIGHT half to jump the cyan one. Pipes scroll toward you. Each pipe has a single gap. Both dots have to thread it.

That's the whole game. No menus to wade through, no in-app purchases, no ads at launch, no progression grind, no tutorials. Just immediate, honest reflex play that gets harder the longer you survive.

WHAT'S IN IT

• Eight difficulty tiers, each retuning gap size, pipe spacing, and scroll speed
• Tier 8 ("Survival") goes forever and gets meaner
• 60fps physics on every device — no high-refresh-rate cheating
• Procedurally generated pipe layouts — no two runs identical
• Persistent personal best across app sessions
• Custom synth audio: pentatonic score-blip ladder, perfect-fourth jump tones, chord chimes at tier boundaries
• Multi-touch — both thumbs at once is the natural posture

WHAT'S NOT IN IT

• No ads (at launch)
• No in-app purchases
• No account required
• No tracking beyond an anonymous device ID used to persist your best score
• No "free coins" loops, no battle passes, no skins

HOW TO PLAY

Tap the LEFT half to jump the orange dot. Tap the RIGHT half to jump the cyan dot. Survive as long as you can. Beat your best score. That's it.
```

(approx 1,300 chars; plenty of room under the 4,000 limit but punchy)

---

## Graphics required

| Asset                | Size            | Source                                                                               |
| -------------------- | --------------- | ------------------------------------------------------------------------------------ |
| App icon             | 512×512 PNG     | `assets/icon.png` — verify resolution, scale up if needed                            |
| Feature graphic      | 1024×500 PNG    | Needs designing — minimal: "TWO DOTS" + orange + cyan dots on `#07070f` background  |
| Phone screenshots    | min 2, max 8    | Have 4 from session 9 (idle / playing / death / pause); ideally re-shoot one with a higher death-screen score so it shows a real number rather than 7 |
| 7" tablet screenshots | optional       | Skip for v0.1.0 — tablet support is `false` in app.config.ts                         |
| 10" tablet screenshots | optional      | Skip                                                                                 |

---

## Privacy policy URL

Once `docs/privacy.html` is in the repo and GitHub Pages is enabled (Settings → Pages → Source = "Deploy from a branch", branch = `main`, folder = `/docs`):

```
https://alecldarlow-cell.github.io/Two-Dots/privacy.html
```

Wait ~1 minute after first push for GitHub Pages to build.

---

## Content rating questionnaire — pre-filled answers

Play Console runs an IARC questionnaire that maps to ESRB / PEGI / USK / ClassInd ratings. For Two Dots, the answer to virtually every question is **No**. Expected outcome: **Everyone / 3+ / PEGI 3 / E**.

Click through with these answers:

### Category (you'll be asked first)

→ **Game** (not "App")

### Violence

| Question                                                                                                | Answer |
| ------------------------------------------------------------------------------------------------------- | ------ |
| Does the game contain violence?                                                                         | **No** |
| Does the game contain blood?                                                                            | No     |
| Does the game contain assets depicting weapons of any kind?                                             | No     |

### Sexual content

| Question                                              | Answer |
| ----------------------------------------------------- | ------ |
| Does the game contain sexual content / nudity?        | **No** |
| Does the game contain sexual innuendo?                | No     |

### Language

| Question                                              | Answer |
| ----------------------------------------------------- | ------ |
| Does the game contain profanity / crude humour?       | **No** |
| Does the game contain references to bodily functions? | No     |

### Controlled substances

| Question                                          | Answer |
| ------------------------------------------------- | ------ |
| Does the game reference drugs / alcohol / tobacco? | **No** |
| Does the game depict use of these?                 | No     |

### Gambling

| Question                                                                  | Answer |
| ------------------------------------------------------------------------- | ------ |
| Does the game contain real-money gambling?                                | **No** |
| Does the game contain simulated gambling (no real currency)?              | No     |
| Does the game contain randomised paid items (loot boxes / gacha)?         | No     |

### User-generated content

| Question                                                                  | Answer |
| ------------------------------------------------------------------------- | ------ |
| Does the game contain a chat feature?                                     | **No** |
| Can users share or upload content?                                        | No     |
| Does the game allow user-to-user voice / text communication?              | No     |

### Discrimination / hate

| Question                                                | Answer |
| ------------------------------------------------------- | ------ |
| Does the game contain hate speech / discriminatory content? | **No** |

### Horror

| Question                                | Answer |
| --------------------------------------- | ------ |
| Does the game contain horror themes?    | **No** |
| Does the game contain frightening scenes? | No   |

### Miscellaneous (sometimes asked)

| Question                                                                  | Answer |
| ------------------------------------------------------------------------- | ------ |
| Does the game allow users to interact with people they may not know?      | **No** |
| Does the game share user location with other users?                       | No     |
| Does the game allow users to purchase digital items?                      | No     |
| Does the game collect personal information about users?                   | No (only an anonymous, device-generated UUID — see Data Safety section) |

---

## Data Safety form — pre-filled answers

Separate from the content rating, Play Console requires a Data Safety form. Two Dots collects the minimum possible:

### Does your app collect or share any of the required user data types?

→ **Yes** (anonymous device identifier and game-event data — see breakdown below)

### Is all of the user data collected by your app encrypted in transit?

→ **Yes** (HTTPS to Supabase via the official Supabase JS SDK)

### Do you provide a way for users to request that their data is deleted?

→ **Yes** — by emailing alecreeder@gmail.com (see privacy policy). For v0.1.0 there's no in-app delete UI; the path is via the privacy contact address.

### Data types collected

| Category                | Type                                          | Collected? | Shared with third parties? | Optional? | Purpose                          |
| ----------------------- | --------------------------------------------- | ---------- | -------------------------- | --------- | -------------------------------- |
| Personal info           | Name, email, phone, address, etc.             | **No**     | —                          | —         | —                                |
| Financial info          | Payment info, purchase history, etc.          | **No**     | —                          | —         | —                                |
| Health & fitness        | All                                           | **No**     | —                          | —         | —                                |
| Messages                | All                                           | **No**     | —                          | —         | —                                |
| Photos and videos       | All                                           | **No**     | —                          | —         | —                                |
| Audio files             | All                                           | **No**     | —                          | —         | —                                |
| Files and docs          | All                                           | **No**     | —                          | —         | —                                |
| Calendar                | All                                           | **No**     | —                          | —         | —                                |
| Contacts                | All                                           | **No**     | —                          | —         | —                                |
| App activity            | App interactions / in-app search / installed apps / other actions | **Yes** (game-event data: run start, run end, score, tier, death side) | No | No (required for high-score persistence) | App functionality + analytics |
| Web browsing            | All                                           | **No**     | —                          | —         | —                                |
| App info & performance  | Crash logs / diagnostics                      | **No** (no crash reporter integrated for v0.1.0) | — | — | — |
| Device or other IDs     | Anonymous device-generated UUID (NOT advertising ID, NOT IMEI) | **Yes** | No | No (required) | App functionality (persisting personal best across sessions) |
| Location                | All                                           | **No**     | —                          | —         | —                                |

### Notable

- The "Device or other IDs" answer is the one most likely to need clarification at review time. The app generates a UUID via `expo-crypto` on first launch and stores it in `AsyncStorage`. It is **not** the Android Advertising ID and **not** any hardware identifier. It exists solely so a player's high score persists when they reopen the app.
- No third-party SDKs are bundled (no Firebase, no AdMob, no Crashlytics, no analytics SDKs). The only network dependency is Supabase (your own backend).

---

## Internal Testing setup (post-verification)

Once the app entry exists and the AAB is uploaded to the Internal Testing track:

1. Add tester emails (max 100 per track)
2. Save the **opt-in URL** — this is what testers use to install
3. Testers click the URL, accept the invitation, then install via Play Store
4. First-install propagation can take 5–15 minutes after upload completes

---

## Notes / open questions

- `com.newco.twodots` — confirm "newco" is the namespace you want (immutable once published; rebrand-blocking if you change orgs later)
- `version: '0.1.0'` and `versionCode: 1` are appropriate for first internal-testing upload. EAS production profile auto-increments versionCode on subsequent builds.
- Feature graphic is the only listing asset that doesn't yet exist — needs design work (or commission)
