jest.mock("../../utils/rateLimiter", () => ({
  isAllowed: jest.fn(() => true),
}));
jest.mock("../../utils/roomManager", () => ({
  getRoomById: jest.fn(),
}));

const rateLimiter = require("../../utils/rateLimiter");
const roomManager = require("../../utils/roomManager");
const handleEmoteEvents = require("../emote");

function makeIo() {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function makeSocket(id) {
  return { id: id || "socket1", on: jest.fn(), emit: jest.fn() };
}

function getHandler(socket, event) {
  const call = socket.on.mock.calls.find((c) => c[0] === event);
  return call?.[1];
}

describe("emote socket handler", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("does nothing when roomId or emote is missing", async () => {
    const io = makeIo();
    const socket = makeSocket("e1");
    handleEmoteEvents(io, socket);
    const handler = getHandler(socket, "send_emote");

    await handler({ roomId: null, emote: "😂" });
    await handler({ roomId: "room1", emote: null });
    await handler();

    expect(roomManager.getRoomById).not.toHaveBeenCalled();
  });

  test("ignores emotes not in the whitelist", async () => {
    const io = makeIo();
    const socket = makeSocket("e2");
    handleEmoteEvents(io, socket);
    const handler = getHandler(socket, "send_emote");

    await handler({ roomId: "room1", emote: "🍕" });
    expect(roomManager.getRoomById).not.toHaveBeenCalled();
    expect(io._emit).not.toHaveBeenCalled();
  });

  test("silently drops when rate-limited", async () => {
    rateLimiter.isAllowed.mockReturnValueOnce(false);
    const io = makeIo();
    const socket = makeSocket("e3");
    handleEmoteEvents(io, socket);
    const handler = getHandler(socket, "send_emote");

    await handler({ roomId: "room1", emote: "😂" });
    expect(socket.emit).not.toHaveBeenCalled();
    expect(roomManager.getRoomById).not.toHaveBeenCalled();
  });

  test("returns early when room is not found", async () => {
    roomManager.getRoomById.mockResolvedValue(null);
    const io = makeIo();
    const socket = makeSocket("e4");
    handleEmoteEvents(io, socket);
    const handler = getHandler(socket, "send_emote");

    await handler({ roomId: "room1", emote: "😂" });
    expect(io._emit).not.toHaveBeenCalled();
  });

  test("returns early when sender is not in the room", async () => {
    roomManager.getRoomById.mockResolvedValue({ id: "room1", users: [] });
    const io = makeIo();
    const socket = makeSocket("e5");
    handleEmoteEvents(io, socket);
    const handler = getHandler(socket, "send_emote");

    await handler({ roomId: "room1", emote: "😂" });
    expect(io._emit).not.toHaveBeenCalled();
  });

  test("emits emote_received with sender info for a valid emote", async () => {
    roomManager.getRoomById.mockResolvedValue({
      id: "room1",
      users: [{ socketId: "e6", name: "Carl", avatar: "🐸" }],
    });
    const io = makeIo();
    const socket = makeSocket("e6");
    handleEmoteEvents(io, socket);
    const handler = getHandler(socket, "send_emote");

    await handler({ roomId: "room1", emote: "🔥" });
    expect(io.to).toHaveBeenCalledWith("room1");
    expect(io._emit).toHaveBeenCalledWith("emote_received", {
      socketId: "e6",
      name: "Carl",
      avatar: "🐸",
      emote: "🔥",
    });
  });
});
