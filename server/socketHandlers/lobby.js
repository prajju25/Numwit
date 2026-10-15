const {
  addUserToRoom,
  removeUserFromRoom,
  getPublicRooms,
  getRoomById,
  deleteRoom,
  saveRoom,
} = require("../utils/roomManager");
const constants = require("../constants/constants");
const { MIN_PLAYERS, BOT_FILL_DELAY_MS } = constants;
const { clear: clearRateLimit } = require("../utils/rateLimiter");
const { upsertUser } = require("../db/userService");
const timerService = require("../services/timerService");
const botService = require("../services/botService");
const roomCleanup = require("../services/roomCleanup");
const gameHandlers = require("./game");
const startGameForRoom = gameHandlers.startGameForRoom;
const normalizeDifficulty = require("../services/botBrain").normalizeDifficulty;

// ── Reconnection grace-period state ───────────────────────────────────────────
// When a user disconnects (e.g. mobile switching apps) we wait 60 s before
// actually removing them from the room. If they rejoin within that window the
// timer is cancelled and the game continues as if nothing happened.
const DISCONNECT_GRACE_MS = 60 * 1000;
const pendingDisconnects = {};  // deviceId  → { timer, oldSocketId, roomId }
const socketToDevice    = {};   // socketId  → deviceId
const socketToRoom      = {};   // socketId  → roomId

module.exports = function handleLobbyEvents(io, socket) {

  socket.on("join_room", async function(data) {
    const roomId   = data.roomId;
    const user     = data.user;
    const roomType = data.roomType;
    const deviceId = data.deviceId || null;   // Phase 4: device identity

    console.debug(`Socket: "join_room" Room=${roomId} User=${user?.name} Type=${roomType}`);

    // Persist / update user record in DB (fire-and-forget, non-blocking)
    if (deviceId && user?.name) {
      upsertUser(deviceId, user.name, user.avatar || "😎").catch(() => {});
    }

    // Cancel any pending grace-period disconnect for this device.
    // Save it first — we may need to clean up the old room below if the user
    // is joining a *different* room (e.g. starting a brand-new solo game while
    // the grace timer is still counting down for a previous room).
    let cancelledPending = null;
    if (deviceId && pendingDisconnects[deviceId]) {
      cancelledPending = pendingDisconnects[deviceId];
      clearTimeout(cancelledPending.timer);
      delete pendingDisconnects[deviceId];
      console.log(`Reconnect: cancelled disconnect timer for deviceId ${deviceId}`);
    }

    let roomNo = roomId;
    let isNewPublicRoom = false;
    let isReconnectToSameRoom = false;

    // Reconnect fast-path: this device just had a grace-period timer running
    // (see DISCONNECT_GRACE_MS above) — meaning it dropped out of a room very
    // recently, most likely a mobile user backgrounding the tab. Send them
    // straight back into that exact room instead of running it through public
    // matchmaking / room creation, which could otherwise land them in a
    // *different* public room than the one they (and their game state) left.
    if (cancelledPending) {
      const stillExists = await getRoomById(cancelledPending.roomId);
      if (stillExists) {
        roomNo = cancelledPending.roomId;
        isReconnectToSameRoom = true;
        console.log(`Reconnect: returning deviceId ${deviceId} to previous room ${roomNo}`);
      }
    }

    if (!isReconnectToSameRoom) {
      // Public room: find an existing joinable room (O(1) via Redis SET)
      if (roomType === "public") {
        const publicRoom = await getPublicRooms();
        roomNo = publicRoom?.id;
        console.debug(`Socket: "join_room" public room found: ${roomNo}`);
        if (!roomNo) isNewPublicRoom = true;
      }

      // No room found — create a new one
      if (!roomNo) {
        roomNo = Math.random().toString(36).substring(2, 8);
        console.debug(`Socket: "join_room" new room created: ${roomNo}`);
      }
    }

    // If the user cancelled a grace-period for a DIFFERENT room (e.g. they
    // started a new solo game instead of rejoining the previous one), remove
    // them from the old room immediately.  Without this the old room keeps a
    // ghost "disconnected" user entry forever and cleanupIfBotsOnly never fires.
    if (cancelledPending && cancelledPending.roomId !== roomNo) {
      console.log(`Joining different room — cleaning up old room ${cancelledPending.roomId}`);
      const abandonedRoom = await removeUserFromRoom(cancelledPending.oldSocketId);
      if (abandonedRoom) {
        await handlePostRemove(io, abandonedRoom);
      }
    }

    try {
      socket.join(roomNo);
      user.socketId = socket.id;
      // Phase 4: tag the in-room user with their stable device id so
      // addUserToRoom can replace a stale entry from a previous connection
      // (e.g. a page refresh, which gets a brand-new socket.id) instead of
      // leaving a duplicate row behind.
      if (deviceId) user.deviceId = deviceId;
      const room = await addUserToRoom(roomNo, user, roomType, !roomId);

      // Track socket → device/room for grace-period reconnection
      if (deviceId) socketToDevice[socket.id] = deviceId;
      socketToRoom[socket.id] = roomNo;

      // Clear any stale disconnected flag left by a previous grace period
      const rejoiningUser = room.users.find(function(u) { return u.socketId === socket.id; });
      if (rejoiningUser?.disconnected) {
        rejoiningUser.disconnected = false;
        await saveRoom(room);
      }

      // Schedule idle-delete for new public/private waiting rooms.
      // Solo rooms start immediately so no idle timer is needed for them.
      // The timer is cancelled in startGameForRoom when the game kicks off.
      if (roomType !== "solo" && !room.game && !roomId) {
        roomCleanup.scheduleIdleDelete(io, roomNo);
      }

      // Play vs Computer: always a brand-new, single-occupant room. Fill it
      // with bots up to MIN_PLAYERS immediately (no countdown, no waiting
      // room) and start the game right away. See PLAY_VS_COMPUTER_PROPOSAL.md.
      if (roomType === "solo" && !room.game) {
        const addedSoloBots = botService.fillRoomWithBots(room, MIN_PLAYERS);
        // Kept on the room so "Play again" uses the same difficulty
        room.botDifficulty = normalizeDifficulty(data.botDifficulty);
        await saveRoom(room);

        io.to(roomNo).emit("room_update", room);
        if (addedSoloBots.length > 0) {
          io.to(roomNo).emit("bots_added", { roomId: roomNo, bots: addedSoloBots });
        }

        await startGameForRoom(io, roomNo, { botDifficulty: room.botDifficulty });
        return;
      }

      // Bot-fill: a brand-new public room has nobody to match with yet.
      // Schedule a one-shot check — if it's still below MIN_PLAYERS after
      // BOT_FILL_DELAY_MS, the server pads it with bots and starts the game
      // itself (see fillRoomWithBotsAndStart below). Can be disabled entirely
      // via the BOT_FILL_ENABLED env var.
      if (constants.BOT_FILL_ENABLED && isNewPublicRoom && !room.game && room.users.length < MIN_PLAYERS) {
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

        const timeLeft = timerService.getTimeLeft(roomNo);
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
      console.error(`join_room error: ${err.message}`);
      socket.emit("error_message", { message: err.message });
    }
  });

  socket.on("leave_room", async function(callback) {
    console.debug(`Socket: "leave_room" ${socket.id}`);

    // Intentional leave — cancel any pending grace timer and clean up maps
    const dId = socketToDevice[socket.id];
    if (dId && pendingDisconnects[dId]) {
      clearTimeout(pendingDisconnects[dId].timer);
      delete pendingDisconnects[dId];
    }
    delete socketToDevice[socket.id];
    delete socketToRoom[socket.id];

    const room = await removeUserFromRoom(socket.id);
    if (room) {
      socket.leave(room.id);
      roomCleanup.cancelPostGameDelete(room.id);
      roomCleanup.cancelIdleDelete(room.id);
      await cleanupIfBotsOnly(io, room);
      if (callback) callback({ status: "ok" });
    } else {
      if (callback) callback({ status: "error", message: "User not in a room" });
    }
  });

  socket.on("disconnect", async function() {
    console.log(`Socket: "disconnect" ${socket.id}`);

    clearRateLimit(socket.id);

    const deviceId = socketToDevice[socket.id];
    const roomId   = socketToRoom[socket.id];
    delete socketToDevice[socket.id];
    delete socketToRoom[socket.id];

    // Grace period: if we know the device, hold the room slot for 60 s so a
    // mobile user switching apps (or a brief network drop) can come back.
    if (deviceId && roomId) {
      const room = await getRoomById(roomId);
      if (room) {
        // Mark user as temporarily disconnected so the client can show it
        const disconnectedUser = room.users.find(function(u) { return u.socketId === socket.id; });
        if (disconnectedUser) {
          disconnectedUser.disconnected = true;
          await saveRoom(room);
          io.to(room.id).emit("room_update", room);
        }

        const oldSocketId = socket.id;
        pendingDisconnects[deviceId] = {
          oldSocketId: oldSocketId,
          roomId: roomId,
          timer: setTimeout(async function() {
            delete pendingDisconnects[deviceId];
            console.log(`Grace period expired for deviceId ${deviceId} — removing from room`);
            const r = await removeUserFromRoom(oldSocketId);
            if (r) {
              await handlePostRemove(io, r);
            }
          }, DISCONNECT_GRACE_MS),
        };

        console.log(`Disconnect grace period started for deviceId ${deviceId} (60s)`);
        return;
      }
    }

    // No deviceId (anonymous) or room already gone — immediate cleanup
    const r = await removeUserFromRoom(socket.id);
    if (r) {
      await handlePostRemove(io, r);
    }
    console.log("User disconnected (immediate):", socket.id);
  });
};

// ── handlePostRemove ──────────────────────────────────────────────────────────
// Called after a user is fully removed from a room (grace period expired or
// immediate). Triggers game_over if too few active players remain, then
// cleans up bot-only rooms.
async function handlePostRemove(io, room) {
  if (room.game) {
    const activePlayers = room.users.filter(function(u) {
      return room.game.eliminatedPlayers.indexOf(u.socketId) === -1
        && room.game.turnOrder.indexOf(u.socketId) !== -1;
    });
    if (activePlayers.length < MIN_PLAYERS) {
      const lastPlayer = activePlayers[0];
      io.to(room.id).emit("game_over", {
        winnerSocketId: lastPlayer ? lastPlayer.socketId : null,
        points: room.game.points,
        reason: "opponent_disconnected",
      });
      // Schedule 5-min post-game delete (cancelled if a real user clicks Play Again)
      roomCleanup.schedulePostGameDelete(io, room.id);
    }
  }
  await cleanupIfBotsOnly(io, room);
}

// ── cleanupIfBotsOnly ──────────────────────────────────────────────────────
// If the room that just lost a real user now contains only bots, tear it
// down — bots never "play alone". Otherwise broadcast the usual room_update.
async function cleanupIfBotsOnly(io, room) {
  if (botService.hasOnlyBots(room)) {
    roomCleanup.cancelPostGameDelete(room.id);
    roomCleanup.cancelIdleDelete(room.id);
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
  const room = await getRoomById(roomId);
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

  const addedBots = botService.fillRoomWithBots(room, MIN_PLAYERS);
  room.botFillAt = null;
  await saveRoom(room);

  roomCleanup.cancelIdleDelete(roomId);

  io.to(roomId).emit("room_update", room);
  if (addedBots.length > 0) {
    io.to(roomId).emit("bots_added", { roomId: roomId, bots: addedBots });
  }

  await startGameForRoom(io, roomId, {});
}
