#!/bin/bash
# tools/e2e/01-core-path.sh
#
# Core-path E2E test. Replicates what .maestro/core-path.yaml did, but
# verifies via Supabase analytics rather than on-screen text. Covers four
# critical state transitions in one flow:
#
#   idle      (session_start fired on app launch)
#   → playing (run_start fires on first tap)
#   → dead    (run_end fires when dots collide with a pipe — no further
#              taps means death from gravity within ~3-5s)
#   → idle    (retry_tapped fires when the user taps the death screen)
#
# This is the smoke test that proves: app boots, analytics flush, every
# critical state transition fires its event. ~25 seconds total.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

e2e_init "01-core-path"

# Clean launch — wipes AsyncStorage so a stale best-score doesn't render an
# extra HUD element that could perturb taps. Also guarantees a fresh session_id.
e2e_launch_app_clean

# 1. App is up. session_start should be in flight to Supabase. We don't
#    assert it yet — we'll let it land while the rest of the test runs and
#    check at the end with the other events (one round-trip vs four).

# 2. Idle → playing. Any tap on the idle phase transitions to playing and
#    fires run_start. Engine's handleTap on idle ignores tap position.
echo ">>> tap to start"
e2e_tap_l

# 3. Let the dots die naturally. With no further input, gravity takes them
#    into the first pipe pair within a couple of seconds. run_end fires on
#    death. Sleep generously to absorb death-freeze + analytics send.
echo ">>> waiting for dots to die"
sleep 6

# 4. Dead → idle. A tap on the death screen resets to idle and fires
#    retry_tapped. The dead-phase tap-handler ignores position (any tap
#    works), so the L-tap location is fine.
echo ">>> tap to retry"
e2e_tap_l

# 5. Let analytics flush. Events are queued client-side and pushed in
#    batches; ANALYTICS_FLUSH_WAIT_S gives the network a comfortable window.
echo ">>> letting analytics flush"
sleep "$ANALYTICS_FLUSH_WAIT_S"

# 6. Verify all four expected events landed. e2e_wait_for_event polls
#    Supabase up to E2E_EVENT_TIMEOUT_S — picks up late arrivals from the
#    flush batch. set -e exits on the first failure (run dump on failure
#    if you want to see what DID land — uncomment the trap).
#
# trap 'e2e_dump_events' ERR

echo
echo ">>> verifying analytics"
# session_start is already proven by e2e_launch_app_clean's readiness check
# (it polls until session_start lands before returning). Re-asserting here
# would be redundant — and we want the test to focus on the four transitions
# that the prime tap + retry tap drive.
e2e_wait_for_event "run_start"
e2e_wait_for_event "run_end"
e2e_wait_for_event "retry_tapped"

e2e_pass "launch + all four state transitions confirmed via analytics"
