/**
 * roomCleanup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages two deferred room-deletion timers:
 *
 *  Post-game  — after game_over is emitted, wait POST_GAME_MS (5 min) for a
 *               "Play Again" restart_game.  If none arrives, delete the room.
 *               Applies to ALL room types (solo, public, private).
 *
 *  Idle       — after a waiting room is created (no game yet), wait IDLE_MS
 *               (5 min).  If no game has started by then, delete the room.
 *               Applies to public and private rooms (solo starts immediately).
 *
 * Imported by both game.js and lobby.js — no circular dependencies.
 */

const timerService = require("./timerService");
const botService   = require("./botService");
const roomManager  = require("../utils/roomManager");

const POST_GAME_MS = 5 * 60 * 1000;  // 5 minutes after game_over
const IDLE_MS      = 5 * 60 * 1000;  // 5 minutes for idle waiting rooms

const pendingPostGame = {};  // roomId → timer handle
const pendingIdle     = {};  // roomId → timer handle

// ── shared teardown ───────────────────────────────────────────────────────────
async function _deleteRoom(io, roomId, reason) {
  timerService.clearTimer(roomId);
  botService.clearSubmissionTimers(roomId);
  botService.removeRoom(roomId);
  // Notify connected clients BEFORE the Redis key is gone
  io.to(roomId).emit("game_reset");
  io.to(roomId).emit("room_deleted", { reason: reason });
  await roomManager.deleteRoom(roomId);
  console.log(`Room ${roomId} auto-deleted: ${reason}`);
}

// ── post-game timer ───────────────────────────────────────────────────────────
function schedulePostGameDelete(io, roomId) {
  cancelPostGameDelete(roomId);
  pendingPostGame[roomId] = setTimeout(async function() {
    delete pendingPostGame[roomId];
    await _deleteRoom(io, roomId, "no_restart_after_game_over");
  }, POST_GAME_MS);
  console.log(`Post-game delete scheduled for room ${roomId} (5 min)`);
}

function cancelPostGameDelete(roomId) {
  if (pendingPostGame[roomId]) {
    clearTimeout(pendingPostGame[roomId]);
    delete pendingPostGame[roomId];
  }
}

// ── idle timer ────────────────────────────────────────────────────────────────
function scheduleIdleDelete(io, roomId) {
  cancelIdleDelete(roomId);
  pendingIdle[roomId] = setTimeout(async function() {
    delete pendingIdle[roomId];
    // Guard: skip if a game already started while we were waiting
    const room = await roomManager.getRoomById(roomId);
    if (!room || room.game) return;
    await _deleteRoom(io, roomId, "idle_no_game_started");
  }, IDLE_MS);
  console.log(`Idle delete scheduled for room ${roomId} (5 min)`);
}

function cancelIdleDelete(roomId) {
  if (pendingIdle[roomId]) {
    clearTimeout(pendingIdle[roomId]);
    delete pendingIdle[roomId];
  }
}

module.exports = {
  schedulePostGameDelete,
  cancelPostGameDelete,
  scheduleIdleDelete,
  cancelIdleDelete,
};
