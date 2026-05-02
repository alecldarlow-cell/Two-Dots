#!/bin/bash
# tools/e2e/lib.sh
#
# Shared bash library for Two Dots E2E tests. Pairs ADB-driven input dispatch
# with Supabase-driven assertion logic — Maestro proved unable to dispatch
# rapid in-game taps reliably (its tapOn-on-point routes through Android
# accessibility services and gets swallowed during the 'playing' phase), and
# anyway we wanted the test verdict to come from the analytics pipeline (real
# integration signal) rather than from on-screen state (Skia text isn't in
# the accessibility tree).
#
# Usage from a test script:
#
#   #!/bin/bash
#   set -euo pipefail
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#
#   e2e_init "my-test-name"
#   e2e_launch_app
#   e2e_tap_l
#   sleep 3
#   e2e_wait_for_event "run_end"
#   e2e_pass "all events landed"
#
# Required env:
#   SUPABASE_URL                  https://<project>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY     service_role JWT (bypasses RLS — keep secret)
#
# Optional env:
#   APP_ID                        defaults to com.newco.twodots
#   ANALYTICS_FLUSH_WAIT_S        post-action sleep before querying (default 5)
#   E2E_EVENT_TIMEOUT_S           max wait per event lookup (default 30)
#
# Required tooling on the runner: adb, curl, jq.

# ─── Config (overridable by env) ─────────────────────────────────────────────

APP_ID="${APP_ID:-com.newco.twodots}"
ANALYTICS_FLUSH_WAIT_S="${ANALYTICS_FLUSH_WAIT_S:-5}"
E2E_EVENT_TIMEOUT_S="${E2E_EVENT_TIMEOUT_S:-30}"

# ─── Init / preflight ────────────────────────────────────────────────────────

e2e_init() {
  E2E_TEST_NAME="${1:-unnamed}"
  # ISO-8601 with millisecond precision; Supabase TIMESTAMPTZ accepts it.
  E2E_START_TIME=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)

  echo "═══════════════════════════════════════════════════════════════"
  echo " E2E test: $E2E_TEST_NAME"
  echo " Start:    $E2E_START_TIME"
  echo "═══════════════════════════════════════════════════════════════"

  e2e__check_prereqs
  e2e__get_screen_dims

  echo "Device:   ${E2E_SCREEN_W}x${E2E_SCREEN_H}"
  echo "App ID:   $APP_ID"
  echo
}

e2e__check_prereqs() {
  command -v adb  >/dev/null || e2e_fail "adb not on PATH"
  command -v curl >/dev/null || e2e_fail "curl not on PATH"
  command -v jq   >/dev/null || e2e_fail "jq not on PATH (apt install jq)"

  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    e2e_fail "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required"
  fi

  # Count "device" lines after the header. If zero, no device is connected /
  # authorised.
  local devices
  devices=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)
  if [ "$devices" -lt 1 ]; then
    e2e_fail "no ADB device connected (run 'adb devices' to debug)"
  fi
}

e2e__get_screen_dims() {
  # `wm size` prints e.g. "Physical size: 1080x2400". Grab the first WxH.
  local size
  size=$(adb shell wm size 2>/dev/null | grep -oE '[0-9]+x[0-9]+' | head -1)
  if [ -z "$size" ]; then
    e2e_fail "could not read screen size from adb"
  fi
  E2E_SCREEN_W=$(echo "$size" | cut -d 'x' -f 1)
  E2E_SCREEN_H=$(echo "$size" | cut -d 'x' -f 2)
}

# ─── App lifecycle ───────────────────────────────────────────────────────────

# Force-stop and cold-launch the app, then wait until it's actually ready
# for input. "Ready" = session_start has landed in Supabase (proving the
# React tree mounted and analytics flushed), plus a small extra beat for
# the idle screen to render after splash dismissal.
#
# The force-stop wipes in-memory state but NOT AsyncStorage — best-score
# persistence tests need that. To wipe AsyncStorage as well, use
# `e2e_launch_app_clean`.
e2e_launch_app() {
  echo ">>> launching $APP_ID"
  adb shell am force-stop "$APP_ID"
  sleep 1
  adb shell am start -n "$APP_ID/.MainActivity" >/dev/null
  e2e__wait_until_ready
}

# Same as e2e_launch_app but also clears app data (AsyncStorage, caches).
# Use for tests where prior runs' best-score / session state would interfere.
e2e_launch_app_clean() {
  echo ">>> clearing $APP_ID and launching"
  adb shell pm clear "$APP_ID" >/dev/null
  sleep 1
  adb shell am start -n "$APP_ID/.MainActivity" >/dev/null
  e2e__wait_until_ready
}

# Internal: wait for the most-recent session_start to appear in Supabase
# (proves analytics is up and React tree is mounted), then a brief extra
# pause for the idle screen to be visible. Replaces the old fixed-3s sleep
# which was a race against splash/font/asset loading on cold launches.
e2e__wait_until_ready() {
  printf "  waiting for app to be ready "
  # Poll Supabase up to 20s for any session_start since test start. Use a
  # short per-poll cadence (1s) to keep startup latency low when the app
  # boots quickly.
  local elapsed=0
  while [ "$elapsed" -lt 20 ]; do
    local result count
    result=$(e2e_supabase_get \
      "analytics_events?event_type=eq.session_start&occurred_at=gt.${E2E_START_TIME}&select=occurred_at&limit=1")
    count=$(echo "$result" | jq 'length' 2>/dev/null || echo 0)
    if [ "$count" -ge 1 ]; then
      printf " ✓ session_start landed\n"
      # Brief settle: session_start fires when AnalyticsBootstrap mounts,
      # but the splash screen + idle UI may take another moment to render
      # over the top.
      sleep 1
      return 0
    fi
    printf "."
    sleep 1
    elapsed=$((elapsed + 1))
  done
  printf "\n"
  e2e_fail "app didn't reach ready state within 20s (no session_start)"
}

# ─── Tap dispatch ────────────────────────────────────────────────────────────
# Percentage-based; resolves to physical pixels per the device's wm size.
# `adb shell input tap` injects a synthetic touch at the OS input layer —
# bypasses accessibility entirely, dispatches to the JS layer like a real
# finger.

e2e_tap_pct() {
  local x_pct=$1
  local y_pct=$2
  local x=$((E2E_SCREEN_W * x_pct / 100))
  local y=$((E2E_SCREEN_H * y_pct / 100))
  adb shell input tap "$x" "$y"
}

e2e_tap_l()      { e2e_tap_pct 20 60; }   # left half — bumps orange dot
e2e_tap_r()      { e2e_tap_pct 80 60; }   # right half — bumps cyan dot
e2e_tap_center() { e2e_tap_pct 50 50; }   # safe for "tap anywhere" interactions
e2e_tap_divider(){ e2e_tap_pct 50 75; }   # mid-screen vertical divider — pause toggle

# ─── Supabase verification ──────────────────────────────────────────────────

# Low-level: GET against PostgREST, returns raw JSON.
e2e_supabase_get() {
  local query=$1
  curl -s \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/$query"
}

# Wait until N events of `event_type` (occurred since test start, optionally
# matching extra filters) appear in analytics_events. Polls every 2s up to
# E2E_EVENT_TIMEOUT_S.
#
# Args:
#   $1  event_type        e.g. 'run_end'
#   $2  min_count         (default 1)
#   $3  extra_filter      raw PostgREST filter snippet, e.g. '&score=gte.5'
#                         (must include leading '&')
#   $4  timeout_s         override E2E_EVENT_TIMEOUT_S
#
# Exits the script on timeout (set -e in caller).
e2e_wait_for_event() {
  local event_type=$1
  local min_count=${2:-1}
  local extra_filter=${3:-}
  local timeout=${4:-$E2E_EVENT_TIMEOUT_S}

  local query="analytics_events?event_type=eq.${event_type}&occurred_at=gt.${E2E_START_TIME}${extra_filter}&select=score,tier,occurred_at,payload"

  printf "  waiting for %s (min %d) " "$event_type" "$min_count"
  local elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    local result count
    result=$(e2e_supabase_get "$query")
    count=$(echo "$result" | jq 'length' 2>/dev/null || echo 0)
    if [ "$count" -ge "$min_count" ]; then
      printf " ✓ found %d\n" "$count"
      return 0
    fi
    printf "."
    sleep 2
    elapsed=$((elapsed + 2))
  done
  printf "\n"
  echo "    QUERY:    $query"
  echo "    LAST:     $result"
  e2e_fail "timed out waiting for $event_type (min $min_count)"
}

# Convenience: assert a run_end with score >= N has fired since test start.
e2e_assert_run_end_score() {
  local min_score=$1
  e2e_wait_for_event "run_end" 1 "&score=gte.${min_score}"
}

# Convenience: assert a run_end with tier >= N has fired since test start.
e2e_assert_run_end_tier() {
  local min_tier=$1
  e2e_wait_for_event "run_end" 1 "&tier=gte.${min_tier}"
}

# Diagnostic: print a summary of every event since test start. Useful for
# debugging a failing test — call before e2e_fail to see what DID land.
e2e_dump_events() {
  echo "─── events since $E2E_START_TIME ───"
  e2e_supabase_get "analytics_events?occurred_at=gt.${E2E_START_TIME}&order=occurred_at.asc&select=event_type,score,tier,occurred_at" \
    | jq -r '.[] | "\(.occurred_at)  \(.event_type)  score=\(.score // "-")  tier=\(.tier // "-")"'
  echo "─────────────────────────────────────"
}

# ─── Result reporting ────────────────────────────────────────────────────────

e2e_pass() {
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo " ✅ PASS: $E2E_TEST_NAME"
  echo "    ${1:-all checks succeeded}"
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
}

e2e_fail() {
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo " ❌ FAIL: ${E2E_TEST_NAME:-init}"
  echo "    ${1:-unspecified failure}"
  echo "═══════════════════════════════════════════════════════════════"
  exit 1
}
