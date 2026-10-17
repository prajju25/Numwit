/**
 * db/statsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Session stats persistence + weekly and all-time leaderboards.
 */

const { db } = require("./prismaClient");
const { canonicalDeviceId } = require("./deviceAlias");

/**
 * Write one session stat row for a user.
 * @param {string} deviceId
 * @param {object} stats  {
 *   rounds, wins, penalties, exactMatches, survived,
 *   roomType, isDuel, playerCount, maxConsecRoundWins, wasLastPlace
 * }
 */
async function writeSessionStat(deviceId, stats) {
  deviceId = await canonicalDeviceId(deviceId); // merged devices play as their player
  // Resolve userId from deviceId
  const user = await db((p) => p.user.findUnique({
    where: { deviceId },
    select: { id: true },
  }));
  if (!user) return null;

  return db((p) =>
    p.sessionStat.create({
      data: {
        userId:            user.id,
        rounds:            stats.rounds            || 0,
        wins:              stats.wins              || 0,
        penalties:         stats.penalties         || 0,
        exactMatches:      stats.exactMatches      || 0,
        survived:          stats.survived          || false,
        roomType:          stats.roomType          || "public",
        isDuel:            stats.isDuel            || false,
        playerCount:       stats.playerCount       || 0,
        maxConsecRoundWins: stats.maxConsecRoundWins || 0,
        wasLastPlace:      stats.wasLastPlace      || false,
      },
    })
  );
}

/**
 * Weekly leaderboard — top N players by round wins in the last 7 days.
 * Returns [{
 *   name, avatar, level,
 *   weekGamesPlayed, weekGamesWon, weekRoundWins,   ← 7-day
 *   allTimeGamesPlayed, allTimeGamesWon, allTimeRoundWins  ← all-time
 * }]
 * @param {number} limit   How many rows to return (default 10, max 100)
 * @param {number} offset  Rows to skip, for paging (default 0)
 */
async function getWeeklyLeaderboard(limit = 10, offset = 0) {
  const take = Math.min(Math.max(1, Number(limit) || 10), 100);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Weekly: round wins + games played in one groupBy
  const weekRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { playedAt: { gte: since } },
      _sum:   { wins: true },
      _count: { id: true },
      // userId breaks ties so pages never overlap or skip anyone
      orderBy: [{ _sum: { wins: "desc" } }, { userId: "asc" }],
      skip: Math.max(0, Number(offset) || 0),
      take,
    })
  );
  if (!weekRows || weekRows.length === 0) return [];

  const userIds = weekRows.map((r) => r.userId);

  // Weekly games won (survived=true is Boolean — must count separately)
  const weekWonRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { playedAt: { gte: since }, survived: true, userId: { in: userIds } },
      _count: { id: true },
    })
  );
  const weekWonMap = {};
  (weekWonRows || []).forEach((r) => { weekWonMap[r.userId] = r._count.id; });

  // All-time: round wins + games played
  const allTimeRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum:   { wins: true },
      _count: { id: true },
    })
  );
  const allTimeMap = {};
  (allTimeRows || []).forEach((r) => {
    allTimeMap[r.userId] = {
      gamesPlayed: r._count.id    || 0,
      roundWins:   r._sum.wins    || 0,
    };
  });

  // All-time games won (survived=true)
  const allTimeWonRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, survived: true },
      _count: { id: true },
    })
  );
  const allTimeWonMap = {};
  (allTimeWonRows || []).forEach((r) => { allTimeWonMap[r.userId] = r._count.id; });

  // User profiles
  const users = await db((p) =>
    p.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, level: true },
    })
  );
  if (!users) return [];

  const userMap = {};
  users.forEach((u) => { userMap[u.id] = u; });

  return weekRows.map((r) => ({
    ...(userMap[r.userId] || {}),
    // 7-day
    weekGamesPlayed: r._count.id             || 0,
    weekGamesWon:    weekWonMap[r.userId]     || 0,
    weekRoundWins:   r._sum.wins             || 0,
    // all-time
    allTimeGamesPlayed: (allTimeMap[r.userId] || {}).gamesPlayed || 0,
    allTimeGamesWon:    allTimeWonMap[r.userId]                  || 0,
    allTimeRoundWins:   (allTimeMap[r.userId] || {}).roundWins   || 0,
  })).filter((r) => r.name);
}

/**
 * All-time leaderboard — top N players by round wins across every game ever
 * recorded (not just players active this week). Same row shape as
 * getWeeklyLeaderboard, so the client can render either.
 * @param {number} limit   How many rows to return (default 10, max 100)
 * @param {number} offset  Rows to skip, for paging (default 0)
 */
async function getAllTimeLeaderboard(limit = 10, offset = 0) {
  const take = Math.min(Math.max(1, Number(limit) || 10), 100);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // All-time: round wins + games played, ranked
  const allTimeRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      _sum:   { wins: true },
      _count: { id: true },
      // userId breaks ties so pages never overlap or skip anyone
      orderBy: [{ _sum: { wins: "desc" } }, { userId: "asc" }],
      skip: Math.max(0, Number(offset) || 0),
      take,
    })
  );
  if (!allTimeRows || allTimeRows.length === 0) return [];

  const userIds = allTimeRows.map((r) => r.userId);
  const countMap = (rows) => {
    const map = {};
    (rows || []).forEach((r) => { map[r.userId] = r._count.id; });
    return map;
  };

  // All-time games won (survived=true)
  const allTimeWonMap = countMap(await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, survived: true },
      _count: { id: true },
    })
  ));

  // This week's numbers for the same players
  const weekRows = await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, playedAt: { gte: since } },
      _sum:   { wins: true },
      _count: { id: true },
    })
  );
  const weekMap = {};
  (weekRows || []).forEach((r) => {
    weekMap[r.userId] = { gamesPlayed: r._count.id || 0, roundWins: r._sum.wins || 0 };
  });

  const weekWonMap = countMap(await db((p) =>
    p.sessionStat.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, playedAt: { gte: since }, survived: true },
      _count: { id: true },
    })
  ));

  const users = await db((p) =>
    p.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, level: true },
    })
  );
  if (!users) return [];

  const userMap = {};
  users.forEach((u) => { userMap[u.id] = u; });

  return allTimeRows.map((r) => ({
    ...(userMap[r.userId] || {}),
    // 7-day
    weekGamesPlayed: (weekMap[r.userId] || {}).gamesPlayed || 0,
    weekGamesWon:    weekWonMap[r.userId]                  || 0,
    weekRoundWins:   (weekMap[r.userId] || {}).roundWins   || 0,
    // all-time
    allTimeGamesPlayed: r._count.id          || 0,
    allTimeGamesWon:    allTimeWonMap[r.userId] || 0,
    allTimeRoundWins:   r._sum.wins          || 0,
  })).filter((r) => r.name);
}

/**
 * Get all-time stats for a device.
 * Includes duelWins and soloWins for achievement checks.
 */
async function getPlayerStats(deviceId) {
  deviceId = await canonicalDeviceId(deviceId); // merged devices play as their player
  const user = await db((p) => p.user.findUnique({
    where: { deviceId },
    select: { id: true, consecutiveGameWins: true, bestStreak: true },
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

  // Duel wins: isDuel=true AND survived=true
  const duelWonAgg = await db((p) =>
    p.sessionStat.aggregate({
      where: { userId: user.id, isDuel: true, survived: true },
      _count: { id: true },
    })
  );

  // Solo wins: roomType='solo' AND survived=true
  const soloWonAgg = await db((p) =>
    p.sessionStat.aggregate({
      where: { userId: user.id, roomType: "solo", survived: true },
      _count: { id: true },
    })
  );

  return {
    gamesPlayed:          agg._count.id                                  || 0,
    totalRounds:          agg._sum.rounds                                || 0,
    totalWins:            agg._sum.wins                                  || 0,
    totalPenalties:       agg._sum.penalties                             || 0,
    exactMatches:         agg._sum.exactMatches                          || 0,
    survived:             survivedAgg?._count.id                        || 0,
    duelWins:             duelWonAgg?._count.id                          || 0,
    soloWins:             soloWonAgg?._count.id                          || 0,
    consecutiveGameWins:  user.consecutiveGameWins                       || 0,
    bestStreak:           user.bestStreak                                || 0,
  };
}

/**
 * How many players a leaderboard has in total ("week" = played in the last 7
 * days, "all" = ever), for paging. Counted in the database, not by loading rows.
 */
async function countLeaderboardPlayers(period = "week") {
  const rows = await db((p) => (period === "all"
    ? p.$queryRaw`SELECT COUNT(DISTINCT "userId")::int AS n FROM "SessionStat"`
    : p.$queryRaw`SELECT COUNT(DISTINCT "userId")::int AS n FROM "SessionStat" WHERE "playedAt" >= ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)}`));
  return rows && rows[0] ? Number(rows[0].n) : 0;
}

module.exports = {
  writeSessionStat, getWeeklyLeaderboard, getAllTimeLeaderboard, countLeaderboardPlayers, getPlayerStats,
};
