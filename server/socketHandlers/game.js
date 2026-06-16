var gameManager = require("../utils/gameManager");
var createGameData = gameManager.createGameData;
var evaluateRound = gameManager.evaluateRound;
var sanitizeSettings = gameManager.sanitizeSettings;
var roomManager = require("../utils/roomManager");
var getRoomById = roomManager.getRoomById;
var saveRoom = roomManager.saveRoom;
var removeFromPublicSet = roomManager.removeFromPublicSet;
var deleteRoom = roomManager.deleteRoom;
var NUMWIT_GAME_STATUS = require("../constants/constants").NUMWIT_GAME_STATUS;
var timerService = require("../services/timerService");
var botService = require("../services/botService");
var roomCleanup = require("../services/roomCleanup");

// Phase 4: DB services (all wrapped with graceful fallback)
var userService = require("../db/userService");
var statsService = require("../db/statsService");
var achievementService = require("../db/achievementService");

// Pause after a round_result is broadcast, before the next round begins.
// Gives players time to read the result overlay and see the "next round
// starting in..." countdown (was 5000ms, then 7000ms).
var ROUND_RESULT_DELAY_MS = 10000;

// Tracks the pending "advance to next round" setTimeout per room (keyed by
// roomId), scheduled by scheduleRoundAdvance after a round_result is
// broadcast. Lets skip_round_result and restart_game cancel/short-circuit it.
var pendingRoundAdvance = {};

module.exports = function handleGameEvents(io, socket) {

  // ── start_game ──────────────────────────────────────────────────────────────
  socket.on("start_game", async function(data) {
    var roomId = data.roomId;
    var settings = data.settings || {};
    console.debug('Socket: "start_game" Room=' + roomId);

    var room = await getRoomById(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      return socket.emit("error_message", { message: "Only the host can start the game" });
    }

    await startGameForRoom(io, roomId, settings);
  });

  // ── send_number ─────────────────────────────────────────────────────────────
  socket.on("send_number", async function(data) {
    var roomId = data.roomId;
    var user   = data.user;
    var no     = data.no;
    console.debug('Socket: "send_number" Room=' + roomId + ' User=' + (user && user.name) + ' No=' + no);

    var number = Math.max(0, Math.min(100, Math.round(Number(no))));
    if (isNaN(number)) {
      return socket.emit("invalid_number", { message: "Number must be 0-100" });
    }

    var room = await getRoomById(roomId);
    if (!room) return socket.emit("not_in_room");

    var game = room.game;
    if (!game) return socket.emit("not_in_room");

    var isInRoom = room.users.some(function(u) { return u.socketId === socket.id; });
    if (!isInRoom) return socket.emit("not_in_room");

    // Mid-game joiners are in pendingJoiners, not yet in turnOrder — they cannot submit.
    var isInTurnOrder = game.turnOrder.indexOf(socket.id) !== -1;
    if (!isInTurnOrder) return;

    var isEliminated = game.eliminatedPlayers.indexOf(socket.id) !== -1;
    if (isEliminated) return;

    if (game.numbers[socket.id] !== undefined) {
      return socket.emit("duplicate_submission", { message: "You already submitted for this round" });
    }
    if (game.status === NUMWIT_GAME_STATUS.COMPLETED) {
      return socket.emit("round_already_completed");
    }

    socket.emit("number_received", { no: number });
    await submitNumber(io, room, socket.id, number);
  });

  // ── restart_game ────────────────────────────────────────────────────────────
  socket.on("restart_game", async function(data) {
    var roomId = data.roomId;
    console.debug('Socket: "restart_game" Room=' + roomId);

    var room = await getRoomById(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      return socket.emit("error_message", { message: "Only the host can restart the game" });
    }

    timerService.clearTimer(roomId);
    botService.clearSubmissionTimers(roomId);
    clearRoundAdvance(roomId);
    roomCleanup.cancelPostGameDelete(roomId);
    room.game = null;
    room.gameEnded = false;

    // Solo rooms: re-fill with bots and restart immediately.
    // Must emit game_reset first so the client clears GameOverScreen state,
    // then start the game — the brief WaitingRoom flash is acceptable.
    if (room.type === "solo") {
      const { MIN_PLAYERS } = require("../constants/constants");
      botService.fillRoomWithBots(room, MIN_PLAYERS);
      await saveRoom(room);
      io.to(roomId).emit("game_reset");
      io.to(roomId).emit("room_update", room);
      await startGameForRoom(io, roomId, {});
      return;
    }

    await saveRoom(room);

    // Return everyone to the waiting room.
    // room_update refreshes the player list so WaitingRoom renders correctly.
    // Host will click Start Game again when ready.
    io.to(roomId).emit("game_reset");
    io.to(roomId).emit("room_update", room);
  });

  // ── skip_round_result ───────────────────────────────────────────────────────
  // Lets a player dismiss the round-result overlay early and start the next
  // round immediately, instead of waiting out the full ROUND_RESULT_DELAY_MS.
  socket.on("skip_round_result", async function(data) {
    var roomId = data.roomId;
    console.debug('Socket: "skip_round_result" Room=' + roomId);

    // No-op if there's nothing pending (e.g. round already advanced, or this
    // is a round_void rather than a round_result — those don't schedule an
    // advance at all).
    if (!pendingRoundAdvance[roomId]) return;

    clearRoundAdvance(roomId);
    await advanceToNextRound(io, roomId);
  });
};

// ── startGameForRoom ────────────────────────────────────────────────────────
// Shared by the start_game socket handler (human host clicked "Start Game")
// and the bot-fill flow in lobby.js (server starts the game itself once a
// brand-new public room has been padded with bots and there's no human host
// action to wait for). Behavior is identical either way.
async function startGameForRoom(io, roomId, settings) {
  var room = await getRoomById(roomId);
  if (!room) return;

  // Game is starting — cancel any pending idle-delete timer
  roomCleanup.cancelIdleDelete(roomId);

  await removeFromPublicSet(roomId);
  io.to(roomId).emit("game_started");

  var gameData = await createGameData(room, sanitizeSettings(settings));
  if (!gameData) return;

  var timerDuration = (gameData.settings && gameData.settings.timerDuration) || 30;
  // Small delay so client has time to mount NumwitRuleProvider before next_round arrives
  setTimeout(function() {
    io.to(roomId).emit("next_round", {
      round: gameData.round,
      points: gameData.points,
      turnOrder: gameData.turnOrder,
      eliminatedPlayers: gameData.eliminatedPlayers,
      hostSocketId: room.hostSocketId,
      timerDuration: timerDuration,
      gameSettings: gameData.settings,
    });
    timerService.startTimer(io, roomId, room, timerDuration, handleTimerExpiry);
    botService.scheduleBotSubmissions(roomId, gameData, function(botSocketId, number) {
      submitBotNumber(io, roomId, botSocketId, number);
    });
  }, 300);
}

// ── submitNumber ────────────────────────────────────────────────────────────
// Shared by the send_number socket handler (real players) and
// submitBotNumber (bot players). Caller is responsible for validating that
// the room/game exist, socketId is in turnOrder, not eliminated, hasn't
// already submitted this round, and the round isn't already COMPLETED.
async function submitNumber(io, room, socketId, number) {
  var roomId = room.id;
  var game = room.game;
  if (!game) return;

  game.numbers[socketId] = number;
  game.submittedCount = (game.submittedCount || 0) + 1;

  var activePlayers = room.users.filter(function(u) {
    return game.eliminatedPlayers.indexOf(u.socketId) === -1
      && game.turnOrder.indexOf(u.socketId) !== -1;
  });

  if (game.submittedCount < activePlayers.length) {
    await saveRoom(room);
    io.to(roomId).emit("waiting_for_players", {
      submitted: game.submittedCount,
      total: activePlayers.length,
    });
    return;
  }

  timerService.clearTimer(roomId);
  botService.clearSubmissionTimers(roomId);
  await resolveRound(io, room, activePlayers);
}

// ── submitBotNumber ─────────────────────────────────────────────────────────
// Called by botService after its random 1-4s "thinking" delay. Re-fetches the
// room (the delay means the in-memory `room`/`game` from when scheduling
// happened may be stale) and re-validates before submitting, mirroring the
// guards in the send_number handler.
async function submitBotNumber(io, roomId, botSocketId, number) {
  var room = await getRoomById(roomId);
  if (!room || !room.game) return;
  var game = room.game;

  if (game.turnOrder.indexOf(botSocketId) === -1) return;
  if (game.eliminatedPlayers.indexOf(botSocketId) !== -1) return;
  if (game.numbers[botSocketId] !== undefined) return;
  if (game.status === NUMWIT_GAME_STATUS.COMPLETED) return;

  await submitNumber(io, room, botSocketId, number);
}

// ── resolveRound ─────────────────────────────────────────────────────────────
async function resolveRound(io, room, activePlayers) {
  var roomId = room.id;
  var game   = room.game;

  var result = evaluateRound(game, activePlayers);

  if (result.roundVoid) {
    game.numbers      = {};
    game.submittedCount = 0;
    game.status       = NUMWIT_GAME_STATUS.IN_PROGRESS;
    await saveRoom(room);
    io.to(roomId).emit("round_void", {
      round:       result.round,
      reason:      result.reason,
      submissions: result.submissions,
    });
    var voidTimer = (game.settings && game.settings.timerDuration) || 30;
    timerService.startTimer(io, roomId, room, voidTimer, handleTimerExpiry);
    botService.scheduleBotSubmissions(roomId, game, function(botSocketId, number) {
      submitBotNumber(io, roomId, botSocketId, number);
    });
    return;
  }

  Object.assign(game, result.updatedGame);

  // Track per-round wins and exact matches so persistGameOver can read them.
  // winHistory and exactMatchHistory are initialized as {} in createGameData.
  result.winnerIds.forEach(function(id) {
    game.winHistory[id] = (game.winHistory[id] || 0) + 1;
  });
  if (result.exactMatch) {
    result.winnerIds.forEach(function(id) {
      game.exactMatchHistory[id] = (game.exactMatchHistory[id] || 0) + 1;
    });
  }

  await saveRoom(room);

  if (result.exactMatch) {
    io.to(roomId).emit("exact_match_penalty", {
      target:    result.target,
      winnerIds: result.winnerIds,
      points:    result.points,
    });
  }
  if (result.twoPlayerCycle) {
    io.to(roomId).emit("two_players_left_result", {
      winnerIds:      result.winnerIds,
      winnerSocketId: result.winnerSocketId,
    });
  }

  io.to(roomId).emit("round_result", result);

  result.newlyEliminated.forEach(function(socketId) {
    io.to(roomId).emit("player_eliminated", { socketId: socketId });
  });

  var remainingPlayers = activePlayers.filter(function(u) {
    return result.updatedGame.eliminatedPlayers.indexOf(u.socketId) === -1;
  });

  if (remainingPlayers.length <= 1) {
    var winnerPlayer = remainingPlayers[0] || null;
    var gameOverData = {
      winnerSocketId: winnerPlayer ? winnerPlayer.socketId : null,
      points:         result.points,
      reason:         "elimination",
    };
    io.to(roomId).emit("game_over", gameOverData);
    botService.clearSubmissionTimers(roomId);

    // Mark room as ended so admin dashboard shows correct status
    room.gameEnded = true;
    saveRoom(room).catch(function(e) { console.error("saveRoom(gameEnded) error:", e.message); });

    // ── Phase 4: persist stats + check achievements (non-blocking) ────────────
    persistGameOver(io, room, game, activePlayers, winnerPlayer, result).catch(function(e) {
      console.error("persistGameOver error:", e.message);
    });

    // Schedule room deletion after 5 min if no "Play Again" arrives
    roomCleanup.schedulePostGameDelete(io, roomId);

    return;
  }

  // Pause — let players read the round_result overlay before next round begins.
  // game.status is already NUMWIT_GAME_STATUS.COMPLETED (set by evaluateRound),
  // which blocks any late send_number submissions during this window.
  // A player clicking "Skip" on the overlay fires skip_round_result, which
  // cancels this and calls advanceToNextRound immediately.
  scheduleRoundAdvance(io, roomId);
}

// ── scheduleRoundAdvance / clearRoundAdvance ─────────────────────────────────
// Schedules advanceToNextRound to run after ROUND_RESULT_DELAY_MS, tracking
// the timeout per room so it can be cancelled early (skip_round_result) or
// torn down (restart_game).
function scheduleRoundAdvance(io, roomId) {
  clearRoundAdvance(roomId);
  pendingRoundAdvance[roomId] = setTimeout(function() {
    delete pendingRoundAdvance[roomId];
    advanceToNextRound(io, roomId).catch(function(e) {
      console.error("advanceToNextRound error:", e.message);
    });
  }, ROUND_RESULT_DELAY_MS);
}

function clearRoundAdvance(roomId) {
  if (pendingRoundAdvance[roomId]) {
    clearTimeout(pendingRoundAdvance[roomId]);
    delete pendingRoundAdvance[roomId];
  }
}

// ── advanceToNextRound ────────────────────────────────────────────────────────
// Moves the game to the next round and broadcasts next_round. Runs either
// after the normal ROUND_RESULT_DELAY_MS pause (via scheduleRoundAdvance) or
// immediately when a player clicks "Skip" (via skip_round_result).
async function advanceToNextRound(io, roomId) {
  // Defensive: ensure no stale timeout remains tracked for this room.
  delete pendingRoundAdvance[roomId];

  // Re-fetch from Redis to guard against restart_game firing in the meantime —
  // it nulls game on a freshly-fetched room object.
  var room = await getRoomById(roomId);
  if (!room || !room.game) return;
  var game = room.game;

  game.round       += 1;
  game.numbers      = {};
  game.submittedCount = 0;
  game.status       = NUMWIT_GAME_STATUS.IN_PROGRESS;
  game.average      = null;
  game.target       = null;
  game.winnerIds    = [];
  game.winnerSocketId = null;

  // Promote any mid-game joiners into the active turn order for this round.
  var pending = game.pendingJoiners || [];
  pending.forEach(function(id) {
    if (game.turnOrder.indexOf(id) === -1) {
      game.turnOrder.push(id);
    }
    if (game.points[id] === undefined) {
      game.points[id] = 0;
    }
  });
  game.pendingJoiners = [];

  await saveRoom(room);

  var nextTimer = (game.settings && game.settings.timerDuration) || 30;
  io.to(roomId).emit("next_round", {
    round:             game.round,
    points:            game.points,
    turnOrder:         game.turnOrder,
    eliminatedPlayers: game.eliminatedPlayers,
    hostSocketId:      room.hostSocketId,
    timerDuration:     nextTimer,
    gameSettings:      game.settings,
  });
  timerService.startTimer(io, roomId, room, nextTimer, handleTimerExpiry);
  botService.scheduleBotSubmissions(roomId, game, function(botSocketId, number) {
    submitBotNumber(io, roomId, botSocketId, number);
  });
}

// ── persistGameOver ───────────────────────────────────────────────────────────
// Writes session stats, awards XP, checks achievements, emits unlocked ones.
async function persistGameOver(io, room, game, activePlayers, winnerPlayer, lastResult) {
  var roomId = room.id;
  var isDuel = activePlayers.length === 2;

  // Build per-player stats from game state
  for (var i = 0; i < room.users.length; i++) {
    var u = room.users[i];
    var deviceId = u.deviceId;
    if (!deviceId) continue;   // skip users without device identity (includes all bots)

    var mySocketId = u.socketId;
    var survived   = winnerPlayer && winnerPlayer.socketId === mySocketId;
    var myPoints   = (game.points && game.points[mySocketId]) || 0;

    // Count wins/exactMatches/penalties from game history stored on game
    // (We track this simply as: penalties = points, since each penalty = 1 or 2 pts)
    var sessionStats = {
      rounds:       game.round,
      wins:         (game.winHistory && game.winHistory[mySocketId]) || 0,
      penalties:    myPoints,
      exactMatches: (game.exactMatchHistory && game.exactMatchHistory[mySocketId]) || 0,
      survived:     survived,
    };

    // Write to DB (non-blocking per user)
    statsService.writeSessionStat(deviceId, sessionStats).catch(() => {});

    // Award XP
    var xpResult = await userService.awardXp(deviceId, sessionStats);

    // Look up DB userId for achievements
    var userRecord = await userService.getProfile(deviceId);
    if (!userRecord) continue;

    var allTimeStats = await statsService.getPlayerStats(deviceId).catch(function() { return null; });

    var sessionDataForAchievements = {
      wins:            sessionStats.wins,
      exactMatches:    sessionStats.exactMatches,
      penalties:       sessionStats.penalties,
      survived:        survived,
      eliminatedCount: (game.eliminatedPlayers || []).length,
      isDuel:          isDuel,
      cameBackFrom4:   myPoints >= 4 && survived,
    };

    var newAchievements = await achievementService.checkAndAward(
      userRecord.id,
      sessionDataForAchievements,
      allTimeStats
    );

    // Resolve the target socket once — used for both achievements and XP below
    var targetSocket = io.sockets.sockets.get(mySocketId) || null;

    // Emit achievement unlocks to the specific player
    newAchievements.forEach(function(ach) {
      if (targetSocket) {
        targetSocket.emit("achievement_unlocked", {
          id:          ach.id,
          name:        ach.name,
          icon:        ach.icon,
          description: ach.description,
        });
      }
    });

    // Emit XP update to the specific player
    if (xpResult && targetSocket) {
      targetSocket.emit("xp_update", {
        xp:       xpResult.xp,
        level:    xpResult.level,
        xpGained: xpResult.xpGained,
        levelUp:  xpResult.levelUp,
      });
    }
  }
}

// ── handleTimerExpiry ────────────────────────────────────────────────────────
async function handleTimerExpiry(io, roomId) {
  var room = await getRoomById(roomId);
  if (!room || !room.game) return;

  var game = room.game;
  if (game.status === NUMWIT_GAME_STATUS.COMPLETED) return;

  console.debug("Timer expired for room " + roomId + " round " + game.round);
  io.to(roomId).emit("timer_expired", { roomId: roomId, round: game.round });
  var activePlayers = room.users.filter(function(u) {
    return game.eliminatedPlayers.indexOf(u.socketId) === -1
      && game.turnOrder.indexOf(u.socketId) !== -1;
  });

  if (activePlayers.length === 0) return;
  await resolveRound(io, room, activePlayers);
}

// Exported so lobby.js can start a game server-side once a brand-new public
// room has been padded with bots (no human host action to wait for).
module.exports.startGameForRoom = startGameForRoom;
