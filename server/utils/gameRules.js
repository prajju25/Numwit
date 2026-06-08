/**
 * gameRules.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for ALL 80-Percentile game rules.
 * To change any rule, edit RULES or the pure functions below.
 * gameManager.js calls these functions — it never contains rule logic itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Tuneable config ────────────────────────────────────────────────────────────
var RULES = {
  TARGET_MULTIPLIER: 0.8,          // target = average * TARGET_MULTIPLIER
  MIN_NUMBER: 0,
  MAX_NUMBER: 100,
  NORMAL_PENALTY: 1,               // penalty points for non-winners per round
  EXACT_MATCH_PENALTY: 2,          // penalty when winner hits target exactly
  ELIMINATION_THRESHOLD: 5,        // points at which a player is eliminated

  // Duplicate rule: only active when >= this many players remain
  DUPLICATE_RULE_MIN_PLAYERS: 3,

  // 2-player special cycle: key BEATS value
  // 100 beats 0, 0 beats 1, 1 beats 100
  TWO_PLAYER_CYCLE: { 100: 0, 0: 1, 1: 100 },
};

// ── Rule 1: Duplicate filtering ───────────────────────────────────────────────
/**
 * When 3+ players remain, any number submitted by 2+ players is INVALID.
 * Returns { valid, invalid } where each is [{socketId, number}].
 * When < 3 players, all submissions are valid (no duplicate rule).
 */
function applyDuplicateRule(submissions, activePlayerCount) {
  if (activePlayerCount < RULES.DUPLICATE_RULE_MIN_PLAYERS) {
    return { valid: submissions.slice(), invalid: [] };
  }

  // Count how many times each number was submitted
  var freq = {};
  submissions.forEach(function(s) {
    freq[s.number] = (freq[s.number] || 0) + 1;
  });

  var valid = [];
  var invalid = [];
  submissions.forEach(function(s) {
    if (freq[s.number] === 1) {
      valid.push(s);
    } else {
      invalid.push(s);
    }
  });

  return { valid: valid, invalid: invalid };
}

// ── Rule 2: Round void detection ──────────────────────────────────────────────
/**
 * A round is VOID (replay, no points) when:
 *   (a) All players submitted the same number (special case of b)
 *   (b) No valid (unique) submissions remain after duplicate filtering
 *   (c) 2-player same number → tie → void
 * Returns { isVoid, reason } where reason is a human-readable string.
 */
function isRoundVoid(validSubmissions, allSubmissions, activePlayerCount) {
  // 2-player tie: both picked same number
  if (activePlayerCount === 2 &&
      allSubmissions.length === 2 &&
      allSubmissions[0].number === allSubmissions[1].number) {
    return { isVoid: true, reason: "Both players chose the same number — round replayed." };
  }

  // No valid submissions remain (all were duplicates)
  if (validSubmissions.length === 0) {
    return { isVoid: true, reason: "All numbers were duplicated — round replayed." };
  }

  return { isVoid: false, reason: null };
}

// ── Rule 3: 2-player cycle ────────────────────────────────────────────────────
/**
 * Rock-paper-scissors style cycle for exactly 2 players.
 * Only fires when both players picked numbers that are part of the cycle {0, 1, 100}
 * AND the pair forms a valid cycle match.
 * Returns winning socketId, or null if cycle doesn't apply (fall through to normal).
 */
function applyTwoPlayerCycle(submissions) {
  if (submissions.length !== 2) return null;

  var n0 = submissions[0].number;
  var n1 = submissions[1].number;
  var cycleNumbers = Object.keys(RULES.TWO_PLAYER_CYCLE).map(Number);

  // Both must be in the cycle set
  if (cycleNumbers.indexOf(n0) === -1 || cycleNumbers.indexOf(n1) === -1) return null;

  // Check if n0 beats n1
  if (RULES.TWO_PLAYER_CYCLE[n0] === n1) return submissions[0].socketId;
  // Check if n1 beats n0
  if (RULES.TWO_PLAYER_CYCLE[n1] === n0) return submissions[1].socketId;

  // Both in cycle set but neither beats the other (e.g. 100 vs 100 — handled as void earlier)
  return null;
}

// ── Rule 4: Find winners ──────────────────────────────────────────────────────
/**
 * Finds all players closest to target (multiple co-winners allowed).
 * Returns array of socketIds. All co-winners get 0 penalty points.
 * Input: validSubmissions [{socketId, number}], target (number).
 */
function findWinners(validSubmissions, target) {
  if (validSubmissions.length === 0) return [];

  var minDiff = Infinity;
  validSubmissions.forEach(function(s) {
    var diff = Math.abs(s.number - target);
    if (diff < minDiff) minDiff = diff;
  });

  return validSubmissions
    .filter(function(s) { return Math.abs(s.number - target) === minDiff; })
    .map(function(s) { return s.socketId; });
}

// ── Rule 5: Exact match detection ─────────────────────────────────────────────
/**
 * Returns true if any WINNER hit the target exactly.
 * (Exact match only meaningful when the winner's number == target.)
 * Uses a small epsilon for floating-point safety.
 */
function hasExactMatch(validSubmissions, target, winnerIds) {
  var EPSILON = 0.0001;
  return validSubmissions.some(function(s) {
    return winnerIds.indexOf(s.socketId) !== -1 &&
           Math.abs(s.number - target) < EPSILON;
  });
}

// ── Rule 6: Compute penalties ─────────────────────────────────────────────────
/**
 * Awards penalty points to all non-winners.
 * If exactMatch: non-winners get EXACT_MATCH_PENALTY (+2), else NORMAL_PENALTY (+1).
 * Returns { updatedPoints, newlyEliminated }.
 *
 * allPlayerIds: all active player socketIds (includes winners AND losers)
 * winnerIds:    socketIds of co-winners (get 0 points)
 * exactMatch:   boolean
 * currentPoints: { socketId: points } — existing cumulative points
 * eliminatedPlayers: [socketId] — already eliminated (skip)
 */
// eliminationThreshold: optional override (default: RULES.ELIMINATION_THRESHOLD)
function computePenalties(allPlayerIds, winnerIds, exactMatch, currentPoints, eliminatedPlayers, eliminationThreshold) {
  var threshold = (eliminationThreshold != null) ? eliminationThreshold : RULES.ELIMINATION_THRESHOLD;
  var penalty = exactMatch ? RULES.EXACT_MATCH_PENALTY : RULES.NORMAL_PENALTY;
  var updatedPoints = Object.assign({}, currentPoints);

  allPlayerIds.forEach(function(id) {
    if (eliminatedPlayers.indexOf(id) !== -1) return; // skip already eliminated
    if (winnerIds.indexOf(id) !== -1) return;          // skip winners
    updatedPoints[id] = (updatedPoints[id] || 0) + penalty;
  });

  var newlyEliminated = [];
  var newEliminatedList = eliminatedPlayers.slice();
  allPlayerIds.forEach(function(id) {
    if (newEliminatedList.indexOf(id) !== -1) return;
    if ((updatedPoints[id] || 0) >= threshold) {
      newlyEliminated.push(id);
      newEliminatedList.push(id);
    }
  });

  return {
    updatedPoints: updatedPoints,
    newlyEliminated: newlyEliminated,
    eliminatedPlayers: newEliminatedList,
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────
module.exports = {
  RULES: RULES,
  applyDuplicateRule: applyDuplicateRule,
  isRoundVoid: isRoundVoid,
  applyTwoPlayerCycle: applyTwoPlayerCycle,
  findWinners: findWinners,
  hasExactMatch: hasExactMatch,
  computePenalties: computePenalties,
};
