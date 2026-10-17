const express = require("express");
const supertest = require("supertest");

jest.mock("../../utils/roomManager", () => ({
  getRoomCounts: jest.fn(),
  getActiveRooms: jest.fn(),
}));
jest.mock("../../db/feedbackService", () => ({
  getFeedbackCounts: jest.fn(),
  listFeedback: jest.fn(),
  updateFeedbackStatus: jest.fn(),
  VALID_STATUSES: ["open", "in_review", "resolved"],
}));
jest.mock("../../db/userService", () => ({
  getTotalUsers: jest.fn(),
}));
jest.mock("../../db/metricsService", () => ({
  getGrowthMetrics: jest.fn(),
}));
jest.mock("../../db/statsService", () => ({
  getWeeklyLeaderboard: jest.fn(),
  getAllTimeLeaderboard: jest.fn(),
  countLeaderboardPlayers: jest.fn(),
}));
jest.mock("../../db/playerAdminService", () => ({
  listPlayers: jest.fn(),
  deletePreview: jest.fn(),
  deletePlayer: jest.fn(),
  mergePlayers: jest.fn(),
}));

const roomManager = require("../../utils/roomManager");
const feedbackService = require("../../db/feedbackService");
const userService = require("../../db/userService");
const metricsService = require("../../db/metricsService");
const playerAdminService = require("../../db/playerAdminService");
const statsService = require("../../db/statsService");
const adminRoutes = require("../admin");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRoutes);
  return app;
}

describe("admin routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/admin/metrics", () => {
    test("returns growth metrics", async () => {
      metricsService.getGrowthMetrics.mockResolvedValueOnce({ weeklyActivePlayers: 12 });
      const res = await supertest(makeApp()).get("/api/admin/metrics");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ weeklyActivePlayers: 12 });
    });

    test("returns 503 without a database and 500 on errors", async () => {
      metricsService.getGrowthMetrics.mockResolvedValueOnce(null);
      expect((await supertest(makeApp()).get("/api/admin/metrics")).status).toBe(503);

      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      metricsService.getGrowthMetrics.mockRejectedValueOnce(new Error("db down"));
      const res = await supertest(makeApp()).get("/api/admin/metrics");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "metrics unavailable" });
      errSpy.mockRestore();
    });
  });

  describe("GET /api/admin/stats", () => {
    test("returns combined room, feedback, and user counts", async () => {
      roomManager.getRoomCounts.mockResolvedValueOnce({ totalRooms: 2, totalPlayers: 4 });
      feedbackService.getFeedbackCounts.mockResolvedValueOnce({ open: 1, in_review: 0, resolved: 3 });
      userService.getTotalUsers.mockResolvedValueOnce(17);

      const res = await supertest(makeApp()).get("/api/admin/stats");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        rooms: { totalRooms: 2, totalPlayers: 4 },
        feedback: { open: 1, in_review: 0, resolved: 3 },
        users: { total: 17 },
      });
    });

    test("returns 500 if an underlying call throws", async () => {
      roomManager.getRoomCounts.mockRejectedValueOnce(new Error("redis down"));

      const res = await supertest(makeApp()).get("/api/admin/stats");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "stats unavailable" });
    });
  });

  describe("GET /api/admin/rooms", () => {
    test("returns the active rooms list", async () => {
      const mockRooms = [
        { id: "r1", type: "public", playerCount: 2, players: [{ name: "Alice", avatar: "cat", isBot: false }], inProgress: false, round: null },
      ];
      roomManager.getActiveRooms.mockResolvedValueOnce(mockRooms);

      const res = await supertest(makeApp()).get("/api/admin/rooms");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ rooms: mockRooms });
    });

    test("returns an empty array when no rooms are active", async () => {
      roomManager.getActiveRooms.mockResolvedValueOnce([]);

      const res = await supertest(makeApp()).get("/api/admin/rooms");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ rooms: [] });
    });

    test("returns 500 if getActiveRooms throws", async () => {
      roomManager.getActiveRooms.mockRejectedValueOnce(new Error("redis down"));

      const res = await supertest(makeApp()).get("/api/admin/rooms");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "rooms unavailable" });
    });
  });

  describe("GET /api/admin/feedback", () => {
    test("lists feedback with no filters", async () => {
      feedbackService.listFeedback.mockResolvedValueOnce([{ id: "f1", status: "open" }]);

      const res = await supertest(makeApp()).get("/api/admin/feedback");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ feedback: [{ id: "f1", status: "open" }] });
      expect(feedbackService.listFeedback).toHaveBeenCalledWith({
        status: undefined,
        category: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    test("passes through status/category/limit/offset query params", async () => {
      feedbackService.listFeedback.mockResolvedValueOnce([]);

      const res = await supertest(makeApp()).get(
        "/api/admin/feedback?status=open&category=bug&limit=10&offset=5"
      );

      expect(res.status).toBe(200);
      expect(feedbackService.listFeedback).toHaveBeenCalledWith({
        status: "open",
        category: "bug",
        limit: 10,
        offset: 5,
      });
    });

    test("returns 500 if listFeedback throws", async () => {
      feedbackService.listFeedback.mockRejectedValueOnce(new Error("db down"));

      const res = await supertest(makeApp()).get("/api/admin/feedback");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "feedback unavailable" });
    });
  });

  describe("PATCH /api/admin/feedback/:id", () => {
    test("updates status and returns the updated row", async () => {
      feedbackService.updateFeedbackStatus.mockResolvedValueOnce({ id: "f1", status: "resolved" });

      const res = await supertest(makeApp())
        .patch("/api/admin/feedback/f1")
        .send({ status: "resolved" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "f1", status: "resolved" });
      expect(feedbackService.updateFeedbackStatus).toHaveBeenCalledWith("f1", "resolved");
    });

    test("returns 400 for an invalid status", async () => {
      const res = await supertest(makeApp())
        .patch("/api/admin/feedback/f1")
        .send({ status: "bogus" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid status" });
      expect(feedbackService.updateFeedbackStatus).not.toHaveBeenCalled();
    });

    test("returns 404 when the feedback row doesn't exist", async () => {
      feedbackService.updateFeedbackStatus.mockResolvedValueOnce(null);

      const res = await supertest(makeApp())
        .patch("/api/admin/feedback/missing")
        .send({ status: "resolved" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Feedback not found" });
    });

    test("returns 500 if updateFeedbackStatus throws", async () => {
      feedbackService.updateFeedbackStatus.mockRejectedValueOnce(new Error("db down"));

      const res = await supertest(makeApp())
        .patch("/api/admin/feedback/f1")
        .send({ status: "resolved" });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "update failed" });
    });
  });

  describe("players", () => {
    beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
    afterEach(() => console.error.mockRestore());

    test("GET /players passes search and page through", async () => {
      const page = { players: [{ id: "u1", name: "Prajju" }], total: 1, page: 1, pages: 1 };
      playerAdminService.listPlayers.mockResolvedValueOnce(page);
      const res = await supertest(makeApp()).get("/api/admin/players?q=praj&page=2");
      expect(playerAdminService.listPlayers).toHaveBeenCalledWith({ q: "praj", page: "2" });
      expect(res.body).toEqual(page);

      playerAdminService.listPlayers.mockResolvedValueOnce(null);
      expect((await supertest(makeApp()).get("/api/admin/players")).body).toEqual({ players: [], total: 0, page: 1, pages: 1 });
    });

    test("errors are shown, not hidden", async () => {
      playerAdminService.listPlayers.mockRejectedValueOnce(new Error("Database unavailable"));
      const res = await supertest(makeApp()).get("/api/admin/players");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Database unavailable" });
    });

    test("GET /players/:id/delete-preview", async () => {
      playerAdminService.deletePreview.mockResolvedValueOnce({ games: 3 });
      expect((await supertest(makeApp()).get("/api/admin/players/u1/delete-preview")).body).toEqual({ games: 3 });
      expect(playerAdminService.deletePreview).toHaveBeenCalledWith("u1");

      playerAdminService.deletePreview.mockResolvedValueOnce(null);
      expect((await supertest(makeApp()).get("/api/admin/players/nope/delete-preview")).status).toBe(404);

      playerAdminService.deletePreview.mockRejectedValueOnce(new Error("boom"));
      expect((await supertest(makeApp()).get("/api/admin/players/u1/delete-preview")).status).toBe(500);
    });

    test("DELETE /players/:id", async () => {
      playerAdminService.deletePlayer.mockResolvedValueOnce({ deleted: "Tester" });
      const res = await supertest(makeApp()).delete("/api/admin/players/u9");
      expect(res.body).toEqual({ deleted: "Tester" });
      expect(playerAdminService.deletePlayer).toHaveBeenCalledWith("u9");

      playerAdminService.deletePlayer.mockResolvedValueOnce(null);
      expect((await supertest(makeApp()).delete("/api/admin/players/u9")).status).toBe(404);

      playerAdminService.deletePlayer.mockRejectedValueOnce(new Error("boom"));
      expect((await supertest(makeApp()).delete("/api/admin/players/u9")).status).toBe(500);
    });

    test("POST /players/merge", async () => {
      playerAdminService.mergePlayers.mockResolvedValueOnce({ merged: "Prajju", into: "Prajju" });
      const res = await supertest(makeApp()).post("/api/admin/players/merge").send({ sourceId: "phone", targetId: "laptop" });
      expect(res.body).toEqual({ merged: "Prajju", into: "Prajju" });
      expect(playerAdminService.mergePlayers).toHaveBeenCalledWith("phone", "laptop");

      expect((await supertest(makeApp()).post("/api/admin/players/merge").send({ sourceId: "a", targetId: "a" })).status).toBe(400);
      expect((await supertest(makeApp()).post("/api/admin/players/merge")).status).toBe(400);

      playerAdminService.mergePlayers.mockResolvedValueOnce(null);
      expect((await supertest(makeApp()).post("/api/admin/players/merge").send({ sourceId: "a", targetId: "b" })).status).toBe(404);

      playerAdminService.mergePlayers.mockRejectedValueOnce(new Error("boom"));
      expect((await supertest(makeApp()).post("/api/admin/players/merge").send({ sourceId: "a", targetId: "b" })).status).toBe(500);
    });
  });

  describe("GET /leaderboard (paged)", () => {
    const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: "u" + i, name: "P" + i }));

    test("page 2 of the weekly board, ranked from 11", async () => {
      statsService.countLeaderboardPlayers.mockResolvedValueOnce(23);
      statsService.getWeeklyLeaderboard.mockResolvedValueOnce(rows(10));
      const res = await supertest(makeApp()).get("/api/admin/leaderboard?page=2");

      expect(statsService.countLeaderboardPlayers).toHaveBeenCalledWith("week");
      expect(statsService.getWeeklyLeaderboard).toHaveBeenCalledWith(10, 10);
      expect(res.body).toMatchObject({ period: "week", page: 2, pageSize: 10, total: 23, pages: 3 });
      expect(res.body.leaderboard[0]).toEqual({ id: "u0", name: "P0", rank: 11 });
    });

    test("all time, with a page past the end clamped to the last page", async () => {
      statsService.countLeaderboardPlayers.mockResolvedValueOnce(23);
      statsService.getAllTimeLeaderboard.mockResolvedValueOnce(rows(3));
      const res = await supertest(makeApp()).get("/api/admin/leaderboard?period=all&page=99");

      expect(statsService.getAllTimeLeaderboard).toHaveBeenCalledWith(10, 20);
      expect(res.body).toMatchObject({ period: "all", page: 3, pages: 3 });
      expect(res.body.leaderboard.map((e) => e.rank)).toEqual([21, 22, 23]);
    });

    test("no players yet → one empty page; bad input falls back to defaults", async () => {
      statsService.countLeaderboardPlayers.mockResolvedValueOnce(0);
      statsService.getWeeklyLeaderboard.mockResolvedValueOnce(null);
      const res = await supertest(makeApp()).get("/api/admin/leaderboard?page=abc&pageSize=0&period=nope");
      expect(res.body).toEqual({ leaderboard: [], period: "week", page: 1, pageSize: 10, total: 0, pages: 1 });
    });

    test("500 when the database query fails", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      statsService.countLeaderboardPlayers.mockRejectedValueOnce(new Error("db down"));
      const res = await supertest(makeApp()).get("/api/admin/leaderboard");
      expect(res.status).toBe(500);
      console.error.mockRestore();
    });
  });
});
