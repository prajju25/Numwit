/**
 * db/userService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * User upsert, XP/level management.
 *
 * XP formula:
 *   Win a round   → +20 XP
 *   Exact match   → +15 XP bonus
 *   Survive game  → +50 XP
 *   Penalty point → -5 XP (floor: 0)
 *
 * Level thresholds (cumulative XP):
 *   Lv 1:    0   Lv 2:  100  Lv 3:  250  Lv 4:  500
 *   Lv 5:  900   Lv 6: 1400  Lv 7: 2000  Lv 8: 3000
 *   Lv 9: 4500  Lv 10: 6500
 */

const { db } = require("./prismaClient");

const XP_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 3000, 4500, 6500];
const MAX_LEVEL = XP_THRESHOLDS.length;

function xpToLevel(xp) {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

function xpForNextLevel(level) {
  return XP_THRESHOLDS[level] || null; // null at max level
}

/**
 * Progress through the current level, for level rings / XP bars.
 * progress is 0–1; at max level it is 1 and xpNextLevel is null.
 */
function levelProgress(xp) {
  const safeXp = Math.max(0, xp || 0);
  const level = xpToLevel(safeXp);
  const xpLevelStart = XP_THRESHOLDS[level - 1];
  const xpNextLevel = xpForNextLevel(level);
  const progress = xpNextLevel
    ? (safeXp - xpLevelStart) / (xpNextLevel - xpLevelStart)
    : 1;
  return { xp: safeXp, level, xpLevelStart, xpNextLevel, progress };
}

/**
 * Upsert a user by deviceId. Creates on first visit, updates name/avatar.
 * Returns the user record (or null if DB unavailable).
 */
async function upsertUser(deviceId, name, avatar) {
  return db((p) =>
    p.user.upsert({
      where: { deviceId },
      update: { name, avatar, updatedAt: new Date() },
      create: { deviceId, name, avatar },
    })
  );
}

/**
 * Award XP to a user after a game session.
 * @param {string} deviceId
 * @param {object} gains  { wins, exactMatches, penalties, survived }
 * Returns updated { xp, level, levelUp } or null.
 */
async function awardXp(deviceId, gains) {
  const user = await db((p) => p.user.findUnique({ where: { deviceId } }));
  if (!user) return null;

  const earned =
    (gains.wins || 0) * 20 +
    (gains.exactMatches || 0) * 15 +
    (gains.survived ? 50 : 0) -
    (gains.penalties || 0) * 5;

  const newXp = Math.max(0, user.xp + earned);
  const oldLevel = user.level;
  const newLevel = xpToLevel(newXp);
  const levelUp = newLevel > oldLevel;

  await db((p) =>
    p.user.update({
      where: { deviceId },
      data: { xp: newXp, level: newLevel },
    })
  );

  return { xp: newXp, level: newLevel, levelUp, xpGained: earned };
}

/**
 * Get a user's public profile (level, xp) by deviceId.
 */
async function getProfile(deviceId) {
  return db((p) =>
    p.user.findUnique({
      where: { deviceId },
      select: { id: true, name: true, avatar: true, xp: true, level: true },
    })
  );
}

/**
 * Total number of unique players (by device) that have ever played, all-time.
 * Used by the admin dashboard. Returns 0 if the DB is unavailable.
 */
async function getTotalUsers() {
  const count = await db((p) => p.user.count());
  return count || 0;
}

/**
 * Update the consecutive game-win streak for a player.
 * If survived=true, increments (and raises bestStreak if this is a new high);
 * if survived=false, resets the current streak to 0 (bestStreak is untouched).
 * Returns the new consecutiveGameWins value (or 0 on failure).
 */
async function updateConsecutiveGameWins(deviceId, survived) {
  const user = await db((p) =>
    p.user.findUnique({ where: { deviceId }, select: { consecutiveGameWins: true, bestStreak: true } })
  );
  if (!user) return 0;

  const newStreak = survived ? (user.consecutiveGameWins || 0) + 1 : 0;
  const newBest = Math.max(user.bestStreak || 0, newStreak);

  await db((p) =>
    p.user.update({
      where: { deviceId },
      data: { consecutiveGameWins: newStreak, bestStreak: newBest },
    })
  );

  return newStreak;
}

module.exports = {
  upsertUser, awardXp, getProfile, getTotalUsers,
  updateConsecutiveGameWins,
  xpToLevel, xpForNextLevel, levelProgress, XP_THRESHOLDS,
};
