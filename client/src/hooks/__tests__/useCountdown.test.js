import { renderHook, act } from "@testing-library/react";
import useCountdown from "../useCountdown";
import { __mockSocket } from "socket.io-client";

describe("useCountdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, "now");
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("returns 0 and not expired when timerDuration is null", () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isExpired).toBe(false);
  });

  test("counts down from the given duration", () => {
    Date.now.mockReturnValue(0);
    const { result } = renderHook(() => useCountdown(10));
    expect(result.current.timeLeft).toBe(10);

    Date.now.mockReturnValue(3000);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current.timeLeft).toBe(7);
  });

  test("marks expired once the countdown reaches zero", () => {
    Date.now.mockReturnValue(0);
    const { result } = renderHook(() => useCountdown(1));

    Date.now.mockReturnValue(1500);
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });

  test("registers and cleans up timer_tick / timer_expired listeners", () => {
    const { unmount } = renderHook(() => useCountdown(10));

    expect(__mockSocket.on).toHaveBeenCalledWith("timer_tick", expect.any(Function));
    expect(__mockSocket.on).toHaveBeenCalledWith("timer_expired", expect.any(Function));

    unmount();

    expect(__mockSocket.off).toHaveBeenCalledWith("timer_tick", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("timer_expired", expect.any(Function));
  });

  test("restarts the interval when timerDuration changes again", () => {
    Date.now.mockReturnValue(0);
    const { result, rerender } = renderHook(({ duration }) => useCountdown(duration), {
      initialProps: { duration: 10 },
    });
    expect(result.current.timeLeft).toBe(10);

    Date.now.mockReturnValue(0);
    rerender({ duration: 5 });
    expect(result.current.timeLeft).toBe(5);

    Date.now.mockReturnValue(2000);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current.timeLeft).toBe(3);
  });

  test("does not resync when server drift is within the threshold", () => {
    Date.now.mockReturnValue(0);
    const { result } = renderHook(() => useCountdown(10));

    const tickHandler = __mockSocket.on.mock.calls.find(
      (c) => c[0] === "timer_tick"
    )[1];

    Date.now.mockReturnValue(1000);
    act(() => {
      tickHandler({ secondsLeft: 9 });
    });

    // clientEstimate ~= 9, secondsLeft = 9 -> drift 0, no resync
    expect(result.current.timeLeft).toBe(10);
  });

  test("corrects drift when server timer_tick differs significantly", () => {
    Date.now.mockReturnValue(0);
    const { result } = renderHook(() => useCountdown(10));

    const tickHandler = __mockSocket.on.mock.calls.find(
      (c) => c[0] === "timer_tick"
    )[1];

    Date.now.mockReturnValue(1000);
    act(() => {
      tickHandler({ secondsLeft: 3 });
    });

    expect(result.current.timeLeft).toBe(3);
  });

  test("freezes timeLeft while paused and resumes from where it left off", () => {
    Date.now.mockReturnValue(0);
    const { result, rerender } = renderHook(({ paused }) => useCountdown(10, paused), {
      initialProps: { paused: false },
    });
    expect(result.current.timeLeft).toBe(10);

    Date.now.mockReturnValue(3000);
    act(() => { jest.advanceTimersByTime(250); });
    expect(result.current.timeLeft).toBe(7);

    // Pause — further elapsed time should not change timeLeft
    rerender({ paused: true });
    Date.now.mockReturnValue(6000);
    act(() => { jest.advanceTimersByTime(250); });
    expect(result.current.timeLeft).toBe(7);

    // Resume — continues counting down from 7, ignoring time spent paused
    rerender({ paused: false });
    Date.now.mockReturnValue(7000);
    act(() => { jest.advanceTimersByTime(250); });
    expect(result.current.timeLeft).toBe(6);
  });

  test("forces expiry when server emits timer_expired", () => {
    Date.now.mockReturnValue(0);
    const { result } = renderHook(() => useCountdown(10));

    const expiredHandler = __mockSocket.on.mock.calls.find(
      (c) => c[0] === "timer_expired"
    )[1];

    act(() => {
      expiredHandler();
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isExpired).toBe(true);
  });
});
