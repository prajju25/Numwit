jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));

const { db } = require("../prismaClient");
const { writeSessionStat, getWeeklyLeaderboard, getPlayerStats } = require("../statsService");

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
      });
    });
  });

  describe("getWeeklyLeaderboard", () => {
    test("returns [] when groupBy returns null (db unavailable)", async () => {
      db.mockResolvedValueOnce(null);
      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([]);
    });

    test("returns [] when groupBy returns an empty array", async () => {
      db.mockResolvedValueOnce([]);
      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([]);
    });

    test("returns [] when the user lookup fails", async () => {
      db
        .mockResolvedValueOnce([{ userId: 1, _sum: { wins: 5, survived: 1 } }]) // groupBy
        .mockResolvedValueOnce(null); // findMany

      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([]);
    });

    test("merges leaderboard rows with user info and filters entries without a name", async () => {
      db
        .mockResolvedValueOnce([
          { userId: 1, _sum: { wins: 5, survived: 1 } },
          { userId: 2, _sum: { wins: 3, survived: 0 } },
          { userId: 3, _sum: { wins: 1, survived: 0 } }, // no matching user -> filtered out
        ])
        .mockResolvedValueOnce([
          { id: 1, name: "Alice", avatar: "🐱", level: 4 },
          { id: 2, name: "Bob", avatar: "🐶", level: 2 },
        ]);

      const result = await getWeeklyLeaderboard();
      expect(result).toEqual([
        { id: 1, name: "Alice", avatar: "🐱", level: 4, wins: 5, survived: 1 },
        { id: 2, name: "Bob", avatar: "🐶", level: 2, wins: 3, survived: 0 },
      ]);
    });

    test("defaults missing _sum values to 0", async () => {
      db
        .mockResolvedValueOnce([{ userId: 1, _sum: {} }])
        .mockResolvedValueOnce([{ id: 1, name: "Alice", avatar: "🐱", level: 1 }]);

      const result = await getWeeklyLeaderboard();
      expect(result[0].wins).toBe(0);
      expect(result[0].survived).toBe(0);
    });
  });

  describe("getPlayerStats", () => {
    test("returns null when the user cannot be resolved", async () => {
      db.mockResolvedValueOnce(null);
      const result = await getPlayerStats("dev1");
      expect(result).toBeNull();
    });

    test("returns null when aggregate fails", async () => {
      db
        .mockResolvedValueOnce({ id: 1 }) // findUnique
        .mockResolvedValueOnce(null); // aggregate

      const result = await getPlayerStats("dev1");
      expect(result).toBeNull();
    });

    test("returns formatted aggregate stats with defaults for missing sums", async () => {
      db
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({
          _count: { id: 7 },
          _sum: { rounds: 21, wins: 9, penalties: 4, exactMatches: 2, survived: 3 },
        });

      const result = await getPlayerStats("dev1");
      expect(result).toEqual({
        gamesPlayed: 7,
        totalRounds: 21,
        totalWins: 9,
        totalPenalties: 4,
        exactMatches: 2,
        survived: 3,
      });
    });

    test("defaults all aggregate fields to 0 when _sum values are missing", async () => {
      db
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ _count: { id: 0 }, _sum: {} });

      const result = await getPlayerStats("dev1");
      expect(result).toEqual({
        gamesPlayed: 0,
        totalRounds: 0,
        totalWins: 0,
        totalPenalties: 0,
        exactMatches: 0,
        survived: 0,
      });
    });
  });
});
