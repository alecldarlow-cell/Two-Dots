# features/ads

**Deliberately empty.** Ads are not integrated in the MVP.

## When this gets built

After Phase 1 validation — 70%+ unprompted retry rate across 20–30 testers — the `features/monetisation/useMonetisation.ts` facade gets a real implementation that uses what's in this folder.

## Expected contents when implemented

- `api/useInterstitial.ts` — wrapper around the chosen ad SDK (Google AdMob, AppLovin, or similar)
- `api/useRewardedVideo.ts` — for a "continue this run" revive mechanic, if desired
- `components/AdConsentSheet.tsx` — GDPR/ATT consent flow
- Typed config for ad unit IDs per platform and per env

## Why the facade exists already

`useMonetisation.ts` returns `{ showInterstitial: noop, hasRemovedAds: true }` today. Game code calls that hook. When ads land, only the facade changes. Zero game-code churn.

See the Two Dots research page in Confluence for the monetisation open questions.
