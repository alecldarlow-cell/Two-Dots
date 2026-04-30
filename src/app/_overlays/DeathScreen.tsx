/**
 * DeathScreen — minimalist end-of-run overlay. Gated by
 * deathCountFrames <= scoreCountFrames in the parent (see showDeathOverlay).
 *
 * v0.3-worlds redesign — eyebrow + hero + footer pattern:
 *   1. World eyebrow on top — small all-caps "MOON" / "EARTH" / "JUPITER".
 *      Always visible (no countDone gate); names the context immediately.
 *   2. Big gold score — count-up animated, dead-centre, the hero.
 *   3. BEST footer — same typographic weight as the world eyebrow,
 *      parallel labels framing the score. Fades in after count-up.
 *
 * Hierarchy: eyebrow and footer share an identical type system (small
 * caps, low opacity, wide letter-spacing) so they read as a pair of
 * supporting labels. The score is the only large / saturated element on
 * screen — uncontested visual hero.
 *
 * Dropped vs prototype/Stage 2.2:
 *   - Orange/cyan offset shadows on the score (retro-arcade leftover).
 *   - Tier + gate info ("<tier> · gate N of 5").
 *   - Pulsing tap-to-retry pill in the killed dot's colour (tap-to-retry
 *     is implicit — the GameScreen touch surface catches taps in any phase).
 *
 * Layout stability: footer Text is rendered from frame 1 with opacity 0
 * until countDone, rather than conditionally mounted. Keeps the score at
 * its final flex-centred position throughout the count-up animation.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { GOLD, sx } from '../_shared/constants';
import type { DisplaySnapshot } from '../_shared/snapshot';
import { styles } from '../_shared/styles';
import { planetForScore } from '../_hooks/useCurrentPlanet';

export interface DeathScreenProps {
  display: DisplaySnapshot;
  /** True once the score count-up animation has completed. Gates the
   *  BEST footer opacity so it fades in as a clean reveal after the
   *  number lands. The world eyebrow is not gated — context is visible
   *  immediately. */
  countDone: boolean;
  /** True if this run beat the previous personal best — drives the
   *  "★ NEW BEST ★" celebration vs the standard "BEST N" line. */
  wasNewBest: boolean;
  /** Persisted personal-best score across runs. Shown in "BEST N" form
   *  when this run didn't beat the previous best. */
  bestScore: number;
}

// Shared label typography for eyebrow + footer. Parallel weight makes
// them read as a label pair framing the score.
const labelStyle = {
  fontFamily: 'Fraunces-Bold' as const,
  fontSize: sx(14),
  color: '#e8d4c8',
  letterSpacing: 4,
} as const;

export function DeathScreen({
  display,
  countDone,
  wasNewBest,
  bestScore,
}: DeathScreenProps): React.ReactElement {
  const worldId = planetForScore(display.score);
  // BEST footer reveal — gated on countDone and score>0 (no comparison
  // meaningful at score=0). Rendered from frame 1 with opacity 0 so the
  // score's centred position doesn't shift on reveal.
  const footerOpacity =
    countDone && display.score > 0 ? (wasNewBest ? 0.9 : 0.6) : 0;

  return (
    <View
      style={[
        styles.overlay,
        {
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {/* World eyebrow — small all-caps label, always visible. */}
      <Text style={[labelStyle, { opacity: 0.6 }]}>{worldId.toUpperCase()}</Text>

      {/* Big gold score — count-up animated. The hero. */}
      <Text style={[styles.deathScoreBig, { color: GOLD }]}>{display.scoreDisplay}</Text>

      {/* BEST footer — parallel weight to the eyebrow above. */}
      <Text style={[labelStyle, { opacity: footerOpacity, marginTop: sx(8) }]}>
        {wasNewBest ? '★ NEW BEST ★' : `BEST ${bestScore}`}
      </Text>
    </View>
  );
}
