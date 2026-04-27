/**
 * Monetisation facade.
 *
 * Deliberately stubbed for MVP. The Two Dots research page leaves the
 * monetisation model as an open founder question, and the business case
 * gates polish investment on Phase 1 validation (70%+ unprompted retry).
 *
 * This hook provides the shape the game screen calls against, so when ads/IAP
 * are wired in Phase 2, no game code changes. The implementation will move to
 * `features/ads/` and `features/iap/` (currently empty stub folders).
 *
 * What the game currently calls:
 *   - `showInterstitial()` — invoked on death. Currently a no-op.
 *   - `hasRemovedAds` — driven by a future IAP. Currently always true so the
 *     game never attempts to show an ad from a no-op function.
 *
 * What the menu currently calls:
 *   - `canPurchaseRemoveAds` — whether the "remove ads" IAP is available.
 *     Currently always false (IAP is not integrated).
 *   - `purchaseRemoveAds()` — triggers the IAP flow. Currently a no-op.
 */

export interface MonetisationApi {
  /** True if ads are suppressed — either because IAP is purchased or ads aren't wired. */
  hasRemovedAds: boolean;
  /** Show an interstitial ad. No-op when ads are suppressed. */
  showInterstitial: () => void;
  /** True if the "remove ads" IAP is available to purchase. */
  canPurchaseRemoveAds: boolean;
  /** Trigger the IAP purchase flow. */
  purchaseRemoveAds: () => Promise<void>;
}

export function useMonetisation(): MonetisationApi {
  return {
    // Phase 1 stub: ads are treated as "removed" because they aren't integrated.
    // This prevents any code from attempting to show one from the no-op function.
    hasRemovedAds: true,
    showInterstitial: () => {
      // no-op — see module docstring
    },
    canPurchaseRemoveAds: false,
    purchaseRemoveAds: async () => {
      // no-op
    },
  };
}
