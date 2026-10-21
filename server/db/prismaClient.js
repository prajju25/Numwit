/**
 * db/prismaClient.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports a Prisma client instance with graceful fallback.
 * If DATABASE_URL is not set or the DB is unreachable, all DB calls silently
 * no-op so the game still runs without a database.
 */

let prisma = null;
let dbAvailable = false;

// Neon suspends the database after a few idle minutes and closes the open
// connections; Prisma logs each as "Error in PostgreSQL connection: Error
// { kind: Closed, cause: None }" and reconnects on the next query. That's
// expected, so it isn't logged — every other database error still is.
function isIdleDisconnect(message) {
  return /Error in PostgreSQL connection: Error \{ kind: Closed, cause: None \}/.test(String(message || ""));
}

function logPrismaError(e) {
  if (isIdleDisconnect(e && e.message)) return;
  console.error("prisma:error", e && e.message);
}

if (process.env.DATABASE_URL) {
  try {
    const { PrismaClient } = require("@prisma/client");
    // Errors come to us as events (not printed by Prisma) so the idle
    // disconnect above can be skipped; warnings print as before in dev.
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development"
        ? ["warn", { emit: "event", level: "error" }]
        : [{ emit: "event", level: "error" }],
    });
    if (typeof prisma.$on === "function") prisma.$on("error", logPrismaError);

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

module.exports = { db, getPrisma: () => prisma, isIdleDisconnect, logPrismaError };
