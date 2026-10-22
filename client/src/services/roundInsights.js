/**
 * roundInsights.js
 * Plain-language explanations built from a round's real numbers, so new
 * players see *why* the target landed where it did.
 */

const fmt = (n) => (Math.round(n * 10) / 10).toString();

/** True when a round has an average + target to explain (not a duel-cycle win). */
export function canExplain(result) {
  return !!result
    && typeof result.average === "number"
    && typeof result.target === "number"
    && !result.twoPlayerCycle;
}

/**
 * Explainer for the first round's result.
 * Returns { title, steps: [string, string] } or null.
 */
export function explainFirstRound(result) {
  if (!canExplain(result)) return null;
  const { average: avg, target: tgt } = result;
  const mult = avg > 0 ? tgt / avg : 0.8;
  const pct = Math.round(mult * 100);
  const next = Math.round(tgt * mult);
  return {
    title: `Why was the target ${fmt(tgt)}?`,
    steps: [
      `Everyone's picks averaged ${fmt(avg)}. The target is always ${pct}% of the average: ${fmt(avg)} × ${fmt(mult)} = ${fmt(tgt)}.`,
      `Most people start near 50, so the winner is whoever guesses a bit lower than the crowd. Next round everyone aims near ${fmt(tgt)} — think one step further: about ${next}.`,
    ],
  };
}

/**
 * Tip for the next pick, from the previous round's result and the game's
 * multiplier. Returns a sentence, or null when there's nothing to go on.
 */
export function nextRoundTip(prevResult, multiplier) {
  if (!canExplain(prevResult)) return null;
  const mult = typeof multiplier === "number" && multiplier > 0 ? multiplier : 0.8;
  const tgt = prevResult.target;
  const aim = Math.round(tgt); // multiply the number we show, so the sum reads right
  return `Last round's target was ${fmt(tgt)}. Everyone saw it — if they all aim near ${aim}, `
    + `the new target lands near ${fmt(mult)} × ${aim} ≈ ${Math.round(aim * mult)}. Stay one step ahead of the crowd.`;
}

// ── "Show the explainer for a player's first few games" ───────────────────────
const SEEN_KEY = "numwit_explainer_games";
export const EXPLAINER_GAMES = 3;

export function explainerGamesSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return EXPLAINER_GAMES; // storage blocked — don't nag every game
  }
}

export function markExplainerSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(explainerGamesSeen() + 1));
  } catch {
    // not critical
  }
}
