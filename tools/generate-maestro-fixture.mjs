#!/usr/bin/env node
/**
 * generate-maestro-fixture.mjs
 *
 * Pulls a fixture-worthy run from Supabase analytics and emits a Maestro
 * YAML flow that replays the recorded tap stream against a deterministic-
 * seeded build.
 *
 * Usage:
 *   # Set env (service role key required — anon can't read analytics_events
 *   # per supabase/migrations/003).
 *   $env:SUPABASE_URL = "https://biwhjzebrmhvtkjaqsay.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<paste from Supabase dashboard>"
 *
 *   # Default: seed=42, min-score=20, writes to .maestro/seeded-survival.yaml
 *   node tools/generate-maestro-fixture.mjs
 *
 *   # Or with overrides:
 *   node tools/generate-maestro-fixture.mjs --seed 42 --min-score 25 \
 *     --out .maestro/survival-25.yaml
 *
 * Prerequisites:
 *   - The seeded build must have been run by at least one tester who reached
 *     the score threshold. The generator picks the most recent qualifying
 *     run.
 *   - The build profile is `e2e` in eas.json (sets EXPO_PUBLIC_E2E_SEED).
 *   - The replay runs against that same e2e APK — different seeds = different
 *     pipe layouts = recorded taps don't replay.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  // tapOverheadMs: how much wall time Maestro burns per tapOn (screen capture +
  //   accessibility tree fetch + tap dispatch). Subtract from each captured delta
  //   so the *next* tap fires at the recorded moment, not after Maestro's slack.
  // minWaitMs: floor for a wait. Below ~50ms Maestro can't reliably honour the
  //   timeout, and we don't want to invert the timing by going negative.
  const args = {
    seed: 42,
    minScore: 20,
    out: '.maestro/seeded-survival.yaml',
    tapOverheadMs: 150,
    minWaitMs: 50,
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
    } else if (a === '--out' && next) {
      args.out = next;
      i++;
    } else if (a === '--tap-overhead-ms' && next) {
      args.tapOverheadMs = parseInt(next, 10);
      i++;
    } else if (a === '--min-wait-ms' && next) {
      args.minWaitMs = parseInt(next, 10);
      i++;
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node tools/generate-maestro-fixture.mjs ' +
          '[--seed N] [--min-score N] [--out path] ' +
          '[--tap-overhead-ms N] [--min-wait-ms N]',
      );
      exit(0);
    }
  }
  return args;
}

// ─── Supabase query ──────────────────────────────────────────────────────────

// How many recent qualifying runs to fetch before client-side ranking.
// Client-side sort lets us rank by a JSONB-payload field (close_calls_in_run)
// without wrestling Supabase JS over JSONB ordering syntax.
const CANDIDATE_POOL = 20;

async function fetchFixtureRun(seed, minScore) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. See script header.',
    );
    exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  // Pull the most recent N qualifying runs, then rank client-side. We prefer
  // runs with FEWER close calls because timing drift in the Maestro replay
  // eats into the same spatial margin that close calls measure — picking a
  // forgiving source run gives the replay extra room before drift kills it.
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
        'A tester needs to play the e2e-profile APK and reach the threshold first.',
    );
    exit(4);
  }

  // Rank: lowest close_calls first; tiebreak by higher score (more
  // demonstrative of multi-gate progression); tiebreak by most recent.
  // Note: this biases fixtures toward "boring" runs — fine for an E2E
  // pipeline test, not fine if we ever want fixtures to double as regression
  // tests for hard sections of the level. Not how we use them here.
  const ranked = [...data].sort((a, b) => {
    const aCalls = a.payload?.close_calls_in_run ?? Number.POSITIVE_INFINITY;
    const bCalls = b.payload?.close_calls_in_run ?? Number.POSITIVE_INFINITY;
    if (aCalls !== bCalls) return aCalls - bCalls;
    if (a.score !== b.score) return b.score - a.score;
    return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
  });

  console.log(
    `Considered ${data.length} qualifying run(s); close-call counts: ` +
      `[${data.map((r) => r.payload?.close_calls_in_run ?? '?').join(', ')}].`,
  );
  return ranked[0];
}

// ─── YAML emission ───────────────────────────────────────────────────────────

/**
 * Merge the L and R timestamp arrays into a single time-ordered stream,
 * then compute deltas (Maestro's waitFor: { milliseconds: N } takes deltas
 * not absolute times).
 */
function buildEventStream(taps) {
  const events = [
    ...taps.L.map((ms) => ({ ms, side: 'L' })),
    ...taps.R.map((ms) => ({ ms, side: 'R' })),
  ];
  events.sort((a, b) => a.ms - b.ms);

  // Compute delta from the previous event (or from run-start = 0 for the first).
  let prev = 0;
  return events.map((e) => {
    const delta = e.ms - prev;
    prev = e.ms;
    return { ...e, delta };
  });
}

const TAP_POINT = { L: '20%, 60%', R: '80%, 60%' };

function emitYaml(run, seed, tapOverheadMs, minWaitMs) {
  const taps = run.payload.taps;
  if (!taps || !Array.isArray(taps.L) || !Array.isArray(taps.R)) {
    console.error('Run found but payload.taps is missing or malformed.');
    exit(5);
  }

  const stream = buildEventStream(taps);

  // Apply per-tap overhead compensation: each Maestro tapOn burns ~150ms of
  // wall time on screen capture + accessibility tree fetch + dispatch, so the
  // wait we emit needs to be (recorded_delta - overhead). Floor at minWaitMs
  // because Maestro can't reliably honour sub-50ms timeouts.
  let clampedCount = 0;
  let totalCompensation = 0;
  const compensated = stream.map((e) => {
    const target = e.delta - tapOverheadMs;
    const wait = Math.max(target, minWaitMs);
    if (target < minWaitMs) clampedCount++;
    totalCompensation += e.delta - wait;
    return { ...e, wait };
  });

  const closeCalls = run.payload?.close_calls_in_run ?? '?';
  const lines = [];
  lines.push('# Generated by tools/generate-maestro-fixture.mjs');
  lines.push(
    `# Seed: ${seed} | Source score: ${run.score} | Close calls: ${closeCalls} | ` +
      `Recorded: ${run.occurred_at}`,
  );
  lines.push(
    `# Selection: lowest close_calls_in_run wins (forgiving fixtures absorb ` +
      `more replay drift).`,
  );
  lines.push(
    `# Re-run the generator after engine-tuning changes (JUMP_VY, GRAVITY, etc.) — recorded`,
  );
  lines.push('# tap timings will drift relative to the new physics.');
  lines.push('#');
  lines.push(
    `# Tap-overhead compensation: ${tapOverheadMs}ms shaved from each delta ` +
      `(min ${minWaitMs}ms floor).`,
  );
  lines.push(
    `# Total compensation applied: ${totalCompensation}ms across ${stream.length} taps. ` +
      `${clampedCount} taps clamped to the floor.`,
  );
  lines.push('# IMPORTANT: this flow only replays correctly against the matching seeded APK');
  lines.push(`# (built with EXPO_PUBLIC_E2E_SEED=${seed} — see eas.json e2e profile).`);
  lines.push('');
  lines.push('appId: com.newco.twodots');
  lines.push('---');
  lines.push('# 1. Cold launch on a clean state.');
  lines.push('- launchApp:');
  lines.push('    clearState: true');
  lines.push('');
  lines.push("# 2. Idle screen reachable.");
  lines.push("- assertVisible: 'TWO'");
  lines.push('');
  lines.push("# 3. tap-start at ms=0 (any safe off-centre point — engine handleTap on idle");
  lines.push("#    fires regardless of position; primes both dots upward).");
  lines.push("- tapOn:");
  lines.push("    point: '20%, 60%'");
  lines.push('');
  lines.push(`# 4. Replay the captured ${stream.length} L+R taps from the source run.`);
  lines.push(`#    waitForAnimationToEnd doubles as a fixed sleep here: the Skia canvas`);
  lines.push(`#    redraws every frame, so the animation detector never settles and the`);
  lines.push(`#    full timeout elapses. Maestro has no pure sleep command.`);
  for (const e of compensated) {
    lines.push(`- waitForAnimationToEnd:`);
    lines.push(`    timeout: ${e.wait}   # recorded delta=${e.delta}ms, cumulative ms=${e.ms}`);
    lines.push(`- tapOn: { point: '${TAP_POINT[e.side]}' }   # ${e.side} jump`);
  }
  lines.push('');
  lines.push('# 5. The run will eventually die. Wait for the death-screen world eyebrow.');
  lines.push("- extendedWaitUntil:");
  lines.push("    visible: 'JUPITER'   # source run scored 20+, so dying world is Jupiter");
  lines.push("    timeout: 30000");
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
  `Picked run scored ${run.score} at ${run.occurred_at}, ` +
    `${closeCalls} close calls, ` +
    `${run.payload.taps?.L?.length ?? 0} L taps + ${run.payload.taps?.R?.length ?? 0} R taps.`,
);
const yaml = emitYaml(run, args.seed, args.tapOverheadMs, args.minWaitMs);
await writeFile(args.out, yaml, 'utf8');
console.log(
  `Wrote ${args.out} ` +
    `(tap-overhead-ms=${args.tapOverheadMs}, min-wait-ms=${args.minWaitMs}).`,
);
