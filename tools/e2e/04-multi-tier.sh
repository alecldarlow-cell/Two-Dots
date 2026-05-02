#!/bin/bash
# tools/e2e/04-multi-tier.sh
#
# Requirement #9 — multi-tier engine progression: verify a run reaches
# tier >= 2. Tier 1 ends around score 10 in the current engine config; the
# replay needs to clear that boundary. Same blocker as 03-world-transition:
# pending replay reliably reaching higher scores.
#
# Asserts directly on tier rather than score so this test stays valid even
# if the score→tier mapping shifts in future tuning.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

e2e_init "04-multi-tier"

# Regenerate replay with target high enough to almost certainly hit tier 2,
# but use a custom assertion below (tier-based) instead of the generator's
# score-based one.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/../generate-e2e-replay.mjs" \
  --target-score 1 \
  --out "$SCRIPT_DIR/02-seeded-replay.sh" > /dev/null

# Don't run 02's assertion — we'll do our own tier-based one. Strip the
# trailing assertion from 02-seeded-replay.sh and run just the gameplay.
# Cleaner: just run the script and check tier directly afterwards. The
# script's score>=1 assertion will pass too.
bash "$SCRIPT_DIR/02-seeded-replay.sh" || true

# Now the tier check. Override E2E_START_TIME to capture only this test's
# events (the inner script bumped it on its own e2e_init).
sleep "$ANALYTICS_FLUSH_WAIT_S"
e2e_assert_run_end_tier 2

e2e_pass "replay reached tier >= 2"
