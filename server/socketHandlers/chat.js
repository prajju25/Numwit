// server/socketHandlers/chat.js
// Handles waiting-room chat + typing indicators.
const rateLimiter = require("../utils/rateLimiter");
const roomManager = require("../utils/roomManager");

const MAX_CHAT_LENGTH = 200;
const CHAT_RATE_MAX = 5;
const CHAT_RATE_WINDOW_MS = 5000;

// Debounce typing broadcasts: max 1 player_typing per socket per second
const typingTimers = new Map(); // socketId → clearTimeout handle

module.exports = function handleChatEvents(io, socket) {

  // ── room_chat ───────────────────────────────────────────────────────────────
  socket.on("room_chat", async function(data) {
    const roomId = data && data.roomId;
    let message = data && data.message;

    if (!roomId || !message) return;

    message = String(message).replace(/<[^>]*>/g, "").trim().slice(0, MAX_CHAT_LENGTH);
    if (!message) return;

    if (!rateLimiter.isAllowed(socket.id, "chat", CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS)) {
      return socket.emit("chat_rate_limited", { message: "Slow down — too many messages!" });
    }

    const room = await roomManager.getRoomById(roomId);
    if (!room) return;

    const sender = room.users.find(function(u) { return u.socketId === socket.id; });
    if (!sender) return;

    // Clear typing indicator when a message is sent
    _clearTyping(io, socket, roomId);

    io.to(roomId).emit("chat_message", {
      socketId: socket.id,
      name: sender.name,
      avatar: sender.avatar,
      message: message,
      timestamp: Date.now(),
    });
  });

  // ── typing_start ────────────────────────────────────────────────────────────
  socket.on("typing_start", function(data) {
    const roomId = data && data.roomId;
    if (!roomId) return;

    // Debounce: only broadcast if not already throttled for this socket
    if (typingTimers.has(socket.id)) return;

    socket.to(roomId).emit("player_typing", { socketId: socket.id, isTyping: true });

    // Auto-clear typing after 3s without a refresh
    const timerId = setTimeout(function() {
      typingTimers.delete(socket.id);
      socket.to(roomId).emit("player_typing", { socketId: socket.id, isTyping: false });
    }, 3000);

    typingTimers.set(socket.id, { timerId, roomId });
  });

  // ── typing_stop ─────────────────────────────────────────────────────────────
  socket.on("typing_stop", function(data) {
    const roomId = data && data.roomId;
    if (!roomId) return;
    _clearTyping(io, socket, roomId);
  });

  // Clean up on disconnect
  socket.on("disconnect", function() {
    const entry = typingTimers.get(socket.id);
    if (entry) {
      clearTimeout(entry.timerId);
      socket.to(entry.roomId).emit("player_typing", { socketId: socket.id, isTyping: false });
      typingTimers.delete(socket.id);
    }
  });
};

function _clearTyping(io, socket, roomId) {
  const entry = typingTimers.get(socket.id);
  if (entry) {
    clearTimeout(entry.timerId);
    typingTimers.delete(socket.id);
    socket.to(roomId).emit("player_typing", { socketId: socket.id, isTyping: false });
  }
}
