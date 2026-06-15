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

const roomManager = require("../../utils/roomManager");
const feedbackService = require("../../db/feedbackService");
const userService = require("../../db/userService");
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
});
