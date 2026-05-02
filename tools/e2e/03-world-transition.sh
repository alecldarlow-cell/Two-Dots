#!/bin/bash
# tools/e2e/03-world-transition.sh
#
# Requirement #8 — world transitions: verify a run reaches score >= 10
# (Mars threshold). Uses the seeded replay generator to drive gameplay,
# then asserts via Supabase that a run_end with score >= 10 landed.
#
# Will fail until tap-overhead-ms tuning + physics determinism gets the
# replay reliably above score 10. As of writing the seeded replay peaks
# around score 8 on a Pixel 7. Test is correct shape — passes once the
# achievable score crosses the threshold.
#
# Run sequence:
#   1. Generator pulls forgiving fixture from Supabase, emits a fresh
#      02-seeded-replay.sh with target-score=10.
#   2. Run that script (it sources lib.sh, dispatches taps via adb,
#      asserts run_end.score >= 10 in Supabase).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ">>> regenerating replay with target-score=10"
node "$SCRIPT_DIR/../generate-e2e-replay.mjs" \
  --target-score 10 \
  --out "$SCRIPT_DIR/02-seeded-replay.sh"

bash "$SCRIPT_DIR/02-seeded-replay.sh"
