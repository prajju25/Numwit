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

// ── "How many steps did the room think?" ──────────────────────────────────────
// Step 0 assumes everyone picks at random (average 50). Step 1 picks 50 × m,
// step 2 assumes everyone did step 1 and picks 50 × m², and so on.
export const MAX_STEPS = 5;
const RANDOM_AVERAGE = 50;

/** Steps of thinking a pick represents: 0…MAX_STEPS, or MAX_STEPS + 1 for "more". */
export function stepsAhead(n, multiplier) {
  if (n >= RANDOM_AVERAGE) return 0;
  if (n <= 0) return MAX_STEPS + 1;
  const steps = Math.round(Math.log(n / RANDOM_AVERAGE) / Math.log(multiplier));
  return Math.min(Math.max(steps, 0), MAX_STEPS + 1);
}

export function stepsLabel(steps) {
  if (steps > MAX_STEPS) return `${MAX_STEPS}+ steps`;
  return steps === 1 ? "1 step" : `${steps} steps`;
}

/**
 * The thinking levels for a round, and where the room's average sits.
 * Returns { levels: [{ step, value }], room } or null when the round has no
 * usable multiplier (duel-cycle wins, an average of 0).
 */
export function roomDepth(result) {
  if (!canExplain(result) || !(result.average > 0)) return null;
  const mult = result.target / result.average;
  if (!(mult > 0 && mult < 1)) return null;
  const levels = Array.from({ length: MAX_STEPS + 1 }, (_, step) => ({
    step,
    value: RANDOM_AVERAGE * Math.pow(mult, step),
  }));
  return { levels, multiplier: mult, room: stepsAhead(result.average, mult) };
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
