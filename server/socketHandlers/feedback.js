// server/socketHandlers/feedback.js
// Handles in-app user feedback (bug reports / feature requests / comments).
const rateLimiter = require("../utils/rateLimiter");
const feedbackService = require("../db/feedbackService");

const FEEDBACK_RATE_MAX = 3;
const FEEDBACK_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes per socket
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 60;
const MAX_CONTEXT_LENGTH = 200;

module.exports = function handleFeedbackEvents(io, socket) {

  // ── submit_feedback ────────────────────────────────────────────────────────
  socket.on("submit_feedback", async function(data, callback) {
    data = data || {};

    const message = String(data.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message) {
      if (callback) callback({ status: "error", message: "Feedback message is required" });
      return;
    }

    if (!rateLimiter.isAllowed(socket.id, "feedback", FEEDBACK_RATE_MAX, FEEDBACK_RATE_WINDOW_MS)) {
      if (callback) callback({ status: "error", message: "Too many submissions — please try again later." });
      return;
    }

    const userAgent = (socket.handshake && socket.handshake.headers && socket.handshake.headers["user-agent"]) || null;

    try {
      const result = await feedbackService.createFeedback({
        deviceId:  data.deviceId || null,
        name:      data.name ? String(data.name).trim().slice(0, MAX_NAME_LENGTH) : null,
        category:  data.category,
        message:   message,
        context:   data.context ? String(data.context).trim().slice(0, MAX_CONTEXT_LENGTH) : null,
        userAgent: userAgent,
      });

      if (!result) {
        if (callback) callback({ status: "error", message: "Failed to save feedback. Please try again later." });
        return;
      }

      if (callback) callback({ status: "ok", id: result.id });
    } catch (err) {
      console.error('submit_feedback error: ' + err.message);
      if (callback) callback({ status: "error", message: "Failed to submit feedback" });
    }
  });
};
