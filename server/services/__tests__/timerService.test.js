const { startTimer, clearTimer, getTimeLeft } = require("../timerService");

function makeIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

describe("timerService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("getTimeLeft returns null when there is no active timer", () => {
    expect(getTimeLeft("room-none")).toBeNull();
  });

  test("startTimer fires onExpire and emits timer_expired after the duration", () => {
    const io = makeIo();
    const room = { game: { round: 2 } };
    const onExpire = jest.fn();

    startTimer(io, "room1", room, 30, onExpire);

    // not yet expired
    jest.advanceTimersByTime(29000);
    expect(onExpire).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(io.to).toHaveBeenCalledWith("room1");
    expect(io.emit).toHaveBeenCalledWith("timer_expired", { roomId: "room1", round: 2 });
    expect(onExpire).toHaveBeenCalledWith(io, "room1");
  });

  test("emits timer_tick every 10 seconds with seconds remaining", () => {
    const io = makeIo();
    const room = { game: { round: 1 } };
    startTimer(io, "room2", room, 30, jest.fn());

    jest.advanceTimersByTime(10000);
    expect(io.emit).toHaveBeenCalledWith(
      "timer_tick",
      expect.objectContaining({ roomId: "room2", round: 1 })
    );

    const tickCall = io.emit.mock.calls.find((c) => c[0] === "timer_tick");
    expect(tickCall[1].secondsLeft).toBeLessThanOrEqual(30);
    expect(tickCall[1].secondsLeft).toBeGreaterThanOrEqual(0);
  });

  test("startTimer defaults round to 0 when room.game is absent", () => {
    const io = makeIo();
    const room = {};
    startTimer(io, "room3", room, 20, jest.fn());

    jest.advanceTimersByTime(20000);
    expect(io.emit).toHaveBeenCalledWith("timer_expired", { roomId: "room3", round: 0 });
  });

  test("clearTimer cancels a pending timer before it fires", () => {
    const io = makeIo();
    const onExpire = jest.fn();
    startTimer(io, "room4", { game: { round: 1 } }, 30, onExpire);

    clearTimer("room4");
    jest.advanceTimersByTime(60000);

    expect(onExpire).not.toHaveBeenCalled();
  });

  test("clearTimer on a room with no timer is a no-op", () => {
    expect(() => clearTimer("never-started")).not.toThrow();
  });

  test("starting a new timer for the same room clears the previous one", () => {
    const io = makeIo();
    const onExpire1 = jest.fn();
    const onExpire2 = jest.fn();

    startTimer(io, "room5", { game: { round: 1 } }, 30, onExpire1);
    startTimer(io, "room5", { game: { round: 2 } }, 20, onExpire2);

    jest.advanceTimersByTime(20000);
    expect(onExpire2).toHaveBeenCalled();

    jest.advanceTimersByTime(10000);
    expect(onExpire1).not.toHaveBeenCalled();
  });

  test("getTimeLeft returns seconds remaining for an active timer", () => {
    const io = makeIo();
    startTimer(io, "room6", { game: { round: 1 } }, 30, jest.fn());

    jest.advanceTimersByTime(5000);
    const left = getTimeLeft("room6");
    expect(left).toBeLessThanOrEqual(30);
    expect(left).toBeGreaterThanOrEqual(20);
  });
});
