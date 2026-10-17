jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));
// Alias resolution is tested in deviceAlias.test.js
jest.mock("../deviceAlias", () => ({ canonicalDeviceId: jest.fn(async (d) => d) }));

const { db } = require("../prismaClient");
const { writeSessionStat, getWeeklyLeaderboard, getAllTimeLeaderboard, countLeaderboardPlayers, getPlayerStats } = require("../statsService");

describe("statsService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("writeSessionStat", () => {
    test("returns null when the user cannot be resolved from deviceId", async () => {
      db.mockResolvedValueOnce(null); // findUnique -> null
      const result = await writeSessionStat("dev1", { rounds: 3 });
      expect(result).toBeNull();
    });

    test("creates a sessionStat row with defaulted fields", async () => {
      let capturedArgs;
      db
        .mockResolvedValueOnce({ id: 42 }) // findUnique
        .mockImplementationOnce(async (fn) => fn({
          sessionStat: {
            create: jest.fn((args) => {
              capturedArgs = args;
              return Promise.resolve({ id: 1, ...args.data });
            }),
          },
        }));

      const result = await writeSessionStat("dev1", { rounds: 5, wins: 2 });
      expect(capturedArgs.data).toEqual({
        userId: 42,
        rounds: 5,
        wins: 2,
        penalties: 0,
        exactMatches: 0,
        survived: false,
        roomType: "public",
        isDuel: false,
        playerCount: 0,
        maxConsecRoundWins: 0,
        wasLastPlace: false,
      });
      expect(result.userId).toBe(42);
    });

    test("defaults all stats fields to 0/false when not provided", async () => {
      let capturedArgs;
      db
        .mockResolvedValueOnce({ id: 7 })
        .mockImplementationOnce(async (fn) => fn({
          sessionStat: {
            create: jest.fn((args) => {
              capturedArgs = args;
              return Promise.resolve({});
            }),
          },
        }));

      await writeSessionStat("dev2", {});
      expect(capturedArgs.data).toEqual({
        userId: 7,
        rounds: 0,
        wins: 0,
        penalties: 0,
        exactMatches: 0,
        survived: false,
        roomType: "public",
        isDuel: false,
        playerCount: 0,
        maxConsecRoundWins: 0,
        wasLastPlace: false,
      });
    });

    test("passes through roomType/isDuel/playerCount/maxConsecRoundWins/wasLastPlace when provided", async () => {
      let capturedArgs;
      db
        .mockResolvedValueOnce({ id: 9 })
        .mockImplementationOnce(async (fn) => fn({
          sessionStat: {
            create: jest.fn((args) => {
              capturedArgs = args;
              return Promise.resolve({});
            }),
          },
        }));

      await writeSessionStat("dev3", {
        rounds: 4,
        wins: 1,
        penalties: 2,
        exactMatches: 1,
        survived: true,
        roomType: "solo",
        isDuel: true,
        playerCount: 2,
        maxConsecRoundWins: 3,
        wasLastPlace: true,
      });
      expect(capturedArgs.data).toEqual({
        userId: 9,
        rounds: 4,
        wins: 1,
        penalties: 2,
        exactMatches: 1,
        survived: true,
        roomType: "solo",
        isDuel: true,
        playerCount: 2,
        maxConsecRoundWins: 3,
        wasLastPlace: true,
      });
    });
  });

  // getWeeklyLeaderboard issues, in order: weekRows (groupBy), weekWonRows
  // (groupBy, survived=true), allTimeRows (groupBy), allTimeWonRows (groupBy,
  // survived=true), then users (findMany). It bails out early — without
  // touching the later queries — when weekRows is null/empty or users is
  // null.
  describe("getWeeklyLeaderboard", () => {
    test("returns [] when the weekly groupBy returns null (db unavailable)", async () => {
      db.mockResolvedValueOnce(null);
      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([]);
    });

    test("returns [] when the weekly groupBy returns an empty array", async () => {
      db.mockResolvedValueOnce([]);
      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([]);
    });

    test("returns [] when the user lookup fails", async () => {
      db
        .mockResolvedValueOnce([{ userId: 1, _sum: { wins: 5 }, _count: { id: 2 } }]) // weekRows
        .mockResolvedValueOnce([]) // weekWonRows
        .mockResolvedValueOnce([]) // allTimeRows
        .mockResolvedValueOnce([]) // allTimeWonRows
        .mockResolvedValueOnce(null); // users findMany

      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([]);
    });

    test("merges leaderboard rows with user info and filters entries without a name", async () => {
      db
        .mockResolvedValueOnce([
          { userId: 1, _sum: { wins: 5 }, _count: { id: 2 } },
          { userId: 2, _sum: { wins: 3 }, _count: { id: 1 } },
          { userId: 3, _sum: { wins: 1 }, _count: { id: 1 } }, // no matching user -> filtered out
        ]) // weekRows
        .mockResolvedValueOnce([{ userId: 1, _count: { id: 1 } }]) // weekWonRows
        .mockResolvedValueOnce([
          { userId: 1, _sum: { wins: 10 }, _count: { id: 5 } },
          { userId: 2, _sum: { wins: 6 }, _count: { id: 3 } },
          { userId: 3, _sum: { wins: 2 }, _count: { id: 2 } },
        ]) // allTimeRows
        .mockResolvedValueOnce([{ userId: 1, _count: { id: 3 } }]) // allTimeWonRows
        .mockResolvedValueOnce([
          { id: 1, name: "Alice", avatar: "🐱", level: 4 },
          { id: 2, name: "Bob", avatar: "🐶", level: 2 },
        ]); // users

      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([
        {
          id: 1, name: "Alice", avatar: "🐱", level: 4,
          weekGamesPlayed: 2, weekGamesWon: 1, weekRoundWins: 5,
          allTimeGamesPlayed: 5, allTimeGamesWon: 3, allTimeRoundWins: 10,
        },
        {
          id: 2, name: "Bob", avatar: "🐶", level: 2,
          weekGamesPlayed: 1, weekGamesWon: 0, weekRoundWins: 3,
          allTimeGamesPlayed: 3, allTimeGamesWon: 0, allTimeRoundWins: 6,
        },
      ]);
    });

    test("defaults missing _sum/_count values to 0", async () => {
      db
        .mockResolvedValueOnce([{ userId: 1, _sum: {}, _count: { id: 0 } }]) // weekRows
        .mockResolvedValueOnce([]) // weekWonRows
        .mockResolvedValueOnce([{ userId: 1, _sum: {}, _count: { id: 0 } }]) // allTimeRows
        .mockResolvedValueOnce([]) // allTimeWonRows
        .mockResolvedValueOnce([{ id: 1, name: "Alice", avatar: "🐱", level: 1 }]); // users

      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([
        {
          id: 1, name: "Alice", avatar: "🐱", level: 1,
          weekGamesPlayed: 0, weekGamesWon: 0, weekRoundWins: 0,
          allTimeGamesPlayed: 0, allTimeGamesWon: 0, allTimeRoundWins: 0,
        },
      ]);
    });
  });

  // getPlayerStats issues, in order: findUnique (user + consecutiveGameWins),
  // aggregate (rounds/wins/penalties/exactMatches + count), survivedAgg,
  // duelWonAgg, soloWonAgg.
  describe("getPlayerStats", () => {
    test("returns null when the user cannot be resolved", async () => {
      db.mockResolvedValueOnce(null);
      const result = await getPlayerStats("dev1");
      expect(result).toBeNull();
    });

    test("returns null when the aggregate fails", async () => {
      db
        .mockResolvedValueOnce({ id: 1, consecutiveGameWins: 0 }) // findUnique
        .mockResolvedValueOnce(null); // aggregate

      const result = await getPlayerStats("dev1");
      expect(result).toBeNull();
    });

    test("returns formatted aggregate stats with defaults for missing sums", async () => {
      db
        .mockResolvedValueOnce({ id: 1, consecutiveGameWins: 2, bestStreak: 4 }) // findUnique
        .mockResolvedValueOnce({
          _count: { id: 7 },
          _sum: { rounds: 21, wins: 9, penalties: 4, exactMatches: 2 },
        }) // aggregate
        .mockResolvedValueOnce({ _count: { id: 3 } }) // survivedAgg
        .mockResolvedValueOnce({ _count: { id: 1 } }) // duelWonAgg
        .mockResolvedValueOnce({ _count: { id: 0 } }); // soloWonAgg

      const result = await getPlayerStats("dev1");
      expect(result).toEqual({
        gamesPlayed: 7,
        totalRounds: 21,
        totalWins: 9,
        totalPenalties: 4,
        exactMatches: 2,
        survived: 3,
        duelWins: 1,
        soloWins: 0,
        consecutiveGameWins: 2,
        bestStreak: 4,
      });
    });

    test("defaults all aggregate fields to 0 when _sum/_count values are missing", async () => {
      db
        .mockResolvedValueOnce({ id: 1 }) // findUnique, no consecutiveGameWins/bestStreak
        .mockResolvedValueOnce({ _count: { id: 0 }, _sum: {} }) // aggregate
        .mockResolvedValueOnce({ _count: { id: 0 } }) // survivedAgg
        .mockResolvedValueOnce({ _count: { id: 0 } }) // duelWonAgg
        .mockResolvedValueOnce({ _count: { id: 0 } }); // soloWonAgg

      const result = await getPlayerStats("dev1");
      expect(result).toEqual({
        gamesPlayed: 0,
        totalRounds: 0,
        totalWins: 0,
        totalPenalties: 0,
        exactMatches: 0,
        survived: 0,
        duelWins: 0,
        soloWins: 0,
        consecutiveGameWins: 0,
        bestStreak: 0,
      });
    });
  });
});

// getAllTimeLeaderboard issues, in order: allTimeRows (groupBy, ranked),
// allTimeWonRows, weekRows, weekWonRows (all groupBy), then users (findMany).
describe("getAllTimeLeaderboard", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns [] when there are no sessions at all", async () => {
    db.mockResolvedValueOnce([]);
    expect(await getAllTimeLeaderboard()).toEqual([]);
    db.mockResolvedValueOnce(null);
    expect(await getAllTimeLeaderboard()).toEqual([]);
  });

  test("includes players with no games this week, ranked by all-time round wins", async () => {
    db
      .mockResolvedValueOnce([
        { userId: 1, _sum: { wins: 40 }, _count: { id: 12 } },
        { userId: 2, _sum: { wins: 25 }, _count: { id: 9 } },
        { userId: 3, _sum: { wins: 5 }, _count: { id: 2 } }, // no user row -> filtered
      ]) // allTimeRows
      .mockResolvedValueOnce([{ userId: 1, _count: { id: 6 } }]) // allTimeWonRows
      .mockResolvedValueOnce([{ userId: 2, _sum: { wins: 3 }, _count: { id: 1 } }]) // weekRows
      .mockResolvedValueOnce([{ userId: 2, _count: { id: 1 } }]) // weekWonRows
      .mockResolvedValueOnce([
        { id: 1, name: "Jon", avatar: "😎", level: 5 },
        { id: 2, name: "Prajju", avatar: "😎", level: 4 },
      ]); // users

    const result = await getAllTimeLeaderboard(50);

    expect(result).toEqual([
      {
        id: 1, name: "Jon", avatar: "😎", level: 5,
        weekGamesPlayed: 0, weekGamesWon: 0, weekRoundWins: 0,
        allTimeGamesPlayed: 12, allTimeGamesWon: 6, allTimeRoundWins: 40,
      },
      {
        id: 2, name: "Prajju", avatar: "😎", level: 4,
        weekGamesPlayed: 1, weekGamesWon: 1, weekRoundWins: 3,
        allTimeGamesPlayed: 9, allTimeGamesWon: 0, allTimeRoundWins: 25,
      },
    ]);
  });

  test("returns [] when the user lookup fails", async () => {
    db
      .mockResolvedValueOnce([{ userId: 1, _sum: {}, _count: {} }])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    expect(await getAllTimeLeaderboard()).toEqual([]);
  });
});

describe("leaderboard paging", () => {
  afterEach(() => jest.clearAllMocks());

  test.each([
    ["weekly", getWeeklyLeaderboard],
    ["all-time", getAllTimeLeaderboard],
  ])("%s: skips to the page and breaks ties by player id", async (_, fn) => {
    const groupBy = jest.fn().mockResolvedValue([]);
    db.mockImplementation(async (q) => q({ sessionStat: { groupBy } }));

    await fn(10, 20);
    expect(groupBy.mock.calls[0][0]).toMatchObject({
      orderBy: [{ _sum: { wins: "desc" } }, { userId: "asc" }],
      skip: 20,
      take: 10,
    });

    await fn(10);
    expect(groupBy.mock.calls[1][0].skip).toBe(0);
    await fn(10, -5);
    expect(groupBy.mock.calls[2][0].skip).toBe(0);
  });

  test("countLeaderboardPlayers counts distinct players this week or ever", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ n: 37 }]);
    db.mockImplementation(async (q) => q({ $queryRaw }));

    await expect(countLeaderboardPlayers("week")).resolves.toBe(37);
    expect($queryRaw.mock.calls[0][0].join("?")).toContain('WHERE "playedAt" >= ?');
    await expect(countLeaderboardPlayers("all")).resolves.toBe(37);
    expect($queryRaw.mock.calls[1][0].join("")).not.toContain("WHERE");
    await expect(countLeaderboardPlayers()).resolves.toBe(37);

    db.mockResolvedValueOnce(null);
    await expect(countLeaderboardPlayers("all")).resolves.toBe(0);
  });
});
