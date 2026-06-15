import React from "react";
import { renderHook, act } from "@testing-library/react";
import { UserProvider, useUser } from "../UserContext";

function wrapper({ children }) {
  return <UserProvider>{children}</UserProvider>;
}

describe("UserContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("generates and persists a deviceId on first use", () => {
    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.deviceId).toBeTruthy();
    expect(localStorage.getItem("80p-device-id")).toBe(result.current.deviceId);
  });

  test("reuses an existing deviceId from localStorage", () => {
    localStorage.setItem("80p-device-id", "existing-device-id");
    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.deviceId).toBe("existing-device-id");
  });

  test("falls back to a generated UUID when crypto.randomUUID is unavailable", () => {
    const original = crypto.randomUUID;
    // eslint-disable-next-line no-global-assign
    delete crypto.randomUUID;
    localStorage.clear();

    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.deviceId).toMatch(/^[0-9a-f-]{36}$/);

    crypto.randomUUID = original;
  });

  test("initializes user from localStorage if present", () => {
    localStorage.setItem("80Percentile-user", JSON.stringify({ name: "Alice" }));
    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.user).toEqual({ name: "Alice" });
  });

  test("initializes user to null when localStorage is empty or invalid JSON", () => {
    localStorage.setItem("80Percentile-user", "not-json");
    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  test("persists user to localStorage when set, removes when cleared", () => {
    const { result } = renderHook(() => useUser(), { wrapper });

    act(() => {
      result.current.setUser({ name: "Bob" });
    });
    expect(JSON.parse(localStorage.getItem("80Percentile-user"))).toEqual({ name: "Bob" });

    act(() => {
      result.current.setUser(null);
    });
    expect(localStorage.getItem("80Percentile-user")).toBeNull();
  });

  test("resetUser resets room/game-related state", () => {
    const { result } = renderHook(() => useUser(), { wrapper });

    act(() => {
      result.current.setRoomId("room1");
      result.current.setIsInGame(true);
      result.current.setIsWaitingRoom(true);
      result.current.setRoomType("public");
      result.current.setHasStarted(true);
      result.current.setIsJoiningRoom(true);
    });

    act(() => {
      result.current.resetUser();
    });

    expect(result.current.roomId).toBeNull();
    expect(result.current.isInGame).toBe(false);
    expect(result.current.isWaitingRoom).toBe(false);
    expect(result.current.roomType).toBeNull();
    expect(result.current.hasStarted).toBe(false);
    expect(result.current.isJoiningRoom).toBe(false);
  });
});
