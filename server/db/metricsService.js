/**
 * db/metricsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Growth metrics for the admin dashboard, from real players only (bots never
 * write SessionStat rows — see persistGameOver in socketHandlers/game.js).
 *
 * North-star: weekly active players (WAP) = distinct players who finished at
 * least one game in the last 7 days.
 */

const { db } = require("./prismaClient");

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

/**
 * @param {number} now  epoch ms (injectable for tests)
 * @returns {Promise<object|null>} null when the database is unavailable
 */
async function getGrowthMetrics(now = Date.now()) {
  const weekAgo = new Date(now - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now - 14 * DAY_MS);

  const sessions = await db((p) =>
    p.sessionStat.findMany({
      where: { playedAt: { gte: twoWeeksAgo } },
      select: { userId: true, playedAt: true, roomType: true },
    })
  );
  if (!sessions) return null;

  const [newPlayers, rounds7d, roundsTotal] = await Promise.all([
    db((p) => p.user.count({ where: { createdAt: { gte: weekAgo } } })),
    db((p) => p.roundLog.count({ where: { playedAt: { gte: weekAgo } } })),
    db((p) => p.roundLog.count()),
  ]);

  const thisWeek = new Set();
  const lastWeek = new Set();
  const gamesByRoomType = { public: 0, private: 0, solo: 0 };
  const perDay = {};
  let games7d = 0;

  sessions.forEach((s) => {
    const t = new Date(s.playedAt).getTime();
    if (t >= weekAgo.getTime()) {
      thisWeek.add(s.userId);
      games7d++;
      gamesByRoomType[s.roomType] = (gamesByRoomType[s.roomType] || 0) + 1;
    } else {
      lastWeek.add(s.userId);
    }
    const key = dayKey(t);
    (perDay[key] = perDay[key] || new Set()).add(s.userId);
  });

  const returning = [...thisWeek].filter((id) => lastWeek.has(id)).length;

  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    daily.push({ date: key, players: perDay[key] ? perDay[key].size : 0 });
  }

  return {
    weeklyActivePlayers: thisWeek.size,
    previousWeekActivePlayers: lastWeek.size,
    returningPlayers: returning, // played last week AND this week
    returningRate: lastWeek.size ? Math.round((returning / lastWeek.size) * 100) : null,
    newPlayers7d: newPlayers || 0,
    games7d,
    gamesByRoomType,
    rounds7d: rounds7d || 0,
    roundsTotal: roundsTotal || 0,
    daily,
  };
}

module.exports = { getGrowthMetrics };
