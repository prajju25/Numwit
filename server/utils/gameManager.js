/**
 * gameManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates game state. Does NOT contain rule logic — all rules live in
 * gameRules.js. This file only coordinates the sequence of rule applications.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const constants = require("../constants/constants");
const NUMWIT_GAME_STATUS = constants.NUMWIT_GAME_STATUS;

const rules = require("./gameRules");
const applyDuplicateRule = rules.applyDuplicateRule;
const isRoundVoid = rules.isRoundVoid;
const applyTwoPlayerCycle = rules.applyTwoPlayerCycle;
const findWinners = rules.findWinners;
const hasExactMatch = rules.hasExactMatch;
const computePenalties = rules.computePenalties;

const saveRoom = require("./roomManager").saveRoom;

function shuffleArray(arr) {
  return arr.slice().sort(function() { return Math.random() - 0.5; });
}

// ── Valid setting ranges ───────────────────────────────────────────────────────
const VALID_TIMER_DURATIONS      = [20, 30, 60];
const VALID_ELIM_THRESHOLDS      = [3, 5, 7];
const VALID_TARGET_MULTIPLIERS   = [0.6, 0.8, 0.9];

/**
 * Validate and clamp host-supplied settings. Unknown keys are ignored.
 * Returns a clean settings object safe to persist in Redis.
 */
function sanitizeSettings(raw) {
  if (!raw || typeof raw !== "object") raw = {};

  const timerDuration = VALID_TIMER_DURATIONS.includes(Number(raw.timerDuration))
    ? Number(raw.timerDuration) : 30;

  const eliminationThreshold = VALID_ELIM_THRESHOLDS.includes(Number(raw.eliminationThreshold))
    ? Number(raw.eliminationThreshold) : 5;

  const targetMultiplier = VALID_TARGET_MULTIPLIERS.includes(Number(raw.targetMultiplier))
    ? Number(raw.targetMultiplier) : 0.8;

  const duplicateRuleEnabled = raw.duplicateRuleEnabled === false ? false : true;

  return { timerDuration, eliminationThreshold, targetMultiplier, duplicateRuleEnabled };
}

// ── createGameData ─────────────────────────────────────────────────────────────
// settings: host-configurable options (validated via sanitizeSettings)
async function createGameData(room, settings) {
  if (settings === undefined) settings = {};

  if (!room.game) {
    const socketIds = room.users.map(function(u) { return u.socketId; });
    const cleanSettings = sanitizeSettings(settings);

    const gameData = {
      round: 1,
      numbers: {},
      points: {},
      turnOrder: shuffleArray(socketIds),
      status: NUMWIT_GAME_STATUS.IN_PROGRESS,
      average: null,
      target: null,
      winnerIds: [],         // array — supports multiple co-winners
      winnerSocketId: null,  // kept for backward compat (first winner or null)
      eliminatedPlayers: [],
      submittedCount: 0,
      settings: cleanSettings,
      winHistory: {},          // { [socketId]: number } — incremented each round a player wins
      exactMatchHistory: {},   // { [socketId]: number } — incremented on exact-match wins
      consecWinHistory: {},    // { [socketId]: number } — current consecutive round-win streak
      maxConsecWinHistory: {}, // { [socketId]: number } — max consecutive round-win streak
      wasLastPlaceSet: {},     // { [socketId]: boolean } — was ever the player with most penalties
    };

    socketIds.forEach(function(id) { gameData.points[id] = 0; });
    room.game = gameData;
    await saveRoom(room);
    return gameData;
  }
  return null;
}

// ── evaluateRound ──────────────────────────────────────────────────────────────
/**
 * Full round evaluation pipeline:
 *
 * 1. Collect submissions
 * 2. [2-player] Check cycle rule first
 * 3. [3+ player] Apply duplicate filter → valid / invalid submissions
 * 4. Check round void condition → if void, return { roundVoid: true }
 * 5. Compute average + target from VALID submissions only
 * 6. Find co-winners (all equidistant players)
 * 7. Check exact match (winner hit target exactly)
 * 8. Compute penalties (non-winners get +1 or +2)
 * 9. Check eliminations
 * 10. Return full result
 *
 * Returns either:
 *   { roundVoid: true, reason, submissions }   ← round must be replayed
 *   { roundVoid: false, ...fullResult }         ← normal result
 */
function evaluateRound(game, activePlayers) {
  // Read per-game settings (with defaults)
  const gs = game.settings || {};
  const targetMultiplier    = gs.targetMultiplier    != null ? gs.targetMultiplier    : rules.RULES.TARGET_MULTIPLIER;
  const eliminationThreshold= gs.eliminationThreshold!= null ? gs.eliminationThreshold: null; // null = use RULES default
  const duplicateRuleEnabled= gs.duplicateRuleEnabled!= null ? gs.duplicateRuleEnabled: true;

  // All submissions, including non-submitters (number === undefined)
  const submissions = activePlayers.map(function(u) {
    return { socketId: u.socketId, number: game.numbers[u.socketId] };
  });

  const activePlayerCount = activePlayers.length;
  const allPlayerIds = activePlayers.map(function(u) { return u.socketId; });

  // ── Filter non-submitters ─────────────────────────────────────────────────
  // Players who ran out of time without picking get number=undefined.
  // Exclude them from average/target/winner logic but keep them in allPlayerIds
  // so computePenalties still awards them a penalty point.
  const actualSubmissions = submissions.filter(function(s) {
    return typeof s.number === "number" && !isNaN(s.number);
  });

  // If nobody submitted at all, replay the round
  if (actualSubmissions.length === 0) {
    return {
      roundVoid: true,
      reason: "No submissions — round replayed.",
      submissions: submissions,
      round: game.round,
    };
  }

  // ── Step 2: 2-player cycle rule ──────────────────────────────────────────
  let cycleWinnerId = null;
  if (activePlayerCount === 2 && actualSubmissions.length === 2) {
    cycleWinnerId = applyTwoPlayerCycle(actualSubmissions);
  }

  // ── Step 3: Duplicate filter (3+ players only, unless disabled) ──────────
  // Use only actualSubmissions so non-submitters don't distort duplicate counts
  let filtered;
  if (duplicateRuleEnabled) {
    filtered = applyDuplicateRule(actualSubmissions, activePlayerCount);
  } else {
    filtered = { valid: actualSubmissions.slice(), invalid: [] };
  }
  const validSubmissions = filtered.valid;
  const invalidSubmissions = filtered.invalid;

  // ── Step 4: Round void check ─────────────────────────────────────────────
  const voidCheck = isRoundVoid(validSubmissions, actualSubmissions, activePlayerCount);
  if (voidCheck.isVoid) {
    return {
      roundVoid: true,
      reason: voidCheck.reason,
      submissions: submissions,       // so client can show what was picked
      round: game.round,
    };
  }

  // ── Step 5: Average + target (uses per-game targetMultiplier) ────────────
  // Base is always from actual submitters only — non-submitters don't skew the average
  const computeBase = (cycleWinnerId !== null) ? actualSubmissions : validSubmissions;
  const sum = computeBase.reduce(function(acc, s) { return acc + s.number; }, 0);
  const average = sum / computeBase.length;
  const target = average * targetMultiplier;

  // ── Step 6: Find co-winners ───────────────────────────────────────────────
  let winnerIds;
  if (cycleWinnerId !== null) {
    winnerIds = [cycleWinnerId];
  } else {
    winnerIds = findWinners(validSubmissions, target);
  }

  // ── Step 7: Exact match ───────────────────────────────────────────────────
  let exactMatch = false;
  if (cycleWinnerId === null) {
    exactMatch = hasExactMatch(validSubmissions, target, winnerIds);
  }
  const penaltyResult = computePenalties(
    allPlayerIds,
    winnerIds,
    exactMatch,
    game.points,
    game.eliminatedPlayers,
    eliminationThreshold   // null = use module default
  );

  // ── Build result ──────────────────────────────────────────────────────────
  const twoPlayerCycle = cycleWinnerId !== null;

  // Backward-compat: winnerSocketId = first winner (for UI that expects single winner)
  const winnerSocketId = winnerIds.length > 0 ? winnerIds[0] : null;

  return {
    roundVoid: false,
    round: game.round,
    average: average,
    target: target,
    winnerIds: winnerIds,           // all co-winners
    winnerSocketId: winnerSocketId, // first co-winner (backward compat)
    submissions: submissions,       // ALL submissions (including invalid)
    validSubmissions: validSubmissions,
    invalidSubmissions: invalidSubmissions,
    points: penaltyResult.updatedPoints,
    exactMatch: exactMatch,
    twoPlayerCycle: twoPlayerCycle,
    newlyEliminated: penaltyResult.newlyEliminated,
    updatedGame: {
      average: average,
      target: target,
      winnerIds: winnerIds,
      winnerSocketId: winnerSocketId,
      points: penaltyResult.updatedPoints,
      eliminatedPlayers: penaltyResult.eliminatedPlayers,
      status: NUMWIT_GAME_STATUS.COMPLETED,
    },
  };
}

module.exports = {
  createGameData: createGameData,
  evaluateRound: evaluateRound,
  sanitizeSettings: sanitizeSettings,
};
