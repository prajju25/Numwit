import React from "react";
import { renderHook, act } from "@testing-library/react";
import { ChatProvider, useChat } from "../ChatContext";
import { __mockSocket } from "socket.io-client";

function wrapper({ children }) {
  return <ChatProvider>{children}</ChatProvider>;
}

describe("ChatContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("starts with empty messages and rateLimited=false", () => {
    const { result } = renderHook(() => useChat(), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.rateLimited).toBe(false);
  });

  test("appends incoming chat_message events", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      __mockSocket.__trigger("chat_message", { user: "Alice", text: "hi" });
    });

    expect(result.current.messages).toEqual([{ user: "Alice", text: "hi" }]);

    act(() => {
      __mockSocket.__trigger("chat_message", { user: "Bob", text: "yo" });
    });

    expect(result.current.messages).toHaveLength(2);
  });

  test("sets and auto-clears rateLimited on chat_rate_limited", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      __mockSocket.__trigger("chat_rate_limited", { message: "Slow down!" });
    });

    expect(result.current.rateLimited).toBe("Slow down!");

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.rateLimited).toBe(false);
  });

  test("sendMessage emits room_chat with trimmed message", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.sendMessage("room1", "  hello  ");
    });

    expect(__mockSocket.emit).toHaveBeenCalledWith("room_chat", {
      roomId: "room1",
      message: "hello",
    });
  });

  test("sendMessage does nothing for empty/whitespace-only messages", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      result.current.sendMessage("room1", "   ");
    });
    act(() => {
      result.current.sendMessage("room1", "");
    });
    act(() => {
      result.current.sendMessage("room1", undefined);
    });

    expect(__mockSocket.emit).not.toHaveBeenCalledWith("room_chat", expect.anything());
  });

  test("clearMessages empties the messages array", () => {
    const { result } = renderHook(() => useChat(), { wrapper });

    act(() => {
      __mockSocket.__trigger("chat_message", { user: "Alice", text: "hi" });
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
  });

  test("cleans up socket listeners on unmount", () => {
    const { unmount } = renderHook(() => useChat(), { wrapper });
    unmount();

    expect(__mockSocket.off).toHaveBeenCalledWith("chat_message", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("chat_rate_limited", expect.any(Function));
  });
});
