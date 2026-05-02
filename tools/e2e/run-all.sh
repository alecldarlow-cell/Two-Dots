#!/bin/bash
# tools/e2e/run-all.sh
#
# Runs every numbered E2E test script in tools/e2e/ in order. Each test
# returns 0 on pass, 1 on fail. The runner aggregates results and exits
# non-zero on any failure (CI-friendly).
#
# Usage:
#   export SUPABASE_URL=...
#   export SUPABASE_SERVICE_ROLE_KEY=...
#   bash tools/e2e/run-all.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0
FAILED_TESTS=()

# Glob in lexical order so 01-, 02-, ... run in numeric sequence.
shopt -s nullglob
for script in "$SCRIPT_DIR"/[0-9][0-9]-*.sh; do
  echo
  echo "▶ Running $(basename "$script")"
  echo "─────────────────────────────────────────────────────────────"
  if bash "$script"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_TESTS+=("$(basename "$script")")
  fi
done

echo
echo "═════════════════════════════════════════════════════════════"
echo " E2E suite summary"
echo "   passed: $PASS"
echo "   failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "   failures:"
  for t in "${FAILED_TESTS[@]}"; do
    echo "     ✗ $t"
  done
fi
echo "═════════════════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ]
