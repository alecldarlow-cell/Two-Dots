/**
 * GameOverlay — draws the in-game elements (dots, divider, pipes) on top of
 * the WorldRenderer so we can verify legibility in every time-of-day state.
 *
 * Mirrors what GameCanvas.tsx does in the production app, simplified for
 * design preview:
 *   - Dual-glow divider (orange L / cyan R)
 *   - Two dots with optional treatment (plain / glow / ring / trail)
 *   - One demo pipe at fixed position so we can see contrast
 */

const PIPE_WALL = '#10355c';
const PIPE_EDGE = '#7ac0e8';

// Three named palette options for the dots. The world ships ONE chosen pair;
// these are here so we can evaluate live in the design tool.
const DOT_PALETTES = {
  canon:    { L: '#FF5E35', R: '#2ECFFF', label: 'Canon (production)' },
  softened: { L: '#FF7A5C', R: '#5AD2FF', label: 'Softened — coral & soft cyan' },
  warmCool: { L: '#FFB13B', R: '#7FE5E8', label: 'Warm/cool — amber & ice' },
  worldTinted: { L: null, R: null, label: 'World-tinted (uses theme.palette.dotL/R)' },
};

function GameOverlay({ w, gameH, dotTreatment, dotPalette, theme, showPipes, showDivider, showDots, dotYOffset, t }) {
  let COL_L, COL_R;
  if (dotPalette === 'worldTinted') {
    COL_L = theme.palette.dotL;
    COL_R = theme.palette.dotR;
  } else {
    const p = DOT_PALETTES[dotPalette] || DOT_PALETTES.canon;
    COL_L = p.L;
    COL_R = p.R;
  }
  // Dot positions — left lane / right lane, centred-ish on the regolith plain
  const dotY = gameH * (0.74 + dotYOffset);
  const dotR = 11;
  const laneL = w * 0.28;
  const laneR = w * 0.72;

  // Pipe demo — single pipe with a gap centred at dotY
  const pipeX = w * 0.5;
  const pipeW = 92;
  const gapH = 180;
  const gapY = dotY;

  return (
    <svg
      width={w}
      height={gameH}
      viewBox={`0 0 ${w} ${gameH}`}
      style={{ display: 'block', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="divL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={COL_L} stopOpacity="0" />
          <stop offset="100%" stopColor={COL_L} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="divR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={COL_R} stopOpacity="0.55" />
          <stop offset="100%" stopColor={COL_R} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="dotLglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={COL_L} stopOpacity="0.7" />
          <stop offset="100%" stopColor={COL_L} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dotRglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={COL_R} stopOpacity="0.7" />
          <stop offset="100%" stopColor={COL_R} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Divider glow removed per design review (Moon point 1 / Earth point 1).
          The toggle in the tweaks panel is still present but is now a no-op. */}

      {/* Demo pipes (left half + right half with gap at dot height) */}
      {showPipes && (
        <g>
          {/* top pipe (above gap) */}
          <rect x={pipeX - pipeW / 2} y={0} width={pipeW} height={gapY - gapH / 2} fill={PIPE_WALL} />
          <rect x={pipeX - pipeW / 2} y={gapY - gapH / 2 - 4} width={pipeW} height={4} fill={PIPE_EDGE} />
          {/* bottom pipe (below gap) */}
          <rect x={pipeX - pipeW / 2} y={gapY + gapH / 2} width={pipeW} height={gameH - (gapY + gapH / 2)} fill={PIPE_WALL} />
          <rect x={pipeX - pipeW / 2} y={gapY + gapH / 2} width={pipeW} height={4} fill={PIPE_EDGE} />
        </g>
      )}

      {/* Dots */}
      {showDots && (
        <g>
          {/* L dot */}
          {(dotTreatment === 'glow' || dotTreatment === 'ring' || dotTreatment === 'trail') && (
            <circle cx={laneL} cy={dotY} r={dotR * 3} fill="url(#dotLglow)" />
          )}
          {dotTreatment === 'ring' && (
            <circle cx={laneL} cy={dotY} r={dotR + 4} fill="none" stroke={COL_L} strokeOpacity="0.55" strokeWidth="1.5" />
          )}
          {dotTreatment === 'trail' && (
            <g opacity="0.6">
              <circle cx={laneL - 10} cy={dotY + 3} r={dotR * 0.7} fill={COL_L} opacity="0.35" />
              <circle cx={laneL - 18} cy={dotY + 6} r={dotR * 0.5} fill={COL_L} opacity="0.18" />
            </g>
          )}
          <circle cx={laneL} cy={dotY} r={dotR} fill={COL_L} />

          {/* R dot */}
          {(dotTreatment === 'glow' || dotTreatment === 'ring' || dotTreatment === 'trail') && (
            <circle cx={laneR} cy={dotY} r={dotR * 3} fill="url(#dotRglow)" />
          )}
          {dotTreatment === 'ring' && (
            <circle cx={laneR} cy={dotY} r={dotR + 4} fill="none" stroke={COL_R} strokeOpacity="0.55" strokeWidth="1.5" />
          )}
          {dotTreatment === 'trail' && (
            <g opacity="0.6">
              <circle cx={laneR - 10} cy={dotY + 3} r={dotR * 0.7} fill={COL_R} opacity="0.35" />
              <circle cx={laneR - 18} cy={dotY + 6} r={dotR * 0.5} fill={COL_R} opacity="0.18" />
            </g>
          )}
          <circle cx={laneR} cy={dotY} r={dotR} fill={COL_R} />
        </g>
      )}
    </svg>
  );
}

window.GameOverlay = GameOverlay;
window.DOT_PALETTES = DOT_PALETTES;
