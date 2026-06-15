const {
  addUserToRoom,
  removeUserFromRoom,
  getPublicRooms,
  getRoomById,
  deleteRoom,
} = require("../utils/roomManager");
const { MIN_PLAYERS, BOT_FILL_DELAY_MS } = require("../constants/constants");
const { clear: clearRateLimit } = require("../utils/rateLimiter");
const { upsertUser } = require("../db/userService");
const timerService = require("../services/timerService");
const botService = require("../services/botService");
const gameHandlers = require("./game");
const startGameForRoom = gameHandlers.startGameForRoom;
const saveRoom = require("../utils/roomManager").saveRoom;

module.exports = function handleLobbyEvents(io, socket) {

  socket.on("join_room", async function(data) {
    var roomId   = data.roomId;
    var user     = data.user;
    var roomType = data.roomType;
    var deviceId = data.deviceId || null;   // Phase 4: device identity

    console.debug('Socket: "join_room" Room=' + roomId + ' User=' + (user && user.name) + ' Type=' + roomType);

    // Persist / update user record in DB (fire-and-forget, non-blocking)
    if (deviceId && user && user.name) {
      upsertUser(deviceId, user.name, user.avatar || "😎").catch(() => {});
    }

    var roomNo = roomId;
    var isNewPublicRoom = false;

    // Public room: find an existing joinable room (O(1) via Redis SET)
    if (roomType === "public") {
      var publicRoom = await getPublicRooms();
      roomNo = publicRoom && publicRoom.id;
      console.debug('Socket: "join_room" public room found: ' + roomNo);
      if (!roomNo) isNewPublicRoom = true;
    }

    // No room found — create a new one
    if (!roomNo) {
      roomNo = Math.random().toString(36).substring(2, 8);
      console.debug('Socket: "join_room" new room created: ' + roomNo);
    }

    try {
      socket.join(roomNo);
      user.socketId = socket.id;
      var room = await addUserToRoom(roomNo, user, roomType, !roomId);

      // Play vs Computer: always a brand-new, single-occupant room. Fill it
      // with bots up to MIN_PLAYERS immediately (no countdown, no waiting
      // room) and start the game right away. See PLAY_VS_COMPUTER_PROPOSAL.md.
      if (roomType === "solo" && !room.game) {
        var addedSoloBots = botService.fillRoomWithBots(room, MIN_PLAYERS);
        await saveRoom(room);

        io.to(roomNo).emit("room_update", room);
        if (addedSoloBots.length > 0) {
          io.to(roomNo).emit("bots_added", { roomId: roomNo, bots: addedSoloBots });
        }

        await startGameForRoom(io, roomNo, {});
        return;
      }

      // Bot-fill: a brand-new public room has nobody to match with yet.
      // Schedule a one-shot check — if it's still below MIN_PLAYERS after
      // BOT_FILL_DELAY_MS, the server pads it with bots and starts the game
      // itself (see fillRoomWithBotsAndStart below).
      if (isNewPublicRoom && !room.game && room.users.length < MIN_PLAYERS) {
        room.botFillAt = Date.now() + BOT_FILL_DELAY_MS;
        await saveRoom(room);
        botService.scheduleBotFill(roomNo, BOT_FILL_DELAY_MS, function(rid) {
          fillRoomWithBotsAndStart(io, rid);
        });
      }

      io.to(roomNo).emit("room_update", room);

      // If a game is already in progress, queue this player for the next round
      // and send them a snapshot so they land directly on the GameBoard.
      if (room.game) {
        room.game.pendingJoiners = room.game.pendingJoiners || [];
        // Avoid duplicates (e.g. rapid reconnect)
        if (room.game.pendingJoiners.indexOf(socket.id) === -1) {
          room.game.pendingJoiners.push(socket.id);
        }
        await saveRoom(room);

        var timeLeft = timerService.getTimeLeft(roomNo);
        socket.emit("game_in_progress", {
          round:             room.game.round,
          points:            room.game.points,
          turnOrder:         room.game.turnOrder,
          eliminatedPlayers: room.game.eliminatedPlayers,
          hostSocketId:      room.hostSocketId,
          timerDuration:     timeLeft !== null ? timeLeft : 0,
          gameSettings:      room.game.settings,
        });
      }
    } catch (err) {
      console.error('join_room error: ' + err.message);
      socket.emit("error_message", { message: err.message });
    }
  });

  socket.on("leave_room", async function(callback) {
    console.debug('Socket: "leave_room" ' + socket.id);
    var room = await removeUserFromRoom(socket.id);
    if (room) {
      socket.leave(room.id);
      await cleanupIfBotsOnly(io, room);
      if (callback) callback({ status: "ok" });
    } else {
      if (callback) callback({ status: "error", message: "User not in a room" });
    }
  });

  socket.on("disconnect", async function() {
    console.log('Socket: "disconnect" ' + socket.id);

    clearRateLimit(socket.id);

    var room = await removeUserFromRoom(socket.id);
    if (room) {
      if (room.game) {
        var activePlayers = room.users.filter(function(u) {
          return room.game.eliminatedPlayers.indexOf(u.socketId) === -1
            && room.game.turnOrder.indexOf(u.socketId) !== -1;
        });
        if (activePlayers.length < MIN_PLAYERS) {
          var lastPlayer = activePlayers[0];
          io.to(room.id).emit("game_over", {
            winnerSocketId: lastPlayer ? lastPlayer.socketId : null,
            points: room.game.points,
            reason: "opponent_disconnected",
          });
        }
      }

      await cleanupIfBotsOnly(io, room);
    }
    console.log("User disconnected:", socket.id);
  });
};

// ── cleanupIfBotsOnly ──────────────────────────────────────────────────────
// If the room that just lost a real user now contains only bots, tear it
// down — bots never "play alone". Otherwise broadcast the usual room_update.
async function cleanupIfBotsOnly(io, room) {
  if (botService.hasOnlyBots(room)) {
    timerService.clearTimer(room.id);
    botService.removeRoom(room.id);
    await deleteRoom(room.id);
    return;
  }
  io.to(room.id).emit("room_update", room);
}

// ── fillRoomWithBotsAndStart ──────────────────────────────────────────────────
// Fired BOT_FILL_DELAY_MS after a brand-new public room was created. Re-reads
// the room — if real players already brought it up to MIN_PLAYERS (or the
// room/game state changed in the meantime), this is a no-op.
async function fillRoomWithBotsAndStart(io, roomId) {
  var room = await getRoomById(roomId);
  if (!room) return; // room was deleted in the meantime
  if (room.game) return; // already started by someone else

  if (room.users.length >= MIN_PLAYERS) {
    // Enough real players joined in time — just clear the pending-fill flag.
    if (room.botFillAt) {
      room.botFillAt = null;
      await saveRoom(room);
      io.to(roomId).emit("room_update", room);
    }
    return;
  }

  var addedBots = botService.fillRoomWithBots(room, MIN_PLAYERS);
  room.botFillAt = null;
  await saveRoom(room);

  io.to(roomId).emit("room_update", room);
  if (addedBots.length > 0) {
    io.to(roomId).emit("bots_added", { roomId: roomId, bots: addedBots });
  }

  await startGameForRoom(io, roomId, {});
}
