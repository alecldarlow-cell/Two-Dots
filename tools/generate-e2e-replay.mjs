#!/usr/bin/env node
/**
 * generate-e2e-replay.mjs
 *
 * Pulls a fixture-worthy run from Supabase analytics and emits a bash E2E
 * test script that replays the recorded tap stream against a deterministic-
 * seeded build via `adb shell input tap`. Replaces the old YAML-emitter
 * (generate-maestro-fixture.mjs) — Maestro can't dispatch in-game taps
 * reliably, ADB can.
 *
 * Pipeline:
 *   1. Fetch up to N most-recent qualifying runs (seed match, score >= min).
 *   2. Rank: lowest close_calls_in_run first (forgiving fixture absorbs more
 *      timing drift), then highest score, then most recent.
 *   3. Merge L+R taps into a time-ordered stream, compute deltas.
 *   4. Apply tap-overhead compensation (default 30ms — adb's per-tap floor
 *      vs Maestro's ~150ms, so most replays survive at default).
 *   5. Emit a self-contained bash script that sources lib.sh, replays the
 *      taps, then asserts run_end with target score landed in Supabase.
 *
 * Usage:
 *   $env:SUPABASE_URL = "https://<project>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role JWT>"
 *
 *   node tools/generate-e2e-replay.mjs                      # defaults
 *   node tools/generate-e2e-replay.mjs --seed 42 --min-score 20 \
 *     --tap-overhead-ms 30 --min-wait-ms 30 \
 *     --target-score 5 \
 *     --out tools/e2e/02-seeded-replay.sh
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile, chmod } from 'node:fs/promises';
import { argv, exit } from 'node:process';

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  // tap-overhead-ms: shave from each captured delta to compensate for ADB's
  //   per-tap dispatch overhead (~30ms typical). Lower than Maestro's ~150ms.
  // min-wait-ms: floor for between-tap waits. Don't go below ~10ms (sub-frame).
  // target-score: minimum score that the replay must reach for the test to
  //   pass. Set BELOW the source run's score to give drift some headroom.
  const args = {
    seed: 42,
    minScore: 20,
    // Set to the runner's measured adb roundtrip (run tools/e2e/probe-adb.sh
    // — typically 60-70ms on a wireless-ADB Pixel 7). Empirical score sweep
    // suggested ~100ms is better because of in-app latency, but starting
    // from probe-measured value lets us see drift in either direction.
    tapOverheadMs: 65,
    // Minimum wait after subtracting overhead. ADB's own dispatch is ~65ms,
    // so the actual minimum inter-tap interval is tapOverheadMs + minWaitMs;
    // raising minWaitMs above ~10 just over-delays already-tight recorded
    // deltas. Keep small (>0) to give bash `sleep` a stable rounding margin.
    minWaitMs: 10,
    targetScore: 5,
    out: 'tools/e2e/02-seeded-replay.sh',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--seed' && next) {
      args.seed = parseInt(next, 10);
      i++;
    } else if (a === '--min-score' && next) {
      args.minScore = parseInt(next, 10);
      i++;
    } else if (a === '--tap-overhead-ms' && next) {
      args.tapOverheadMs = parseInt(next, 10);
      i++;
    } else if (a === '--min-wait-ms' && next) {
      args.minWaitMs = parseInt(next, 10);
      i++;
    } else if (a === '--target-score' && next) {
      args.targetScore = parseInt(next, 10);
      i++;
    } else if (a === '--out' && next) {
      args.out = next;
      i++;
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node tools/generate-e2e-replay.mjs ' +
          '[--seed N] [--min-score N] [--target-score N] ' +
          '[--tap-overhead-ms N] [--min-wait-ms N] [--out path]',
      );
      exit(0);
    }
  }
  return args;
}

// ─── Supabase fetch + rank ──────────────────────────────────────────────────

const CANDIDATE_POOL = 20;

async function fetchFixtureRun(seed, minScore) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.',
    );
    exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('analytics_events')
    .select('score, occurred_at, payload')
    .eq('event_type', 'run_end')
    .gte('score', minScore)
    .filter('payload->>seed', 'eq', String(seed))
    .order('occurred_at', { ascending: false })
    .limit(CANDIDATE_POOL);

  if (error) {
    console.error('Supabase query failed:', error.message);
    exit(3);
  }
  if (!data || data.length === 0) {
    console.error(
      `No run_end found with seed=${seed} score>=${minScore}. ` +
        'A tester must play the e2e-profile APK and reach the threshold first.',
    );
    exit(4);
  }

  // Rank: fewest close calls first (forgiving fixture), then higher score,
  // then most recent. Prefers replays that absorb timing drift.
  const ranked = [...data].sort((a, b) => {
    const aCalls = a.payload?.close_calls_in_run ?? Number.POSITIVE_INFINITY;
    const bCalls = b.payload?.close_calls_in_run ?? Number.POSITIVE_INFINITY;
    if (aCalls !== bCalls) return aCalls - bCalls;
    if (a.score !== b.score) return b.score - a.score;
    return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
  });

  console.log(
    `Considered ${data.length} run(s); close-call counts: ` +
      `[${data.map((r) => r.payload?.close_calls_in_run ?? '?').join(', ')}].`,
  );
  return ranked[0];
}

// ─── Stream build ────────────────────────────────────────────────────────────

function buildEventStream(taps) {
  const events = [
    ...taps.L.map((ms) => ({ ms, side: 'L' })),
    ...taps.R.map((ms) => ({ ms, side: 'R' })),
  ];
  events.sort((a, b) => a.ms - b.ms);
  let prev = 0;
  return events.map((e) => {
    const delta = e.ms - prev;
    prev = e.ms;
    return { ...e, delta };
  });
}

// ─── Bash emission ───────────────────────────────────────────────────────────

function emitBash(run, args) {
  const taps = run.payload?.taps;
  if (!taps || !Array.isArray(taps.L) || !Array.isArray(taps.R)) {
    console.error('Run found but payload.taps is missing or malformed.');
    exit(5);
  }

  const stream = buildEventStream(taps);

  // Compensation for ADB's per-tap dispatch overhead (~30ms typical). Floor
  // protects against sub-frame waits that bash `sleep` rounds badly.
  let clamped = 0;
  let totalComp = 0;
  const compensated = stream.map((e) => {
    const target = e.delta - args.tapOverheadMs;
    const wait = Math.max(target, args.minWaitMs);
    if (target < args.minWaitMs) clamped++;
    totalComp += e.delta - wait;
    return { ...e, wait };
  });

  const closeCalls = run.payload?.close_calls_in_run ?? '?';

  const lines = [];
  lines.push('#!/bin/bash');
  lines.push('# Generated by tools/generate-e2e-replay.mjs — do not edit.');
  lines.push('#');
  lines.push(`# Seed:         ${args.seed}`);
  lines.push(`# Source score: ${run.score}`);
  lines.push(`# Close calls:  ${closeCalls}`);
  lines.push(`# Recorded at:  ${run.occurred_at}`);
  lines.push(`# Tap stream:   ${stream.length} events ` +
    `(${taps.L.length} L + ${taps.R.length} R)`);
  lines.push(`# Compensation: ${args.tapOverheadMs}ms per tap, ` +
    `${args.minWaitMs}ms floor — ${clamped} clamped, ${totalComp}ms total shaved`);
  lines.push(`# Target score: >= ${args.targetScore} (test passes if reached)`);
  lines.push('#');
  lines.push('# Replay only works against the matching seeded APK ' +
    `(EXPO_PUBLIC_E2E_SEED=${args.seed}, eas.json e2e profile).`);
  lines.push('# Re-run the generator after engine-tuning changes — recorded ' +
    'tap timings drift relative to new physics.');
  lines.push('');
  lines.push('set -euo pipefail');
  lines.push('source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"');
  lines.push('');
  lines.push(`e2e_init "02-seeded-replay-${args.seed}"`);
  lines.push('e2e_launch_app_clean');
  lines.push('');
  lines.push('# Prime tap — any position. Engine handleTap on idle transitions to');
  lines.push('# playing regardless of tap location, and primes both dots upward.');
  lines.push('echo ">>> prime tap"');
  lines.push('e2e_tap_l');
  lines.push('');
  lines.push(`echo ">>> replaying ${stream.length} captured taps"`);

  // Emit taps. Use printf instead of echo for portability across bash variants
  // when sleep takes fractional seconds.
  for (let i = 0; i < compensated.length; i++) {
    const e = compensated[i];
    const seconds = (e.wait / 1000).toFixed(3);
    lines.push(
      `sleep ${seconds}; e2e_tap_${e.side.toLowerCase()}` +
        `   # tap ${i + 1}/${stream.length} (delta=${e.delta}ms, wait=${e.wait}ms, cumulative=${e.ms}ms)`,
    );
  }

  lines.push('');
  lines.push('# Wait for run_end + analytics flush. The dots will likely die at or');
  lines.push('# shortly after the last tap (replay ends, no more input → gravity).');
  lines.push('echo ">>> waiting for death + analytics flush"');
  lines.push('sleep 4');
  lines.push('sleep "$ANALYTICS_FLUSH_WAIT_S"');
  lines.push('');
  lines.push('# Verify: a run_end event with score >= target landed since test start.');
  lines.push('# Source run scored ' + run.score + '; target is intentionally lower to');
  lines.push('# absorb timing-drift attrition over the replay.');
  lines.push(`e2e_assert_run_end_score ${args.targetScore}`);
  lines.push('');
  lines.push(`e2e_pass "replay reached score >= ${args.targetScore}"`);
  lines.push('');

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs();
console.log(
  `Looking for run_end with seed=${args.seed}, score>=${args.minScore} ...`,
);
const run = await fetchFixtureRun(args.seed, args.minScore);
const closeCalls = run.payload?.close_calls_in_run ?? '?';
console.log(
  `Picked run scored ${run.score}, ${closeCalls} close calls, ` +
    `recorded ${run.occurred_at}.`,
);

const bash = emitBash(run, args);
await writeFile(args.out, bash, 'utf8');
// Make the generated script executable on POSIX. Harmless on Windows file
// systems (chmod is a no-op on NTFS).
try {
  await chmod(args.out, 0o755);
} catch (_e) {
  // Ignore — the script can still be run via `bash <path>`.
}
console.log(
  `Wrote ${args.out} ` +
    `(target-score=${args.targetScore}, tap-overhead-ms=${args.tapOverheadMs}, ` +
    `min-wait-ms=${args.minWaitMs}).`,
);
