// server/routes/admin.js
// Read-only-ish admin API: live room stats + feedback inbox management.
// All routes here are mounted under /api/admin and gated by adminAuth
// (HTTP Basic Auth, see ../middleware/adminAuth.js).

const express = require("express");
const roomManager = require("../utils/roomManager");
const feedbackService = require("../db/feedbackService");
const userService = require("../db/userService");
const timerService = require("../services/timerService");
const botService = require("../services/botService");
const statsService = require("../db/statsService");

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

// -- GET /api/admin/leaderboard -------------------------------------------------------
// Weekly leaderboard with configurable limit (default 50, max 100) for the admin UI.
router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const board = await statsService.getWeeklyLeaderboard(limit);
    res.json({ leaderboard: board || [] });
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

module.exports = router;
