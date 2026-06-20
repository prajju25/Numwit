jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));

const { db } = require("../prismaClient");
const { ACHIEVEMENTS, seedAchievements, checkAndAward, getUnlocked } = require("../achievementService");

describe("achievementService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("ACHIEVEMENTS catalogue", () => {
    test("contains 20 achievements with unique ids", () => {
      expect(ACHIEVEMENTS).toHaveLength(20);
      const ids = ACHIEVEMENTS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("every achievement has id, name, icon, and description", () => {
      ACHIEVEMENTS.forEach((a) => {
        expect(a).toHaveProperty("id");
        expect(a).toHaveProperty("name");
        expect(a).toHaveProperty("icon");
        expect(a).toHaveProperty("description");
      });
    });
  });

  describe("getUnlocked", () => {
    test("returns a Set of unlocked achievement ids for a user", async () => {
      db.mockImplementation(async (fn) => fn({
        userAchievement: {
          findMany: jest.fn().mockResolvedValue([
            { achievementId: "first_win" },
            { achievementId: "survivor" },
          ]),
        },
      }));

      const result = await getUnlocked("user1");
      expect(result).toBeInstanceOf(Set);
      expect(result.has("first_win")).toBe(true);
      expect(result.has("survivor")).toBe(true);
      expect(result.size).toBe(2);
    });

    test("returns an empty Set when db is unavailable", async () => {
      db.mockResolvedValueOnce(null);
      const result = await getUnlocked("user1");
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });

  describe("seedAchievements", () => {
    test("upserts every achievement in the catalogue", async () => {
      db.mockImplementation(async (fn) => fn({
        achievement: { upsert: jest.fn().mockResolvedValue({}) },
      }));

      await seedAchievements();
      expect(db).toHaveBeenCalledTimes(ACHIEVEMENTS.length);
    });

    test("upserts using each achievement's id as the where clause", async () => {
      const upsertCalls = [];
      db.mockImplementation(async (fn) => fn({
        achievement: {
          upsert: jest.fn((args) => {
            upsertCalls.push(args);
            return Promise.resolve({});
          }),
        },
      }));

      await seedAchievements();
      expect(upsertCalls[0]).toEqual({
        where: { id: ACHIEVEMENTS[0].id },
        update: {},
        create: ACHIEVEMENTS[0],
      });
    });
  });

  describe("checkAndAward", () => {
    function mockDbWithUnlocked(unlockedIds, unlockResult = {}) {
      let callIndex = 0;
      db.mockImplementation(async (fn) => {
        callIndex++;
        if (callIndex === 1) {
          return fn({
            userAchievement: {
              findMany: jest.fn().mockResolvedValue(unlockedIds.map((id) => ({ achievementId: id }))),
            },
          });
        }
        return fn({
          userAchievement: { upsert: jest.fn().mockResolvedValue(unlockResult) },
        });
      });
    }

    test("returns [] when no conditions are met", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", {
        wins: 0,
        exactMatches: 0,
        penalties: 0,
        survived: false,
        eliminatedCount: 0,
        isDuel: false,
      }, {});
      expect(result).toEqual([]);
    });

    test("awards first_win when wins >= 1", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", { wins: 1, exactMatches: 0, penalties: 0, survived: false }, {});
      expect(result.map((a) => a.id)).toContain("first_win");
    });

    test("awards survivor and untouchable when survived with 0 penalties", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", { wins: 0, exactMatches: 0, penalties: 0, survived: true }, {});
      const ids = result.map((a) => a.id);
      expect(ids).toContain("survivor");
      expect(ids).toContain("untouchable");
    });

    test("does not award untouchable if survived but penalties > 0", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", { wins: 0, exactMatches: 0, penalties: 1, survived: true }, {});
      expect(result.map((a) => a.id)).not.toContain("untouchable");
      expect(result.map((a) => a.id)).toContain("survivor");
    });

    test("awards sharp_shooter when exactMatches >= 1", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", { wins: 0, exactMatches: 1, penalties: 0, survived: false }, {});
      expect(result.map((a) => a.id)).toContain("sharp_shooter");
    });

    test("awards hat_trick when wins >= 3", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", { wins: 3, exactMatches: 0, penalties: 0, survived: false }, {});
      expect(result.map((a) => a.id)).toContain("hat_trick");
    });

    test("awards no_mercy when eliminatedCount >= 3", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", {
        wins: 0, exactMatches: 0, penalties: 0, survived: false, eliminatedCount: 3,
      }, {});
      expect(result.map((a) => a.id)).toContain("no_mercy");
    });

    test("awards comeback_kid when cameBackFrom4 is true", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", {
        wins: 0, exactMatches: 0, penalties: 0, survived: false, cameBackFrom4: true,
      }, {});
      expect(result.map((a) => a.id)).toContain("comeback_kid");
    });

    test("awards veteran when allTimeStats.gamesPlayed >= 10", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", {
        wins: 0, exactMatches: 0, penalties: 0, survived: false,
      }, { gamesPlayed: 10 });
      expect(result.map((a) => a.id)).toContain("veteran");
    });

    test("awards mind_reader when combined exact matches reach 3", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", {
        wins: 0, exactMatches: 1, penalties: 0, survived: false,
      }, { exactMatches: 2 });
      expect(result.map((a) => a.id)).toContain("mind_reader");
    });

    test("awards duel_champion when isDuel and survived", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", {
        wins: 0, exactMatches: 0, penalties: 0, survived: true, isDuel: true,
      }, {});
      expect(result.map((a) => a.id)).toContain("duel_champion");
    });

    test("does not re-award an already-unlocked achievement", async () => {
      mockDbWithUnlocked(["first_win"]);
      const result = await checkAndAward("user1", { wins: 1, exactMatches: 0, penalties: 0, survived: false }, {});
      expect(result.map((a) => a.id)).not.toContain("first_win");
    });

    test("treats a null findMany result as no unlocked achievements", async () => {
      let callIndex = 0;
      db.mockImplementation(async (fn) => {
        callIndex++;
        if (callIndex === 1) {
          return fn({ userAchievement: { findMany: jest.fn().mockResolvedValue(null) } });
        }
        return fn({ userAchievement: { upsert: jest.fn().mockResolvedValue({}) } });
      });

      const result = await checkAndAward("user1", { wins: 1, exactMatches: 0, penalties: 0, survived: false }, {});
      expect(result.map((a) => a.id)).toContain("first_win");
    });

    test("does not add to newlyUnlocked when unlock() returns null (db unavailable)", async () => {
      mockDbWithUnlocked([], null);
      const result = await checkAndAward("user1", { wins: 1, exactMatches: 0, penalties: 0, survived: false }, {});
      expect(result).toEqual([]);
    });

    test("defaults allTimeStats to {} when not provided", async () => {
      mockDbWithUnlocked([]);
      const result = await checkAndAward("user1", { wins: 0, exactMatches: 0, penalties: 0, survived: false }, undefined);
      expect(result).toEqual([]);
    });
  });
});
