/**
 * Engine constants.
 *
 * Ported directly from the HTML prototype. Values are tuned and MUST NOT be
 * changed without a corresponding update to the physics tests — the Phase 1
 * retry-rate gate assumes this exact difficulty curve.
 *
 * See prototype reference: TwoDots.html lines 41-76.
 */

// ─── Canvas dimensions ────────────────────────────────────────────────────────
// W is fixed — the game is designed against a 390px logical width and difficulty
// (gap-to-dot ratio) is tuned against that. H_REF is the *reference* height used
// only for proportions that don't need to scale with device (e.g. idle bob
// amplitude). The actual playable height — `visH` — is computed at runtime from
// the viewport's aspect ratio so taller phones get a proportionally taller
// logical canvas. This preserves gap-threading difficulty across devices and
// only affects vertical runway between obstacles.
export const W = 390;
export const H_REF = 700;

// Logical height is clamped so unusual viewports (foldables, tablets in portrait)
// don't produce absurd values that break the idle-bob safe zone.
export const VIS_H_MIN = 600;
export const VIS_H_MAX = 1000;

// ─── Lane centres ─────────────────────────────────────────────────────────────
export const LANE_L = W * 0.25;
export const LANE_R = W * 0.75;

// ─── Physics ──────────────────────────────────────────────────────────────────
export const GRAVITY = 0.12;
export const JUMP_VY = -4.2;
export const DOT_R = 14;

// ─── Pipes ────────────────────────────────────────────────────────────────────
export const PIPE_W = 36;
// Base speed is no longer used directly — per-tier speed is in `tiers.ts`.
// Kept as reference for the derivation in `maxUpReach`.
export const PIPE_SPEED_BASE = 2.2;
// Retained as a safety ceiling only — distance-based spawn is primary.
export const PIPE_SPAWN_MS = 2800;
// Horizontal px between pipe centres — spawn when rightmost is this far from right edge.
export const PIPE_SPACING = 280;

// ─── Close-call detection ────────────────────────────────────────────────────
// Pixels of clearance that count as "nearly" — fires the gold ring + chime.
export const CLOSE_CALL_PX = 18;

// ─── Animation frame counts ──────────────────────────────────────────────────
// All expressed in frames at 60fps. Converted to ms by the renderer if needed.
export const PULSE_FRAMES = 8;
export const SCORE_POP_FRAMES = 18;
export const MILESTONE_POP_FRAMES = 40;
export const MILESTONE_POP_FRAMES_TIER_BOUNDARY = 90;
export const CLOSE_RING_FRAMES = 12;
export const DEATH_FLASH_FRAMES = 20;
export const DEATH_FREEZE_FRAMES = 20;
export const SURVIVAL_PULSE_FRAMES = 20;
export const CLEAR_FLASH_FRAMES = 20;

// ─── Idle bob ────────────────────────────────────────────────────────────────
// The idle bob is constrained to a safe zone between the text block (ends ~y=320)
// and thumb circles (visH * 0.72). Amplitude capped so full swing stays in range.
export const IDLE_SAFE_TOP = 330;
export const IDLE_SAFE_BOTTOM_FACTOR = 0.72;
export const IDLE_SAFE_BOTTOM_OFFSET = 80;
export const IDLE_AMPLITUDE_MAX = 55;
export const IDLE_PERIOD_MS = 900;
export const IDLE_RIGHT_PHASE_OFFSET = 1.8;

// ─── Visual: lane intensity per tier ─────────────────────────────────────────
// Lane background alpha steps through these values as the player progresses.
// Pushed higher than the prototype's original sequence so tier advancement is
// visible against the dark background.
export const LANE_ALPHA_BY_TIER = [0x08, 0x10, 0x16, 0x1e, 0x26, 0x2e, 0x36, 0x3e] as const;

// ─── Audio: pitch ladder ─────────────────────────────────────────────────────
// Score blip frequency: 500Hz at Tier 1 → 780Hz at Tier 8. Duration tightens at Tier 7+.
export const BLIP_FREQ_BASE = 500;
export const BLIP_FREQ_STEP_PER_TIER = 40;
export const BLIP_DURATION_S = 0.08;
export const BLIP_DURATION_S_TIGHT = 0.06;

// Every-5 chime (two notes) and tier-boundary chord (three notes).
export const CHIME_FREQS_EVERY_FIVE = [880, 1320] as const;
export const CHIME_FREQS_TIER_BOUNDARY = [660, 880, 1320] as const;

// Tap blip pitches.
export const TAP_FREQ_L = 380;
export const TAP_FREQ_R = 520;
export const TAP_FREQ_START = 440;
export const TAP_FREQ_PAUSE = 330;
export const TAP_DURATION_S = 0.04;
export const TAP_DURATION_S_START = 0.05;

// Close-call chime and death sound.
export const CLOSE_CALL_FREQ = 1100;
export const CLOSE_CALL_DURATION_S = 0.05;
export const DEATH_FREQ_HIGH = 240;
export const DEATH_FREQ_LOW = 160;
export const DEATH_DURATION_HIGH_S = 0.15;
export const DEATH_DURATION_LOW_S = 0.25;

// ─── Haptics durations (milliseconds) ────────────────────────────────────────
export const HAPTIC_TAP_MS = 8;
export const HAPTIC_START_MS = 10;
export const HAPTIC_MILESTONE_PATTERN = [15, 40, 15] as const;
export const HAPTIC_DEATH_PATTERN = [30, 40, 60] as const;
