jest.mock("../../utils/roomManager", () => ({
  addUserToRoom: jest.fn(),
  removeUserFromRoom: jest.fn(),
  getPublicRooms: jest.fn(),
  getRoomById: jest.fn(),
  deleteRoom: jest.fn(),
  saveRoom: jest.fn(),
}));
jest.mock("../../utils/rateLimiter", () => ({
  clear: jest.fn(),
}));
jest.mock("../../db/userService", () => ({
  upsertUser: jest.fn(() => Promise.resolve({})),
}));
jest.mock("../../services/timerService", () => ({
  getTimeLeft: jest.fn(),
  clearTimer: jest.fn(),
  startTimer: jest.fn(),
}));
jest.mock("../../services/botService", () => ({
  fillRoomWithBots: jest.fn(),
  scheduleBotFill: jest.fn(),
  hasOnlyBots: jest.fn(),
  removeRoom: jest.fn(),
  clearSubmissionTimers: jest.fn(),
}));
jest.mock("../game", () => ({
  startGameForRoom: jest.fn(() => Promise.resolve()),
}));

const roomManager = require("../../utils/roomManager");
const rateLimiter = require("../../utils/rateLimiter");
const userService = require("../../db/userService");
const timerService = require("../../services/timerService");
const botService = require("../../services/botService");
const gameHandlers = require("../game");
const handleLobbyEvents = require("../lobby");
const { MIN_PLAYERS } = require("../../constants/constants");

function makeIo() {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function makeSocket(id) {
  return {
    id: id || "socket1",
    on: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  };
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

describe("lobby socket handler", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("join_room", () => {
    test("upserts the user in DB when deviceId and name are provided", async () => {
      roomManager.getPublicRooms.mockResolvedValue(null);
      roomManager.addUserToRoom.mockResolvedValue({ id: "room1", users: [{ socketId: "s1" }] });
      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "room1",
        user: { name: "Alice", avatar: "🐱" },
        roomType: "private",
        deviceId: "dev1",
      });

      expect(userService.upsertUser).toHaveBeenCalledWith("dev1", "Alice", "🐱");
    });

    test("does not upsert when deviceId is missing", async () => {
      roomManager.addUserToRoom.mockResolvedValue({ id: "room1", users: [{ socketId: "s1" }] });
      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "room1",
        user: { name: "Alice" },
        roomType: "private",
      });

      expect(userService.upsertUser).not.toHaveBeenCalled();
    });

    test("tags the in-room user with deviceId so a refresh can replace its stale entry", async () => {
      roomManager.addUserToRoom.mockResolvedValue({ id: "room1", users: [{ socketId: "s1" }] });
      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "room1",
        user: { name: "Alice" },
        roomType: "private",
        deviceId: "dev1",
      });

      expect(roomManager.addUserToRoom).toHaveBeenCalledWith(
        "room1",
        expect.objectContaining({ name: "Alice", socketId: "s1", deviceId: "dev1" }),
        "private",
        false
      );
    });

    test("does not set deviceId on the in-room user when not provided", async () => {
      roomManager.addUserToRoom.mockResolvedValue({ id: "room1", users: [{ socketId: "s1" }] });
      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "room1",
        user: { name: "Alice" },
        roomType: "private",
      });

      const passedUser = roomManager.addUserToRoom.mock.calls[0][1];
      expect(passedUser.deviceId).toBeUndefined();
    });

    test("solo mode fills room with bots and starts the game immediately", async () => {
      const room = { id: "roomSolo", users: [{ socketId: "s1" }], game: null };
      roomManager.addUserToRoom.mockResolvedValue(room);
      const bots = [{ socketId: "bot-roomSolo-0" }, { socketId: "bot-roomSolo-1" }];
      botService.fillRoomWithBots.mockReturnValue(bots);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: null,
        user: { name: "Solo" },
        roomType: "solo",
        botDifficulty: "sharp",
      });

      const roomNo = socket.join.mock.calls[0][0];

      expect(room.botDifficulty).toBe("sharp");
      expect(botService.fillRoomWithBots).toHaveBeenCalledWith(room, MIN_PLAYERS);
      expect(roomManager.saveRoom).toHaveBeenCalledWith(room);
      expect(io._emit).toHaveBeenCalledWith("room_update", room);
      expect(io._emit).toHaveBeenCalledWith("bots_added", { roomId: roomNo, bots });
      expect(gameHandlers.startGameForRoom).toHaveBeenCalledWith(io, roomNo, { botDifficulty: "sharp" });
    });

    test("solo mode without added bots does not emit bots_added", async () => {
      const room = { id: "roomSolo2", users: [{ socketId: "s1" }, { socketId: "s2" }, { socketId: "s3" }], game: null };
      roomManager.addUserToRoom.mockResolvedValue(room);
      botService.fillRoomWithBots.mockReturnValue([]);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: null,
        user: { name: "Solo" },
        roomType: "solo",
      });

      const roomNo = socket.join.mock.calls[0][0];

      expect(io._emit).not.toHaveBeenCalledWith("bots_added", expect.anything());
      // No difficulty chosen → adaptive
      expect(gameHandlers.startGameForRoom).toHaveBeenCalledWith(io, roomNo, { botDifficulty: "adaptive" });
    });

    test("joins an existing public room found via getPublicRooms", async () => {
      const existingRoom = { id: "existingRoom", users: [{ socketId: "s1" }, { socketId: "s2" }], game: null };
      roomManager.getPublicRooms.mockResolvedValue({ id: "existingRoom" });
      roomManager.addUserToRoom.mockResolvedValue(existingRoom);

      const io = makeIo();
      const socket = makeSocket("s2");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: null,
        user: { name: "Bob" },
        roomType: "public",
      });

      expect(roomManager.addUserToRoom).toHaveBeenCalledWith("existingRoom", expect.any(Object), "public", true);
      expect(socket.join).toHaveBeenCalledWith("existingRoom");
    });

    test("creates a brand new public room and schedules bot-fill when below MIN_PLAYERS", async () => {
      roomManager.getPublicRooms.mockResolvedValue(null);
      let createdRoomId;
      roomManager.addUserToRoom.mockImplementation((roomNo) => {
        createdRoomId = roomNo;
        return Promise.resolve({ id: roomNo, users: [{ socketId: "s3" }], game: null });
      });

      const io = makeIo();
      const socket = makeSocket("s3");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: null,
        user: { name: "Carl" },
        roomType: "public",
      });

      expect(botService.scheduleBotFill).toHaveBeenCalledWith(createdRoomId, expect.any(Number), expect.any(Function));
      expect(roomManager.saveRoom).toHaveBeenCalled();
      expect(io._emit).toHaveBeenCalledWith("room_update", expect.objectContaining({ id: createdRoomId }));
    });

    test("does not schedule bot-fill for a new public room when BOT_FILL_ENABLED is false", async () => {
      const constants = require("../../constants/constants");
      const original = constants.BOT_FILL_ENABLED;
      constants.BOT_FILL_ENABLED = false;

      try {
        roomManager.getPublicRooms.mockResolvedValue(null);
        let createdRoomId;
        roomManager.addUserToRoom.mockImplementation((roomNo) => {
          createdRoomId = roomNo;
          return Promise.resolve({ id: roomNo, users: [{ socketId: "s3b" }], game: null });
        });

        const io = makeIo();
        const socket = makeSocket("s3b");
        handleLobbyEvents(io, socket);

        await getHandler(socket, "join_room")({
          roomId: null,
          user: { name: "Dana" },
          roomType: "public",
        });

        expect(botService.scheduleBotFill).not.toHaveBeenCalled();
        expect(roomManager.saveRoom).not.toHaveBeenCalled();
        expect(io._emit).toHaveBeenCalledWith("room_update", expect.objectContaining({ id: createdRoomId }));
      } finally {
        constants.BOT_FILL_ENABLED = original;
      }
    });

    test("private room joins with the supplied roomId", async () => {
      roomManager.addUserToRoom.mockResolvedValue({ id: "priv1", users: [{ socketId: "s4" }], game: null });

      const io = makeIo();
      const socket = makeSocket("s4");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "priv1",
        user: { name: "Dana" },
        roomType: "private",
      });

      expect(roomManager.getPublicRooms).not.toHaveBeenCalled();
      expect(roomManager.addUserToRoom).toHaveBeenCalledWith("priv1", expect.any(Object), "private", false);
    });

    test("emits error_message when addUserToRoom throws", async () => {
      roomManager.addUserToRoom.mockRejectedValue(new Error("Room is full"));

      const io = makeIo();
      const socket = makeSocket("s5");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "fullroom",
        user: { name: "Eve" },
        roomType: "private",
      });

      expect(socket.emit).toHaveBeenCalledWith("error_message", { message: "Room is full" });
    });

    test("queues a mid-game joiner and sends game_in_progress snapshot", async () => {
      const room = {
        id: "roomGame",
        users: [{ socketId: "s6" }],
        hostSocketId: "s1",
        game: {
          round: 2,
          points: { s1: 1 },
          turnOrder: ["s1"],
          eliminatedPlayers: [],
          settings: { timerDuration: 30 },
          pendingJoiners: [],
        },
      };
      roomManager.addUserToRoom.mockResolvedValue(room);
      timerService.getTimeLeft.mockReturnValue(15);

      const io = makeIo();
      const socket = makeSocket("s6");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "roomGame",
        user: { name: "Frank" },
        roomType: "private",
      });

      expect(room.game.pendingJoiners).toContain("s6");
      expect(roomManager.saveRoom).toHaveBeenCalledWith(room);
      expect(socket.emit).toHaveBeenCalledWith("game_in_progress", expect.objectContaining({
        round: 2,
        timerDuration: 15,
      }));
    });

    test("does not duplicate pendingJoiners on rapid reconnect", async () => {
      const room = {
        id: "roomGame2",
        users: [{ socketId: "s7" }],
        hostSocketId: "s1",
        game: {
          round: 1,
          points: {},
          turnOrder: ["s1"],
          eliminatedPlayers: [],
          settings: {},
          pendingJoiners: ["s7"],
        },
      };
      roomManager.addUserToRoom.mockResolvedValue(room);
      timerService.getTimeLeft.mockReturnValue(null);

      const io = makeIo();
      const socket = makeSocket("s7");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({
        roomId: "roomGame2",
        user: { name: "Gina" },
        roomType: "private",
      });

      expect(room.game.pendingJoiners).toEqual(["s7"]);
      expect(socket.emit).toHaveBeenCalledWith("game_in_progress", expect.objectContaining({ timerDuration: 0 }));
    });
  });

  describe("leave_room", () => {
    test("removes the user, leaves the socket room, and calls back ok", async () => {
      const room = { id: "room1", users: [{ socketId: "other" }] };
      roomManager.removeUserFromRoom.mockResolvedValue(room);
      botService.hasOnlyBots.mockReturnValue(false);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);
      const callback = jest.fn();

      await getHandler(socket, "leave_room")(callback);

      expect(socket.leave).toHaveBeenCalledWith("room1");
      expect(io._emit).toHaveBeenCalledWith("room_update", room);
      expect(callback).toHaveBeenCalledWith({ status: "ok" });
    });

    test("calls back with error when user is not in a room", async () => {
      roomManager.removeUserFromRoom.mockResolvedValue(null);

      const io = makeIo();
      const socket = makeSocket("s2");
      handleLobbyEvents(io, socket);
      const callback = jest.fn();

      await getHandler(socket, "leave_room")(callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: "User not in a room" });
    });

    test("does not throw when no callback is provided", async () => {
      roomManager.removeUserFromRoom.mockResolvedValue(null);

      const io = makeIo();
      const socket = makeSocket("s3");
      handleLobbyEvents(io, socket);

      await expect(getHandler(socket, "leave_room")()).resolves.toBeUndefined();
    });

    test("deletes a room left with only bots remaining", async () => {
      const room = { id: "botRoom", users: [{ socketId: "bot-botRoom-0" }] };
      roomManager.removeUserFromRoom.mockResolvedValue(room);
      botService.hasOnlyBots.mockReturnValue(true);

      const io = makeIo();
      const socket = makeSocket("s4");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "leave_room")(jest.fn());

      expect(timerService.clearTimer).toHaveBeenCalledWith("botRoom");
      expect(botService.removeRoom).toHaveBeenCalledWith("botRoom");
      expect(roomManager.deleteRoom).toHaveBeenCalledWith("botRoom");
      expect(io._emit).not.toHaveBeenCalledWith("room_update", expect.anything());
    });
  });

  describe("disconnect", () => {
    test("clears the rate limiter for the socket", async () => {
      roomManager.removeUserFromRoom.mockResolvedValue(null);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "disconnect")();

      expect(rateLimiter.clear).toHaveBeenCalledWith("s1");
    });

    test("does nothing further when the user was not in a room", async () => {
      roomManager.removeUserFromRoom.mockResolvedValue(null);

      const io = makeIo();
      const socket = makeSocket("s2");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "disconnect")();

      expect(io._emit).not.toHaveBeenCalled();
    });

    test("emits game_over with opponent_disconnected when active players drop below MIN_PLAYERS", async () => {
      const room = {
        id: "roomD",
        users: [{ socketId: "remaining" }],
        game: {
          eliminatedPlayers: [],
          turnOrder: ["remaining"],
          points: { remaining: 0 },
        },
      };
      roomManager.removeUserFromRoom.mockResolvedValue(room);
      botService.hasOnlyBots.mockReturnValue(false);

      const io = makeIo();
      const socket = makeSocket("s3");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "disconnect")();

      expect(io._emit).toHaveBeenCalledWith("game_over", {
        winnerSocketId: "remaining",
        points: room.game.points,
        reason: "opponent_disconnected",
      });
    });

    test("emits game_over with null winner when no active players remain", async () => {
      const room = {
        id: "roomE",
        users: [],
        game: {
          eliminatedPlayers: [],
          turnOrder: [],
          points: {},
        },
      };
      roomManager.removeUserFromRoom.mockResolvedValue(room);
      botService.hasOnlyBots.mockReturnValue(false);

      const io = makeIo();
      const socket = makeSocket("s4");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "disconnect")();

      expect(io._emit).toHaveBeenCalledWith("game_over", {
        winnerSocketId: null,
        points: {},
        reason: "opponent_disconnected",
      });
    });

    test("does not emit game_over when enough active players remain", async () => {
      const room = {
        id: "roomF",
        users: [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }],
        game: {
          eliminatedPlayers: [],
          turnOrder: ["a", "b", "c"],
          points: {},
        },
      };
      roomManager.removeUserFromRoom.mockResolvedValue(room);
      botService.hasOnlyBots.mockReturnValue(false);

      const io = makeIo();
      const socket = makeSocket("s5");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "disconnect")();

      expect(io._emit).not.toHaveBeenCalledWith("game_over", expect.anything());
    });
  });

  describe("bot-fill timer callback (fillRoomWithBotsAndStart)", () => {
    test("does nothing when the room no longer exists", async () => {
      roomManager.getPublicRooms.mockResolvedValue(null);
      roomManager.addUserToRoom.mockResolvedValue({ id: "roomBF", users: [{ socketId: "s1" }], game: null });
      roomManager.getRoomById.mockResolvedValue(null);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({ roomId: null, user: { name: "A" }, roomType: "public" });

      const fillCallback = botService.scheduleBotFill.mock.calls[0][2];
      fillCallback("roomBF");
      await flush();
      expect(roomManager.saveRoom).not.toHaveBeenCalledTimes(2);
    });

    test("does nothing when the room already has a game", async () => {
      roomManager.getPublicRooms.mockResolvedValue(null);
      roomManager.addUserToRoom.mockResolvedValue({ id: "roomBF2", users: [{ socketId: "s1" }], game: null });
      roomManager.getRoomById.mockResolvedValue({ id: "roomBF2", users: [{ socketId: "s1" }], game: { round: 1 } });

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({ roomId: null, user: { name: "A" }, roomType: "public" });

      const fillCallback = botService.scheduleBotFill.mock.calls[0][2];
      fillCallback("roomBF2");
      await flush();
      expect(gameHandlers.startGameForRoom).not.toHaveBeenCalled();
    });

    test("clears botFillAt when enough real players already joined", async () => {
      roomManager.getPublicRooms.mockResolvedValue(null);
      roomManager.addUserToRoom.mockResolvedValue({ id: "roomBF3", users: [{ socketId: "s1" }], game: null });
      const fullRoom = {
        id: "roomBF3",
        users: [{ socketId: "s1" }, { socketId: "s2" }, { socketId: "s3" }],
        game: null,
        botFillAt: 12345,
      };
      roomManager.getRoomById.mockResolvedValue(fullRoom);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({ roomId: null, user: { name: "A" }, roomType: "public" });
      io._emit.mockClear();

      const fillCallback = botService.scheduleBotFill.mock.calls[0][2];
      fillCallback("roomBF3");
      await flush();

      expect(fullRoom.botFillAt).toBeNull();
      expect(roomManager.saveRoom).toHaveBeenCalledWith(fullRoom);
      expect(io._emit).toHaveBeenCalledWith("room_update", fullRoom);
      expect(gameHandlers.startGameForRoom).not.toHaveBeenCalled();
    });

    test("fills with bots and starts the game when still below MIN_PLAYERS", async () => {
      roomManager.getPublicRooms.mockResolvedValue(null);
      roomManager.addUserToRoom.mockResolvedValue({ id: "roomBF4", users: [{ socketId: "s1" }], game: null });
      const sparseRoom = { id: "roomBF4", users: [{ socketId: "s1" }], game: null, botFillAt: 999 };
      roomManager.getRoomById.mockResolvedValue(sparseRoom);
      const bots = [{ socketId: "bot-roomBF4-0" }, { socketId: "bot-roomBF4-1" }];
      botService.fillRoomWithBots.mockReturnValue(bots);

      const io = makeIo();
      const socket = makeSocket("s1");
      handleLobbyEvents(io, socket);

      await getHandler(socket, "join_room")({ roomId: null, user: { name: "A" }, roomType: "public" });
      io._emit.mockClear();

      const fillCallback = botService.scheduleBotFill.mock.calls[0][2];
      fillCallback("roomBF4");
      await flush();

      expect(botService.fillRoomWithBots).toHaveBeenCalledWith(sparseRoom, MIN_PLAYERS);
      expect(sparseRoom.botFillAt).toBeNull();
      expect(io._emit).toHaveBeenCalledWith("room_update", sparseRoom);
      expect(io._emit).toHaveBeenCalledWith("bots_added", { roomId: "roomBF4", bots });
      expect(gameHandlers.startGameForRoom).toHaveBeenCalledWith(io, "roomBF4", {});
    });
  });

  describe("update_profile", () => {
    async function joinedSocket(id) {
      const room = { id: "roomP", users: [{ socketId: id, name: "Player482", avatar: "😎" }, { socketId: "bot-roomP-0", name: "Bot Ada", isBot: true }], game: { round: 2 } };
      roomManager.addUserToRoom.mockResolvedValue(room);
      roomManager.getRoomById.mockResolvedValue(room);
      const io = makeIo();
      const socket = makeSocket(id);
      handleLobbyEvents(io, socket);
      await getHandler(socket, "join_room")({ roomId: "roomP", user: { name: "Player482", avatar: "😎" }, roomType: "private", deviceId: "devP" });
      // Forget the join, keep the registered handlers
      [roomManager.saveRoom, roomManager.getRoomById, userService.upsertUser, io._emit].forEach((m) => m.mockClear());
      roomManager.getRoomById.mockResolvedValue(room);
      return { io, socket, room };
    }

    test("renames the player in their room, saves it, tells everyone, and updates the profile", async () => {
      const { io, socket, room } = await joinedSocket("sP1");
      await getHandler(socket, "update_profile")({ name: "  <b>Ace</b>  ", avatar: "🦊" });

      expect(room.users[0]).toMatchObject({ name: "Ace", avatar: "🦊" });
      expect(room.users[1].name).toBe("Bot Ada");
      expect(roomManager.saveRoom).toHaveBeenCalledWith(room);
      expect(io._emit).toHaveBeenCalledWith("room_update", room);
      expect(userService.upsertUser).toHaveBeenCalledWith("devP", "Ace", "🦊");
    });

    test("ignores empty names and missing avatars", async () => {
      const { socket } = await joinedSocket("sP2");
      await getHandler(socket, "update_profile")({ name: "   ", avatar: "🦊" });
      await getHandler(socket, "update_profile")({ name: "Ace" });
      await getHandler(socket, "update_profile")();
      expect(roomManager.saveRoom).not.toHaveBeenCalled();
      expect(userService.upsertUser).not.toHaveBeenCalled();
    });

    test("outside a room it only updates the stored profile (if any)", async () => {
      const io = makeIo();
      const socket = makeSocket("loner");
      handleLobbyEvents(io, socket);
      await getHandler(socket, "update_profile")({ name: "Solo", avatar: "🐸" });
      expect(roomManager.getRoomById).not.toHaveBeenCalled();
      expect(userService.upsertUser).not.toHaveBeenCalled();
    });

    test("does nothing when the room is gone or the player is no longer in it", async () => {
      const { socket, room } = await joinedSocket("sP3");
      room.users = room.users.filter((u) => u.socketId !== "sP3");
      await getHandler(socket, "update_profile")({ name: "Ace", avatar: "🦊" });
      roomManager.getRoomById.mockResolvedValue(null);
      await getHandler(socket, "update_profile")({ name: "Ace", avatar: "🦊" });
      expect(roomManager.saveRoom).not.toHaveBeenCalled();
    });
  });

  describe("rejoining after a disconnect (60s grace period)", () => {
    async function droppedFrom(roomId, deviceId) {
      const room = { id: roomId, users: [{ socketId: "old-" + deviceId, deviceId }], game: { round: 8 } };
      roomManager.addUserToRoom.mockResolvedValue(room);
      roomManager.getRoomById.mockResolvedValue(room);
      const io = makeIo();
      const oldSocket = makeSocket("old-" + deviceId);
      handleLobbyEvents(io, oldSocket);
      await getHandler(oldSocket, "join_room")({ roomId, user: { name: "P" }, roomType: "private", deviceId });
      await getHandler(oldSocket, "disconnect")();
      roomManager.addUserToRoom.mockClear();
      roomManager.removeUserFromRoom.mockClear();
      return { io, room };
    }

    test("the app's reconnect (same room id) goes straight back to that room", async () => {
      const { io } = await droppedFrom("roomR1", "devR1");
      const socket = makeSocket("new-R1");
      handleLobbyEvents(io, socket);
      roomManager.addUserToRoom.mockResolvedValue({ id: "roomR1", users: [], game: { round: 8 } });
      await getHandler(socket, "join_room")({ roomId: "roomR1", user: { name: "P" }, roomType: "private", deviceId: "devR1" });

      expect(roomManager.addUserToRoom.mock.calls[0][0]).toBe("roomR1");
      expect(roomManager.removeUserFromRoom).not.toHaveBeenCalled();
    });

    test("a fresh choice (refresh, then Play now) starts a new game and leaves the old room", async () => {
      const { io } = await droppedFrom("roomR2", "devR2");
      const socket = makeSocket("new-R2");
      handleLobbyEvents(io, socket);
      roomManager.removeUserFromRoom.mockResolvedValue(null);
      roomManager.addUserToRoom.mockImplementation(async (id) => ({ id, users: [{ socketId: "new-R2" }], game: null }));
      botService.fillRoomWithBots.mockReturnValue([]);
      await getHandler(socket, "join_room")({ roomId: null, user: { name: "P" }, roomType: "solo", deviceId: "devR2" });

      const newRoom = roomManager.addUserToRoom.mock.calls[0][0];
      expect(newRoom).not.toBe("roomR2");
      expect(roomManager.removeUserFromRoom).toHaveBeenCalledWith("old-devR2");
      expect(gameHandlers.startGameForRoom).toHaveBeenCalledWith(io, newRoom, { botDifficulty: "adaptive" });
    });
  });
});
