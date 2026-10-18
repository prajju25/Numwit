/**
 * roomLock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs async work for one room strictly one-at-a-time.
 *
 * Game handlers read the room from Redis, change it and write it back. Two of
 * those overlapping (a player and a bot submitting within one Redis round-trip)
 * would each save their own copy and the later write would drop the earlier
 * pick — the round then waits for the timer and treats that player as a
 * no-show. Queueing per room prevents it. In-process is enough: Numwit runs as
 * exactly one server instance (see fly.toml).
 *
 * Not re-entrant: never call withRoomLock for a room from inside work that
 * already holds that room's lock — it would wait for itself forever.
 *
 * Slow work is logged (room, label, how long it waited and held the lock), so
 * a stuck room shows up in the logs instead of only as a frozen game.
 */
const SLOW_MS = Number(process.env.ROOM_LOCK_SLOW_MS) || 2000;

const tails = new Map();

function withRoomLock(roomId, fn, label) {
  const queuedAt = Date.now();
  const prev = tails.get(roomId) || Promise.resolve();
  const timed = function() {
    const startedAt = Date.now();
    const finish = function() {
      const waited = startedAt - queuedAt;
      const held = Date.now() - startedAt;
      if (waited >= SLOW_MS || held >= SLOW_MS) {
        console.warn(`roomLock: slow ${label || "work"} in room ${roomId} — waited ${waited}ms, held ${held}ms`);
      }
    };
    return Promise.resolve()
      .then(fn)
      .then(
        function(value) { finish(); return value; },
        function(err) { finish(); throw err; }
      );
  };
  const run = prev.then(timed, timed);
  // The next caller waits for this one, whether it succeeds or fails
  const tail = run.catch(function() {});
  tails.set(roomId, tail);
  tail.then(function() {
    if (tails.get(roomId) === tail) tails.delete(roomId);
  });
  return run;
}

module.exports = { withRoomLock, SLOW_MS };
