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
 */
const tails = new Map();

function withRoomLock(roomId, fn) {
  const prev = tails.get(roomId) || Promise.resolve();
  const run = prev.then(fn, fn);
  // The next caller waits for this one, whether it succeeds or fails
  const tail = run.catch(function() {});
  tails.set(roomId, tail);
  tail.then(function() {
    if (tails.get(roomId) === tail) tails.delete(roomId);
  });
  return run;
}

module.exports = { withRoomLock };
