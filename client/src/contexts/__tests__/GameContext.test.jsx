import React from "react";
import { renderHook, act } from "@testing-library/react";
import { GameProvider, useGame } from "../GameContext";
import { __mockSocket } from "socket.io-client";
import { useUser } from "../UserContext";

jest.mock("../UserContext", () => ({
  useUser: jest.fn(),
}));

function wrapper({ children }) {
  return <GameProvider>{children}</GameProvider>;
}

function mockUserContext(overrides = {}) {
  useUser.mockReturnValue({
    setIsInGame: jest.fn(),
    setIsWaitingRoom: jest.fn(),
    roomType: null,
    setRoomId: jest.fn(),
    setHasStarted: jest.fn(),
    setIsJoiningRoom: jest.fn(),
    ...overrides,
  });
}

describe("GameContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
  });

  test("starts with empty players, no host, no spectator snapshot, no botFillAt", () => {
    mockUserContext();
    const { result } = renderHook(() => useGame(), { wrapper });

    expect(result.current.players).toEqual([]);
    expect(result.current.hostSocketId).toBeNull();
    expect(result.current.spectatorSnapshot).toBeNull();
    expect(result.current.botFillAt).toBeNull();
  });

  test("room_update with < MIN_PLAYERS sets waiting room (private room)", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "private",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    const { result } = renderHook(() => useGame(), { wrapper });

    const room = {
      id: "room1",
      users: [{ socketId: "a" }, { socketId: "b" }],
      hostSocketId: "a",
      botFillAt: null,
    };

    act(() => {
      __mockSocket.__trigger("room_update", room);
    });

    expect(userCtx.setRoomId).toHaveBeenCalledWith("room1");
    expect(result.current.players).toEqual(room.users);
    expect(userCtx.setHasStarted).toHaveBeenCalledWith(true);
    expect(userCtx.setIsJoiningRoom).toHaveBeenCalledWith(false);
    expect(result.current.hostSocketId).toBe("a");
    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(true);
    expect(userCtx.setIsInGame).not.toHaveBeenCalledWith(true);
  });

  test("room_update with >= MIN_PLAYERS and roomType=public goes straight to game", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "public",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    const { result } = renderHook(() => useGame(), { wrapper });

    const room = {
      id: "room1",
      users: [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }],
      hostSocketId: "a",
      botFillAt: 123456,
    };

    act(() => {
      __mockSocket.__trigger("room_update", room);
    });

    expect(userCtx.setIsInGame).toHaveBeenCalledWith(true);
    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(false);
    expect(result.current.botFillAt).toBe(123456);
  });

  test("room_update with >= MIN_PLAYERS and roomType=solo goes straight to game", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "solo",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    renderHook(() => useGame(), { wrapper });

    act(() => {
      __mockSocket.__trigger("room_update", {
        id: "room1",
        users: [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }],
      });
    });

    expect(userCtx.setIsInGame).toHaveBeenCalledWith(true);
    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(false);
  });

  test("room_update with >= MIN_PLAYERS and roomType=private stays in waiting room", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "private",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    renderHook(() => useGame(), { wrapper });

    act(() => {
      __mockSocket.__trigger("room_update", {
        id: "room1",
        users: [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }],
      });
    });

    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(true);
    expect(userCtx.setIsInGame).not.toHaveBeenCalledWith(true);
  });

  test("game_started sets isInGame and clears waiting room", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "private",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    renderHook(() => useGame(), { wrapper });

    act(() => {
      __mockSocket.__trigger("game_started");
    });

    expect(userCtx.setIsInGame).toHaveBeenCalledWith(true);
    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(false);
  });

  test("game_reset returns everyone to the waiting room", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "private",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    renderHook(() => useGame(), { wrapper });

    act(() => {
      __mockSocket.__trigger("game_reset");
    });

    expect(userCtx.setIsInGame).toHaveBeenCalledWith(false);
    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(true);
  });

  test("game_in_progress stores spectator snapshot and enters game", () => {
    const userCtx = {
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      roomType: "private",
      setRoomId: jest.fn(),
      setHasStarted: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    mockUserContext(userCtx);
    const { result } = renderHook(() => useGame(), { wrapper });

    const snapshot = { round: 3, eliminatedPlayers: ["a"] };
    act(() => {
      __mockSocket.__trigger("game_in_progress", snapshot);
    });

    expect(result.current.spectatorSnapshot).toEqual(snapshot);
    expect(userCtx.setIsInGame).toHaveBeenCalledWith(true);
    expect(userCtx.setIsWaitingRoom).toHaveBeenCalledWith(false);
  });

  test("clearSpectatorSnapshot resets spectatorSnapshot to null", () => {
    mockUserContext({ roomType: "private" });
    const { result } = renderHook(() => useGame(), { wrapper });

    act(() => {
      __mockSocket.__trigger("game_in_progress", { round: 1 });
    });
    expect(result.current.spectatorSnapshot).toEqual({ round: 1 });

    act(() => {
      result.current.clearSpectatorSnapshot();
    });
    expect(result.current.spectatorSnapshot).toBeNull();
  });

  test("resetGame clears players, hostSocketId, and botFillAt", () => {
    mockUserContext({ roomType: "private" });
    const { result } = renderHook(() => useGame(), { wrapper });

    act(() => {
      __mockSocket.__trigger("room_update", {
        id: "room1",
        users: [{ socketId: "a" }],
        hostSocketId: "a",
        botFillAt: 999,
      });
    });
    expect(result.current.players).toHaveLength(1);

    act(() => {
      result.current.resetGame();
    });

    expect(result.current.players).toEqual([]);
    expect(result.current.hostSocketId).toBeNull();
    expect(result.current.botFillAt).toBeNull();
  });

  test("cleans up socket listeners on unmount", () => {
    mockUserContext();
    const { unmount } = renderHook(() => useGame(), { wrapper });
    unmount();

    expect(__mockSocket.off).toHaveBeenCalledWith("room_update", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("game_started", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("game_reset", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("game_in_progress", expect.any(Function));
  });
});
