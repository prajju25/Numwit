/**
 * db/prismaClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports a Prisma client instance with graceful fallback.
 * If DATABASE_URL is not set or the DB is unreachable, all DB calls silently
 * no-op so the game still runs without a database.
 */

let prisma = null;
let dbAvailable = false;

if (process.env.DATABASE_URL) {
  try {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

    // Test connection eagerly — suppress errors at startup
    prisma.$connect()
      .then(() => {
        dbAvailable = true;
        console.log("✅ PostgreSQL connected via Prisma");
      })
      .catch((err) => {
        console.warn("⚠️  PostgreSQL unavailable — running without DB:", err.message);
        prisma = null;
      });
  } catch (err) {
    console.warn("⚠️  Prisma client init failed:", err.message);
  }
} else {
  console.info("ℹ️  DATABASE_URL not set — running without PostgreSQL");
}

/**
 * Safe wrapper: executes fn(prisma) only if DB is available.
 * Returns the result or null on failure / unavailability.
 *
 * Usage:
 *   const user = await db(p => p.user.findUnique({ where: { deviceId } }));
 */
async function db(fn) {
  if (!prisma) return null;
  try {
    return await fn(prisma);
  } catch (err) {
    console.error("DB error:", err.message);
    return null;
  }
}

module.exports = { db, getPrisma: () => prisma };
