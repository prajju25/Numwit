/**
 * timerService.js
 * Per-room countdown timers. In-memory for Phase 1 (acceptable up to ~1000 rooms).
 * Phase 4 migration: replace with BullMQ Redis-backed job queue.
 *
 * Interface contract (stable across migrations):
 *   startTimer(io, roomId, room, duration, onExpire)
 *   clearTimer(roomId)
 *   getTimeLeft(roomId) → seconds remaining or null
 */

// Map<roomId, { timerId, tickId, startedAt, duration, round }>
const timers = new Map();

const TICK_INTERVAL_MS = 10000; // broadcast timer_tick every 10s for drift correction

/**
 * Start a round timer. Calls onExpire(io, roomId) when it fires.
 * Clears any existing timer for the room first.
 */
function startTimer(io, roomId, room, durationSeconds, onExpire) {
  clearTimer(roomId);

  const round = room.game ? room.game.round : 0;
  const ms = durationSeconds * 1000;
  const startedAt = Date.now();

  // Main expiry timeout
  const timerId = setTimeout(function() {
    clearTick(roomId);
    timers.delete(roomId);
    io.to(roomId).emit("timer_expired", { roomId, round });
    onExpire(io, roomId);
  }, ms);

  // Tick interval for drift correction (every 10s)
  const tickId = setInterval(function() {
    const entry = timers.get(roomId);
    if (!entry) return;
    const elapsed = (Date.now() - entry.startedAt) / 1000;
    const secondsLeft = Math.max(0, Math.round(entry.duration - elapsed));
    io.to(roomId).emit("timer_tick", { roomId, round, secondsLeft });
  }, TICK_INTERVAL_MS);

  timers.set(roomId, {
    timerId,
    tickId,
    startedAt,
    duration: durationSeconds,
    round,
  });

  console.debug('timerService: started ' + durationSeconds + 's timer for room ' + roomId + ' round ' + round);
}

function clearTick(roomId) {
  const entry = timers.get(roomId);
  if (entry && entry.tickId) clearInterval(entry.tickId);
}

/**
 * Cancel a room's active timer (e.g. all players submitted before expiry).
 */
function clearTimer(roomId) {
  const entry = timers.get(roomId);
  if (entry) {
    clearTimeout(entry.timerId);
    clearInterval(entry.tickId);
    timers.delete(roomId);
    console.debug('timerService: cleared timer for room ' + roomId);
  }
}

/**
 * Returns seconds remaining for the room's active timer, or null if no timer.
 * Used by reconnecting clients to sync their local countdown.
 */
function getTimeLeft(roomId) {
  const entry = timers.get(roomId);
  if (!entry) return null;
  const elapsed = (Date.now() - entry.startedAt) / 1000;
  return Math.max(0, Math.round(entry.duration - elapsed));
}

module.exports = { startTimer, clearTimer, getTimeLeft };
