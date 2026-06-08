// server/socketHandlers/emote.js
// Quick emoji reactions during gameplay.
// Rate-limited: max 3 emotes per 4 seconds per socket.
var rateLimiter = require("../utils/rateLimiter");
var roomManager = require("../utils/roomManager");

var VALID_EMOTES = ["😂", "😱", "🔥", "💀", "🤔", "👏"];
var EMOTE_RATE_MAX = 3;
var EMOTE_RATE_WINDOW_MS = 4000;

module.exports = function handleEmoteEvents(io, socket) {
  socket.on("send_emote", async function(data) {
    var roomId = data && data.roomId;
    var emote = data && data.emote;

    if (!roomId || !emote) return;
    if (!VALID_EMOTES.includes(emote)) return; // whitelist only

    if (!rateLimiter.isAllowed(socket.id, "emote", EMOTE_RATE_MAX, EMOTE_RATE_WINDOW_MS)) {
      return; // silently drop — no error needed for emotes
    }

    var room = await roomManager.getRoomById(roomId);
    if (!room) return;

    var sender = room.users.find(function(u) { return u.socketId === socket.id; });
    if (!sender) return;

    io.to(roomId).emit("emote_received", {
      socketId: socket.id,
      name: sender.name,
      avatar: sender.avatar,
      emote: emote,
    });
  });
};
