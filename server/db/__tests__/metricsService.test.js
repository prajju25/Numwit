jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));

const { db } = require("../prismaClient");
const { getGrowthMetrics } = require("../metricsService");

const NOW = Date.parse("2026-10-14T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000);

function mockDb({ sessions, newPlayers = 0, rounds7d = 0, roundsTotal = 0 }) {
  db.mockImplementation(async (fn) => fn({
    sessionStat: { findMany: jest.fn().mockResolvedValue(sessions) },
    user: { count: jest.fn().mockResolvedValue(newPlayers) },
    roundLog: { count: jest.fn(({ where } = {}) => Promise.resolve(where ? rounds7d : roundsTotal)) },
  }));
}

describe("metricsService.getGrowthMetrics", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns null when the database is unavailable", async () => {
    db.mockResolvedValue(null);
    expect(await getGrowthMetrics(NOW)).toBeNull();
  });

  test("computes weekly active, returning players, games and a 14-day series", async () => {
    mockDb({
      sessions: [
        { userId: "a", playedAt: daysAgo(1), roomType: "public" },
        { userId: "a", playedAt: daysAgo(2), roomType: "solo" },
        { userId: "b", playedAt: daysAgo(3), roomType: "private" },
        { userId: "a", playedAt: daysAgo(9), roomType: "public" },  // last week
        { userId: "c", playedAt: daysAgo(10), roomType: "public" }, // last week only
      ],
      newPlayers: 2,
      rounds7d: 40,
      roundsTotal: 95,
    });

    const m = await getGrowthMetrics(NOW);

    expect(m).toMatchObject({
      weeklyActivePlayers: 2,          // a, b
      previousWeekActivePlayers: 2,    // a, c
      returningPlayers: 1,             // a
      returningRate: 50,
      newPlayers7d: 2,
      games7d: 3,
      gamesByRoomType: { public: 1, private: 1, solo: 1 },
      rounds7d: 40,
      roundsTotal: 95,
    });
    expect(m.daily).toHaveLength(14);
    expect(m.daily[13]).toEqual({ date: "2026-10-14", players: 0 });
    expect(m.daily.find((d) => d.date === "2026-10-13").players).toBe(1);
  });

  test("returningRate is null with no players last week", async () => {
    mockDb({ sessions: [{ userId: "a", playedAt: daysAgo(1), roomType: "public" }] });
    const m = await getGrowthMetrics(NOW);
    expect(m.returningRate).toBeNull();
    expect(m.weeklyActivePlayers).toBe(1);
  });
});
