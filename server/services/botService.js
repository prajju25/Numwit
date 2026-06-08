/**
 * botService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages bot players for tutorial / solo-practice rooms.
 *
 * How it works:
 *   1. When a tutorial room is created, call addBots(room, count).
 *   2. The bots are stored in `bots` map — fake user objects with bot socketIds.
 *   3. When the server calls getBotSubmission(roomId, botSocketId, round),
 *      the bot picks a random number (weighted toward the middle, 30-70).
 *   4. Bots respond with a delay of 1-4 seconds to feel human.
 *
 * The game.js send_number handler does NOT need to change — bots submit
 * via the normal game.numbers path, triggered by scheduleBot().
 */

var BOT_NAMES = ["Bot Alice", "Bot Bob", "Bot Carol", "Bot Dave"];
var BOT_AVATARS = ["🤖", "👾", "🦾", "🧬"];

// Map<roomId, [{socketId, name, avatar, isBot:true}]>
var botsByRoom = new Map();

// Pending bot timeouts: Map<roomId, [timeoutId]>
var botTimers = new Map();

/**
 * Generate a stable fake socketId for a bot.
 */
function botId(roomId, index) {
  return "bot-" + roomId + "-" + index;
}

/**
 * Create N bot user objects and record them for the room.
 * Returns the bot user objects (caller adds them to room.users).
 */
function addBots(roomId, count) {
  var bots = [];
  for (var i = 0; i < count; i++) {
    bots.push({
      socketId: botId(roomId, i),
      name: BOT_NAMES[i % BOT_NAMES.length],
      avatar: BOT_AVATARS[i % BOT_AVATARS.length],
      isBot: true,
    });
  }
  botsByRoom.set(roomId, bots);
  return bots;
}

/**
 * Get all bot socket IDs for a room.
 */
function getBotIds(roomId) {
  var bots = botsByRoom.get(roomId) || [];
  return bots.map(function(b) { return b.socketId; });
}

/**
 * Get a bot's random submission number (weighted 30-70, slightly realistic).
 */
function getBotNumber() {
  // 70% chance: pick in 30-70 range, 30% chance: pick anywhere 0-100
  if (Math.random() < 0.7) {
    return Math.round(30 + Math.random() * 40);
  }
  return Math.round(Math.random() * 100);
}

/**
 * Schedule all bots in a room to submit within 1-4 seconds.
 * onSubmit(botSocketId, number) is called for each bot when ready.
 */
function scheduleBots(roomId, onSubmit) {
  clearBotTimers(roomId);
  var bots = botsByRoom.get(roomId) || [];
  var timers = [];
  bots.forEach(function(bot) {
    var delay = 1000 + Math.random() * 3000; // 1-4 s
    var t = setTimeout(function() {
      onSubmit(bot.socketId, getBotNumber());
    }, delay);
    timers.push(t);
  });
  botTimers.set(roomId, timers);
}

/**
 * Cancel all pending bot submission timers for a room.
 */
function clearBotTimers(roomId) {
  var timers = botTimers.get(roomId) || [];
  timers.forEach(function(t) { clearTimeout(t); });
  botTimers.delete(roomId);
}

/**
 * Remove all bot state for a room (call when room is deleted).
 */
function removeRoom(roomId) {
  clearBotTimers(roomId);
  botsByRoom.delete(roomId);
}

/**
 * Check if a socketId belongs to a bot.
 */
function isBot(socketId) {
  return socketId.startsWith("bot-");
}

module.exports = { addBots, getBotIds, scheduleBots, clearBotTimers, removeRoom, isBot };
