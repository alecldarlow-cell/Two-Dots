#!/bin/bash
# tools/e2e/probe-adb.sh
#
# Characterises this runner's ADB tap-dispatch overhead. Prints per-tap
# timing plus min/max/avg/median/stddev so you can see whether the average
# is representative or whether there's a long-tail / bimodal pattern that
# would make a single overhead value misleading.
#
# Run this BEFORE tuning --tap-overhead-ms on the replay generator. The
# average it prints is the recommended value for that flag.
#
# Usage:
#   bash tools/e2e/probe-adb.sh           # default 20 taps
#   bash tools/e2e/probe-adb.sh 50        # custom sample size
#
# The taps fire on the connected device at the centre of the screen. Easiest
# to run with the app on the idle screen — taps just bump dots around, no
# state damage.

set -euo pipefail

N=${1:-20}
echo "Probing $N adb-tap dispatches against the connected device..."
echo

# Resolve screen dims so we tap centre regardless of device.
size=$(adb shell wm size 2>/dev/null | grep -oE '[0-9]+x[0-9]+' | head -1)
if [ -z "$size" ]; then
  echo "FAIL: could not read screen size from adb"
  exit 1
fi
W=$(echo "$size" | cut -d 'x' -f 1)
H=$(echo "$size" | cut -d 'x' -f 2)
CX=$((W / 2))
CY=$((H / 2))
echo "Device: ${W}x${H}   Tap point: ${CX},${CY}"
echo

# ─── Sample loop ────────────────────────────────────────────────────────────
times_ms=()
for i in $(seq 1 "$N"); do
  start_ns=$(date +%s%N)
  adb shell input tap "$CX" "$CY" > /dev/null
  end_ns=$(date +%s%N)
  elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))
  times_ms+=("$elapsed_ms")
  printf "  tap %2d/%d: %4dms\n" "$i" "$N" "$elapsed_ms"
done

# ─── Stats ──────────────────────────────────────────────────────────────────

# Sort numerically.
sorted=($(printf '%s\n' "${times_ms[@]}" | sort -n))

# Min / max / avg.
min=${sorted[0]}
max=${sorted[$((N - 1))]}
sum=0
for t in "${times_ms[@]}"; do
  sum=$((sum + t))
done
avg=$((sum / N))

# Median: middle element for odd N, mean of two middle for even N.
if (( N % 2 == 1 )); then
  median=${sorted[$((N / 2))]}
else
  m1=${sorted[$((N / 2 - 1))]}
  m2=${sorted[$((N / 2))]}
  median=$(( (m1 + m2) / 2 ))
fi

# P10 / P90 — outlier indicators. If P90 >> avg the network has long tails.
p10=${sorted[$((N * 10 / 100))]}
p90=${sorted[$((N * 90 / 100))]}

# Stddev. Use bc for sqrt; fall back to "?" if bc absent.
sum_sq_diff=0
for t in "${times_ms[@]}"; do
  diff=$((t - avg))
  sum_sq_diff=$((sum_sq_diff + diff * diff))
done
variance=$((sum_sq_diff / N))
if command -v bc >/dev/null; then
  stddev=$(echo "scale=0; sqrt($variance)" | bc)
else
  stddev='?'
fi

# Mean absolute deviation — robust to outliers, useful sanity check vs stddev.
sum_abs_diff=0
for t in "${times_ms[@]}"; do
  diff=$((t - avg))
  abs=${diff#-}
  sum_abs_diff=$((sum_abs_diff + abs))
done
mad=$((sum_abs_diff / N))

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  Sample size:      $N"
echo "  min / max:        ${min}ms / ${max}ms"
echo "  avg / median:     ${avg}ms / ${median}ms"
echo "  p10 / p90:        ${p10}ms / ${p90}ms"
echo "  stddev / MAD:     ${stddev}ms / ${mad}ms"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "Recommended --tap-overhead-ms value: ${avg}"
echo
echo "Variance read:"
if (( max > avg * 3 )); then
  echo "  ⚠ Long tail detected (max is >3× average). The replay's slowest"
  echo "    taps will lag behind their recorded timing. Consider USB-cable"
  echo "    ADB or running the replay in a quieter network window."
elif (( mad < avg / 5 )); then
  echo "  ✓ Tight distribution (MAD < 20% of average). Single overhead"
  echo "    value is reliable for this run."
else
  echo "  ◦ Moderate spread. The average should still be a good default;"
  echo "    if replay scores fluctuate a lot between attempts, investigate"
  echo "    network conditions."
fi
