# features/iap

**Deliberately empty.** IAP is not integrated in the MVP.

## When this gets built

Phase 2, post-validation. First candidate product: "Remove ads" one-off purchase.

## Expected contents when implemented

- `api/usePurchase.ts` — wrapper around `expo-in-app-purchases` or RevenueCat
- `api/useProducts.ts` — fetch available products and their localised prices
- `api/useEntitlements.ts` — check what the user has purchased (survives reinstall via Apple ID / Google account)
- `components/PurchaseSheet.tsx` — product picker

## Why the facade exists already

`useMonetisation.ts` returns `canPurchaseRemoveAds: false` and a no-op `purchaseRemoveAds()`. Game code and menu code call that hook — no IAP knowledge anywhere else. When IAP lands, only the facade changes.
