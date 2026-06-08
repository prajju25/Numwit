var gameManager = require("../utils/gameManager");
var createGameData = gameManager.createGameData;
var evaluateRound = gameManager.evaluateRound;
var sanitizeSettings = gameManager.sanitizeSettings;
var roomManager = require("../utils/roomManager");
var getRoomById = roomManager.getRoomById;
var saveRoom = roomManager.saveRoom;
var removeFromPublicSet = roomManager.removeFromPublicSet;
var NUMWIT_GAME_STATUS = require("../constants/constants").NUMWIT_GAME_STATUS;
var timerService = require("../services/timerService");

// Phase 4: DB services (all wrapped with graceful fallback)
var userService = require("../db/userService");
var statsService = require("../db/statsService");
var achievementService = require("../db/achievementService");

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

    await removeFromPublicSet(roomId);
    io.to(roomId).emit("game_started");

    var gameData = await createGameData(room, sanitizeSettings(settings));
    if (gameData) {
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
      }, 300);
    }
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

    game.numbers[socket.id] = number;
    game.submittedCount = (game.submittedCount || 0) + 1;
    socket.emit("number_received", { no: number });

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
    await resolveRound(io, room, activePlayers);
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
    room.game = null;
    await saveRoom(room);

    // Return everyone to the waiting room.
    // room_update refreshes the player list so WaitingRoom renders correctly.
    // Host will click Start Game again when ready.
    io.to(roomId).emit("game_reset");
    io.to(roomId).emit("room_update", room);
  });
};

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

    // ── Phase 4: persist stats + check achievements (non-blocking) ────────────
    persistGameOver(io, room, game, activePlayers, winnerPlayer, result).catch(function(e) {
      console.error("persistGameOver error:", e.message);
    });

    return;
  }

  // 5-second pause — let players read the round_result overlay before next round begins.
  // game.status is already NUMWIT_GAME_STATUS.COMPLETED (set by evaluateRound),
  // which blocks any late send_number submissions during this window.
  setTimeout(async function() {
    // Re-fetch from Redis to guard against restart_game firing during the delay.
    // The outer `room` / `game` closure references are stale if restart_game ran —
    // it fetches a new object and nulls game, but our closure still holds the old one.
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
  }, 5000);
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
    if (!deviceId) continue;   // skip users without device identity

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
