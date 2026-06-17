const express = require("express");
const http    = require("http");
const path    = require("path");
const helmet  = require("helmet");
const { Server } = require("socket.io");
// Always load server/.env regardless of the process's current working
// directory (e.g. `npm run server` from the repo root runs with cwd at the
// repo root, where dotenv's default lookup would find nothing).
require("dotenv").config({ path: path.join(__dirname, ".env") });

const handleLobbyEvents = require("./socketHandlers/lobby");
const handleGameEvents  = require("./socketHandlers/game");
const handleChatEvents  = require("./socketHandlers/chat");
const handleEmoteEvents = require("./socketHandlers/emote");
const handleVoiceEvents = require("./socketHandlers/voice");
const handleFeedbackEvents = require("./socketHandlers/feedback");

const roomManager      = require("./utils/roomManager");
const codeService      = require("./services/codeService");
const statsService     = require("./db/statsService");
const achievementService = require("./db/achievementService");
const adminAuth        = require("./middleware/adminAuth");
const adminRoutes      = require("./routes/admin");

const app    = express();
const server = http.createServer(app);

// Security headers on every response. CSP is disabled for now since it needs
// tuning for the inline scripts / websocket connections the client uses --
// revisit once the production origin is finalized.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json());

// Serve the built React client (see Dockerfile, which builds client/ into
// client/dist next to server/). No-ops harmlessly if the directory doesn't
// exist (e.g. local dev where the client runs via webpack-dev-server instead).
app.use(express.static(path.join(__dirname, "../client/dist")));

const CORS_ORIGIN          = process.env.CORS_ORIGIN || "*";
const SOCKET_PING_INTERVAL = Number(process.env.SOCKET_PING_INTERVAL) || 5000;
const SOCKET_PING_TIMEOUT  = Number(process.env.SOCKET_PING_TIMEOUT) || 3000;

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  pingInterval: SOCKET_PING_INTERVAL,
  pingTimeout:  SOCKET_PING_TIMEOUT,
});

// -- @socket.io/redis-adapter (horizontal scaling) -----------------------------
// Only active when REDIS_ADAPTER_URL is set (same Redis or separate instance).
if (process.env.REDIS_ADAPTER_URL || process.env.REDIS_URL) {
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const { createClient }  = require("redis");
    const adapterUrl = process.env.REDIS_ADAPTER_URL || process.env.REDIS_URL;

    const pubClient = createClient({ url: adapterUrl });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log("Socket.IO redis-adapter active");
      })
      .catch((err) => {
        console.warn("redis-adapter unavailable, running single-node:", err.message);
      });
  } catch (err) {
    console.warn("redis-adapter module missing:", err.message);
  }
}

// -- Seed achievements on startup -----------------------------------------------
achievementService.seedAchievements().catch(() => {});

// -- REST: GET /api/health --------------------------------------------------------
app.get("/api/health", async (req, res) => {
  let redisStatus = "ok";
  try {
    const redis = require("./redisClient");
    await redis.ping();
  } catch (_) {
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
app.get("/api/stats", async (req, res) => {
  try {
    const redis = require("./redisClient");
    const keys = await redis.keys("room:*");
    let activeRooms = 0, activePlayers = 0, gamesInProgress = 0;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const room = JSON.parse(raw);
      activeRooms++;
      activePlayers += (room.users || []).length;
      if (room.game) gamesInProgress++;
    }
    res.json({ activeRooms, activePlayers, gamesInProgress });
  } catch (err) {
    res.status(500).json({ error: "stats unavailable" });
  }
});

// -- REST: GET /api/leaderboard ------------------------------------------------------
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const board = await statsService.getWeeklyLeaderboard(limit);
    res.json({ leaderboard: board || [] });
  } catch (err) {
    res.status(500).json({ error: "leaderboard unavailable", leaderboard: [] });
  }
});

// -- REST: GET /api/room/:code -------------------------------------------------------
app.get("/api/room/:code", (req, res) => {
  const code   = String(req.params.code).toLowerCase().trim();
  const roomId = codeService.resolveCode(code);
  if (!roomId) return res.status(404).json({ error: "Room not found or expired" });
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
app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
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
