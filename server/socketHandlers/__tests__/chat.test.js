jest.mock("../../utils/rateLimiter", () => ({
  isAllowed: jest.fn(() => true),
}));
jest.mock("../../utils/roomManager", () => ({
  getRoomById: jest.fn(),
}));

const rateLimiter = require("../../utils/rateLimiter");
const roomManager = require("../../utils/roomManager");
const handleChatEvents = require("../chat");

function makeIo() {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function makeSocket(id) {
  return {
    id: id || "socket1",
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  };
}

function getHandler(socket, event) {
  const call = socket.on.mock.calls.find((c) => c[0] === event);
  return call?.[1];
}

describe("chat socket handler", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("room_chat", () => {
    test("does nothing when roomId or message is missing", async () => {
      const io = makeIo();
      const socket = makeSocket("s1");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "room_chat");

      await handler({ roomId: null, message: "hi" });
      await handler({ roomId: "room1", message: "" });
      await handler();

      expect(roomManager.getRoomById).not.toHaveBeenCalled();
    });

    test("strips HTML tags, trims, and truncates to 200 chars", async () => {
      const io = makeIo();
      const socket = makeSocket("s2");
      roomManager.getRoomById.mockResolvedValue({
        id: "room1",
        users: [{ socketId: "s2", name: "Alice", avatar: "🐱" }],
      });
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "room_chat");

      const longMsg = `<b>${"a".repeat(300)}</b>  `;
      await handler({ roomId: "room1", message: longMsg });

      expect(io._emit).toHaveBeenCalledWith("chat_message", expect.objectContaining({
        socketId: "s2",
        name: "Alice",
        avatar: "🐱",
        message: "a".repeat(200),
      }));
    });

    test("returns early when message is empty after stripping tags", async () => {
      const io = makeIo();
      const socket = makeSocket("s3");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "room_chat");

      await handler({ roomId: "room1", message: "<b></b>   " });
      expect(roomManager.getRoomById).not.toHaveBeenCalled();
      expect(io._emit).not.toHaveBeenCalled();
    });

    test("emits chat_rate_limited when rate limit exceeded", async () => {
      rateLimiter.isAllowed.mockReturnValueOnce(false);
      const io = makeIo();
      const socket = makeSocket("s4");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "room_chat");

      await handler({ roomId: "room1", message: "hello" });
      expect(socket.emit).toHaveBeenCalledWith("chat_rate_limited", expect.any(Object));
      expect(roomManager.getRoomById).not.toHaveBeenCalled();
    });

    test("returns early when room is not found", async () => {
      roomManager.getRoomById.mockResolvedValue(null);
      const io = makeIo();
      const socket = makeSocket("s5");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "room_chat");

      await handler({ roomId: "room1", message: "hello" });
      expect(io._emit).not.toHaveBeenCalled();
    });

    test("returns early when sender is not in the room", async () => {
      roomManager.getRoomById.mockResolvedValue({ id: "room1", users: [] });
      const io = makeIo();
      const socket = makeSocket("s6");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "room_chat");

      await handler({ roomId: "room1", message: "hello" });
      expect(io._emit).not.toHaveBeenCalled();
    });

    test("clears typing indicator before emitting chat_message", async () => {
      jest.useFakeTimers();
      roomManager.getRoomById.mockResolvedValue({
        id: "room1",
        users: [{ socketId: "s7", name: "Bob", avatar: "🐶" }],
      });
      const io = makeIo();
      const socket = makeSocket("s7");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleChatEvents(io, socket);

      const typingHandler = getHandler(socket, "typing_start");
      const chatHandler = getHandler(socket, "room_chat");

      typingHandler({ roomId: "room1" });
      expect(toEmit).toHaveBeenCalledWith("player_typing", { socketId: "s7", isTyping: true });

      await chatHandler({ roomId: "room1", message: "hello" });
      expect(toEmit).toHaveBeenCalledWith("player_typing", { socketId: "s7", isTyping: false });
    });
  });

  describe("typing_start", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test("does nothing when roomId is missing", () => {
      const io = makeIo();
      const socket = makeSocket("t1");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "typing_start");
      expect(() => handler({})).not.toThrow();
      expect(socket.to).not.toHaveBeenCalled();
    });

    test("broadcasts player_typing=true and auto-clears after 3s", () => {
      const io = makeIo();
      const socket = makeSocket("t2");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "typing_start");

      handler({ roomId: "room1" });
      expect(toEmit).toHaveBeenCalledWith("player_typing", { socketId: "t2", isTyping: true });

      jest.advanceTimersByTime(3000);
      expect(toEmit).toHaveBeenCalledWith("player_typing", { socketId: "t2", isTyping: false });
    });

    test("debounces repeated calls within the throttle window", () => {
      const io = makeIo();
      const socket = makeSocket("t3");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "typing_start");

      handler({ roomId: "room1" });
      handler({ roomId: "room1" });

      const trueCalls = toEmit.mock.calls.filter((c) => c[1].isTyping);
      expect(trueCalls).toHaveLength(1);
    });
  });

  describe("typing_stop", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test("does nothing when roomId is missing", () => {
      const io = makeIo();
      const socket = makeSocket("u1");
      handleChatEvents(io, socket);
      const handler = getHandler(socket, "typing_stop");
      expect(() => handler({})).not.toThrow();
    });

    test("clears active typing timer and emits isTyping=false", () => {
      const io = makeIo();
      const socket = makeSocket("u2");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleChatEvents(io, socket);

      getHandler(socket, "typing_start")({ roomId: "room1" });
      toEmit.mockClear();
      getHandler(socket, "typing_stop")({ roomId: "room1" });

      expect(toEmit).toHaveBeenCalledWith("player_typing", { socketId: "u2", isTyping: false });
    });

    test("is a no-op when there is no active typing timer", () => {
      const io = makeIo();
      const socket = makeSocket("u3");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleChatEvents(io, socket);

      getHandler(socket, "typing_stop")({ roomId: "room1" });
      expect(toEmit).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test("clears pending typing timer and notifies room on disconnect", () => {
      const io = makeIo();
      const socket = makeSocket("d1");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleChatEvents(io, socket);

      getHandler(socket, "typing_start")({ roomId: "room1" });
      toEmit.mockClear();
      getHandler(socket, "disconnect")();

      expect(toEmit).toHaveBeenCalledWith("player_typing", { socketId: "d1", isTyping: false });
    });

    test("is a no-op when there is no pending typing timer", () => {
      const io = makeIo();
      const socket = makeSocket("d2");
      handleChatEvents(io, socket);
      expect(() => getHandler(socket, "disconnect")()).not.toThrow();
    });
  });
});
