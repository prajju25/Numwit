const {
  addUserToRoom,
  removeUserFromRoom,
  getPublicRooms,
  getRoomById,
  deleteRoom,
  saveRoom,
} = require("../utils/roomManager");
const constants = require("../constants/constants");
const { MIN_PLAYERS, MAX_PLAYERS, BOT_FILL_DELAY_MS } = constants;
const { clear: clearRateLimit } = require("../utils/rateLimiter");
const { upsertUser } = require("../db/userService");
const timerService = require("../services/timerService");
const botService = require("../services/botService");
const roomCleanup = require("../services/roomCleanup");
const gameHandlers = require("./game");
const startGameForRoom = gameHandlers.startGameForRoom;
const normalizeDifficulty = require("../services/botBrain").normalizeDifficulty;
const withRoomLock = require("../utils/roomLock").withRoomLock;
const replaceSocketId = require("../utils/gameManager").replaceSocketId;

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
    //
    // Only when the client asks for that same room: the app's reconnect sends
    // the room it was in. A join with no room id (or another one) is a fresh
    // choice — e.g. refresh, then "Play now" — and must not be pulled back
    // into the old, possibly finished, game.
    if (cancelledPending && roomId === cancelledPending.roomId) {
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
      const abandonedRoom = await removeUserLocked(cancelledPending.oldSocketId, cancelledPending.roomId);
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

      // Locked like game updates: joining saves the room, and a reconnecting
      // player's game state is moved to their new socket.id in the same step.
      const joined = await withRoomLock(roomNo, async function() {
        // Coming back to a room this device is already in (a dropped
        // connection, or a second tab): note its previous socket.id so the
        // game can continue as the same player. Only when the client asked
        // for this room — matchmaking never resumes an old seat.
        let previousSocketId = null;
        if (roomId && deviceId) {
          const before = await getRoomById(roomNo);
          const prev = before && before.users.find(function(u) {
            return u.deviceId === deviceId && u.socketId !== socket.id;
          });
          if (prev) previousSocketId = prev.socketId;
        }

        const room = await addUserToRoom(roomNo, user, roomType, !roomId);
        let changed = false;

        // Clear any stale disconnected flag left by a previous grace period
        const rejoiningUser = room.users.find(function(u) { return u.socketId === socket.id; });
        if (rejoiningUser?.disconnected) {
          rejoiningUser.disconnected = false;
          changed = true;
        }

        // A game is running: the same player carries on (same points, back
        // into the current round); anyone new waits for the next round.
        let resumed = false;
        if (room.game) {
          resumed = replaceSocketId(room.game, previousSocketId, socket.id);
          if (resumed) {
            console.log(`Reconnect: ${previousSocketId} → ${socket.id} resumes in room ${roomNo}`);
          } else {
            room.game.pendingJoiners = room.game.pendingJoiners || [];
            // Avoid duplicates (e.g. rapid reconnect)
            if (room.game.pendingJoiners.indexOf(socket.id) === -1) {
              room.game.pendingJoiners.push(socket.id);
            }
          }
          changed = true;
        }

        if (changed) await saveRoom(room);
        return { room: room, resumed: resumed };
      }, "join");
      const room = joined.room;

      // Track socket → device/room for grace-period reconnection
      if (deviceId) socketToDevice[socket.id] = deviceId;
      socketToRoom[socket.id] = roomNo;

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

      // A public room that just filled up has nobody left to wait for:
      // start now instead of at the end of the countdown.
      if (roomType === "public" && !room.game && room.users.length >= MAX_PLAYERS) {
        botService.clearFillTimer(roomNo);
        await fillRoomWithBotsAndStart(io, roomNo);
        return;
      }

      // If a game is already in progress, send a snapshot so the player lands
      // directly on the GameBoard (a new joiner was queued for the next round
      // above; a reconnecting player is back in the current one).
      if (room.game) {
        const game = room.game;
        const timeLeft = timerService.getTimeLeft(roomNo);
        socket.emit("game_in_progress", {
          round:             game.round,
          points:            game.points,
          turnOrder:         game.turnOrder,
          eliminatedPlayers: game.eliminatedPlayers,
          hostSocketId:      room.hostSocketId,
          timerDuration:     timeLeft !== null ? timeLeft : 0,
          gameSettings:      game.settings,
          // So a reconnecting player's board shows what's already been picked
          // this round — including their own pick, if it got through.
          resumed:           joined.resumed,
          myNumber:          (game.numbers || {})[socket.id] !== undefined ? game.numbers[socket.id] : null,
          submittedIds:      Object.keys(game.numbers || {}),
        });
      }
    } catch (err) {
      console.error(`join_room error: ${err.message}`);
      socket.emit("error_message", { message: err.message });
    }
  });

  // ── update_profile ──────────────────────────────────────────────────────────
  // Rename / change avatar from the profile menu, including mid-game, so other
  // players see the change straight away. Locked like game updates: saving the
  // room here must not overwrite a pick saved at the same moment.
  socket.on("update_profile", async function(data) {
    const name = String(data?.name || "").replace(/<[^>]*>/g, "").trim().slice(0, 20);
    const avatar = String(data?.avatar || "").slice(0, 16);
    if (!name || !avatar) return;
    console.debug(`Socket: "update_profile" ${socket.id} → ${name}`);

    const deviceId = socketToDevice[socket.id];
    if (deviceId) upsertUser(deviceId, name, avatar).catch(() => {});

    const roomId = socketToRoom[socket.id];
    if (!roomId) return;
    await withRoomLock(roomId, async function() {
      const room = await getRoomById(roomId);
      const me = room && room.users.find(function(u) { return u.socketId === socket.id; });
      if (!me) return;
      me.name = name;
      me.avatar = avatar;
      await saveRoom(room);
      io.to(roomId).emit("room_update", room);
    }, "update_profile");
  });

  socket.on("leave_room", async function(callback) {
    console.debug(`Socket: "leave_room" ${socket.id}`);

    // Intentional leave — cancel any pending grace timer and clean up maps
    const dId = socketToDevice[socket.id];
    if (dId && pendingDisconnects[dId]) {
      clearTimeout(pendingDisconnects[dId].timer);
      delete pendingDisconnects[dId];
    }
    const leftRoomId = socketToRoom[socket.id];
    delete socketToDevice[socket.id];
    delete socketToRoom[socket.id];

    const room = await removeUserLocked(socket.id, leftRoomId);
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
      // Locked like game updates: this save must not overwrite a pick or
      // next-round write landing at the same moment.
      const roomExists = await withRoomLock(roomId, async function() {
        const room = await getRoomById(roomId);
        if (!room) return false;
        // Mark user as temporarily disconnected so the client can show it
        const disconnectedUser = room.users.find(function(u) { return u.socketId === socket.id; });
        if (disconnectedUser) {
          disconnectedUser.disconnected = true;
          await saveRoom(room);
          io.to(room.id).emit("room_update", room);
        }
        return true;
      }, "disconnect");
      if (roomExists) {
        const oldSocketId = socket.id;
        pendingDisconnects[deviceId] = {
          oldSocketId: oldSocketId,
          roomId: roomId,
          timer: setTimeout(async function() {
            delete pendingDisconnects[deviceId];
            console.log(`Grace period expired for deviceId ${deviceId} — removing from room`);
            const r = await removeUserLocked(oldSocketId, roomId);
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
    const r = await removeUserLocked(socket.id, roomId);
    if (r) {
      await handlePostRemove(io, r);
    }
    console.log("User disconnected (immediate):", socket.id);
  });
};

// ── removeUserLocked ─────────────────────────────────────────────────────────
// Removes a user, queued behind other work for that room when the room is
// known (so the write can't overwrite a pick saved at the same moment), and
// looks the room up directly instead of scanning every room in Redis.
function removeUserLocked(socketId, roomId) {
  if (!roomId) return removeUserFromRoom(socketId);
  return withRoomLock(roomId, function() {
    return removeUserFromRoom(socketId, roomId);
  }, "leave");
}

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
// Fired BOT_FILL_DELAY_MS after a brand-new public room was created (or as
// soon as it fills up). Re-reads the room — a no-op if it was deleted or a
// game already started in the meantime; otherwise the game starts now.
async function fillRoomWithBotsAndStart(io, roomId) {
  const room = await getRoomById(roomId);
  if (!room) return; // room was deleted in the meantime
  if (room.game) return; // already started by someone else

  // The countdown is over, so the game starts either way: padded with bots if
  // too few people came, otherwise with whoever is here. (Waiting for a host
  // to press Start doesn't work in matchmaking — strangers don't know it's
  // up to them, and the room would sit idle until it's deleted.)
  const addedBots = room.users.length < MIN_PLAYERS
    ? botService.fillRoomWithBots(room, MIN_PLAYERS)
    : [];
  room.botFillAt = null;
  await saveRoom(room);

  roomCleanup.cancelIdleDelete(roomId);

  io.to(roomId).emit("room_update", room);
  if (addedBots.length > 0) {
    io.to(roomId).emit("bots_added", { roomId: roomId, bots: addedBots });
  }

  await startGameForRoom(io, roomId, {});
}
