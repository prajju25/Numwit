jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));

const { db } = require("../prismaClient");
const {
  upsertUser,
  awardXp,
  getProfile,
  getTotalUsers,
  updateConsecutiveGameWins,
  xpToLevel,
  xpForNextLevel,
  XP_THRESHOLDS,
} = require("../userService");

describe("userService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("xpToLevel", () => {
    test("returns level 1 for 0 xp and just below the level-2 threshold", () => {
      expect(xpToLevel(0)).toBe(1);
      expect(xpToLevel(99)).toBe(1);
    });

    test("returns the correct level at each threshold boundary", () => {
      expect(xpToLevel(100)).toBe(2);
      expect(xpToLevel(250)).toBe(3);
      expect(xpToLevel(500)).toBe(4);
      expect(xpToLevel(900)).toBe(5);
      expect(xpToLevel(1400)).toBe(6);
      expect(xpToLevel(2000)).toBe(7);
      expect(xpToLevel(3000)).toBe(8);
      expect(xpToLevel(4500)).toBe(9);
      expect(xpToLevel(6500)).toBe(10);
    });

    test("caps at MAX_LEVEL (10) for very high xp", () => {
      expect(xpToLevel(1_000_000)).toBe(10);
    });
  });

  describe("xpForNextLevel", () => {
    test("returns the xp threshold for the next level", () => {
      expect(xpForNextLevel(1)).toBe(XP_THRESHOLDS[1]); // 100
      expect(xpForNextLevel(9)).toBe(XP_THRESHOLDS[9]); // 6500
    });

    test("returns null at max level", () => {
      expect(xpForNextLevel(10)).toBeNull();
    });
  });

  describe("upsertUser", () => {
    test("calls db with a function that upserts the user by deviceId", async () => {
      db.mockImplementation(async (fn) => fn({
        user: { upsert: jest.fn().mockResolvedValue({ id: 1, deviceId: "dev1" }) },
      }));

      const result = await upsertUser("dev1", "Alice", "🐱");
      expect(db).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 1, deviceId: "dev1" });
    });

    test("passes correct where/update/create shape to prisma", async () => {
      let capturedArgs;
      db.mockImplementation(async (fn) => fn({
        user: {
          upsert: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve({});
          }),
        },
      }));

      await upsertUser("dev2", "Bob", "🐶");
      expect(capturedArgs.where).toEqual({ deviceId: "dev2" });
      expect(capturedArgs.create).toEqual({ deviceId: "dev2", name: "Bob", avatar: "🐶" });
      expect(capturedArgs.update.name).toBe("Bob");
      expect(capturedArgs.update.avatar).toBe("🐶");
      expect(capturedArgs.update.updatedAt).toBeInstanceOf(Date);
    });

    test("returns null when db is unavailable", async () => {
      db.mockResolvedValue(null);
      const result = await upsertUser("dev3", "Carl", "🐸");
      expect(result).toBeNull();
    });
  });

  describe("awardXp", () => {
    test("returns null when the user does not exist", async () => {
      db.mockResolvedValueOnce(null); // findUnique returns null
      const result = await awardXp("dev1", { wins: 1 });
      expect(result).toBeNull();
    });

    test("computes earned xp from wins, exactMatches, survived, and penalties", async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      db
        .mockResolvedValueOnce({ xp: 80, level: 1 }) // findUnique
        .mockImplementationOnce(async (fn) => fn({ user: { update: updateMock } })); // update call

      const result = await awardXp("dev1", { wins: 1, exactMatches: 1, survived: true, penalties: 1 });
      // earned = 1*20 + 1*15 + 50 - 1*5 = 80; newXp = 80 + 80 = 160
      expect(result.xpGained).toBe(80);
      expect(result.xp).toBe(160);
      expect(result.level).toBe(xpToLevel(160));
      expect(updateMock).toHaveBeenCalledWith({
        where: { deviceId: "dev1" },
        data: { xp: 160, level: xpToLevel(160) },
      });
    });

    test("clamps newXp at 0 when penalties exceed gains", async () => {
      db
        .mockResolvedValueOnce({ xp: 2, level: 1 })
        .mockImplementationOnce(async (fn) => fn({ user: { update: jest.fn().mockResolvedValue({}) } }));

      const result = await awardXp("dev2", { penalties: 10 });
      // earned = -50; newXp = max(0, 2 - 50) = 0
      expect(result.xp).toBe(0);
      expect(result.xpGained).toBe(-50);
    });

    test("sets levelUp=true when crossing a level threshold", async () => {
      db
        .mockResolvedValueOnce({ xp: 95, level: 1 })
        .mockImplementationOnce(async (fn) => fn({ user: { update: jest.fn().mockResolvedValue({}) } }));

      const result = await awardXp("dev3", { wins: 1 }); // earned=20, newXp=115 -> level 2
      expect(result.levelUp).toBe(true);
      expect(result.level).toBe(2);
    });

    test("sets levelUp=false when staying within the same level", async () => {
      db
        .mockResolvedValueOnce({ xp: 10, level: 1 })
        .mockImplementationOnce(async (fn) => fn({ user: { update: jest.fn().mockResolvedValue({}) } }));

      const result = await awardXp("dev4", {}); // earned=0, newXp=10 -> level 1
      expect(result.levelUp).toBe(false);
      expect(result.level).toBe(1);
    });

    test("defaults missing gain fields to 0/false", async () => {
      db
        .mockResolvedValueOnce({ xp: 0, level: 1 })
        .mockImplementationOnce(async (fn) => fn({ user: { update: jest.fn().mockResolvedValue({}) } }));

      const result = await awardXp("dev5", {});
      expect(result.xpGained).toBe(0);
      expect(result.xp).toBe(0);
    });
  });

  describe("getProfile", () => {
    test("returns the selected profile fields", async () => {
      const profile = { id: 1, name: "Alice", avatar: "🐱", xp: 50, level: 2 };
      db.mockImplementation(async (fn) => fn({
        user: { findUnique: jest.fn().mockResolvedValue(profile) },
      }));

      const result = await getProfile("dev1");
      expect(result).toEqual(profile);
    });

    test("returns null when db is unavailable", async () => {
      db.mockResolvedValue(null);
      const result = await getProfile("dev1");
      expect(result).toBeNull();
    });
  });

  describe("getTotalUsers", () => {
    test("returns the total user count from prisma", async () => {
      db.mockImplementation(async (fn) => fn({
        user: { count: jest.fn().mockResolvedValue(42) },
      }));

      const result = await getTotalUsers();
      expect(result).toBe(42);
    });

    test("returns 0 when db is unavailable", async () => {
      db.mockResolvedValue(null);
      const result = await getTotalUsers();
      expect(result).toBe(0);
    });

    test("returns 0 when count resolves to 0", async () => {
      db.mockImplementation(async (fn) => fn({
        user: { count: jest.fn().mockResolvedValue(0) },
      }));

      const result = await getTotalUsers();
      expect(result).toBe(0);
    });
  });

  describe("updateConsecutiveGameWins", () => {
    test("returns 0 when the user cannot be resolved", async () => {
      db.mockResolvedValueOnce(null); // findUnique -> null
      const result = await updateConsecutiveGameWins("dev1", true);
      expect(result).toBe(0);
    });

    test("increments the streak and raises bestStreak when survived=true and it's a new high", async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      db
        .mockResolvedValueOnce({ consecutiveGameWins: 4, bestStreak: 4 }) // findUnique
        .mockImplementationOnce(async (fn) => fn({ user: { update: updateMock } }));

      const result = await updateConsecutiveGameWins("dev1", true);
      expect(result).toBe(5);
      expect(updateMock).toHaveBeenCalledWith({
        where: { deviceId: "dev1" },
        data: { consecutiveGameWins: 5, bestStreak: 5 },
      });
    });

    test("does not lower bestStreak when the current streak is below the existing best", async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      db
        .mockResolvedValueOnce({ consecutiveGameWins: 2, bestStreak: 7 }) // findUnique
        .mockImplementationOnce(async (fn) => fn({ user: { update: updateMock } }));

      const result = await updateConsecutiveGameWins("dev1", true);
      expect(result).toBe(3);
      expect(updateMock).toHaveBeenCalledWith({
        where: { deviceId: "dev1" },
        data: { consecutiveGameWins: 3, bestStreak: 7 },
      });
    });

    test("resets the current streak to 0 on a loss without touching bestStreak", async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      db
        .mockResolvedValueOnce({ consecutiveGameWins: 6, bestStreak: 6 }) // findUnique
        .mockImplementationOnce(async (fn) => fn({ user: { update: updateMock } }));

      const result = await updateConsecutiveGameWins("dev1", false);
      expect(result).toBe(0);
      expect(updateMock).toHaveBeenCalledWith({
        where: { deviceId: "dev1" },
        data: { consecutiveGameWins: 0, bestStreak: 6 },
      });
    });

    test("defaults missing consecutiveGameWins/bestStreak to 0", async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      db
        .mockResolvedValueOnce({}) // findUnique, no fields
        .mockImplementationOnce(async (fn) => fn({ user: { update: updateMock } }));

      const result = await updateConsecutiveGameWins("dev1", true);
      expect(result).toBe(1);
      expect(updateMock).toHaveBeenCalledWith({
        where: { deviceId: "dev1" },
        data: { consecutiveGameWins: 1, bestStreak: 1 },
      });
    });
  });
});
