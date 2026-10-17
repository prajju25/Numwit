import { renderHook, act } from "@testing-library/react";
import useChallengeFriends, { readChallenge, clearChallenge, CHALLENGE_KEY } from "../useChallengeFriends";
import { useUser } from "../../contexts/UserContext";
import { useGame } from "../../contexts/GameContext";
import socket from "../../socket";
import { track } from "../../services/analytics";

jest.mock("../../contexts/UserContext", () => ({ useUser: jest.fn() }));
jest.mock("../../contexts/GameContext", () => ({ useGame: jest.fn() }));
jest.mock("../../services/analytics", () => ({ track: jest.fn() }));

describe("useChallengeFriends", () => {
  let ctx;
  let resetGame;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    sessionStorage.clear();
    ctx = {
      user: { name: "Prajju", avatar: "😎" },
      deviceId: "dev1",
      setRoomId: jest.fn(),
      setRoomType: jest.fn(),
      setIsInGame: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      setIsJoiningRoom: jest.fn(),
    };
    useUser.mockReturnValue(ctx);
    resetGame = jest.fn();
    useGame.mockReturnValue({ resetGame });
  });
  afterEach(() => jest.useRealTimers());

  test("leaves the game, then opens a private room with the message waiting", () => {
    const { result } = renderHook(() => useChallengeFriends());
    act(() => result.current("Beat me 👇", { won: true }));

    expect(track).toHaveBeenCalledWith("challenge_start", { won: true });
    expect(readChallenge()).toBe("Beat me 👇");
    expect(socket.emit).toHaveBeenCalledWith("leave_room", expect.any(Function));
    expect(socket.emit).not.toHaveBeenCalledWith("join_room", expect.anything());

    // server confirms the leave
    const leaveCb = socket.emit.mock.calls.find(([e]) => e === "leave_room")[1];
    act(() => leaveCb({ status: "ok" }));

    expect(resetGame).toHaveBeenCalled();
    expect(ctx.setIsInGame).toHaveBeenCalledWith(false);
    expect(ctx.setRoomId).toHaveBeenCalledWith(null);
    expect(ctx.setRoomType).toHaveBeenCalledWith("private");
    expect(ctx.setIsJoiningRoom).toHaveBeenCalledWith(true);
    expect(socket.emit).toHaveBeenCalledWith("join_room", {
      roomId: null, user: ctx.user, roomType: "private", deviceId: "dev1",
    });

    // the fallback timer doesn't open a second room
    act(() => jest.advanceTimersByTime(2000));
    expect(socket.emit.mock.calls.filter(([e]) => e === "join_room")).toHaveLength(1);
  });

  test("opens the room anyway if the server never answers the leave", () => {
    useGame.mockReturnValue({}); // no resetGame available
    const { result } = renderHook(() => useChallengeFriends());
    act(() => result.current("Beat me"));
    act(() => jest.advanceTimersByTime(1500));
    expect(socket.emit).toHaveBeenCalledWith("join_room", expect.objectContaining({ roomType: "private" }));
  });

  test("blocked storage never stops the challenge", () => {
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const get = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const rm = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useChallengeFriends());
    expect(() => act(() => result.current("Beat me"))).not.toThrow();
    expect(readChallenge()).toBeNull();
    expect(() => clearChallenge()).not.toThrow();
    [set, get, rm].forEach((m) => m.mockRestore());
  });

  test("clearChallenge removes the message", () => {
    sessionStorage.setItem(CHALLENGE_KEY, "x");
    clearChallenge();
    expect(readChallenge()).toBeNull();
  });
});
