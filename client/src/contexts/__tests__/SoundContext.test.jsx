import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SoundProvider, useSound } from "../SoundContext";
import soundManager from "../../services/soundManager";
import { __mockSocket } from "socket.io-client";

jest.mock("../../services/soundManager", () => ({
  setMuted: jest.fn(),
  playRoundStart: jest.fn(),
  playSubmit: jest.fn(),
  playExactMatch: jest.fn(),
  playElimination: jest.fn(),
  playWin: jest.fn(),
}));

function wrapper({ children }) {
  return <SoundProvider>{children}</SoundProvider>;
}

describe("SoundContext", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
  });

  test("defaults to unmuted and persists initial state", () => {
    const { result } = renderHook(() => useSound(), { wrapper });
    expect(result.current.muted).toBe(false);
    expect(soundManager.setMuted).toHaveBeenCalledWith(false);
    expect(localStorage.getItem("80p-sound-muted")).toBe("false");
  });

  test("initializes muted state from localStorage", () => {
    localStorage.setItem("80p-sound-muted", "true");
    const { result } = renderHook(() => useSound(), { wrapper });
    expect(result.current.muted).toBe(true);
  });

  test("toggleMute flips muted state and persists it", () => {
    const { result } = renderHook(() => useSound(), { wrapper });

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.muted).toBe(true);
    expect(soundManager.setMuted).toHaveBeenCalledWith(true);
    expect(localStorage.getItem("80p-sound-muted")).toBe("true");
  });

  test("plays sounds in response to socket events", () => {
    renderHook(() => useSound(), { wrapper });

    __mockSocket.__trigger("next_round", {});
    expect(soundManager.playRoundStart).toHaveBeenCalled();

    __mockSocket.__trigger("number_received", {});
    expect(soundManager.playSubmit).toHaveBeenCalled();

    __mockSocket.__trigger("round_result", { exactMatch: true });
    expect(soundManager.playExactMatch).toHaveBeenCalled();

    __mockSocket.__trigger("round_result", { exactMatch: false });
    expect(soundManager.playExactMatch).toHaveBeenCalledTimes(1);

    __mockSocket.__trigger("player_eliminated", {});
    expect(soundManager.playElimination).toHaveBeenCalled();

    __mockSocket.__trigger("game_over", {});
    expect(soundManager.playWin).toHaveBeenCalled();
  });

  test("cleans up socket listeners on unmount", () => {
    const { unmount } = renderHook(() => useSound(), { wrapper });
    unmount();

    expect(__mockSocket.off).toHaveBeenCalledWith("next_round", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("number_received", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("round_result", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("player_eliminated", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("game_over", expect.any(Function));
  });
});
