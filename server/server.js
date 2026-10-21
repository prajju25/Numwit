const express = require("express");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const { Server } = require("socket.io");
// Always load server/.env regardless of the process's current working
// directory (e.g. `npm run server` from the repo root runs with cwd at the
// repo root, where dotenv's default lookup would find nothing).
require("dotenv").config({ path: path.join(__dirname, ".env") });

const handleLobbyEvents = require("./socketHandlers/lobby");
const handleGameEvents = require("./socketHandlers/game");
const handleChatEvents = require("./socketHandlers/chat");
const handleEmoteEvents = require("./socketHandlers/emote");
const handleVoiceEvents = require("./socketHandlers/voice");
const handleFeedbackEvents = require("./socketHandlers/feedback");

const roomManager = require("./utils/roomManager");
const codeService = require("./services/codeService");
const statsService = require("./db/statsService");
const achievementService = require("./db/achievementService");
const userService = require("./db/userService");
const adminAuth = require("./middleware/adminAuth");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);

// Security headers on every response. CSP is disabled for now since it needs
// tuning for the inline scripts / websocket connections the client uses --
// revisit once the production origin is finalized.
app.use(helmet({ contentSecurityPolicy: false }));

// One log line per failed HTTP request (status 400+), e.g. "HTTP 401 GET
// /admin 3ms" — so a 4xx/5xx in Fly's metrics can be traced to its URL.
// Successful requests (200, 304, Socket.IO's 101 upgrade) aren't logged.
// Path only: query strings never reach the logs.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (res.statusCode < 400) return;
    const path = String(req.originalUrl || req.url || "").split("?")[0].slice(0, 200);
    console.warn(`HTTP ${res.statusCode} ${req.method} ${path} ${Date.now() - startedAt}ms`);
  });
  next();
});

// Public images (link-preview image, icons, install screenshots) must be
// loadable by other sites: Reddit's post editor, Discord, Slack etc. show
// og-image.jpg straight from here, and helmet's default
// Cross-Origin-Resource-Policy: same-origin makes browsers refuse that.
// Everything else (pages, API, admin) keeps same-origin.
const PUBLIC_IMAGE = /\.(?:png|jpe?g|webp|gif|svg|ico)$/i;
app.use((req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && PUBLIC_IMAGE.test(req.path) && !req.path.startsWith("/admin")) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  }
  next();
});

// gzip responses (mainly the ~535 KB client bundle) — cuts egress, which is
// billed per GB on the host. Socket.IO traffic is unaffected.
app.use(compression());

app.use(express.json());

// Serve the built React client (see Dockerfile, which builds client/ into
// client/dist next to server/). No-ops harmlessly if the directory doesn't
// exist (e.g. local dev where the client runs via webpack-dev-server instead).
app.use(express.static(path.join(__dirname, "../client/dist")));

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const SOCKET_PING_INTERVAL = Number(process.env.SOCKET_PING_INTERVAL) || 5000;
const SOCKET_PING_TIMEOUT = Number(process.env.SOCKET_PING_TIMEOUT) || 3000;

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  pingInterval: SOCKET_PING_INTERVAL,
  pingTimeout: SOCKET_PING_TIMEOUT,
});

// -- @socket.io/redis-adapter (horizontal scaling) -----------------------------
// Only active when REDIS_ADAPTER_URL is set explicitly. A single instance gains
// nothing from it, and on a per-command-billed Redis (e.g. Upstash) its pub/sub
// traffic on every broadcast is pure cost. Set it (usually to REDIS_URL) only
// when running 2+ instances.
if (process.env.REDIS_ADAPTER_URL) {
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const { createClient } = require("redis");
    const adapterUrl = process.env.REDIS_ADAPTER_URL;

    const pubClient = createClient({ url: adapterUrl });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log("Socket.IO redis-adapter active");
      })
      .catch((err) => {
        console.warn(
          "redis-adapter unavailable, running single-node:",
          err.message,
        );
      });
  } catch (err) {
    console.warn("redis-adapter module missing:", err.message);
  }
}

// -- Seed achievements on startup -----------------------------------------------
achievementService.seedAchievements().catch((err) => {
  console.error("seedAchievements failed:", err.message);
});

// -- REST: GET /api/health --------------------------------------------------------
app.get("/api/health", async (req, res) => {
  let redisStatus = "ok";
  try {
    const redis = require("./redisClient");
    await redis.ping();
  } catch (e) {
    console.error("Redis down is expected/reportable, not exceptional", e);
    // Redis down is expected/reportable, not exceptional — surfaced via the
    // redisStatus field below rather than logged on every health check poll.
    redisStatus = "unavailable";
  }
  res.json({
    status: "ok",
    redis: redisStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// -- REST: GET /api/stats -----------------------------------------------------------
// The landing page polls this every 10s per visitor, so successful results are
// cached briefly and shared across all pollers. Each computation is a KEYS
// scan plus one MGET for all rooms (one round trip and one command, instead of
// a GET per room — that was slow and costly with hundreds of rooms).
const STATS_CACHE_MS = Number(process.env.STATS_CACHE_MS ?? 10000);
let statsCache = { at: 0, body: null };

app.get("/api/stats", async (req, res) => {
  if (statsCache.body && Date.now() - statsCache.at < STATS_CACHE_MS) {
    return res.json(statsCache.body);
  }
  try {
    const redis = require("./redisClient");
    const keys = await redis.keys("room:*");
    const values = keys.length ? await redis.mGet(keys) : [];
    // activePlayers counts people only — a solo game is 1 person + 3 bots.
    // waitingPublic: people in a public room that hasn't started yet (shown
    // in the room picker, so a public game with strangers is visible).
    let activeRooms = 0,
      activePlayers = 0,
      gamesInProgress = 0,
      waitingPublic = 0;
    for (const raw of values) {
      if (!raw) continue;
      const room = JSON.parse(raw);
      const people = (room.users || []).filter((u) => !u.isBot).length;
      activeRooms++;
      activePlayers += people;
      if (room.game) gamesInProgress++;
      else if (room.type === "public") waitingPublic += people;
    }
    statsCache = { at: Date.now(), body: { activeRooms, activePlayers, gamesInProgress, waitingPublic } };
    res.json(statsCache.body);
  } catch (err) {
    console.error("GET /api/stats error:", err.message);
    res.status(500).json({ error: "stats unavailable" });
  }
});

// -- REST: GET /api/leaderboard ------------------------------------------------------
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    // ?period=all ranks every player ever recorded; default is the last 7 days.
    const board = req.query.period === "all"
      ? await statsService.getAllTimeLeaderboard(limit)
      : await statsService.getWeeklyLeaderboard(limit);
    // Which row is "You": matched by the asking browser's player (merged
    // devices included), not by name — two players can share a name.
    const deviceId = req.get("x-device-id");
    const me = deviceId ? await userService.getProfile(deviceId).catch(() => null) : null;
    const body = { leaderboard: board || [] };
    if (me) body.myUserId = me.id;
    res.json(body);
  } catch (err) {
    console.error("GET /api/leaderboard error:", err.message);
    res.status(500).json({ error: "leaderboard unavailable", leaderboard: [] });
  }
});

// -- REST: GET /api/room/:code -------------------------------------------------------
app.get("/api/room/:code", (req, res) => {
  const code = String(req.params.code).toLowerCase().trim();
  const roomId = codeService.resolveCode(code);
  if (!roomId)
    return res.status(404).json({ error: "Room not found or expired" });
  res.json({ roomId });
});

// -- REST: POST /api/room/code -------------------------------------------------------
app.post("/api/room/code", (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) return res.status(400).json({ error: "roomId required" });
  const code = codeService.getOrCreateCode(roomId);
  res.json({ code });
});

// -- REST: GET /api/player/:deviceId/stats -------------------------------------------
app.get("/api/player/:deviceId/stats", async (req, res) => {
  try {
    const stats = await statsService.getPlayerStats(req.params.deviceId);
    if (!stats) return res.status(404).json({ error: "Player not found" });
    res.json(stats);
  } catch (err) {
    console.error(
      `GET /api/player/${req.params.deviceId}/stats error:`,
      err.message,
    );
    res.status(500).json({ error: "unavailable" });
  }
});

// -- REST: GET /api/player/:deviceId/card --------------------------------------------
// Combined, share-card-ready snapshot: profile + all-time stats + achievement
// count in one response, used by the client's "Share" buttons (leaderboard +
// post-game victory screen) so they only need a single round trip.
app.get("/api/player/:deviceId/card", async (req, res) => {
  try {
    const profile = await userService.getProfile(req.params.deviceId);
    if (!profile) return res.status(404).json({ error: "Player not found" });

    const stats = await statsService.getPlayerStats(req.params.deviceId);
    const unlocked = await achievementService.getUnlocked(profile.id);

    const gamesPlayed = stats?.gamesPlayed || 0;
    const gamesWon = stats?.survived || 0;

    const progress = userService.levelProgress(profile.xp);

    res.json({
      name: profile.name,
      avatar: profile.avatar,
      level: profile.level,
      xp: progress.xp,
      xpLevelStart: progress.xpLevelStart,
      xpNextLevel: progress.xpNextLevel,
      levelProgress: progress.progress,
      gamesPlayed,
      gamesWon,
      roundWins: stats?.totalWins || 0,
      winRate: gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
      currentStreak: stats?.consecutiveGameWins || 0,
      bestStreak: stats?.bestStreak || 0,
      achievementsUnlocked: unlocked.size,
      achievementsTotal: achievementService.ACHIEVEMENTS.length,
    });
  } catch (err) {
    console.error(
      `GET /api/player/${req.params.deviceId}/card error:`,
      err.message,
    );
    res.status(500).json({ error: "unavailable" });
  }
});

// -- Admin API (Basic Auth via ADMIN_PASSWORD) -----------------------------------------
app.use("/api/admin", adminAuth, adminRoutes);

// -- Admin dashboard (static page, same Basic Auth) ------------------------------------
app.use("/admin", adminAuth, express.static(path.join(__dirname, "admin")));

// -- SPA fallback ---------------------------------------------------------------------
// Any GET that isn't /api/* or /socket.io/* falls back to the client's
// index.html so React Router (client-side routing) can take over. Must be
// registered after all /api routes above and after express.static, but
// before server.listen.
//
// Only the home page and the leaderboard are indexable; room links (/<code>)
// and anything else that falls through here are noindex.
const INDEXABLE_PATHS = new Set(["/", "/leaderboard"]);
app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
  if (!INDEXABLE_PATHS.has(req.path)) res.set("X-Robots-Tag", "noindex");
  res.sendFile(path.join(__dirname, "../client/dist/index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

// -- Socket.IO --------------------------------------------------------------------
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  handleLobbyEvents(io, socket);
  handleGameEvents(io, socket);
  handleChatEvents(io, socket);
  handleEmoteEvents(io, socket);
  handleVoiceEvents(io, socket);
  handleFeedbackEvents(io, socket);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Exported for testing (supertest against `app`, inspecting `io` wiring, etc.)
module.exports = { app, server, io };
