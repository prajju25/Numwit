jest.mock("../../utils/gameManager", () => ({
  createGameData: jest.fn(),
  evaluateRound: jest.fn(),
  sanitizeSettings: jest.fn((s) => s || {}),
}));
jest.mock("../../utils/roomManager", () => ({
  getRoomById: jest.fn(),
  saveRoom: jest.fn(() => Promise.resolve()),
  removeFromPublicSet: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../services/timerService", () => ({
  startTimer: jest.fn(),
  clearTimer: jest.fn(),
}));
jest.mock("../../services/botService", () => ({
  scheduleBotSubmissions: jest.fn(),
  clearSubmissionTimers: jest.fn(),
}));
jest.mock("../../db/userService", () => ({
  awardXp: jest.fn(() => Promise.resolve(null)),
  getProfile: jest.fn(() => Promise.resolve(null)),
  updateConsecutiveGameWins: jest.fn(() => Promise.resolve(0)),
  levelProgress: jest.requireActual("../../db/userService").levelProgress,
}));
jest.mock("../../db/statsService", () => ({
  writeSessionStat: jest.fn(() => Promise.resolve(null)),
  getPlayerStats: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("../../db/achievementService", () => ({
  checkAndAward: jest.fn(() => Promise.resolve([])),
}));

const gameManager = require("../../utils/gameManager");
const roomManager = require("../../utils/roomManager");
const timerService = require("../../services/timerService");
const botService = require("../../services/botService");
const userService = require("../../db/userService");
const statsService = require("../../db/statsService");
const achievementService = require("../../db/achievementService");
const handleGameEvents = require("../game");
const { NUMWIT_GAME_STATUS } = require("../../constants/constants");

function makeIo(extra) {
  const emit = jest.fn();
  const io = { to: jest.fn(() => ({ emit })), _emit: emit };
  if (extra) Object.assign(io, extra);
  return io;
}

function makeSocket(id) {
  return { id: id || "socket1", on: jest.fn(), emit: jest.fn() };
}

function getHandler(socket, event) {
  const call = socket.on.mock.calls.find((c) => c[0] === event);
  return call?.[1];
}

function flush(times) {
  let p = Promise.resolve();
  for (let i = 0; i < (times || 10); i++) {
    p = p.then(() => new Promise((r) => setImmediate(r)));
  }
  return p;
}

describe("game socket handler", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("start_game", () => {
    test("returns early when room doesn't exist", async () => {
      roomManager.getRoomById.mockResolvedValue(null);
      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });
      expect(gameManager.createGameData).not.toHaveBeenCalled();
    });

    test("rejects start_game from a non-host", async () => {
      roomManager.getRoomById.mockResolvedValue({ id: "r1", hostSocketId: "hostSock", users: [] });
      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });
      expect(socket.emit).toHaveBeenCalledWith("error_message", { message: "Only the host can start the game" });
      expect(gameManager.createGameData).not.toHaveBeenCalled();
    });

    test("host starts the game and the round begins after the delay", async () => {
      jest.useFakeTimers();
      const room = { id: "r1", hostSocketId: "h1", users: [{ socketId: "h1" }, { socketId: "b" }, { socketId: "c" }], game: null };
      roomManager.getRoomById.mockResolvedValue(room);
      const gameData = {
        round: 1,
        points: {},
        turnOrder: ["h1", "b", "c"],
        eliminatedPlayers: [],
        settings: { timerDuration: 30 },
      };
      gameManager.createGameData.mockResolvedValue(gameData);

      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });

      expect(roomManager.removeFromPublicSet).toHaveBeenCalledWith("r1");
      expect(io._emit).toHaveBeenCalledWith("game_started");

      await jest.advanceTimersByTimeAsync(300);

      expect(io._emit).toHaveBeenCalledWith("next_round", expect.objectContaining({
        round: 1,
        turnOrder: ["h1", "b", "c"],
        timerDuration: 30,
        hostSocketId: "h1",
      }));
      expect(timerService.startTimer).toHaveBeenCalledWith(io, "r1", room, 30, expect.any(Function));
      expect(botService.scheduleBotSubmissions).toHaveBeenCalledWith("r1", gameData, expect.any(Function));
    });

    test("does nothing further when createGameData returns null (game already exists)", async () => {
      jest.useFakeTimers();
      roomManager.getRoomById.mockResolvedValue({ id: "r1", hostSocketId: null, users: [], game: { round: 1 } });
      gameManager.createGameData.mockResolvedValue(null);

      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });
      await jest.advanceTimersByTimeAsync(300);

      expect(io._emit).not.toHaveBeenCalledWith("next_round", expect.anything());
    });

    test("defaults the timer duration to 30 when not provided in settings", async () => {
      jest.useFakeTimers();
      const room = { id: "r1", hostSocketId: null, users: [{ socketId: "a" }], game: null };
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.createGameData.mockResolvedValue({ round: 1, points: {}, turnOrder: ["a"], eliminatedPlayers: [], settings: {} });

      const io = makeIo();
      const socket = makeSocket("a");
      handleGameEvents(io, socket);

      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });
      await jest.advanceTimersByTimeAsync(300);

      expect(io._emit).toHaveBeenCalledWith("next_round", expect.objectContaining({ timerDuration: 30 }));
    });
  });

  describe("send_number", () => {
    test("emits invalid_number for non-numeric input without touching the room", async () => {
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: "abc" });

      expect(socket.emit).toHaveBeenCalledWith("invalid_number", { message: "Number must be 0-100" });
      expect(roomManager.getRoomById).not.toHaveBeenCalled();
    });

    test("emits not_in_room when the room doesn't exist", async () => {
      roomManager.getRoomById.mockResolvedValue(null);
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).toHaveBeenCalledWith("not_in_room");
    });

    test("emits not_in_room when the room has no active game", async () => {
      roomManager.getRoomById.mockResolvedValue({ id: "r1", users: [{ socketId: "p1" }], game: null });
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).toHaveBeenCalledWith("not_in_room");
    });

    test("emits not_in_room when the socket isn't a member of the room", async () => {
      roomManager.getRoomById.mockResolvedValue({
        id: "r1",
        users: [{ socketId: "other" }],
        game: { turnOrder: [], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS },
      });
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).toHaveBeenCalledWith("not_in_room");
    });

    test("silently ignores submissions from pending joiners not yet in turnOrder", async () => {
      roomManager.getRoomById.mockResolvedValue({
        id: "r1",
        users: [{ socketId: "p1" }],
        game: { turnOrder: ["other"], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS },
      });
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    test("silently ignores submissions from eliminated players", async () => {
      roomManager.getRoomById.mockResolvedValue({
        id: "r1",
        users: [{ socketId: "p1" }],
        game: { turnOrder: ["p1"], eliminatedPlayers: ["p1"], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS },
      });
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    test("emits duplicate_submission when the player already submitted this round", async () => {
      roomManager.getRoomById.mockResolvedValue({
        id: "r1",
        users: [{ socketId: "p1" }],
        game: { turnOrder: ["p1"], eliminatedPlayers: [], numbers: { p1: 10 }, status: NUMWIT_GAME_STATUS.IN_PROGRESS },
      });
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).toHaveBeenCalledWith("duplicate_submission", expect.any(Object));
    });

    test("emits round_already_completed when the round has already resolved", async () => {
      roomManager.getRoomById.mockResolvedValue({
        id: "r1",
        users: [{ socketId: "p1" }],
        game: { turnOrder: ["p1"], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.COMPLETED },
      });
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      expect(socket.emit).toHaveBeenCalledWith("round_already_completed");
    });

    test("a valid submission emits number_received and waiting_for_players when others haven't submitted", async () => {
      const room = {
        id: "r1",
        users: [{ socketId: "p1" }, { socketId: "p2" }, { socketId: "p3" }],
        game: { turnOrder: ["p1", "p2", "p3"], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS, submittedCount: 0 },
      };
      roomManager.getRoomById.mockResolvedValue(room);
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });

      expect(socket.emit).toHaveBeenCalledWith("number_received", { no: 50 });
      expect(room.game.numbers.p1).toBe(50);
      expect(roomManager.saveRoom).toHaveBeenCalledWith(room);
      expect(io._emit).toHaveBeenCalledWith("waiting_for_players", { submitted: 1, total: 3, submittedIds: ["p1"] });
    });

    test("clamps and rounds the submitted number to the 0-100 range", async () => {
      const room = {
        id: "r1",
        users: [{ socketId: "p1" }, { socketId: "p2" }],
        game: { turnOrder: ["p1", "p2"], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS, submittedCount: 0 },
      };
      roomManager.getRoomById.mockResolvedValue(room);
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 150.6 });
      expect(socket.emit).toHaveBeenCalledWith("number_received", { no: 100 });
      expect(room.game.numbers.p1).toBe(100);
    });

    describe("when the last active player submits (round resolution)", () => {
      function makeRoom(overrides) {
        return Object.assign({
          id: "r1",
          users: [{ socketId: "p1" }, { socketId: "p2" }, { socketId: "p3" }],
          game: {
            round: 1,
            turnOrder: ["p1", "p2", "p3"],
            eliminatedPlayers: [],
            numbers: { p2: 40, p3: 10 },
            status: NUMWIT_GAME_STATUS.IN_PROGRESS,
            submittedCount: 2,
            settings: { timerDuration: 30 },
            points: { p1: 0, p2: 0, p3: 0 },
            winHistory: {},
            exactMatchHistory: {},
            consecWinHistory: {},
            maxConsecWinHistory: {},
            wasLastPlaceSet: {},
          },
        }, overrides);
      }

      function makeNormalResult(overrides) {
        return Object.assign({
          roundVoid: false,
          round: 1,
          average: 30,
          target: 24,
          winnerIds: ["p2"],
          winnerSocketId: "p2",
          submissions: [{ socketId: "p1", number: 50 }, { socketId: "p2", number: 40 }, { socketId: "p3", number: 10 }],
          validSubmissions: [],
          invalidSubmissions: [],
          points: { p1: 1, p2: 0, p3: 2 },
          exactMatch: false,
          twoPlayerCycle: false,
          newlyEliminated: [],
          updatedGame: {
            average: 30,
            target: 24,
            winnerIds: ["p2"],
            winnerSocketId: "p2",
            points: { p1: 1, p2: 0, p3: 2 },
            eliminatedPlayers: [],
            status: NUMWIT_GAME_STATUS.COMPLETED,
          },
        }, overrides);
      }

      test("a void round re-emits round_void, resets game state, and reschedules", async () => {
        jest.useFakeTimers();
        const room = makeRoom();
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue({
          roundVoid: true,
          reason: "all_same",
          submissions: [{ socketId: "p1", number: 50 }],
          round: 1,
        });

        const io = makeIo();
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });

        expect(io._emit).toHaveBeenCalledWith("round_void", {
          round: 1,
          reason: "all_same",
          submissions: [{ socketId: "p1", number: 50 }],
        });
        expect(room.game.numbers).toEqual({});
        expect(room.game.submittedCount).toBe(0);
        expect(room.game.status).toBe(NUMWIT_GAME_STATUS.IN_PROGRESS);
        expect(timerService.startTimer).toHaveBeenCalledWith(io, "r1", room, 30, expect.any(Function));
        expect(botService.scheduleBotSubmissions).toHaveBeenCalledWith("r1", room.game, expect.any(Function));
      });

      test("a normal round emits round_result, updates points/winHistory, and schedules the next round", async () => {
        jest.useFakeTimers();
        const room = makeRoom();
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult());

        const io = makeIo();
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });

        expect(timerService.clearTimer).toHaveBeenCalledWith("r1");
        expect(botService.clearSubmissionTimers).toHaveBeenCalledWith("r1");
        expect(io._emit).toHaveBeenCalledWith("round_result", expect.objectContaining({ winnerIds: ["p2"] }));
        expect(room.game.winHistory.p2).toBe(1);
        expect(room.game.points).toEqual({ p1: 1, p2: 0, p3: 2 });

        await jest.advanceTimersByTimeAsync(10000);

        expect(room.game.round).toBe(2);
        expect(room.game.numbers).toEqual({});
        expect(room.game.status).toBe(NUMWIT_GAME_STATUS.IN_PROGRESS);
        expect(io._emit).toHaveBeenCalledWith("next_round", expect.objectContaining({ round: 2 }));
        expect(timerService.startTimer).toHaveBeenCalledWith(io, "r1", room, 30, expect.any(Function));
      });

      test("an exact match emits exact_match_penalty and updates exactMatchHistory", async () => {
        jest.useFakeTimers();
        const room = makeRoom();
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult({ exactMatch: true }));

        const io = makeIo();
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });

        expect(io._emit).toHaveBeenCalledWith("exact_match_penalty", { target: 24, winnerIds: ["p2"], points: { p1: 1, p2: 0, p3: 2 } });
        expect(room.game.exactMatchHistory.p2).toBe(1);

        await jest.advanceTimersByTimeAsync(10000);
      });

      test("a two-player cycle emits two_players_left_result", async () => {
        jest.useFakeTimers();
        const room = makeRoom({
          users: [{ socketId: "p1" }, { socketId: "p2" }],
          game: Object.assign({}, makeRoom().game, { turnOrder: ["p1", "p2"], numbers: { p1: 50 }, submittedCount: 1 }),
        });
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult({
          twoPlayerCycle: true,
          winnerIds: ["p1"],
          winnerSocketId: "p1",
        }));

        const io = makeIo();
        const socket = makeSocket("p2");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 40 });

        expect(io._emit).toHaveBeenCalledWith("two_players_left_result", { winnerIds: ["p1"], winnerSocketId: "p1" });

        await jest.advanceTimersByTimeAsync(10000);
      });

      test("newly eliminated players trigger player_eliminated events", async () => {
        jest.useFakeTimers();
        const room = makeRoom();
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult({
          newlyEliminated: ["p3"],
          updatedGame: Object.assign({}, makeNormalResult().updatedGame, { eliminatedPlayers: ["p3"] }),
        }));

        const io = makeIo();
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });

        expect(io._emit).toHaveBeenCalledWith("player_eliminated", { socketId: "p3" });

        await jest.advanceTimersByTimeAsync(10000);
      });

      test("the 5s next-round timer is a no-op when restart_game cleared the game in the meantime", async () => {
        jest.useFakeTimers();
        const room = makeRoom();
        // First call (within resolveRound) returns the room, subsequent (within setTimeout) returns null
        roomManager.getRoomById.mockResolvedValueOnce(room).mockResolvedValueOnce(null);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult());

        const io = makeIo();
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
        io._emit.mockClear();

        await jest.advanceTimersByTimeAsync(10000);

        expect(io._emit).not.toHaveBeenCalledWith("next_round", expect.anything());
      });

      test("promotes pending joiners into turnOrder for the next round", async () => {
        jest.useFakeTimers();
        const room = makeRoom();
        room.game.pendingJoiners = ["p4"];
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult());

        const io = makeIo();
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
        await jest.advanceTimersByTimeAsync(10000);

        expect(room.game.turnOrder).toContain("p4");
        expect(room.game.points.p4).toBe(0);
        expect(room.game.pendingJoiners).toEqual([]);
      });

      test("when only one player remains, emits game_over and persists stats/achievements", async () => {
        const room = makeRoom({
          users: [
            { socketId: "p1", deviceId: "dev1" },
            { socketId: "p2", deviceId: "dev2" },
            { socketId: "p3" }, // bot, no deviceId
          ],
        });
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult({
          winnerIds: ["p1"],
          winnerSocketId: "p1",
          newlyEliminated: ["p2", "p3"],
          updatedGame: Object.assign({}, makeNormalResult().updatedGame, {
            eliminatedPlayers: ["p2", "p3"],
            winnerIds: ["p1"],
            winnerSocketId: "p1",
          }),
        }));

        userService.awardXp.mockResolvedValue({ xp: 120, level: 2, xpGained: 20, levelUp: false });
        userService.getProfile.mockResolvedValue({ id: "userId1" });
        statsService.getPlayerStats.mockResolvedValue({ gamesPlayed: 5 });
        achievementService.checkAndAward.mockResolvedValue([
          { id: "first_win", name: "First Win", icon: "🏆", description: "Win your first game" },
        ]);

        const targetSocket = { emit: jest.fn() };
        const io = makeIo({ sockets: { sockets: { get: jest.fn(() => targetSocket) } } });
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });

        expect(io._emit).toHaveBeenCalledWith("game_over", {
          winnerSocketId: "p1",
          points: { p1: 1, p2: 0, p3: 2 },
          reason: "elimination",
        });
        expect(botService.clearSubmissionTimers).toHaveBeenCalledWith("r1");

        await flush();

        expect(statsService.writeSessionStat).toHaveBeenCalledWith("dev1", expect.objectContaining({ rounds: 1, survived: true }));
        expect(userService.awardXp).toHaveBeenCalledWith("dev1", expect.any(Object));
        expect(achievementService.checkAndAward).toHaveBeenCalled();
        expect(targetSocket.emit).toHaveBeenCalledWith("achievement_unlocked", expect.objectContaining({ id: "first_win" }));
        expect(targetSocket.emit).toHaveBeenCalledWith("xp_update", expect.objectContaining({ xp: 120, level: 2, xpLevelStart: 100, xpNextLevel: 250, progress: 0.0 + 20 / 150 }));
      });

      test("when game_over fires with no winner, winnerSocketId is null", async () => {
        const room = makeRoom({ users: [{ socketId: "p1" }, { socketId: "p2" }, { socketId: "p3" }] });
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult({
          updatedGame: Object.assign({}, makeNormalResult().updatedGame, {
            eliminatedPlayers: ["p1", "p2", "p3"],
          }),
        }));

        const io = makeIo({ sockets: { sockets: { get: jest.fn(() => null) } } });
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
        await flush();

        expect(io._emit).toHaveBeenCalledWith("game_over", expect.objectContaining({ winnerSocketId: null }));
      });

      test("persistGameOver skips users without a deviceId and without a resolvable profile", async () => {
        const room = makeRoom({
          users: [
            { socketId: "p1" }, // bot, no deviceId — entirely skipped
            { socketId: "p2", deviceId: "dev2" },
          ],
        });
        roomManager.getRoomById.mockResolvedValue(room);
        gameManager.evaluateRound.mockReturnValue(makeNormalResult({
          updatedGame: Object.assign({}, makeNormalResult().updatedGame, { eliminatedPlayers: ["p2"] }),
        }));

        userService.awardXp.mockResolvedValue({ xp: 10, level: 1, xpGained: 10, levelUp: false });
        userService.getProfile.mockResolvedValue(null); // profile not found -> achievements skipped

        const io = makeIo({ sockets: { sockets: { get: jest.fn(() => ({ emit: jest.fn() })) } } });
        const socket = makeSocket("p1");
        handleGameEvents(io, socket);

        await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
        await flush();

        expect(statsService.writeSessionStat).toHaveBeenCalledTimes(1);
        expect(statsService.writeSessionStat).toHaveBeenCalledWith("dev2", expect.any(Object));
        expect(achievementService.checkAndAward).not.toHaveBeenCalled();
      });
    });
  });

  describe("restart_game", () => {
    test("returns early when room doesn't exist", async () => {
      roomManager.getRoomById.mockResolvedValue(null);
      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "restart_game")({ roomId: "r1" });
      expect(roomManager.saveRoom).not.toHaveBeenCalled();
    });

    test("rejects restart from a non-host", async () => {
      roomManager.getRoomById.mockResolvedValue({ id: "r1", hostSocketId: "hostSock", game: {} });
      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "restart_game")({ roomId: "r1" });
      expect(socket.emit).toHaveBeenCalledWith("error_message", { message: "Only the host can restart the game" });
      expect(roomManager.saveRoom).not.toHaveBeenCalled();
    });

    test("host restart clears timers, nulls the game, and resets the room", async () => {
      const room = { id: "r1", hostSocketId: "h1", game: { round: 2 } };
      roomManager.getRoomById.mockResolvedValue(room);
      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);

      await getHandler(socket, "restart_game")({ roomId: "r1" });

      expect(timerService.clearTimer).toHaveBeenCalledWith("r1");
      expect(botService.clearSubmissionTimers).toHaveBeenCalledWith("r1");
      expect(room.game).toBeNull();
      expect(roomManager.saveRoom).toHaveBeenCalledWith(room);
      expect(io._emit).toHaveBeenCalledWith("game_reset");
      expect(io._emit).toHaveBeenCalledWith("room_update", room);
    });

    test("host restart cancels a pending round-advance so next_round never fires", async () => {
      jest.useFakeTimers();

      // Resolve a round so resolveRound schedules the 10s round-advance.
      const room = {
        id: "r1",
        hostSocketId: "h1",
        users: [{ socketId: "p1" }, { socketId: "p2" }, { socketId: "p3" }],
        game: {
          round: 1,
          turnOrder: ["p1", "p2", "p3"],
          eliminatedPlayers: [],
          numbers: { p2: 40, p3: 10 },
          status: NUMWIT_GAME_STATUS.IN_PROGRESS,
          submittedCount: 2,
          settings: { timerDuration: 30 },
          points: { p1: 0, p2: 0, p3: 0 },
          winHistory: {},
          exactMatchHistory: {},
          consecWinHistory: {},
          maxConsecWinHistory: {},
          wasLastPlaceSet: {},
        },
      };
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.evaluateRound.mockReturnValue({
        roundVoid: false,
        round: 1,
        average: 30,
        target: 24,
        winnerIds: ["p2"],
        winnerSocketId: "p2",
        submissions: [{ socketId: "p1", number: 50 }, { socketId: "p2", number: 40 }, { socketId: "p3", number: 10 }],
        validSubmissions: [],
        invalidSubmissions: [],
        points: { p1: 1, p2: 0, p3: 2 },
        exactMatch: false,
        twoPlayerCycle: false,
        newlyEliminated: [],
        updatedGame: {
          average: 30, target: 24, winnerIds: ["p2"], winnerSocketId: "p2",
          points: { p1: 1, p2: 0, p3: 2 }, eliminatedPlayers: [], status: NUMWIT_GAME_STATUS.COMPLETED,
        },
      });

      const io = makeIo();
      const playerSocket = makeSocket("p1");
      handleGameEvents(io, playerSocket);
      await getHandler(playerSocket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      io._emit.mockClear();

      // Host restarts before the 10s round-advance fires.
      const hostSocket = makeSocket("h1");
      handleGameEvents(io, hostSocket);
      await getHandler(hostSocket, "restart_game")({ roomId: "r1" });

      io._emit.mockClear();
      await jest.advanceTimersByTimeAsync(10000);

      expect(io._emit).not.toHaveBeenCalledWith("next_round", expect.anything());
    });
  });

  describe("skip_round_result", () => {
    function makeRoom(overrides) {
      return Object.assign({
        id: "r1",
        users: [{ socketId: "p1" }, { socketId: "p2" }, { socketId: "p3" }],
        game: {
          round: 1,
          turnOrder: ["p1", "p2", "p3"],
          eliminatedPlayers: [],
          numbers: { p2: 40, p3: 10 },
          status: NUMWIT_GAME_STATUS.IN_PROGRESS,
          submittedCount: 2,
          settings: { timerDuration: 30 },
          points: { p1: 0, p2: 0, p3: 0 },
          winHistory: {},
          exactMatchHistory: {},
          consecWinHistory: {},
          maxConsecWinHistory: {},
          wasLastPlaceSet: {},
        },
      }, overrides);
    }

    function makeNormalResult(overrides) {
      return Object.assign({
        roundVoid: false,
        round: 1,
        average: 30,
        target: 24,
        winnerIds: ["p2"],
        winnerSocketId: "p2",
        submissions: [{ socketId: "p1", number: 50 }, { socketId: "p2", number: 40 }, { socketId: "p3", number: 10 }],
        validSubmissions: [],
        invalidSubmissions: [],
        points: { p1: 1, p2: 0, p3: 2 },
        exactMatch: false,
        twoPlayerCycle: false,
        newlyEliminated: [],
        updatedGame: {
          average: 30,
          target: 24,
          winnerIds: ["p2"],
          winnerSocketId: "p2",
          points: { p1: 1, p2: 0, p3: 2 },
          eliminatedPlayers: [],
          status: NUMWIT_GAME_STATUS.COMPLETED,
        },
      }, overrides);
    }

    test("is a no-op when nothing is pending for the room", async () => {
      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "skip_round_result")({ roomId: "some-other-room" });

      expect(roomManager.getRoomById).not.toHaveBeenCalled();
      expect(io._emit).not.toHaveBeenCalled();
    });

    test("immediately advances to the next round, cancelling the scheduled delay", async () => {
      jest.useFakeTimers();
      const room = makeRoom();
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.evaluateRound.mockReturnValue(makeNormalResult());

      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      io._emit.mockClear();

      // Skip well before the normal 10s delay would elapse.
      await getHandler(socket, "skip_round_result")({ roomId: "r1" });

      expect(room.game.round).toBe(2);
      expect(room.game.status).toBe(NUMWIT_GAME_STATUS.IN_PROGRESS);
      expect(io._emit).toHaveBeenCalledWith("next_round", expect.objectContaining({ round: 2 }));
      expect(timerService.startTimer).toHaveBeenCalledWith(io, "r1", room, 30, expect.any(Function));
      expect(botService.scheduleBotSubmissions).toHaveBeenCalledWith("r1", room.game, expect.any(Function));

      // The originally-scheduled advance must not fire a second time.
      io._emit.mockClear();
      await jest.advanceTimersByTimeAsync(10000);
      expect(io._emit).not.toHaveBeenCalledWith("next_round", expect.anything());
    });

    test("does nothing if the room or game disappeared before the skip is processed", async () => {
      jest.useFakeTimers();
      const room = makeRoom();
      roomManager.getRoomById.mockResolvedValueOnce(room).mockResolvedValueOnce(null);
      gameManager.evaluateRound.mockReturnValue(makeNormalResult());

      const io = makeIo();
      const socket = makeSocket("p1");
      handleGameEvents(io, socket);

      await getHandler(socket, "send_number")({ roomId: "r1", user: { name: "P" }, no: 50 });
      io._emit.mockClear();

      await getHandler(socket, "skip_round_result")({ roomId: "r1" });

      expect(io._emit).not.toHaveBeenCalledWith("next_round", expect.anything());
    });
  });

  describe("startGameForRoom (exported)", () => {
    test("returns early when room doesn't exist", async () => {
      roomManager.getRoomById.mockResolvedValue(null);
      const io = makeIo();
      await handleGameEvents.startGameForRoom(io, "r1", {});
      expect(roomManager.removeFromPublicSet).not.toHaveBeenCalled();
    });
  });

  describe("handleTimerExpiry (via timerService.startTimer's onExpire callback)", () => {
    async function setupStartedGame() {
      jest.useFakeTimers();
      const room = { id: "r1", hostSocketId: "h1", users: [{ socketId: "h1" }, { socketId: "b" }, { socketId: "c" }], game: null };
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.createGameData.mockResolvedValue({
        round: 1, points: {}, turnOrder: ["h1", "b", "c"], eliminatedPlayers: [], settings: { timerDuration: 30 },
      });

      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);
      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });
      await jest.advanceTimersByTimeAsync(300);

      const onExpire = timerService.startTimer.mock.calls[0][4];
      return { io, onExpire, room };
    }

    test("does nothing when the room no longer exists", async () => {
      const { io, onExpire } = await setupStartedGame();
      roomManager.getRoomById.mockResolvedValue(null);
      io._emit.mockClear();

      await onExpire(io, "r1");
      expect(io._emit).not.toHaveBeenCalled();
    });

    test("does nothing when the round is already completed", async () => {
      const { io, onExpire, room } = await setupStartedGame();
      room.game = { status: NUMWIT_GAME_STATUS.COMPLETED, round: 1 };
      roomManager.getRoomById.mockResolvedValue(room);
      io._emit.mockClear();

      await onExpire(io, "r1");
      expect(io._emit).not.toHaveBeenCalled();
    });

    test("emits timer_expired but skips resolution when there are no active players", async () => {
      const { io, onExpire, room } = await setupStartedGame();
      room.game = { status: NUMWIT_GAME_STATUS.IN_PROGRESS, round: 1, eliminatedPlayers: [], turnOrder: [] };
      room.users = [{ socketId: "h1" }];
      roomManager.getRoomById.mockResolvedValue(room);
      io._emit.mockClear();

      await onExpire(io, "r1");
      expect(io._emit).toHaveBeenCalledWith("timer_expired", { roomId: "r1", round: 1 });
      expect(gameManager.evaluateRound).not.toHaveBeenCalled();
    });

    test("resolves the round when the timer expires with active players", async () => {
      const { io, onExpire, room } = await setupStartedGame();
      room.game = {
        status: NUMWIT_GAME_STATUS.IN_PROGRESS,
        round: 1,
        eliminatedPlayers: [],
        turnOrder: ["h1", "b", "c"],
        numbers: { h1: 10, b: 20, c: 30 },
        submittedCount: 3,
        settings: { timerDuration: 30 },
        points: {},
        winHistory: {},
        exactMatchHistory: {},
        consecWinHistory: {},
        maxConsecWinHistory: {},
        wasLastPlaceSet: {},
      };
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.evaluateRound.mockReturnValue({
        roundVoid: false,
        round: 1,
        average: 20,
        target: 16,
        winnerIds: ["b"],
        winnerSocketId: "b",
        submissions: [],
        validSubmissions: [],
        invalidSubmissions: [],
        points: { h1: 1, b: 0, c: 1 },
        exactMatch: false,
        twoPlayerCycle: false,
        newlyEliminated: [],
        updatedGame: {
          average: 20, target: 16, winnerIds: ["b"], winnerSocketId: "b",
          points: { h1: 1, b: 0, c: 1 }, eliminatedPlayers: [], status: NUMWIT_GAME_STATUS.COMPLETED,
        },
      });
      io._emit.mockClear();

      await onExpire(io, "r1");

      expect(io._emit).toHaveBeenCalledWith("timer_expired", { roomId: "r1", round: 1 });
      expect(io._emit).toHaveBeenCalledWith("round_result", expect.objectContaining({ winnerIds: ["b"] }));

      await jest.advanceTimersByTimeAsync(10000);
    });
  });

  describe("bot submission callback (via botService.scheduleBotSubmissions)", () => {
    async function setupStartedGame() {
      jest.useFakeTimers();
      const room = { id: "r1", hostSocketId: "h1", users: [{ socketId: "h1" }, { socketId: "bot-r1-0" }, { socketId: "c" }], game: null };
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.createGameData.mockResolvedValue({
        round: 1, points: {}, turnOrder: ["h1", "bot-r1-0", "c"], eliminatedPlayers: [], settings: { timerDuration: 30 },
      });

      const io = makeIo();
      const socket = makeSocket("h1");
      handleGameEvents(io, socket);
      await getHandler(socket, "start_game")({ roomId: "r1", settings: {} });
      await jest.advanceTimersByTimeAsync(300);

      const submitCallback = botService.scheduleBotSubmissions.mock.calls[0][2];
      return { io, submitCallback, room };
    }

    test("does nothing when the room or its game no longer exists", async () => {
      const { submitCallback } = await setupStartedGame();
      roomManager.getRoomById.mockResolvedValue(null);
      await submitCallback("bot-r1-0", 42);
      expect(roomManager.saveRoom).not.toHaveBeenCalled();
    });

    test("does nothing when the bot is not in turnOrder", async () => {
      const { submitCallback, room } = await setupStartedGame();
      room.game = { turnOrder: ["h1", "c"], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS };
      roomManager.getRoomById.mockResolvedValue(room);

      await submitCallback("bot-r1-0", 42);
      expect(roomManager.saveRoom).not.toHaveBeenCalled();
    });

    test("does nothing when the bot is eliminated, already submitted, or round completed", async () => {
      const { submitCallback, room } = await setupStartedGame();

      room.game = { turnOrder: ["bot-r1-0"], eliminatedPlayers: ["bot-r1-0"], numbers: {}, status: NUMWIT_GAME_STATUS.IN_PROGRESS };
      roomManager.getRoomById.mockResolvedValue(room);
      await submitCallback("bot-r1-0", 42);

      room.game = { turnOrder: ["bot-r1-0"], eliminatedPlayers: [], numbers: { "bot-r1-0": 10 }, status: NUMWIT_GAME_STATUS.IN_PROGRESS };
      await submitCallback("bot-r1-0", 42);

      room.game = { turnOrder: ["bot-r1-0"], eliminatedPlayers: [], numbers: {}, status: NUMWIT_GAME_STATUS.COMPLETED };
      await submitCallback("bot-r1-0", 42);

      expect(roomManager.saveRoom).not.toHaveBeenCalled();
    });

    test("submits a valid bot number", async () => {
      const { submitCallback, room } = await setupStartedGame();
      room.game = {
        turnOrder: ["h1", "bot-r1-0", "c"],
        eliminatedPlayers: [],
        numbers: { h1: 50, c: 60 },
        status: NUMWIT_GAME_STATUS.IN_PROGRESS,
        submittedCount: 2,
        settings: { timerDuration: 30 },
        points: {},
        winHistory: {},
        exactMatchHistory: {},
        consecWinHistory: {},
        maxConsecWinHistory: {},
        wasLastPlaceSet: {},
      };
      roomManager.getRoomById.mockResolvedValue(room);
      gameManager.evaluateRound.mockReturnValue({
        roundVoid: false,
        round: 1,
        average: 53,
        target: 42,
        winnerIds: ["bot-r1-0"],
        winnerSocketId: "bot-r1-0",
        submissions: [],
        validSubmissions: [],
        invalidSubmissions: [],
        points: {},
        exactMatch: false,
        twoPlayerCycle: false,
        newlyEliminated: [],
        updatedGame: {
          average: 53, target: 42, winnerIds: ["bot-r1-0"], winnerSocketId: "bot-r1-0",
          points: {}, eliminatedPlayers: [], status: NUMWIT_GAME_STATUS.COMPLETED,
        },
      });

      await submitCallback("bot-r1-0", 42);

      expect(room.game.numbers["bot-r1-0"]).toBe(42);
      expect(roomManager.saveRoom).toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(10000);
    });
  });
});
