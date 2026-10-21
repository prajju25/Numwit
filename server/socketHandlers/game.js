const gameManager = require("../utils/gameManager");
const createGameData = gameManager.createGameData;
const evaluateRound = gameManager.evaluateRound;
const sanitizeSettings = gameManager.sanitizeSettings;
const roomManager = require("../utils/roomManager");
const getRoomById = roomManager.getRoomById;
const saveRoom = roomManager.saveRoom;
const removeFromPublicSet = roomManager.removeFromPublicSet;
const NUMWIT_GAME_STATUS = require("../constants/constants").NUMWIT_GAME_STATUS;
const timerService = require("../services/timerService");
const botService = require("../services/botService");
const roomCleanup = require("../services/roomCleanup");

// Phase 4: DB services (all wrapped with graceful fallback)
const userService = require("../db/userService");
const statsService = require("../db/statsService");
const achievementService = require("../db/achievementService");
const roundLogService = require("../db/roundLogService");
const withRoomLock = require("../utils/roomLock").withRoomLock;

// Pause after a round_result is broadcast, before the next round begins.
// Gives players time to read the result overlay and see the "next round
// starting in..." countdown (was 5000ms, then 7000ms).
const ROUND_RESULT_DELAY_MS = 10000;

// Tracks the pending "advance to next round" setTimeout per room (keyed by
// roomId), scheduled by scheduleRoundAdvance after a round_result is
// broadcast. Lets skip_round_result and restart_game cancel/short-circuit it.
const pendingRoundAdvance = {};

module.exports = function handleGameEvents(io, socket) {

  // ── start_game ──────────────────────────────────────────────────────────────
  socket.on("start_game", async function(data) {
    const roomId = data.roomId;
    const settings = data.settings || {};
    console.debug(`Socket: "start_game" Room=${roomId}`);

    const room = await getRoomById(roomId);
    if (!room) return;

    if (room.hostSocketId && room.hostSocketId !== socket.id) {
      return socket.emit("error_message", { message: "Only the host can start the game" });
    }

    await startGameForRoom(io, roomId, settings);
  });

  // ── send_number ─────────────────────────────────────────────────────────────
  socket.on("send_number", async function(data) {
    const roomId = data.roomId;
    const user   = data.user;
    const no     = data.no;
    console.debug(`Socket: "send_number" Room=${roomId} User=${user?.name} No=${no}`);

    const number = Math.max(0, Math.min(100, Math.round(Number(no))));
    if (isNaN(number)) {
      return socket.emit("invalid_number", { message: "Number must be 0-100" });
    }

    // One at a time per room, so simultaneous picks can't overwrite each other
    await withRoomLock(roomId, async function() {
      const room = await getRoomById(roomId);
      if (!room) return socket.emit("not_in_room");

      const game = room.game;
      if (!game) return socket.emit("not_in_room");

      const isInRoom = room.users.some(function(u) { return u.socketId === socket.id; });
      if (!isInRoom) return socket.emit("not_in_room");

      // Mid-game joiners are in pendingJoiners, not yet in turnOrder — they cannot submit.
      const isInTurnOrder = game.turnOrder.indexOf(socket.id) !== -1;
      if (!isInTurnOrder) return;

      const isEliminated = game.eliminatedPlayers.indexOf(socket.id) !== -1;
      if (isEliminated) return;

      if (game.numbers[socket.id] !== undefined) {
        return socket.emit("duplicate_submission", { message: "You already submitted for this round" });
      }
      if (game.status === NUMWIT_GAME_STATUS.COMPLETED) {
        return socket.emit("round_already_completed");
      }

      socket.emit("number_received", { no: number });
      await submitNumber(io, room, socket.id, number);
    }, "send_number");
  });

  // ── restart_game ────────────────────────────────────────────────────────────
  socket.on("restart_game", async function(data) {
    const roomId = data.roomId;
    console.debug(`Socket: "restart_game" Room=${roomId}`);

    const room = await getRoomById(roomId);
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
      await startGameForRoom(io, roomId, { botDifficulty: room.botDifficulty });
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
    const roomId = data.roomId;
    console.debug(`Socket: "skip_round_result" Room=${roomId}`);

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
  const room = await getRoomById(roomId);
  if (!room) return;

  // Game is starting — cancel any pending idle-delete timer
  roomCleanup.cancelIdleDelete(roomId);

  await removeFromPublicSet(roomId);
  io.to(roomId).emit("game_started");

  const gameData = await createGameData(room, sanitizeSettings(settings));
  if (!gameData) return;
  const bots = room.users.filter(function(u) { return u.isBot; }).length;
  console.log(
    `Game started in room ${roomId} (${room.type || "public"}): ` +
    `${room.users.length - bots} ${room.users.length - bots === 1 ? "person" : "people"}, ${bots} bot(s)` +
    (bots > 0 ? `, ${gameData.settings?.botDifficulty || "adaptive"} bots` : "")
  );

  const timerDuration = gameData.settings?.timerDuration || 30;
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
      return submitBotNumber(io, roomId, botSocketId, number);
    });
  }, 300);
}

// ── submitNumber ────────────────────────────────────────────────────────────
// Shared by the send_number socket handler (real players) and
// submitBotNumber (bot players). Caller is responsible for validating that
// the room/game exist, socketId is in turnOrder, not eliminated, hasn't
// already submitted this round, and the round isn't already COMPLETED.
async function submitNumber(io, room, socketId, number) {
  const roomId = room.id;
  const game = room.game;
  if (!game) return;

  game.numbers[socketId] = number;
  game.submittedCount = (game.submittedCount || 0) + 1;

  const activePlayers = room.users.filter(function(u) {
    return game.eliminatedPlayers.indexOf(u.socketId) === -1
      && game.turnOrder.indexOf(u.socketId) !== -1;
  });

  if (game.submittedCount < activePlayers.length) {
    await saveRoom(room);
    io.to(roomId).emit("waiting_for_players", {
      submitted: game.submittedCount,
      total: activePlayers.length,
      // Who has locked in (not what they picked) so clients can tick avatars.
      submittedIds: Object.keys(game.numbers),
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
  return withRoomLock(roomId, function() {
    return submitBotNumberLocked(io, roomId, botSocketId, number);
  }, "bot_number");
}

async function submitBotNumberLocked(io, roomId, botSocketId, number) {
  const room = await getRoomById(roomId);
  if (!room || !room.game) return;
  const game = room.game;

  if (game.turnOrder.indexOf(botSocketId) === -1) return;
  if (game.eliminatedPlayers.indexOf(botSocketId) !== -1) return;
  if (game.numbers[botSocketId] !== undefined) return;
  if (game.status === NUMWIT_GAME_STATUS.COMPLETED) return;

  await submitNumber(io, room, botSocketId, number);
}

// ── recordRound ──────────────────────────────────────────────────────────────
// Anonymous behaviour log (human picks only). Fire-and-forget: a slow or
// missing database must never delay or break the game. Call before the room
// is saved so game.logId (set on first use) persists for later rounds.
function recordRound(room, game, activePlayers, result) {
  try {
    const entry = roundLogService.buildRoundLog(room, game, activePlayers, result);
    if (entry) {
      roundLogService.logRound(entry).catch(function(e) {
        console.error("logRound error:", e.message);
      });
    }
  } catch (e) {
    console.error("recordRound error:", e.message);
  }
}

// ── rememberPicks ────────────────────────────────────────────────────────────
// What bots learn from: everyone's picks in finished rounds (void ones too —
// a duel tie still shows which move a player favours). Capped so the room
// object in Redis stays small.
const PICK_HISTORY_LIMIT = 12;
function rememberPicks(game, activePlayers, result) {
  const picks = {};
  (result.submissions || []).forEach(function(s) {
    if (typeof s.number === "number") picks[s.socketId] = s.number;
  });
  if (!Array.isArray(game.pickHistory)) game.pickHistory = [];
  game.pickHistory.push({
    picks: picks,
    target: result.roundVoid ? null : result.target,
    duel: activePlayers.length === 2,
  });
  if (game.pickHistory.length > PICK_HISTORY_LIMIT) {
    game.pickHistory = game.pickHistory.slice(-PICK_HISTORY_LIMIT);
  }
}

// ── resolveRound ─────────────────────────────────────────────────────────────
async function resolveRound(io, room, activePlayers) {
  const roomId = room.id;
  const game   = room.game;

  const result = evaluateRound(game, activePlayers);

  rememberPicks(game, activePlayers, result);

  if (result.roundVoid) {
    recordRound(room, game, activePlayers, result);
    game.numbers      = {};
    game.submittedCount = 0;
    game.status       = NUMWIT_GAME_STATUS.IN_PROGRESS;
    await saveRoom(room);
    io.to(roomId).emit("round_void", {
      round:       result.round,
      reason:      result.reason,
      submissions: result.submissions,
    });
    const voidTimer = game.settings?.timerDuration || 30;
    timerService.startTimer(io, roomId, room, voidTimer, handleTimerExpiry);
    botService.scheduleBotSubmissions(roomId, game, function(botSocketId, number) {
      return submitBotNumber(io, roomId, botSocketId, number);
    });
    return;
  }

  Object.assign(game, result.updatedGame);
  recordRound(room, game, activePlayers, result);

  // Track per-round wins and exact matches so persistGameOver can read them.
  // winHistory, exactMatchHistory, consecWinHistory, maxConsecWinHistory,
  // and wasLastPlaceSet are all initialized as {} in createGameData.
  result.winnerIds.forEach(function(id) {
    game.winHistory[id] = (game.winHistory[id] || 0) + 1;
  });
  if (result.exactMatch) {
    result.winnerIds.forEach(function(id) {
      game.exactMatchHistory[id] = (game.exactMatchHistory[id] || 0) + 1;
    });
  }

  // Track consecutive round-win streaks
  result.winnerIds.forEach(function(id) {
    game.consecWinHistory[id] = (game.consecWinHistory[id] || 0) + 1;
    game.maxConsecWinHistory[id] = Math.max(
      game.maxConsecWinHistory[id] || 0,
      game.consecWinHistory[id]
    );
  });
  activePlayers.forEach(function(u) {
    if (result.winnerIds.indexOf(u.socketId) === -1) {
      game.consecWinHistory[u.socketId] = 0;
    }
  });

  // Track last-place (player(s) with the highest penalty count this round)
  if (activePlayers.length > 1) {
    const maxPenalty = Math.max.apply(null, activePlayers.map(function(u) {
      return result.points[u.socketId] || 0;
    }));
    activePlayers.forEach(function(u) {
      if ((result.points[u.socketId] || 0) === maxPenalty) {
        game.wasLastPlaceSet[u.socketId] = true;
      }
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

  const remainingPlayers = activePlayers.filter(function(u) {
    return result.updatedGame.eliminatedPlayers.indexOf(u.socketId) === -1;
  });

  if (remainingPlayers.length <= 1) {
    const winnerPlayer = remainingPlayers[0] || null;
    const gameOverData = {
      winnerSocketId: winnerPlayer ? winnerPlayer.socketId : null,
      points:         result.points,
      reason:         "elimination",
    };
    io.to(roomId).emit("game_over", gameOverData);
    botService.clearSubmissionTimers(roomId);

    console.log(
      `Game over in room ${roomId} after ${game.round} round(s): ` +
      (winnerPlayer ? `${winnerPlayer.isBot ? "a bot" : "a person"} won` : "no winner")
    );

    // Mark room as ended so admin dashboard shows correct status
    room.gameEnded = true;
    saveRoom(room).catch(function(e) { console.error("saveRoom(gameEnded) error:", e.message); });

    // ── Phase 4: persist stats + check achievements (non-blocking) ────────────
    persistGameOver(io, room, game, activePlayers, winnerPlayer).catch(function(e) {
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
  // Locked like picks: this saves the room and must not overwrite a write
  // that lands at the same moment (e.g. a player leaving).
  return withRoomLock(roomId, function() {
    return advanceToNextRoundLocked(io, roomId);
  }, "next_round");
}

async function advanceToNextRoundLocked(io, roomId) {
  // Re-fetch from Redis to guard against restart_game firing in the meantime —
  // it nulls game on a freshly-fetched room object.
  const room = await getRoomById(roomId);
  if (!room || !room.game) return;
  const game = room.game;

  game.round       += 1;
  game.numbers      = {};
  game.submittedCount = 0;
  game.status       = NUMWIT_GAME_STATUS.IN_PROGRESS;
  game.average      = null;
  game.target       = null;
  game.winnerIds    = [];
  game.winnerSocketId = null;

  // Promote any mid-game joiners into the active turn order for this round.
  const pending = game.pendingJoiners || [];
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

  const nextTimer = game.settings?.timerDuration || 30;
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
    return submitBotNumber(io, roomId, botSocketId, number);
  });
}

// ── persistGameOver ───────────────────────────────────────────────────────────
// Writes session stats, awards XP, checks achievements, emits unlocked ones.
async function persistGameOver(io, room, game, activePlayers, winnerPlayer) {
  const roomId = room.id;
  // isDuel = exactly 2 human (non-bot) players
  const humanPlayers = activePlayers.filter(function(u) { return !u.isBot; });
  const isDuel = humanPlayers.length === 2;

  // Build per-player stats from game state
  for (let i = 0; i < room.users.length; i++) {
    const u = room.users[i];
    const deviceId = u.deviceId;
    if (!deviceId) continue;   // skip users without device identity (includes all bots)

    const mySocketId = u.socketId;
    const survived   = winnerPlayer?.socketId === mySocketId;
    const myPoints   = game.points?.[mySocketId] || 0;

    const sessionStats = {
      rounds:             game.round,
      wins:               game.winHistory?.[mySocketId] || 0,
      penalties:          myPoints,
      exactMatches:       game.exactMatchHistory?.[mySocketId] || 0,
      survived:           survived,
      // New achievement-tracking fields
      roomType:           room.type || "public",
      isDuel:             isDuel,
      playerCount:        activePlayers.length,
      maxConsecRoundWins: game.maxConsecWinHistory?.[mySocketId] || 0,
      wasLastPlace:       !!game.wasLastPlaceSet?.[mySocketId],
    };

    // Write to DB — awaited so the all-time aggregate fetched below (used for
    // achievement checks and the shareable player card) reliably includes
    // this session's row instead of racing the INSERT.
    await statsService.writeSessionStat(deviceId, sessionStats).catch(function(e) {
      console.error(`writeSessionStat error (room ${roomId}):`, e.message);
    });

    // Update consecutive game-win streak (must await — we need the result for achievement check)
    const newStreak = await userService.updateConsecutiveGameWins(deviceId, survived).catch(function(e) {
      console.error(`updateConsecutiveGameWins error (room ${roomId}):`, e.message);
      return 0;
    });

    // Award XP
    const xpResult = await userService.awardXp(deviceId, sessionStats);

    // Look up DB userId for achievements
    const userRecord = await userService.getProfile(deviceId);
    if (!userRecord) continue;

    // Fetch all-time stats (includes duelWins, soloWins from the new DB fields)
    const allTimeStats = await statsService.getPlayerStats(deviceId).catch(function(e) {
      console.error(`getPlayerStats error (room ${roomId}):`, e.message);
      return null;
    });
    // Override consecutiveGameWins with the freshly updated value
    if (allTimeStats) allTimeStats.consecutiveGameWins = newStreak;

    const sessionDataForAchievements = {
      wins:               sessionStats.wins,
      exactMatches:       sessionStats.exactMatches,
      penalties:          sessionStats.penalties,
      survived:           survived,
      eliminatedCount:    (game.eliminatedPlayers || []).length,
      isDuel:             isDuel,
      cameBackFrom4:      myPoints >= 4 && survived,
      roomType:           sessionStats.roomType,
      playerCount:        sessionStats.playerCount,
      maxConsecRoundWins: sessionStats.maxConsecRoundWins,
      wasLastPlace:       sessionStats.wasLastPlace,
      botDifficulty:      game.settings?.botDifficulty,
    };

    const newAchievements = await achievementService.checkAndAward(
      userRecord.id,
      sessionDataForAchievements,
      allTimeStats
    );

    // Resolve the target socket once — used for both achievements and XP below
    const targetSocket = io.sockets.sockets.get(mySocketId) || null;

    if (newAchievements.length > 0) {
      console.debug(`Achievements unlocked in room ${roomId}: ${newAchievements.map(function(a) { return a.id; }).join(", ")}`);
    }

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
      const progress = userService.levelProgress(xpResult.xp);
      targetSocket.emit("xp_update", {
        xp:           xpResult.xp,
        level:        xpResult.level,
        xpGained:     xpResult.xpGained,
        levelUp:      xpResult.levelUp,
        xpLevelStart: progress.xpLevelStart,
        xpNextLevel:  progress.xpNextLevel,
        progress:     progress.progress,
      });
    }
  }
}

// ── handleTimerExpiry ────────────────────────────────────────────────────────
async function handleTimerExpiry(io, roomId) {
  return withRoomLock(roomId, function() {
    return handleTimerExpiryLocked(io, roomId);
  }, "timer_expiry");
}

async function handleTimerExpiryLocked(io, roomId) {
  const room = await getRoomById(roomId);
  if (!room || !room.game) return;

  const game = room.game;
  if (game.status === NUMWIT_GAME_STATUS.COMPLETED) return;

  console.debug(`Timer expired for room ${roomId} round ${game.round}`);
  io.to(roomId).emit("timer_expired", { roomId: roomId, round: game.round });
  const activePlayers = room.users.filter(function(u) {
    return game.eliminatedPlayers.indexOf(u.socketId) === -1
      && game.turnOrder.indexOf(u.socketId) !== -1;
  });

  if (activePlayers.length === 0) return;
  await resolveRound(io, room, activePlayers);
}

// Exported so lobby.js can start a game server-side once a brand-new public
// room has been padded with bots (no human host action to wait for).
module.exports.startGameForRoom = startGameForRoom;
