/**
 * db/deviceAlias.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A player is identified by the deviceId stored in their browser. When the
 * admin merges two players, the merged player's devices become aliases of the
 * surviving player, so they keep playing as that player instead of quietly
 * re-creating the duplicate on their next game.
 *
 * canonicalDeviceId() turns any deviceId into the one stored on the User row.
 * Every lookup by deviceId goes through it. Results are cached in memory —
 * aliases only change through the admin merge in this same process (Numwit
 * runs as one server), which updates the cache itself.
 */
const { db } = require("./prismaClient");

const cache = new Map(); // deviceId → canonical deviceId (itself when not an alias)

async function canonicalDeviceId(deviceId) {
  if (!deviceId) return deviceId;
  if (cache.has(deviceId)) return cache.get(deviceId);
  const alias = await db((p) =>
    p.deviceAlias.findUnique({ where: { deviceId }, select: { user: { select: { deviceId: true } } } })
  );
  const canonical = alias?.user?.deviceId || deviceId;
  // Don't cache misses caused by the database being unavailable: db() returns
  // null both for "no alias" and "no database", and both mean "use as is".
  cache.set(deviceId, canonical);
  return canonical;
}

/** Call after merges/deletes so the next lookup re-reads the database. */
function forgetDevices(deviceIds) {
  (deviceIds || []).forEach((id) => cache.delete(id));
}

function clearDeviceAliasCache() {
  cache.clear();
}

module.exports = { canonicalDeviceId, forgetDevices, clearDeviceAliasCache };
