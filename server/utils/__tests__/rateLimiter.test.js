const { isAllowed, clear } = require("../rateLimiter");

describe("rateLimiter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("allows up to maxCount calls within the window", () => {
    const socketId = "socket-1";
    expect(isAllowed(socketId, "chat", 3, 1000)).toBe(true);
    expect(isAllowed(socketId, "chat", 3, 1000)).toBe(true);
    expect(isAllowed(socketId, "chat", 3, 1000)).toBe(true);
    // 4th call exceeds maxCount
    expect(isAllowed(socketId, "chat", 3, 1000)).toBe(false);
    clear(socketId);
  });

  test("different actions on the same socket are tracked independently", () => {
    const socketId = "socket-2";
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(true);
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(false);
    expect(isAllowed(socketId, "emote", 1, 1000)).toBe(true);
    clear(socketId);
  });

  test("resets the count once the window has elapsed", () => {
    const socketId = "socket-3";
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(true);
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(false);

    now += 1001; // advance past the window
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(true);

    clear(socketId);
  });

  test("clear removes all rate-limit state for a socket", () => {
    const socketId = "socket-4";
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(true);
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(false);

    clear(socketId);

    // After clearing, the action is treated as fresh again
    expect(isAllowed(socketId, "chat", 1, 1000)).toBe(true);
  });

  test("clear on an unknown socketId is a no-op", () => {
    expect(() => clear("never-seen-socket")).not.toThrow();
  });
});
