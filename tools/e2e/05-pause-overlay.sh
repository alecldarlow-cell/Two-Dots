#!/bin/bash
# tools/e2e/05-pause-overlay.sh
#
# Requirement #5 — pause overlay shows when the player taps the central
# divider mid-run. Verifies via the `pause_toggled` analytics event added
# alongside this test (see src/features/analytics/events.ts).
#
# REQUIRES the next EAS e2e build — the running APK must be one built
# AFTER pause_toggled was added to events.ts + serialise.ts +
# useGameLoop.ts. Without that, no pause_toggled events reach Supabase
# regardless of how many divider taps fire, and the test will time out.
#
# Run sequence:
#   1. Force-clean launch.
#   2. Prime tap to start the run.
#   3. Short sleep so engine is stable in 'playing' phase.
#   4. Tap divider — should toggle pause and emit pause_toggled.
#   5. Tap divider again — should toggle resume and emit a second event.
#   6. Wait for analytics flush, assert at least 2 pause_toggled events.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

e2e_init "05-pause-overlay"

e2e_launch_app_clean

echo ">>> prime tap"
e2e_tap_l   # any tap on idle starts the game
sleep 1

echo ">>> tap divider — pause"
e2e_tap_divider
sleep 1

echo ">>> tap divider — resume"
e2e_tap_divider
sleep 1

# Tap once more to make sure the run progresses (otherwise dots may be
# already dead by the time we query, but events should still be in flight).
e2e_tap_l

echo ">>> letting analytics flush"
sleep "$ANALYTICS_FLUSH_WAIT_S"

# Two transitions expected: into pause, out of pause.
e2e_wait_for_event "pause_toggled" 2

e2e_pass "pause + resume both fired pause_toggled events"
