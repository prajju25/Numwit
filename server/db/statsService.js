/**
 * db/statsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Session stats persistence + weekly leaderboard.
 */

const { db } = require("./prismaClient");

/**
 * Write one session stat row for a user.
 * @param {string} deviceId
 * @param {object} stats  { rounds, wins, penalties, exactMatches, survived }
 */
async function writeSessionStat(deviceId, stats) {
  // Resolve userId from deviceId
  const user = await db((p) => p.user.findUnique({
    where: { deviceId },
    select: { id: true },
  }));
  if (!user) return null;

  return db((p) =>
    p.sessionStat.create({
      data: {
        userId: user.id,
        rounds:       stats.rounds       || 0,
        wins:         stats.wins         || 0,
        penalties:    stats.penalties    || 0,
        exactMatches: stats.exactMatches || 0,
        survived:     stats.survived     || false,
      },
    })
  );
}

/**
 * Weekly leaderboard — top N players by wins in the last 7 days.
 * Returns [{ name, avatar, level, wins, survived }]
 * @param {number} limit  How many rows to return (default 10, max 100)
 */
async function getWeeklyLeaderboard(limit = 10) {
  const take = Math.min(Math.max(1, Number(limit) || 10), 100);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { playedAt: { gte: since } },
      _sum: { wins: true },
      orderBy: { _sum: { wins: "desc" } },
      take,
    })
  );
  if (!rows || rows.length === 0) return [];

  const userIds = rows.map((r) => r.userId);

  // survived is Boolean so it can't be summed — count rows where survived=true instead
  const survivedRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { playedAt: { gte: since }, survived: true, userId: { in: userIds } },
      _count: { id: true },
    })
  );
  const survivedMap = {};
  if (survivedRows) {
    survivedRows.forEach((r) => { survivedMap[r.userId] = r._count.id; });
  }

  const users = await db((p) =>
    p.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, level: true },
    })
  );
  if (!users) return [];

  const userMap = {};
  users.forEach((u) => { userMap[u.id] = u; });

  return rows.map((r) => ({
    ...(userMap[r.userId] || {}),
    wins:     r._sum.wins          || 0,
    survived: survivedMap[r.userId] || 0,
  })).filter((r) => r.name);
}

/**
 * Get all-time stats for a device.
 */
async function getPlayerStats(deviceId) {
  const user = await db((p) => p.user.findUnique({
    where: { deviceId },
    select: { id: true },
  }));
  if (!user) return null;

  const agg = await db((p) =>
    p.sessionStat.aggregate({
      where: { userId: user.id },
      _sum:   { rounds: true, wins: true, penalties: true, exactMatches: true },
      _count: { id: true },
    })
  );
  if (!agg) return null;

  // survived is Boolean — count rows where survived=true separately
  const survivedAgg = await db((p) =>
    p.sessionStat.aggregate({
      where: { userId: user.id, survived: true },
      _count: { id: true },
    })
  );

  return {
    gamesPlayed:    agg._count.id                                  || 0,
    totalRounds:    agg._sum.rounds                                || 0,
    totalWins:      agg._sum.wins                                  || 0,
    totalPenalties: agg._sum.penalties                             || 0,
    exactMatches:   agg._sum.exactMatches                          || 0,
    survived:       (survivedAgg && survivedAgg._count.id)         || 0,
  };
}

module.exports = { writeSessionStat, getWeeklyLeaderboard, getPlayerStats };
