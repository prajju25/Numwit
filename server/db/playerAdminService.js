/**
 * db/playerAdminService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin clean-up of player records: list, delete (with everything tied to
 * the player) and merge duplicates. There are no accounts — a player is one
 * browser's deviceId — so the same person on a phone, a laptop and an
 * incognito window shows up as several players.
 *
 * Delete removes: the User row, their games (SessionStat) and achievements
 * (cascade), their device aliases (cascade), and feedback sent from their
 * devices. RoundLog rows are anonymous (no player link) and stay.
 *
 * Merge moves the source player's history into the target and makes the
 * source's devices aliases of the target (see deviceAlias.js), then removes
 * the source row.
 *
 * Unlike the game's db() helper, errors are thrown, not swallowed: the admin
 * must see "database unavailable" rather than a silent "not found".
 */
const { getPrisma } = require("./prismaClient");
const { forgetDevices } = require("./deviceAlias");
const { xpToLevel } = require("./userService");

function withPrisma(fn) {
  const prisma = getPrisma();
  if (!prisma) return Promise.reject(new Error("Database unavailable"));
  return fn(prisma);
}

/**
 * One page of players (newest first) with enough detail to tell duplicates
 * apart. `q` filters by name (case-insensitive).
 * Returns { players, total, page, pageSize, pages }.
 */
async function listPlayers({ q = "", page = 1, pageSize = 20 } = {}) {
  const size = Math.min(Math.max(1, Number(pageSize) || 20), 100);
  const where = q ? { name: { contains: String(q).trim(), mode: "insensitive" } } : {};

  return withPrisma(async (p) => {
    const total = await p.user.count({ where });
    const pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(Math.max(1, Number(page) || 1), pages);

    const users = await p.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (current - 1) * size,
      take: size,
      select: {
        id: true, deviceId: true, name: true, avatar: true, level: true, xp: true,
        createdAt: true, updatedAt: true,
        deviceAliases: { select: { deviceId: true } },
      },
    });

    const stats = users.length
      ? await p.sessionStat.groupBy({
        by: ["userId"],
        where: { userId: { in: users.map((u) => u.id) } },
        _count: { id: true },
        _sum: { wins: true },
        _max: { playedAt: true },
      })
      : [];
    const byUser = {};
    stats.forEach((st) => { byUser[st.userId] = st; });

    return {
      total, page: current, pageSize: size, pages,
      players: users.map((u) => ({
        id: u.id,
        deviceId: u.deviceId,
        devices: [u.deviceId, ...u.deviceAliases.map((a) => a.deviceId)],
        name: u.name,
        avatar: u.avatar,
        level: u.level,
        xp: u.xp,
        games: byUser[u.id]?._count.id || 0,
        roundWins: byUser[u.id]?._sum.wins || 0,
        lastPlayed: byUser[u.id]?._max.playedAt || null,
        createdAt: u.createdAt,
      })),
    };
  });
}

async function devicesOf(p, userId) {
  const user = await p.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatar: true, deviceId: true, deviceAliases: { select: { deviceId: true } } },
  });
  if (!user) return null;
  return { user, devices: [user.deviceId, ...user.deviceAliases.map((a) => a.deviceId)] };
}

/** What deleting this player would remove — shown before confirming. */
async function deletePreview(userId) {
  return withPrisma(async (p) => {
    const found = await devicesOf(p, userId);
    if (!found) return null;
    const [games, achievements, feedback] = await Promise.all([
      p.sessionStat.count({ where: { userId } }),
      p.userAchievement.count({ where: { userId } }),
      p.feedback.count({ where: { deviceId: { in: found.devices } } }),
    ]);
    return {
      player: { id: found.user.id, name: found.user.name, avatar: found.user.avatar },
      devices: found.devices.length,
      games, achievements, feedback,
    };
  });
}

/** Permanently delete a player and everything tied to them. */
async function deletePlayer(userId) {
  const result = await withPrisma((p) =>
    p.$transaction(async (tx) => {
      const found = await devicesOf(tx, userId);
      if (!found) return null;
      const feedback = await tx.feedback.deleteMany({ where: { deviceId: { in: found.devices } } });
      const games = await tx.sessionStat.count({ where: { userId } });
      const achievements = await tx.userAchievement.count({ where: { userId } });
      await tx.user.delete({ where: { id: userId } }); // cascades games, achievements, aliases
      return { deleted: found.user.name, devices: found.devices, games, achievements, feedback: feedback.count };
    })
  );
  if (result) forgetDevices(result.devices);
  return result;
}

/**
 * Merge `sourceId` into `targetId`: games and achievements move over, XP
 * adds up (level recomputed), best streak is the higher of the two, the
 * target keeps its name/avatar/current streak, and every source device
 * becomes an alias of the target.
 */
async function mergePlayers(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Pick two different players");

  const result = await withPrisma((p) =>
    p.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.user.findUnique({ where: { id: sourceId }, include: { deviceAliases: true, userAchievements: true } }),
        tx.user.findUnique({ where: { id: targetId }, include: { userAchievements: true } }),
      ]);
      if (!source || !target) return null;

      const games = await tx.sessionStat.updateMany({ where: { userId: sourceId }, data: { userId: targetId } });

      const have = new Set(target.userAchievements.map((a) => a.achievementId));
      const newAchievements = source.userAchievements.filter((a) => !have.has(a.achievementId));
      if (newAchievements.length) {
        await tx.userAchievement.createMany({
          data: newAchievements.map((a) => ({ userId: targetId, achievementId: a.achievementId, unlockedAt: a.unlockedAt })),
          skipDuplicates: true,
        });
      }

      const xp = (target.xp || 0) + (source.xp || 0);
      await tx.user.update({
        where: { id: targetId },
        data: { xp, level: xpToLevel(xp), bestStreak: Math.max(target.bestStreak || 0, source.bestStreak || 0) },
      });

      // Source devices now play as the target. Delete the source first: its
      // aliases cascade away, then they are recreated pointing at the target.
      const devices = [source.deviceId, ...source.deviceAliases.map((a) => a.deviceId)];
      await tx.user.delete({ where: { id: sourceId } });
      await tx.deviceAlias.createMany({ data: devices.map((deviceId) => ({ deviceId, userId: targetId })) });

      return {
        merged: source.name, into: target.name,
        games: games.count, achievements: newAchievements.length, xp, devices,
      };
    })
  );
  if (result) forgetDevices(result.devices);
  return result;
}

module.exports = { listPlayers, deletePreview, deletePlayer, mergePlayers };
