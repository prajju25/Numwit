// server/routes/admin.js
// Admin API: live room stats, feedback inbox, and player clean-up
// (delete test players, merge duplicates).
// All routes here are mounted under /api/admin and gated by adminAuth
// (HTTP Basic Auth, see ../middleware/adminAuth.js).

const express = require("express");
const roomManager = require("../utils/roomManager");
const feedbackService = require("../db/feedbackService");
const userService = require("../db/userService");
const timerService = require("../services/timerService");
const botService = require("../services/botService");
const statsService = require("../db/statsService");
const metricsService = require("../db/metricsService");
const playerAdminService = require("../db/playerAdminService");

const router = express.Router();

// -- GET /api/admin/stats ------------------------------------------------------------
// Live room/player counts, a feedback-status breakdown, and the all-time
// total of unique players (by device, from Postgres), for the dashboard's
// overview cards.
router.get("/stats", async (req, res) => {
  try {
    const [rooms, feedback, totalUsers] = await Promise.all([
      roomManager.getRoomCounts(),
      feedbackService.getFeedbackCounts(),
      userService.getTotalUsers(),
    ]);
    res.json({ rooms, feedback, users: { total: totalUsers } });
  } catch (err) {
    console.error("GET /api/admin/stats error:", err.message);
    res.status(500).json({ error: "stats unavailable" });
  }
});

// -- GET /api/admin/metrics -----------------------------------------------------------
// Growth metrics from real players: weekly active players, returning players,
// new players, games, logged rounds, and a 14-day daily-active series.
router.get("/metrics", async (req, res) => {
  try {
    const metrics = await metricsService.getGrowthMetrics();
    if (!metrics) return res.status(503).json({ error: "database unavailable" });
    res.json(metrics);
  } catch (err) {
    console.error("GET /api/admin/metrics error:", err.message);
    res.status(500).json({ error: "metrics unavailable" });
  }
});

// -- GET /api/admin/rooms -------------------------------------------------------------
// Full list of active rooms (id, type, players, in-progress status) for the
// dashboard's "active rooms" cards.
router.get("/rooms", async (req, res) => {
  try {
    const rooms = await roomManager.getActiveRooms();
    res.json({ rooms });
  } catch (err) {
    console.error("GET /api/admin/rooms error:", err.message);
    res.status(500).json({ error: "rooms unavailable" });
  }
});

// -- GET /api/admin/feedback ---------------------------------------------------------
// List feedback rows, optionally filtered by status/category, with pagination.
router.get("/feedback", async (req, res) => {
  try {
    const limit = Number(req.query.limit);
    const offset = Number(req.query.offset);

    const items = await feedbackService.listFeedback({
      status: req.query.status,
      category: req.query.category,
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });

    res.json({ feedback: items });
  } catch (err) {
    console.error("GET /api/admin/feedback error:", err.message);
    res.status(500).json({ error: "feedback unavailable" });
  }
});

// -- DELETE /api/admin/rooms/:id ------------------------------------------------------
// Force-delete a room by ID. Clears timers and bot state, then removes from Redis.
router.delete("/rooms/:id", async (req, res) => {
  const roomId = req.params.id;
  try {
    // Always clear in-memory state (no-ops if room isn't tracked)
    timerService.clearTimer(roomId);
    botService.removeRoom(roomId);
    // Delete from Redis — idempotent: if already gone that's fine
    await roomManager.deleteRoom(roomId);
    res.json({ ok: true, deleted: roomId });
  } catch (err) {
    console.error(`DELETE /api/admin/rooms/${roomId} error:`, err.message);
    res.status(500).json({ error: "delete failed" });
  }
});

// -- GET /api/admin/leaderboard?period=week|all&page=1&pageSize=10 ---------------------
// One page of the leaderboard plus the total, so the admin can page through
// every player without loading them all. Rank = position in the full list.
router.get("/leaderboard", async (req, res) => {
  try {
    const period   = req.query.period === "all" ? "all" : "week";
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 10), 100);
    const total    = await statsService.countLeaderboardPlayers(period);
    const pages    = Math.max(1, Math.ceil(total / pageSize));
    const page     = Math.min(Math.max(1, Number(req.query.page) || 1), pages);
    const offset   = (page - 1) * pageSize;
    const board    = period === "all"
      ? await statsService.getAllTimeLeaderboard(pageSize, offset)
      : await statsService.getWeeklyLeaderboard(pageSize, offset);
    res.json({
      leaderboard: (board || []).map((e, i) => ({ ...e, rank: offset + i + 1 })),
      period, page, pageSize, total, pages,
    });
  } catch (err) {
    console.error("GET /api/admin/leaderboard error:", err.message);
    res.status(500).json({ error: "leaderboard unavailable", leaderboard: [] });
  }
});

// -- PATCH /api/admin/feedback/:id ----------------------------------------------------
// Update a feedback row's status (open | in_review | resolved).
router.patch("/feedback/:id", async (req, res) => {
  const { status } = req.body || {};

  if (!feedbackService.VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const updated = await feedbackService.updateFeedbackStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: "Feedback not found" });
    res.json(updated);
  } catch (err) {
    console.error(`PATCH /api/admin/feedback/${req.params.id} error:`, err.message);
    res.status(500).json({ error: "update failed" });
  }
});

// -- Players (clean-up) --------------------------------------------------------------
// One player = one browser (deviceId), so the same person on two devices or
// in incognito shows up more than once. Errors are reported, never hidden.
const fail = (res, where, err) => {
  console.error(where + " error:", err.message);
  res.status(500).json({ error: err.message });
};

// GET /api/admin/players?q=&page=1 — one page of players, newest first
router.get("/players", async (req, res) => {
  try {
    const result = await playerAdminService.listPlayers({ q: req.query.q, page: req.query.page });
    res.json(result || { players: [], total: 0, page: 1, pages: 1 });
  } catch (err) {
    fail(res, "GET /api/admin/players", err);
  }
});

// GET /api/admin/players/:id/delete-preview — what a delete would remove
router.get("/players/:id/delete-preview", async (req, res) => {
  try {
    const preview = await playerAdminService.deletePreview(req.params.id);
    if (!preview) return res.status(404).json({ error: "Player not found" });
    res.json(preview);
  } catch (err) {
    fail(res, "GET delete-preview", err);
  }
});

// DELETE /api/admin/players/:id — permanently delete a player and their records
router.delete("/players/:id", async (req, res) => {
  try {
    const result = await playerAdminService.deletePlayer(req.params.id);
    if (!result) return res.status(404).json({ error: "Player not found" });
    res.json(result);
  } catch (err) {
    fail(res, "DELETE /api/admin/players", err);
  }
});

// POST /api/admin/players/merge  { sourceId, targetId } — source is folded into target
router.post("/players/merge", async (req, res) => {
  const { sourceId, targetId } = req.body || {};
  if (!sourceId || !targetId || sourceId === targetId) {
    return res.status(400).json({ error: "Pick two different players" });
  }
  try {
    const result = await playerAdminService.mergePlayers(sourceId, targetId);
    if (!result) return res.status(404).json({ error: "Player not found" });
    res.json(result);
  } catch (err) {
    fail(res, "POST /api/admin/players/merge", err);
  }
});

module.exports = router;
