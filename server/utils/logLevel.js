/**
 * logLevel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The server logs with plain console.* calls, by level:
 *   console.debug  per-event detail (picks, timers, voice) — the noisiest
 *   console.log    normal events (joins, games starting/ending, admin actions)
 *   console.warn   something unusual (failed requests, failed admin sign-ins)
 *   console.error  something broke
 *
 * LOG_LEVEL (env) chooses the lowest level that is printed: debug (default,
 * everything), info, warn or error. E.g. `fly secrets set LOG_LEVEL=info`
 * drops the per-pick lines on a busy day without a code change.
 */
const LEVELS = ["debug", "info", "warn", "error"];

function applyLogLevel(level = process.env.LOG_LEVEL, target = console) {
  const wanted = LEVELS.indexOf(String(level || "debug").toLowerCase());
  const min = wanted === -1 ? 0 : wanted;
  const off = function() {};
  if (min > 0) target.debug = off;
  if (min > 1) { target.log = off; target.info = off; }
  if (min > 2) target.warn = off;
  return LEVELS[min];
}

module.exports = { applyLogLevel, LEVELS };
