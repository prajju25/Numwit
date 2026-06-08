const {
  addUserToRoom,
  removeUserFromRoom,
  getPublicRooms,
} = require("../utils/roomManager");
const { MIN_PLAYERS } = require("../constants/constants");
const { clear: clearRateLimit } = require("../utils/rateLimiter");
const { upsertUser } = require("../db/userService");
const timerService = require("../services/timerService");
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

    // Public room: find an existing joinable room (O(1) via Redis SET)
    if (roomType === "public") {
      var publicRoom = await getPublicRooms();
      roomNo = publicRoom && publicRoom.id;
      console.debug('Socket: "join_room" public room found: ' + roomNo);
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
      io.to(room.id).emit("room_update", room);
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
      io.to(room.id).emit("room_update", room);

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
    }
    console.log("User disconnected:", socket.id);
  });
};
