const {
  isBot,
  hasOnlyBots,
  fillRoomWithBots,
  scheduleBotFill,
  clearFillTimer,
  getBotNumber,
  scheduleBotSubmissions,
  clearSubmissionTimers,
  removeRoom,
} = require("../botService");
const { BOT_NAMES, BOT_AVATARS } = require("../../constants/constants");

describe("botService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("isBot", () => {
    test("returns true for bot socketIds", () => {
      expect(isBot("bot-room1-0")).toBe(true);
      expect(isBot("bot-anything")).toBe(true);
    });

    test("returns false for real socketIds", () => {
      expect(isBot("socket-abc123")).toBe(false);
    });

    test("returns false for non-string input", () => {
      expect(isBot(undefined)).toBe(false);
      expect(isBot(null)).toBe(false);
      expect(isBot(123)).toBe(false);
    });
  });

  describe("hasOnlyBots", () => {
    test("returns false when room is null/undefined", () => {
      expect(hasOnlyBots(null)).toBe(false);
      expect(hasOnlyBots(undefined)).toBe(false);
    });

    test("returns false when room.users is empty", () => {
      expect(hasOnlyBots({ users: [] })).toBe(false);
    });

    test("returns false when room contains a mix of real users and bots", () => {
      const room = { users: [{ socketId: "real-1" }, { socketId: "bot-room1-0" }] };
      expect(hasOnlyBots(room)).toBe(false);
    });

    test("returns true when room contains only bots", () => {
      const room = { users: [{ socketId: "bot-room1-0" }, { socketId: "bot-room1-1" }] };
      expect(hasOnlyBots(room)).toBe(true);
    });
  });

  describe("fillRoomWithBots", () => {
    test("adds bots until room.users reaches targetCount", () => {
      const room = { id: "room1", users: [{ socketId: "real-1" }] };
      const added = fillRoomWithBots(room, 3);

      expect(room.users).toHaveLength(3);
      expect(added).toHaveLength(2);
      added.forEach((bot) => {
        expect(bot.isBot).toBe(true);
        expect(bot.socketId).toMatch(/^bot-room1-\d+$/);
        expect(BOT_NAMES).toContain(bot.name);
        expect(BOT_AVATARS).toContain(bot.avatar);
      });
    });

    test("returns an empty array when the room is already at targetCount", () => {
      const room = { id: "room2", users: [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }] };
      const added = fillRoomWithBots(room, 3);
      expect(added).toEqual([]);
      expect(room.users).toHaveLength(3);
    });

    test("skips already-used bot indices on a second fill", () => {
      const room = { id: "room3", users: [{ socketId: "real-1" }] };
      const firstBatch = fillRoomWithBots(room, 2);
      expect(firstBatch).toHaveLength(1);
      expect(firstBatch[0].socketId).toBe("bot-room3-0");

      const secondBatch = fillRoomWithBots(room, 4);
      expect(secondBatch).toHaveLength(2);
      expect(secondBatch[0].socketId).toBe("bot-room3-1");
      expect(secondBatch[1].socketId).toBe("bot-room3-2");
    });

    test("cycles through BOT_NAMES/BOT_AVATARS via modulo when more bots than entries", () => {
      const room = { id: "room4", users: [] };
      const targetCount = BOT_NAMES.length + 1;
      const added = fillRoomWithBots(room, targetCount);
      expect(added[BOT_NAMES.length].name).toBe(BOT_NAMES[0]);
      expect(added[BOT_NAMES.length].avatar).toBe(BOT_AVATARS[0 % BOT_AVATARS.length]);
    });
  });

  describe("scheduleBotFill / clearFillTimer", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test("calls onFire with roomId after delayMs", () => {
      const onFire = jest.fn();
      scheduleBotFill("room1", 15000, onFire);

      jest.advanceTimersByTime(14999);
      expect(onFire).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(onFire).toHaveBeenCalledWith("room1");
    });

    test("clearFillTimer cancels a pending fill timer", () => {
      const onFire = jest.fn();
      scheduleBotFill("room2", 15000, onFire);
      clearFillTimer("room2");

      jest.advanceTimersByTime(20000);
      expect(onFire).not.toHaveBeenCalled();
    });

    test("scheduling a new fill timer for the same room replaces the old one", () => {
      const onFire1 = jest.fn();
      const onFire2 = jest.fn();
      scheduleBotFill("room3", 15000, onFire1);
      scheduleBotFill("room3", 5000, onFire2);

      jest.advanceTimersByTime(5000);
      expect(onFire2).toHaveBeenCalledWith("room3");
      expect(onFire1).not.toHaveBeenCalled();

      jest.advanceTimersByTime(15000);
      expect(onFire1).not.toHaveBeenCalled();
    });

    test("clearFillTimer on a room with no timer is a no-op", () => {
      expect(() => clearFillTimer("never-scheduled")).not.toThrow();
    });
  });

  describe("getBotNumber", () => {
    test("when there is no previous target and Math.random < 0.7, returns a value in [30,70]", () => {
      jest.spyOn(Math, "random").mockReturnValue(0.1);
      const n = getBotNumber({});
      expect(n).toBeGreaterThanOrEqual(30);
      expect(n).toBeLessThanOrEqual(70);
    });

    test("when there is no previous target and Math.random >= 0.7, returns a value in [0,100]", () => {
      jest.spyOn(Math, "random").mockReturnValue(0.9);
      const n = getBotNumber({ target: null });
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    });

    test("biases around the previous target with a +/-15 spread, clamped to [0,100]", () => {
      jest.spyOn(Math, "random").mockReturnValue(0.5); // midpoint -> n = target
      const n = getBotNumber({ target: 50 });
      expect(n).toBe(50);
    });

    test("clamps to 0 when target - spread would go negative", () => {
      jest.spyOn(Math, "random").mockReturnValue(0); // n = target - 15
      const n = getBotNumber({ target: 5 });
      expect(n).toBe(0);
    });

    test("clamps to 100 when target + spread would exceed 100", () => {
      jest.spyOn(Math, "random").mockReturnValue(1); // n = target + 15
      const n = getBotNumber({ target: 95 });
      expect(n).toBe(100);
    });
  });

  describe("scheduleBotSubmissions / clearSubmissionTimers", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(Math, "random").mockReturnValue(0); // delay = 1000ms, getBotNumber deterministic
    });

    test("does nothing when game or game.turnOrder is missing", () => {
      expect(() => scheduleBotSubmissions("room1", null, jest.fn())).not.toThrow();
      expect(() => scheduleBotSubmissions("room1", {}, jest.fn())).not.toThrow();
    });

    test("schedules submissions only for bots that haven't submitted and aren't eliminated", () => {
      const submitFn = jest.fn();
      const game = {
        turnOrder: ["real-1", "bot-room1-0", "bot-room1-1", "bot-room1-2"],
        eliminatedPlayers: ["bot-room1-1"],
        numbers: { "bot-room1-2": 42 },
        target: 50,
      };

      scheduleBotSubmissions("room1", game, submitFn);
      jest.advanceTimersByTime(4000);

      expect(submitFn).toHaveBeenCalledTimes(1);
      expect(submitFn.mock.calls[0][0]).toBe("bot-room1-0");
      expect(typeof submitFn.mock.calls[0][1]).toBe("number");
    });

    test("clearSubmissionTimers cancels all pending bot submissions for a room", () => {
      const submitFn = jest.fn();
      const game = {
        turnOrder: ["bot-room2-0", "bot-room2-1"],
        eliminatedPlayers: [],
        numbers: {},
        target: 50,
      };

      scheduleBotSubmissions("room2", game, submitFn);
      clearSubmissionTimers("room2");
      jest.advanceTimersByTime(10000);

      expect(submitFn).not.toHaveBeenCalled();
    });

    test("scheduling new submissions for a room clears previously pending ones", () => {
      const submitFn = jest.fn();
      const game1 = { turnOrder: ["bot-room3-0"], eliminatedPlayers: [], numbers: {}, target: 50 };
      const game2 = { turnOrder: ["bot-room3-1"], eliminatedPlayers: [], numbers: {}, target: 50 };

      scheduleBotSubmissions("room3", game1, submitFn);
      scheduleBotSubmissions("room3", game2, submitFn);

      jest.advanceTimersByTime(4000);

      expect(submitFn).toHaveBeenCalledTimes(1);
      expect(submitFn.mock.calls[0][0]).toBe("bot-room3-1");
    });

    test("clearSubmissionTimers on a room with no timers is a no-op", () => {
      expect(() => clearSubmissionTimers("never-scheduled")).not.toThrow();
    });
  });

  describe("removeRoom", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test("clears both fill timers and submission timers for a room", () => {
      const onFire = jest.fn();
      const submitFn = jest.fn();
      const game = { turnOrder: ["bot-room1-0"], eliminatedPlayers: [], numbers: {}, target: 50 };

      scheduleBotFill("room1", 15000, onFire);
      scheduleBotSubmissions("room1", game, submitFn);

      removeRoom("room1");
      jest.advanceTimersByTime(20000);

      expect(onFire).not.toHaveBeenCalled();
      expect(submitFn).not.toHaveBeenCalled();
    });

    test("removeRoom on a room with no timers is a no-op", () => {
      expect(() => removeRoom("never-scheduled")).not.toThrow();
    });
  });
});
