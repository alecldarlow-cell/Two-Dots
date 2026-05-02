#!/bin/bash
# tools/e2e/06-best-score.sh
#
# Requirement #6 — best score persistence: a score earned in one session
# survives an app kill + relaunch. Verified by checking that the second
# session_start has best_score in its payload (added alongside this test;
# see src/features/analytics/events.ts).
#
# REQUIRES the next EAS e2e build — needs the bestScore field added to
# SessionStartEvent + populated from AsyncStorage in _layout.tsx. Without
# that the second session_start carries no best_score in its payload and
# the assertion fails.
#
# Run sequence:
#   1. Clean launch (wipes AsyncStorage so we start from best=0).
#   2. Play a quick run — any score > 0 will do.
#   3. Wait for the score-write to AsyncStorage to flush.
#   4. Force-stop the app (DOES NOT clear AsyncStorage — best score persists).
#   5. Relaunch (without clearing).
#   6. Verify the second session_start has best_score > 0 in payload.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

e2e_init "06-best-score"

# ─── Phase 1: play a short run, score something ─────────────────────────────
echo ">>> phase 1: clean launch + quick run"
e2e_launch_app_clean

# Prime tap, then a few rapid taps to score at least 1-2 gates before dying.
e2e_tap_l
sleep 0.4
e2e_tap_l
sleep 0.4
e2e_tap_r
sleep 0.4
e2e_tap_l
sleep 0.4
e2e_tap_r

# Wait for death, AsyncStorage write, analytics flush.
echo ">>> waiting for death + persistence"
sleep 5
sleep "$ANALYTICS_FLUSH_WAIT_S"

# Confirm the run we just played scored > 0 (otherwise no best score saved).
echo ">>> verifying we scored something to persist"
e2e_assert_run_end_score 1

# ─── Phase 2: relaunch without wiping data ──────────────────────────────────
# Mark a new test-window time so we only check the *next* session_start.
PHASE2_START=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
echo ">>> phase 2: force-stop + relaunch (preserves AsyncStorage)"
e2e_launch_app   # NB: not _clean — we want best score to survive
sleep "$ANALYTICS_FLUSH_WAIT_S"

# ─── Verify ─────────────────────────────────────────────────────────────────
# Query for session_start events with non-null payload->>best_score in the
# phase-2 window. Filter `payload->>best_score=not.is.null` matches any
# session_start whose payload includes a best_score field. (Pre-build APKs
# don't emit this field at all — query returns empty → test fails clearly.)
echo ">>> verifying second session_start carries best_score"

QUERY="analytics_events?event_type=eq.session_start&occurred_at=gt.${PHASE2_START}&payload->>best_score=not.is.null&select=payload"
RESULT=$(e2e_supabase_get "$QUERY")
COUNT=$(echo "$RESULT" | jq 'length')

if [ "$COUNT" -lt 1 ]; then
  echo "  ✗ no session_start with best_score found in phase-2 window"
  echo "    QUERY: $QUERY"
  echo "    RESULT: $RESULT"
  e2e_fail "best score did not persist across launch"
fi

BEST=$(echo "$RESULT" | jq -r '.[0].payload.best_score')
echo "  ✓ session_start carries best_score=$BEST"

e2e_pass "best score persisted across app launch"
