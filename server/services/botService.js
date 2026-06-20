/**
 * botService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages bot players used to fill rooms that don't have enough real players.
 * See BOT_FILL_FEATURE_DESIGN.md for the full design.
 *
 * Responsibilities:
 *   1. scheduleBotFill(roomId, delayMs, onFire) — one-shot timer for public-room
 *      auto-fill.
 *   2. fillRoomWithBots(room, targetCount)      — mutate room.users with bot
 *      entries up to targetCount.
 *   3. scheduleBotSubmissions(roomId, game, submitFn) — make bots "play" each
 *      round by calling the shared submitNumber() used for real players.
 *   4. isBot(socketId) / hasOnlyBots(room)      — helpers used by lobby/game
 *      handlers.
 *   5. removeRoom(roomId)                       — clear all timers for a room.
 *
 * Bots are plain user objects pushed into room.users:
 *   { socketId: "bot-<roomId>-<n>", name, avatar, isBot: true }
 * They have no deviceId, so persistGameOver / statsService / achievementService
 * (which all gate on `if (!deviceId) continue`) automatically ignore them —
 * no DB schema changes needed.
 */

const constants = require("../constants/constants");
const BOT_NAMES = constants.BOT_NAMES;
const BOT_AVATARS = constants.BOT_AVATARS;

// Pending one-shot "fill this room with bots" timers: Map<roomId, timeoutId>
const fillTimers = new Map();

// Pending per-round bot submission timers: Map<roomId, [timeoutId]>
const submissionTimers = new Map();

/**
 * Generate a stable fake socketId for a bot.
 */
function botId(roomId, index) {
  return `bot-${roomId}-${index}`;
}

/**
 * Check if a socketId belongs to a bot.
 */
function isBot(socketId) {
  return typeof socketId === "string" && socketId.indexOf("bot-") === 0;
}

/**
 * Returns true if the room currently contains only bots (no real users left).
 * Used to decide whether a room should be torn down once its last human leaves.
 */
function hasOnlyBots(room) {
  if (!room || !room.users || room.users.length === 0) return false;
  return room.users.every(function(u) { return isBot(u.socketId); });
}

/**
 * Add bot users to room.users until it reaches targetCount.
 * Mutates room.users in place and returns the bot objects that were added.
 * Existing bot indices are skipped so a second fill doesn't collide socketIds.
 */
function fillRoomWithBots(room, targetCount) {
  const existingBotCount = room.users.filter(function(u) { return isBot(u.socketId); }).length;
  const added = [];
  let index = existingBotCount;

  while (room.users.length < targetCount) {
    const bot = {
      socketId: botId(room.id, index),
      name: BOT_NAMES[index % BOT_NAMES.length],
      avatar: BOT_AVATARS[index % BOT_AVATARS.length],
      isBot: true,
    };
    room.users.push(bot);
    added.push(bot);
    index++;
  }

  return added;
}

/**
 * Schedule a one-shot "should we fill this room with bots?" check, fired after
 * delayMs. onFire(roomId) must re-read the room from Redis — state may have
 * changed (e.g. real players joined, game already started, room deleted).
 */
function scheduleBotFill(roomId, delayMs, onFire) {
  clearFillTimer(roomId);
  const t = setTimeout(function() {
    fillTimers.delete(roomId);
    onFire(roomId);
  }, delayMs);
  fillTimers.set(roomId, t);
}

/**
 * Cancel a pending bot-fill timer (e.g. room was deleted, or filled manually).
 */
function clearFillTimer(roomId) {
  const t = fillTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    fillTimers.delete(roomId);
  }
}

/**
 * Pick a bot's submission for the current round.
 * Round 1 (no previous target yet): weighted toward 30-70, same as the old
 * tutorial-bot heuristic. Round 2+: biased around the previous round's target
 * with a +/-15 spread, clamped to 0-100 — approximates "trying to guess the
 * target" the way TECHNICAL_IMPLEMENTATION_PLAN.md described for tutorial bots.
 */
function getBotNumber(game) {
  const target = game && typeof game.target === "number" ? game.target : null;
  if (target === null) {
    if (Math.random() < 0.7) return Math.round(30 + Math.random() * 40);
    return Math.round(Math.random() * 100);
  }
  const spread = 15;
  const n = target + (Math.random() * spread * 2 - spread);
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Schedule every active bot in game.turnOrder (not eliminated, hasn't submitted
 * yet) to call submitFn(botSocketId, number) after a random 1-4s delay —
 * mirrors a human reading the board and picking a number. submitFn is expected
 * to be game.js's shared submitNumber(), so bots go through identical
 * validation / round-resolution logic as real players.
 */
function scheduleBotSubmissions(roomId, game, submitFn) {
  clearSubmissionTimers(roomId);
  if (!game || !game.turnOrder) return;

  const timers = [];
  game.turnOrder.forEach(function(socketId) {
    if (!isBot(socketId)) return;
    if ((game.eliminatedPlayers || []).indexOf(socketId) !== -1) return;
    if (game.numbers?.[socketId] !== undefined) return;

    const delay = 1000 + Math.random() * 3000; // 1-4s
    const t = setTimeout(function() {
      submitFn(socketId, getBotNumber(game));
    }, delay);
    timers.push(t);
  });
  submissionTimers.set(roomId, timers);
}

/**
 * Cancel all pending bot submission timers for a room (e.g. round resolved
 * early because every human already submitted, or the game was reset).
 */
function clearSubmissionTimers(roomId) {
  const timers = submissionTimers.get(roomId) || [];
  timers.forEach(function(t) { clearTimeout(t); });
  submissionTimers.delete(roomId);
}

/**
 * Full cleanup for a room — call when a room is deleted / game ends for good.
 */
function removeRoom(roomId) {
  clearFillTimer(roomId);
  clearSubmissionTimers(roomId);
}

module.exports = {
  isBot: isBot,
  hasOnlyBots: hasOnlyBots,
  fillRoomWithBots: fillRoomWithBots,
  scheduleBotFill: scheduleBotFill,
  clearFillTimer: clearFillTimer,
  getBotNumber: getBotNumber,
  scheduleBotSubmissions: scheduleBotSubmissions,
  clearSubmissionTimers: clearSubmissionTimers,
  removeRoom: removeRoom,
};
