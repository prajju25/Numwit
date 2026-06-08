/**
 * db/achievementService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Achievement catalogue + unlock logic.
 *
 * Achievements are checked after game_over and after individual round results.
 * All DB operations are wrapped via db() so they no-op if DB is unavailable.
 */

const { db } = require("./prismaClient");

// ── Catalogue ─────────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: "first_win",        name: "First Blood",    icon: "🏆", description: "Win your first round" },
  { id: "survivor",         name: "Survivor",       icon: "🛡️", description: "Win a game (last player standing)" },
  { id: "sharp_shooter",    name: "Sharp Shooter",  icon: "🎯", description: "Hit the exact target" },
  { id: "hat_trick",        name: "Hat Trick",      icon: "🎩", description: "Win 3 rounds in a single game" },
  { id: "no_mercy",         name: "No Mercy",       icon: "💀", description: "Eliminate 3 players in one game" },
  { id: "comeback_kid",     name: "Comeback Kid",   icon: "🔥", description: "Win a round after reaching 4 penalty points" },
  { id: "untouchable",      name: "Untouchable",    icon: "✨", description: "Win a game with 0 penalty points" },
  { id: "veteran",          name: "Veteran",        icon: "🎖️", description: "Play 10 games" },
  { id: "mind_reader",      name: "Mind Reader",    icon: "🧠", description: "Win 3 exact matches total" },
  { id: "duel_champion",    name: "Duel Champion",  icon: "⚔️", description: "Win a 1v1 duel" },
];

// Seed achievements into DB once (idempotent)
async function seedAchievements() {
  for (const a of ACHIEVEMENTS) {
    await db((p) =>
      p.achievement.upsert({
        where: { id: a.id },
        update: {},
        create: a,
      })
    );
  }
}

/**
 * Get IDs of achievements already unlocked by a user.
 */
async function getUnlocked(userId) {
  const rows = await db((p) =>
    p.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true },
    })
  );
  if (!rows) return new Set();
  return new Set(rows.map((r) => r.achievementId));
}

/**
 * Unlock a single achievement for a user.
 * Returns the achievement object if newly unlocked, null if already had it.
 */
async function unlock(userId, achievementId) {
  const result = await db((p) =>
    p.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      update: {},
      create: { userId, achievementId },
    })
  );
  if (!result) return null;
  return ACHIEVEMENTS.find((a) => a.id === achievementId) || null;
}

/**
 * Check and award achievements after a game session.
 *
 * @param {string}   userId        — DB user id
 * @param {object}   sessionData   — { wins, exactMatches, penalties, survived, eliminatedCount, isDuel, myPoints }
 * @param {object}   allTimeStats  — { totalWins, exactMatches, gamesPlayed } (from statsService)
 * @returns {Array}  newly unlocked achievement objects
 */
async function checkAndAward(userId, sessionData, allTimeStats) {
  const already = await getUnlocked(userId);
  const newlyUnlocked = [];

  const check = async (id, condition) => {
    if (condition && !already.has(id)) {
      const a = await unlock(userId, id);
      if (a) newlyUnlocked.push(a);
    }
  };

  const s = sessionData;
  const t = allTimeStats || {};

  await check("first_win",      s.wins >= 1);
  await check("survivor",       s.survived);
  await check("sharp_shooter",  s.exactMatches >= 1);
  await check("hat_trick",      s.wins >= 3);
  await check("no_mercy",       (s.eliminatedCount || 0) >= 3);
  await check("comeback_kid",   s.cameBackFrom4 || false);
  await check("untouchable",    s.survived && s.penalties === 0);
  await check("veteran",        (t.gamesPlayed || 0) >= 10);
  await check("mind_reader",    ((t.exactMatches || 0) + s.exactMatches) >= 3);
  await check("duel_champion",  s.isDuel && s.survived);

  return newlyUnlocked;
}

module.exports = { ACHIEVEMENTS, seedAchievements, checkAndAward };
