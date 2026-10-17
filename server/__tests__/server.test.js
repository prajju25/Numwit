jest.mock("dotenv", () => ({ config: jest.fn() }));

const http = require("http");
const listenSpy = jest.spyOn(http.Server.prototype, "listen");

const mockIoOn = jest.fn();
const mockIoAdapter = jest.fn();
const mockServerConstructor = jest.fn(() => ({ on: mockIoOn, adapter: mockIoAdapter }));
jest.mock("socket.io", () => ({ Server: mockServerConstructor }));

jest.mock("../socketHandlers/lobby", () => jest.fn());
jest.mock("../socketHandlers/game", () => jest.fn());
jest.mock("../socketHandlers/chat", () => jest.fn());
jest.mock("../socketHandlers/emote", () => jest.fn());
jest.mock("../socketHandlers/voice", () => jest.fn());
jest.mock("../socketHandlers/feedback", () => jest.fn());

jest.mock("../services/codeService", () => ({
  resolveCode: jest.fn(),
  getOrCreateCode: jest.fn(),
}));
jest.mock("../db/statsService", () => ({
  getWeeklyLeaderboard: jest.fn(),
  getAllTimeLeaderboard: jest.fn(),
  getPlayerStats: jest.fn(),
}));
jest.mock("../db/achievementService", () => ({
  seedAchievements: jest.fn(() => Promise.resolve()),
  getUnlocked: jest.fn(() => Promise.resolve(new Set())),
  ACHIEVEMENTS: new Array(20).fill({}),
}));
jest.mock("../db/userService", () => ({
  getProfile: jest.fn(),
  levelProgress: jest.requireActual("../db/userService").levelProgress,
}));
jest.mock("../redisClient", () => ({
  ping: jest.fn().mockResolvedValue("PONG"),
  keys: jest.fn().mockResolvedValue([]),
  get: jest.fn(),
}));

const supertest = require("supertest");

function flush() {
  return new Promise((r) => setImmediate(r));
}

describe("server.js", () => {
  let app;
  let io;
  let connectionHandler;
  let seedAchievementsCalledAtLoad;
  let serverListenCalledWithPort;
  let ioConstructorArgs;
  let codeService;
  let statsService;
  let achievementService;
  let userService;
  let redisClient;
  let handleLobbyEvents;
  let handleGameEvents;
  let handleChatEvents;
  let handleEmoteEvents;
  let handleVoiceEvents;
  let handleFeedbackEvents;

  beforeAll(() => {
    process.env.PORT = "0";
    process.env.STATS_CACHE_MS = "0"; // each test sees fresh stats; caching has its own test below
    delete process.env.REDIS_URL;
    delete process.env.REDIS_ADAPTER_URL;

    const serverModule = require("../server");
    app = serverModule.app;
    io = serverModule.io;

    const connectionCall = mockIoOn.mock.calls.find((c) => c[0] === "connection");
    connectionHandler = connectionCall?.[1];

    ioConstructorArgs = mockServerConstructor.mock.calls[0];

    achievementService = require("../db/achievementService");
    seedAchievementsCalledAtLoad = achievementService.seedAchievements.mock.calls.length > 0;

    serverListenCalledWithPort = listenSpy.mock.calls.some(
      (c) => String(c[0]) === process.env.PORT
    );

    codeService = require("../services/codeService");
    statsService = require("../db/statsService");
    userService = require("../db/userService");
    redisClient = require("../redisClient");
    handleLobbyEvents = require("../socketHandlers/lobby");
    handleGameEvents = require("../socketHandlers/game");
    handleChatEvents = require("../socketHandlers/chat");
    handleEmoteEvents = require("../socketHandlers/emote");
    handleVoiceEvents = require("../socketHandlers/voice");
    handleFeedbackEvents = require("../socketHandlers/feedback");
  });

  afterAll((done) => {
    const realServer = require("../server").server;
    if (realServer?.listening) {
      realServer.close(done);
    } else {
      done();
    }
  });

  describe("startup wiring", () => {
    test("constructs the Socket.IO server with CORS and ping config", () => {
      expect(ioConstructorArgs).toBeDefined();
      expect(ioConstructorArgs[1]).toEqual(
        expect.objectContaining({
          cors: { origin: "*" },
          pingInterval: 5000,
          pingTimeout: 3000,
        })
      );
    });

    test("seeds achievements on startup", () => {
      expect(seedAchievementsCalledAtLoad).toBe(true);
    });

    test("starts listening on the configured port", () => {
      expect(serverListenCalledWithPort).toBe(true);
    });

    test("registers all socket handler modules on a new connection", () => {
      expect(typeof connectionHandler).toBe("function");

      const fakeSocket = { id: "socket123" };
      connectionHandler(fakeSocket);

      expect(handleLobbyEvents).toHaveBeenCalledWith(io, fakeSocket);
      expect(handleGameEvents).toHaveBeenCalledWith(io, fakeSocket);
      expect(handleChatEvents).toHaveBeenCalledWith(io, fakeSocket);
      expect(handleEmoteEvents).toHaveBeenCalledWith(io, fakeSocket);
      expect(handleVoiceEvents).toHaveBeenCalledWith(io, fakeSocket);
      expect(handleFeedbackEvents).toHaveBeenCalledWith(io, fakeSocket);
    });
  });

  describe("GET /api/health", () => {
    test("reports redis ok when ping succeeds", async () => {
      redisClient.ping.mockResolvedValueOnce("PONG");

      const res = await supertest(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.redis).toBe("ok");
      expect(typeof res.body.uptime).toBe("number");
      expect(typeof res.body.timestamp).toBe("string");
    });

    test("reports redis unavailable when ping rejects", async () => {
      redisClient.ping.mockRejectedValueOnce(new Error("down"));

      const res = await supertest(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.redis).toBe("unavailable");
    });
  });

  describe("GET /api/stats", () => {
    test("aggregates active rooms, players, and games in progress", async () => {
      redisClient.keys.mockResolvedValueOnce(["room:1", "room:2", "room:3"]);
      redisClient.get.mockImplementation((key) => {
        if (key === "room:1") {
          return Promise.resolve(JSON.stringify({ users: [{ socketId: "a" }, { socketId: "b" }], game: { round: 1 } }));
        }
        if (key === "room:2") {
          return Promise.resolve(JSON.stringify({ users: [{ socketId: "c" }], game: null }));
        }
        return Promise.resolve(null);
      });

      const res = await supertest(app).get("/api/stats");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeRooms: 2, activePlayers: 3, gamesInProgress: 1 });
    });

    test("returns 500 when redis throws", async () => {
      redisClient.keys.mockRejectedValueOnce(new Error("redis down"));

      const res = await supertest(app).get("/api/stats");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "stats unavailable" });
    });
  });

  describe("GET /api/leaderboard", () => {
    test("returns the weekly leaderboard", async () => {
      statsService.getWeeklyLeaderboard.mockResolvedValueOnce([{ deviceId: "d1", xp: 100 }]);

      const res = await supertest(app).get("/api/leaderboard");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ leaderboard: [{ deviceId: "d1", xp: 100 }] });
      expect(statsService.getAllTimeLeaderboard).not.toHaveBeenCalled();
    });

    test("returns the all-time leaderboard for ?period=all", async () => {
      statsService.getAllTimeLeaderboard.mockResolvedValueOnce([{ name: "Jon" }]);

      const res = await supertest(app).get("/api/leaderboard?period=all&limit=50");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ leaderboard: [{ name: "Jon" }] });
      expect(statsService.getAllTimeLeaderboard).toHaveBeenCalledWith(50);
      expect(statsService.getWeeklyLeaderboard).not.toHaveBeenCalled();
    });

    test("tells the asking browser which row is theirs", async () => {
      statsService.getWeeklyLeaderboard.mockResolvedValueOnce([{ id: "u1", name: "Prajju" }, { id: "u2", name: "Prajju" }]);
      userService.getProfile.mockResolvedValueOnce({ id: "u2" });

      const res = await supertest(app).get("/api/leaderboard").set("X-Device-Id", "dev-phone");

      expect(userService.getProfile).toHaveBeenCalledWith("dev-phone");
      expect(res.body.myUserId).toBe("u2");
    });

    test("leaves myUserId out for unknown browsers or a lookup failure", async () => {
      statsService.getWeeklyLeaderboard.mockResolvedValue([{ id: "u1" }]);
      userService.getProfile.mockResolvedValueOnce(null);
      const unknown = await supertest(app).get("/api/leaderboard").set("X-Device-Id", "dev-new");
      expect(unknown.body).toEqual({ leaderboard: [{ id: "u1" }] });

      userService.getProfile.mockRejectedValueOnce(new Error("db down"));
      const failed = await supertest(app).get("/api/leaderboard").set("X-Device-Id", "dev-x");
      expect(failed.status).toBe(200);
      expect(failed.body).toEqual({ leaderboard: [{ id: "u1" }] });
      statsService.getWeeklyLeaderboard.mockReset();
    });

    test("returns an empty leaderboard when the service returns null", async () => {
      statsService.getWeeklyLeaderboard.mockResolvedValueOnce(null);

      const res = await supertest(app).get("/api/leaderboard");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ leaderboard: [] });
    });

    test("returns 500 when the service throws", async () => {
      statsService.getWeeklyLeaderboard.mockRejectedValueOnce(new Error("db down"));

      const res = await supertest(app).get("/api/leaderboard");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "leaderboard unavailable", leaderboard: [] });
    });
  });

  describe("GET /api/room/:code", () => {
    test("resolves a known code to a roomId", async () => {
      codeService.resolveCode.mockReturnValueOnce("room42");

      const res = await supertest(app).get("/api/room/ABC123");

      expect(codeService.resolveCode).toHaveBeenCalledWith("abc123");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ roomId: "room42" });
    });

    test("returns 404 when the code is unknown", async () => {
      codeService.resolveCode.mockReturnValueOnce(null);

      const res = await supertest(app).get("/api/room/zzzzzz");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Room not found or expired" });
    });
  });

  describe("POST /api/room/code", () => {
    test("creates or returns a code for a roomId", async () => {
      codeService.getOrCreateCode.mockReturnValueOnce("abc123");

      const res = await supertest(app).post("/api/room/code").send({ roomId: "room42" });

      expect(codeService.getOrCreateCode).toHaveBeenCalledWith("room42");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: "abc123" });
    });

    test("returns 400 when roomId is missing", async () => {
      const res = await supertest(app).post("/api/room/code").send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "roomId required" });
    });
  });

  describe("security headers", () => {
    test("applies helmet security headers to responses", async () => {
      const res = await supertest(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
    });

    test("public images can be shown by other sites (link previews); everything else stays same-origin", async () => {
      for (const p of ["/og-image.jpg", "/icons/icon-192.png", "/screenshots/game.JPG", "/favicon.ico"]) {
        const res = await supertest(app).get(p);
        expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      }
      const head = await supertest(app).head("/og-image.jpg");
      expect(head.headers["cross-origin-resource-policy"]).toBe("cross-origin");

      for (const p of ["/api/health", "/", "/main.js", "/admin/logo.png"]) {
        const res = await supertest(app).get(p);
        expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
      }
      const post = await supertest(app).post("/og-image.jpg");
      expect(post.headers["cross-origin-resource-policy"]).toBe("same-origin");
    });
  });

  describe("SPA fallback", () => {
    test("falls back to a 404 for unknown non-API routes when client/dist doesn't exist", async () => {
      const res = await supertest(app).get("/some/client/route");
      expect(res.status).toBe(404);
    });

    test("does not intercept /api/* routes that don't exist", async () => {
      const res = await supertest(app).get("/api/does-not-exist");
      expect(res.status).toBe(404);
    });

    test("marks room links noindex but leaves the leaderboard indexable", async () => {
      const room = await supertest(app).get("/k7qx2m");
      expect(room.headers["x-robots-tag"]).toBe("noindex");

      const leaderboard = await supertest(app).get("/leaderboard");
      expect(leaderboard.headers["x-robots-tag"]).toBeUndefined();
    });
  });

  describe("GET /api/player/:deviceId/stats", () => {
    test("returns player stats when found", async () => {
      statsService.getPlayerStats.mockResolvedValueOnce({ xp: 50, level: 2 });

      const res = await supertest(app).get("/api/player/dev1/stats");

      expect(statsService.getPlayerStats).toHaveBeenCalledWith("dev1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ xp: 50, level: 2 });
    });

    test("returns 404 when the player is not found", async () => {
      statsService.getPlayerStats.mockResolvedValueOnce(null);

      const res = await supertest(app).get("/api/player/unknown/stats");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Player not found" });
    });

    test("returns 500 when the service throws", async () => {
      statsService.getPlayerStats.mockRejectedValueOnce(new Error("db down"));

      const res = await supertest(app).get("/api/player/dev1/stats");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "unavailable" });
    });
  });

  describe("GET /api/player/:deviceId/card", () => {
    test("returns a combined share-card snapshot", async () => {
      userService.getProfile.mockResolvedValueOnce({ id: "u1", name: "Alice", avatar: "🐱", level: 3, xp: 375 });
      statsService.getPlayerStats.mockResolvedValueOnce({
        gamesPlayed: 10, survived: 4, totalWins: 25, consecutiveGameWins: 2, bestStreak: 5,
      });
      achievementService.getUnlocked.mockResolvedValueOnce(new Set(["first_win", "survivor", "veteran"]));

      const res = await supertest(app).get("/api/player/dev1/card");

      expect(userService.getProfile).toHaveBeenCalledWith("dev1");
      expect(achievementService.getUnlocked).toHaveBeenCalledWith("u1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        name: "Alice",
        avatar: "🐱",
        level: 3,
        xp: 375,
        xpLevelStart: 250,
        xpNextLevel: 500,
        levelProgress: 0.5,
        gamesPlayed: 10,
        gamesWon: 4,
        roundWins: 25,
        winRate: 40,
        currentStreak: 2,
        bestStreak: 5,
        achievementsUnlocked: 3,
        achievementsTotal: 20,
      });
    });

    test("returns 404 when the player is not found", async () => {
      userService.getProfile.mockResolvedValueOnce(null);

      const res = await supertest(app).get("/api/player/unknown/card");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Player not found" });
    });

    test("defaults winRate/gamesPlayed to 0 when stats are unavailable", async () => {
      userService.getProfile.mockResolvedValueOnce({ id: "u1", name: "Bob", avatar: "🐶", level: 1 });
      statsService.getPlayerStats.mockResolvedValueOnce(null);
      achievementService.getUnlocked.mockResolvedValueOnce(new Set());

      const res = await supertest(app).get("/api/player/dev2/card");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        name: "Bob",
        avatar: "🐶",
        level: 1,
        xp: 0,
        xpLevelStart: 0,
        xpNextLevel: 100,
        levelProgress: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        roundWins: 0,
        winRate: 0,
        currentStreak: 0,
        bestStreak: 0,
        achievementsUnlocked: 0,
        achievementsTotal: 20,
      });
    });

    test("returns 500 when the profile lookup throws", async () => {
      userService.getProfile.mockRejectedValueOnce(new Error("db down"));

      const res = await supertest(app).get("/api/player/dev1/card");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "unavailable" });
    });
  });
});

describe("server.js redis adapter setup", () => {
  afterEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_ADAPTER_URL;
    jest.dontMock("@socket.io/redis-adapter");
    jest.dontMock("redis");
  });

  test("activates the redis adapter when REDIS_ADAPTER_URL is set and clients connect", async () => {
    process.env.REDIS_ADAPTER_URL = "redis://adapter-host:6379";
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    let mod;
    jest.isolateModules(() => {
      mod = require("../server");
    });

    await flush();
    await flush();

    expect(mockIoAdapter).toHaveBeenCalled();
    consoleLogSpy.mockRestore();
    if (mod.server?.listening) {
      await new Promise((r) => mod.server.close(r));
    }
  });

  test("warns when the redis-adapter package cannot be loaded", async () => {
    process.env.REDIS_ADAPTER_URL = "redis://adapter-host:6379";
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    jest.doMock("@socket.io/redis-adapter", () => {
      throw new Error("Cannot find module");
    });

    let mod;
    jest.isolateModules(() => {
      mod = require("../server");
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("redis-adapter module missing"),
      expect.any(String)
    );
    consoleWarnSpy.mockRestore();
    if (mod.server?.listening) {
      await new Promise((r) => mod.server.close(r));
    }
  });

  test("warns when the redis-adapter clients fail to connect", async () => {
    process.env.REDIS_ADAPTER_URL = "redis://adapter-host:6379";
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    jest.doMock("redis", () => ({
      createClient: jest.fn(() => ({
        connect: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
        duplicate: jest.fn(() => ({
          connect: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
        })),
      })),
    }));

    let mod;
    jest.isolateModules(() => {
      mod = require("../server");
    });

    await flush();
    await flush();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("redis-adapter unavailable"),
      expect.any(String)
    );
    consoleWarnSpy.mockRestore();
    if (mod.server?.listening) {
      await new Promise((r) => mod.server.close(r));
    }
  });

  // Keep last in this block: afterEach's jest.dontMock("redis") would otherwise
  // swap the auto-mocked redis for the real client in the tests that follow.
  test("does not activate the redis adapter from REDIS_URL alone (single instance)", async () => {
    process.env.REDIS_URL = "redis://adapter-host:6379";
    mockIoAdapter.mockClear();

    let mod;
    jest.isolateModules(() => {
      mod = require("../server");
    });

    await flush();
    await flush();

    expect(mockIoAdapter).not.toHaveBeenCalled();
    if (mod.server?.listening) {
      await new Promise((r) => mod.server.close(r));
    }
  });
});

describe("server.js /api/stats cache", () => {
  afterEach(() => {
    process.env.STATS_CACHE_MS = "0";
  });

  test("serves repeat polls from cache instead of re-scanning Redis", async () => {
    process.env.STATS_CACHE_MS = "60000";
    let mod;
    let redis;
    jest.isolateModules(() => {
      mod = require("../server");
      redis = require("../redisClient");
    });
    redis.keys.mockResolvedValue(["room:1"]);
    redis.get.mockResolvedValue(JSON.stringify({ users: [{ socketId: "a" }], game: null }));

    const first = await supertest(mod.app).get("/api/stats");
    const second = await supertest(mod.app).get("/api/stats");

    expect(first.body).toEqual({ activeRooms: 1, activePlayers: 1, gamesInProgress: 0 });
    expect(second.body).toEqual(first.body);
    expect(redis.keys).toHaveBeenCalledTimes(1);
    if (mod.server?.listening) {
      await new Promise((r) => mod.server.close(r));
    }
  });
});
