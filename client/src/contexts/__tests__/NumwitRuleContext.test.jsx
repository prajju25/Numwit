import React from "react";
import { renderHook, act } from "@testing-library/react";
import { NumwitRuleProvider, useNumwit } from "../NumwitRuleContext";
import { __mockSocket } from "socket.io-client";
import { useGame } from "../GameContext";

jest.mock("../GameContext", () => ({
  useGame: jest.fn(),
}));

function wrapper({ children }) {
  return <NumwitRuleProvider>{children}</NumwitRuleProvider>;
}

function mockGameContext(overrides = {}) {
  useGame.mockReturnValue({
    spectatorSnapshot: null,
    clearSpectatorSnapshot: jest.fn(),
    ...overrides,
  });
}

describe("NumwitRuleContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
  });

  test("starts with default empty state when there is no spectator snapshot", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    expect(result.current.gameData).toEqual({});
    expect(result.current.roundResult).toBeNull();
    expect(result.current.roundVoid).toBeNull();
    expect(result.current.submitted).toBe(false);
    expect(result.current.selectedNumber).toBeNull();
    expect(result.current.waitingCount).toBeNull();
    expect(result.current.gameOver).toBeNull();
    expect(result.current.eliminatedPlayers).toEqual([]);
    expect(result.current.alert).toBeNull();
    expect(result.current.history).toEqual([]);
    expect(result.current.hostSocketId).toBeNull();
    expect(result.current.timerExpired).toBe(false);
    expect(result.current.timerKey).toBe(0);
  });

  test("hydrates state from spectatorSnapshot on mount and clears it", () => {
    const clearSpectatorSnapshot = jest.fn();
    const snapshot = {
      round: 4,
      eliminatedPlayers: ["a", "b"],
      hostSocketId: "host1",
    };
    mockGameContext({ spectatorSnapshot: snapshot, clearSpectatorSnapshot });

    const { result } = renderHook(() => useNumwit(), { wrapper });

    expect(result.current.gameData).toEqual(snapshot);
    expect(result.current.eliminatedPlayers).toEqual(["a", "b"]);
    expect(result.current.hostSocketId).toBe("host1");
    expect(result.current.timerKey).toBe(1);
    expect(clearSpectatorSnapshot).toHaveBeenCalled();
  });

  test("next_round resets round state and applies new data", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("next_round", {
        round: 2,
        eliminatedPlayers: ["x"],
        hostSocketId: "hostA",
      });
    });

    expect(result.current.gameData).toEqual({
      round: 2,
      eliminatedPlayers: ["x"],
      hostSocketId: "hostA",
    });
    expect(result.current.eliminatedPlayers).toEqual(["x"]);
    expect(result.current.hostSocketId).toBe("hostA");
    expect(result.current.roundResult).toBeNull();
    expect(result.current.roundVoid).toBeNull();
    expect(result.current.submitted).toBe(false);
    expect(result.current.selectedNumber).toBeNull();
    expect(result.current.waitingCount).toBeNull();
    expect(result.current.timerExpired).toBe(false);
    expect(result.current.timerKey).toBe(1);
  });

  test("waiting_for_players sets waitingCount", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("waiting_for_players", { submitted: 2, total: 5 });
    });

    expect(result.current.waitingCount).toEqual({ submitted: 2, total: 5 });
  });

  test("round_void sets roundVoid, resets submission state, and bumps timerKey", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      result.current.setSubmitted(true);
      result.current.setSelectedNumber(42);
    });

    act(() => {
      __mockSocket.__trigger("round_void", { reason: "tie" });
    });

    expect(result.current.roundVoid).toEqual({ reason: "tie" });
    expect(result.current.submitted).toBe(false);
    expect(result.current.selectedNumber).toBeNull();
    expect(result.current.waitingCount).toBeNull();
    expect(result.current.timerExpired).toBe(false);
    expect(result.current.timerKey).toBe(1);
  });

  test("round_result appends to history, clears roundVoid/waitingCount, and updates points", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    const resultPayload = { winner: "a", points: { a: 10, b: 5 } };
    act(() => {
      __mockSocket.__trigger("round_result", resultPayload);
    });

    expect(result.current.roundResult).toEqual(resultPayload);
    expect(result.current.roundVoid).toBeNull();
    expect(result.current.waitingCount).toBeNull();
    expect(result.current.history).toEqual([resultPayload]);
    expect(result.current.gameData.points).toEqual({ a: 10, b: 5 });
  });

  test("round_result without points does not modify gameData.points", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("round_result", { winner: "a" });
    });

    expect(result.current.gameData.points).toBeUndefined();
    expect(result.current.history).toEqual([{ winner: "a" }]);
  });

  test("player_eliminated adds a socketId once and does not duplicate", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("player_eliminated", { socketId: "p1" });
    });
    expect(result.current.eliminatedPlayers).toEqual(["p1"]);

    act(() => {
      __mockSocket.__trigger("player_eliminated", { socketId: "p1" });
    });
    expect(result.current.eliminatedPlayers).toEqual(["p1"]);

    act(() => {
      __mockSocket.__trigger("player_eliminated", { socketId: "p2" });
    });
    expect(result.current.eliminatedPlayers).toEqual(["p1", "p2"]);
  });

  test("game_over sets gameOver data", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    const payload = { winner: "p1" };
    act(() => {
      __mockSocket.__trigger("game_over", payload);
    });

    expect(result.current.gameOver).toEqual(payload);
  });

  test("game_reset clears round/game state", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("round_result", { winner: "a" });
      __mockSocket.__trigger("player_eliminated", { socketId: "p1" });
      __mockSocket.__trigger("game_over", { winner: "p1" });
      result.current.setAlert({ type: "error", message: "oops" });
    });

    act(() => {
      __mockSocket.__trigger("game_reset");
    });

    expect(result.current.roundResult).toBeNull();
    expect(result.current.roundVoid).toBeNull();
    expect(result.current.submitted).toBe(false);
    expect(result.current.selectedNumber).toBeNull();
    expect(result.current.gameOver).toBeNull();
    expect(result.current.eliminatedPlayers).toEqual([]);
    expect(result.current.waitingCount).toBeNull();
    expect(result.current.alert).toBeNull();
    expect(result.current.history).toEqual([]);
    expect(result.current.timerExpired).toBe(false);
  });

  test("invalid_number sets an error alert and resets submission", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      result.current.setSubmitted(true);
      result.current.setSelectedNumber(7);
    });

    act(() => {
      __mockSocket.__trigger("invalid_number", { message: "Number must be between 0 and 100" });
    });

    expect(result.current.alert).toEqual({ type: "error", message: "Number must be between 0 and 100" });
    expect(result.current.submitted).toBe(false);
    expect(result.current.selectedNumber).toBeNull();
  });

  test("duplicate_submission sets an error alert", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("duplicate_submission", { message: "Already submitted" });
    });

    expect(result.current.alert).toEqual({ type: "error", message: "Already submitted" });
  });

  test("round_already_completed sets a generic error alert", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("round_already_completed");
    });

    expect(result.current.alert).toEqual({
      type: "error",
      message: "Round already completed — wait for next round.",
    });
  });

  test("timer_expired sets timerExpired to true", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      __mockSocket.__trigger("timer_expired");
    });

    expect(result.current.timerExpired).toBe(true);
  });

  test("setSubmitted, setSelectedNumber, and setAlert update state directly", () => {
    mockGameContext();
    const { result } = renderHook(() => useNumwit(), { wrapper });

    act(() => {
      result.current.setSubmitted(true);
      result.current.setSelectedNumber(55);
      result.current.setAlert({ type: "info", message: "hi" });
    });

    expect(result.current.submitted).toBe(true);
    expect(result.current.selectedNumber).toBe(55);
    expect(result.current.alert).toEqual({ type: "info", message: "hi" });
  });

  test("cleans up all socket listeners on unmount", () => {
    mockGameContext();
    const { unmount } = renderHook(() => useNumwit(), { wrapper });
    unmount();

    [
      "next_round",
      "waiting_for_players",
      "round_void",
      "round_result",
      "player_eliminated",
      "game_over",
      "game_reset",
      "invalid_number",
      "duplicate_submission",
      "round_already_completed",
      "timer_expired",
    ].forEach((event) => {
      expect(__mockSocket.off).toHaveBeenCalledWith(event, expect.any(Function));
    });
  });
});
