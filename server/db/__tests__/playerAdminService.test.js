jest.mock("../prismaClient", () => ({ getPrisma: jest.fn() }));
jest.mock("../deviceAlias", () => ({ forgetDevices: jest.fn() }));

const { getPrisma } = require("../prismaClient");
const { forgetDevices } = require("../deviceAlias");
const { listPlayers, deletePreview, deletePlayer, mergePlayers } = require("../playerAdminService");
const { xpToLevel } = require("../userService");

/** A tiny in-memory stand-in for the Prisma calls this service makes. */
function fakeDb() {
  const state = {
    users: {
      laptop: { id: "laptop", deviceId: "dev-laptop", name: "Prajju", avatar: "😎", xp: 300, level: 2, bestStreak: 1, createdAt: new Date("2026-10-01") },
      phone:  { id: "phone",  deviceId: "dev-phone",  name: "Prajju", avatar: "😎", xp: 150, level: 2, bestStreak: 3, createdAt: new Date("2026-10-05") },
    },
    aliases: [{ deviceId: "dev-old-phone", userId: "phone" }],
    stats: [{ userId: "laptop" }, { userId: "phone" }, { userId: "phone" }],
    achievements: [
      { userId: "laptop", achievementId: "first_win", unlockedAt: new Date("2026-10-02") },
      { userId: "phone", achievementId: "first_win", unlockedAt: new Date("2026-10-06") },
      { userId: "phone", achievementId: "survivor", unlockedAt: new Date("2026-10-07") },
    ],
    feedback: [{ deviceId: "dev-phone" }, { deviceId: "dev-old-phone" }, { deviceId: "dev-laptop" }],
  };
  const aliasesOf = (userId) => state.aliases.filter((a) => a.userId === userId).map(({ deviceId }) => ({ deviceId }));
  const withRelations = (u, include) => u && {
    ...u,
    deviceAliases: aliasesOf(u.id),
    ...(include?.userAchievements ? { userAchievements: state.achievements.filter((a) => a.userId === u.id) } : {}),
  };
  // newest first, optional case-insensitive name filter
  const matching = (where) => Object.values(state.users)
    .filter((u) => !where?.name || u.name.toLowerCase().includes(where.name.contains.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const removeUser = (id) => {
    delete state.users[id];
    state.stats = state.stats.filter((s) => s.userId !== id);
    state.achievements = state.achievements.filter((a) => a.userId !== id);
    state.aliases = state.aliases.filter((a) => a.userId !== id);
  };

  const p = {
    user: {
      count: jest.fn(async ({ where }) => matching(where).length),
      findMany: jest.fn(async ({ where, skip, take }) => matching(where).slice(skip, skip + take).map((u) => withRelations(u))),
      findUnique: jest.fn(async ({ where, include }) => withRelations(state.users[where.id], include) || null),
      update: jest.fn(async ({ where, data }) => Object.assign(state.users[where.id], data)),
      delete: jest.fn(async ({ where }) => removeUser(where.id)),
    },
    sessionStat: {
      groupBy: jest.fn(async () => [{ userId: "laptop", _count: { id: 1 }, _sum: { wins: 4 }, _max: { playedAt: new Date("2026-10-16") } }]),
      count: jest.fn(async ({ where }) => state.stats.filter((s) => s.userId === where.userId).length),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = state.stats.filter((s) => s.userId === where.userId);
        rows.forEach((s) => { s.userId = data.userId; });
        return { count: rows.length };
      }),
    },
    userAchievement: {
      count: jest.fn(async ({ where }) => state.achievements.filter((a) => a.userId === where.userId).length),
      createMany: jest.fn(async ({ data }) => { state.achievements.push(...data); return { count: data.length }; }),
    },
    feedback: {
      count: jest.fn(async ({ where }) => state.feedback.filter((f) => where.deviceId.in.includes(f.deviceId)).length),
      deleteMany: jest.fn(async ({ where }) => {
        const before = state.feedback.length;
        state.feedback = state.feedback.filter((f) => !where.deviceId.in.includes(f.deviceId));
        return { count: before - state.feedback.length };
      }),
    },
    deviceAlias: {
      createMany: jest.fn(async ({ data }) => { state.aliases.push(...data); return { count: data.length }; }),
    },
    $transaction: jest.fn(async (fn) => fn(p)),
  };
  getPrisma.mockReturnValue(p);
  return { p, state };
}

describe("playerAdminService", () => {
  beforeEach(() => jest.clearAllMocks());

  test("every call reports a missing database instead of hiding it", async () => {
    getPrisma.mockReturnValue(null);
    await expect(listPlayers()).rejects.toThrow("Database unavailable");
    await expect(deletePlayer("x")).rejects.toThrow("Database unavailable");
  });

  test("listPlayers shows each player's devices, games and last game", async () => {
    fakeDb();
    const { players, total, page, pages } = await listPlayers();
    expect({ total, page, pages }).toEqual({ total: 2, page: 1, pages: 1 });
    expect(players.map((x) => x.id)).toEqual(["phone", "laptop"]); // newest first
    const laptop = players.find((x) => x.id === "laptop");
    const phone = players.find((x) => x.id === "phone");
    expect(laptop).toMatchObject({ devices: ["dev-laptop"], games: 1, roundWins: 4, lastPlayed: new Date("2026-10-16") });
    expect(phone).toMatchObject({ devices: ["dev-phone", "dev-old-phone"], games: 0, roundWins: 0, lastPlayed: null });
  });

  test("listPlayers pages and searches on the server", async () => {
    const { state, p } = fakeDb();
    for (let i = 0; i < 25; i++) {
      state.users["t" + i] = { id: "t" + i, deviceId: "dev-t" + i, name: "Tester" + i, avatar: "🐸", xp: 0, level: 1, createdAt: new Date(2026, 9, 10, 0, i) };
    }
    const page2 = await listPlayers({ page: 2 });
    expect(page2).toMatchObject({ total: 27, page: 2, pageSize: 20, pages: 2 });
    expect(page2.players).toHaveLength(7);
    expect(p.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20 });

    const prajju = await listPlayers({ q: " prajju " });
    expect(prajju.total).toBe(2);
    expect(p.user.count.mock.calls[1][0]).toEqual({ where: { name: { contains: "prajju", mode: "insensitive" } } });

    // past the end → last page; nothing found → no stats query
    expect((await listPlayers({ page: 99 })).page).toBe(2);
    p.sessionStat.groupBy.mockClear();
    const none = await listPlayers({ q: "nobody" });
    expect(none).toMatchObject({ total: 0, page: 1, pages: 1, players: [] });
    expect(p.sessionStat.groupBy).not.toHaveBeenCalled();
  });

  test("deletePreview counts what would go, across all of the player's devices", async () => {
    fakeDb();
    await expect(deletePreview("phone")).resolves.toEqual({
      player: { id: "phone", name: "Prajju", avatar: "😎" },
      devices: 2, games: 2, achievements: 2, feedback: 2,
    });
    await expect(deletePreview("nobody")).resolves.toBeNull();
  });

  test("deletePlayer removes the player, their records and feedback, and forgets their devices", async () => {
    const { state } = fakeDb();
    const result = await deletePlayer("phone");

    expect(result).toEqual({ deleted: "Prajju", devices: ["dev-phone", "dev-old-phone"], games: 2, achievements: 2, feedback: 2 });
    expect(state.users.phone).toBeUndefined();
    expect(state.stats).toEqual([{ userId: "laptop" }]);
    expect(state.feedback).toEqual([{ deviceId: "dev-laptop" }]);
    expect(state.aliases).toEqual([]);
    expect(forgetDevices).toHaveBeenCalledWith(["dev-phone", "dev-old-phone"]);
    await expect(deletePlayer("phone")).resolves.toBeNull();
  });

  test("mergePlayers folds the source into the target and keeps its devices playing as the target", async () => {
    const { state } = fakeDb();
    const result = await mergePlayers("phone", "laptop");

    expect(result).toEqual({
      merged: "Prajju", into: "Prajju", games: 2, achievements: 1, xp: 450,
      devices: ["dev-phone", "dev-old-phone"],
    });
    expect(state.users.phone).toBeUndefined();
    expect(state.stats.every((s) => s.userId === "laptop")).toBe(true);
    expect(state.stats).toHaveLength(3);
    // first_win already on the target: not duplicated; survivor moves over
    expect(state.achievements.filter((a) => a.userId === "laptop").map((a) => a.achievementId).sort()).toEqual(["first_win", "survivor"]);
    expect(state.users.laptop).toMatchObject({ xp: 450, level: xpToLevel(450), bestStreak: 3 });
    expect(state.aliases).toEqual([
      { deviceId: "dev-phone", userId: "laptop" },
      { deviceId: "dev-old-phone", userId: "laptop" },
    ]);
    expect(forgetDevices).toHaveBeenCalledWith(["dev-phone", "dev-old-phone"]);
  });

  test("mergePlayers refuses the same player twice, and reports missing players", async () => {
    fakeDb();
    await expect(mergePlayers("laptop", "laptop")).rejects.toThrow("Pick two different players");
    await expect(mergePlayers(null, "laptop")).rejects.toThrow("Pick two different players");
    await expect(mergePlayers("ghost", "laptop")).resolves.toBeNull();
    expect(forgetDevices).not.toHaveBeenCalled();
  });

  test("merging a player with nothing new to add still works", async () => {
    const { state, p } = fakeDb();
    state.achievements = state.achievements.filter((a) => a.achievementId === "first_win");
    state.users.phone.xp = undefined;
    state.users.laptop.bestStreak = undefined;
    state.users.phone.bestStreak = undefined;
    const result = await mergePlayers("phone", "laptop");
    expect(result.achievements).toBe(0);
    expect(p.userAchievement.createMany).not.toHaveBeenCalled();
    expect(state.users.laptop).toMatchObject({ xp: 300, bestStreak: 0 });
  });
});
