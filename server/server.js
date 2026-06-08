const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const handleLobbyEvents = require("./socketHandlers/lobby");
const handleGameEvents  = require("./socketHandlers/game");
const handleChatEvents  = require("./socketHandlers/chat");
const handleEmoteEvents = require("./socketHandlers/emote");
const handleVoiceEvents = require("./socketHandlers/voice");

const roomManager      = require("./utils/roomManager");
const codeService      = require("./services/codeService");
const statsService     = require("./db/statsService");
const achievementService = require("./db/achievementService");

const app    = express();
const server = http.createServer(app);

app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 5000,
  pingTimeout:  3000,
});

// ── @socket.io/redis-adapter (horizontal scaling) ─────────────────────────────
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
        console.log("✅ Socket.IO redis-adapter active");
      })
      .catch((err) => {
        console.warn("⚠️  redis-adapter unavailable, running single-node:", err.message);
      });
  } catch (err) {
    console.warn("⚠️  redis-adapter module missing:", err.message);
  }
}

// ── Seed achievements on startup ─────────────────────────────────────────────
achievementService.seedAchievements().catch(() => {});

// ── REST: GET /api/health ─────────────────────────────────────────────────────
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

// ── REST: GET /api/stats ──────────────────────────────────────────────────────
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

// ── REST: GET /api/leaderboard ────────────────────────────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  try {
    const board = await statsService.getWeeklyLeaderboard();
    res.json({ leaderboard: board || [] });
  } catch (err) {
    res.status(500).json({ error: "leaderboard unavailable", leaderboard: [] });
  }
});

// ── REST: GET /api/room/:code ─────────────────────────────────────────────────
app.get("/api/room/:code", (req, res) => {
  const code   = String(req.params.code).toLowerCase().trim();
  const roomId = codeService.resolveCode(code);
  if (!roomId) return res.status(404).json({ error: "Room not found or expired" });
  res.json({ roomId });
});

// ── REST: POST /api/room/code ─────────────────────────────────────────────────
app.post("/api/room/code", (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) return res.status(400).json({ error: "roomId required" });
  const code = codeService.getOrCreateCode(roomId);
  res.json({ code });
});

// ── REST: GET /api/player/:deviceId/stats ────────────────────────────────────
app.get("/api/player/:deviceId/stats", async (req, res) => {
  try {
    const stats = await statsService.getPlayerStats(req.params.deviceId);
    if (!stats) return res.status(404).json({ error: "Player not found" });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "unavailable" });
  }
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  handleLobbyEvents(io, socket);
  handleGameEvents(io, socket);
  handleChatEvents(io, socket);
  handleEmoteEvents(io, socket);
  handleVoiceEvents(io, socket);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
