/**
 * db/roundLogService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Anonymous per-round logging for behaviour analysis (see RoundLog in
 * prisma/schema.prisma). Only human picks are recorded, with no identity
 * attached — an opaque per-game id groups rounds of one game.
 */

const { v4: uuidv4 } = require("uuid");
const { db } = require("./prismaClient");

/**
 * Build a RoundLog row from a resolved (or void) round. Returns null when no
 * human submitted a pick — an all-bot round tells us nothing about people.
 *
 * Assigns game.logId on first use; the caller persists the game afterwards
 * (resolveRound saves the room), so later rounds share the id.
 */
function buildRoundLog(room, game, activePlayers, result) {
  const isBot = {};
  activePlayers.forEach(function(u) { isBot[u.socketId] = !!u.isBot; });

  const humanPicks = (result.submissions || [])
    .filter(function(s) { return !isBot[s.socketId] && typeof s.number === "number"; })
    .map(function(s) { return s.number; });
  if (humanPicks.length === 0) return null;

  if (!game.logId) game.logId = uuidv4();

  const humanCount = activePlayers.filter(function(u) { return !u.isBot; }).length;
  const winnerIds = result.winnerIds || [];
  const multiplier = game.settings && game.settings.targetMultiplier != null
    ? game.settings.targetMultiplier : 0.8;

  return {
    gameId:           game.logId,
    round:            result.round != null ? result.round : game.round,
    roomType:         room.type || "public",
    playerCount:      activePlayers.length,
    humanCount:       humanCount,
    humanPicks:       humanPicks,
    invalidCount:     (result.invalidSubmissions || []).length,
    average:          typeof result.average === "number" ? result.average : null,
    target:           typeof result.target === "number" ? result.target : null,
    targetMultiplier: multiplier,
    isVoid:           !!result.roundVoid,
    exactMatch:       !!result.exactMatch,
    isDuel:           activePlayers.length === 2,
    humanWon:         winnerIds.some(function(id) { return isBot[id] === false; }),
  };
}

/** Persist one row. No-ops (resolves null) when the database is unavailable. */
async function logRound(entry) {
  if (!entry) return null;
  return db(function(p) { return p.roundLog.create({ data: entry }); });
}

module.exports = { buildRoundLog, logRound };
