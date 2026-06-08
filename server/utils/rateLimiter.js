/**
 * rateLimiter.js — in-memory per-socket rate limiter.
 * No external dependencies. Cleaned up on socket disconnect.
 *
 * Usage:
 *   const { isAllowed, clear } = require('./rateLimiter');
 *   if (!isAllowed(socket.id, 'chat', 1, 1000)) return; // 1 per 1000ms
 */

// Map<socketId, Map<action, { count, resetAt }>>
const store = new Map();

/**
 * Returns true if the action is within the rate limit, false if throttled.
 * @param {string} socketId
 * @param {string} action     - unique action key e.g. 'chat', 'emote'
 * @param {number} maxCount   - max calls allowed within windowMs
 * @param {number} windowMs   - rolling window in milliseconds
 */
function isAllowed(socketId, action, maxCount, windowMs) {
  const now = Date.now();

  if (!store.has(socketId)) store.set(socketId, new Map());
  const actions = store.get(socketId);

  if (!actions.has(action) || now >= actions.get(action).resetAt) {
    actions.set(action, { count: 1, resetAt: now + windowMs });
    return true;
  }

  const entry = actions.get(action);
  if (entry.count >= maxCount) return false;
  entry.count++;
  return true;
}

/**
 * Remove all rate limit data for a socket (call on disconnect).
 */
function clear(socketId) {
  store.delete(socketId);
}

module.exports = { isAllowed, clear };
