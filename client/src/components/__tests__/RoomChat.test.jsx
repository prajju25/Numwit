import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RoomChat from "../RoomChat";
import { useChat } from "../../contexts/ChatContext";
import { useUser } from "../../contexts/UserContext";
import { useGame } from "../../contexts/GameContext";
import { __mockSocket } from "socket.io-client";

jest.mock("../../contexts/ChatContext", () => ({ useChat: jest.fn() }));
jest.mock("../../contexts/UserContext", () => ({ useUser: jest.fn() }));
jest.mock("../../contexts/GameContext", () => ({ useGame: jest.fn() }));

const players = [
  { socketId: "me", name: "Alice", avatar: "🐱" },
  { socketId: "bob", name: "Bob", avatar: "🐶" },
  { socketId: "carl", name: "Carl", avatar: "🦊" },
];

function setup({ messages = [], rateLimited = null, sendMessage = jest.fn() } = {}) {
  useUser.mockReturnValue({ roomId: "room1", user: { socketId: "me", name: "Alice" } });
  useGame.mockReturnValue({ players });
  useChat.mockReturnValue({ messages, rateLimited, sendMessage });
  return { sendMessage };
}

describe("RoomChat", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
    __mockSocket.emit.mockClear();
    __mockSocket.off.mockClear();
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("shows an empty state when there are no messages", () => {
    setup();
    render(<RoomChat />);
    expect(screen.getByText("No messages yet — say hi! 👋")).toBeInTheDocument();
    expect(screen.getByText("💬 Room Chat")).toBeInTheDocument();
  });

  test("renders messages, distinguishing own vs others", () => {
    setup({
      messages: [
        { socketId: "me", name: "Alice", avatar: "🐱", message: "hi all" },
        { socketId: "bob", name: "Bob", avatar: "🐶", message: "hello!" },
      ],
    });
    render(<RoomChat />);
    expect(screen.getByText("hi all")).toBeInTheDocument();
    expect(screen.getByText("hello!")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    // own message shouldn't show name label
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  test("typing and pressing Enter sends the message and clears the draft", () => {
    const { sendMessage } = setup();
    render(<RoomChat />);
    const input = screen.getByPlaceholderText("Type a message…");

    fireEvent.change(input, { target: { value: "hello" } });
    expect(__mockSocket.emit).toHaveBeenCalledWith("typing_start", { roomId: "room1" });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(sendMessage).toHaveBeenCalledWith("room1", "hello");
    expect(input.value).toBe("");
  });

  test("Shift+Enter does not send the message", () => {
    const { sendMessage } = setup();
    render(<RoomChat />);
    const input = screen.getByPlaceholderText("Type a message…");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("clicking Send sends the message; Send is disabled when draft is empty", () => {
    const { sendMessage } = setup();
    render(<RoomChat />);
    const input = screen.getByPlaceholderText("Type a message…");
    const sendBtn = screen.getByRole("button", { name: "Send" });
    expect(sendBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "hey" } });
    expect(sendBtn).not.toBeDisabled();

    fireEvent.click(sendBtn);
    expect(sendMessage).toHaveBeenCalledWith("room1", "hey");
  });

  test("clearing the input emits typing_stop", () => {
    setup();
    render(<RoomChat />);
    const input = screen.getByPlaceholderText("Type a message…");
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(__mockSocket.emit).toHaveBeenCalledWith("typing_stop", { roomId: "room1" });
  });

  test("typing timeout emits typing_stop after 2.5s", () => {
    setup();
    render(<RoomChat />);
    const input = screen.getByPlaceholderText("Type a message…");
    fireEvent.change(input, { target: { value: "hi" } });

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(__mockSocket.emit).toHaveBeenCalledWith("typing_stop", { roomId: "room1" });
  });

  test("shows a typing indicator for one other player", () => {
    setup();
    render(<RoomChat />);
    act(() => {
      __mockSocket.__trigger("player_typing", { socketId: "bob", isTyping: true });
    });
    expect(screen.getByText("Bob is typing…")).toBeInTheDocument();
  });

  test("shows a typing indicator for two other players", () => {
    setup();
    render(<RoomChat />);
    act(() => {
      __mockSocket.__trigger("player_typing", { socketId: "bob", isTyping: true });
      __mockSocket.__trigger("player_typing", { socketId: "carl", isTyping: true });
    });
    expect(screen.getByText("Bob and Carl are typing…")).toBeInTheDocument();
  });

  test("shows 'Several people are typing…' for 3+ players and removes when isTyping false", () => {
    setup({});
    useGame.mockReturnValue({
      players: [
        ...players,
        { socketId: "dan", name: "Dan", avatar: "🐧" },
      ],
    });
    render(<RoomChat />);
    act(() => {
      __mockSocket.__trigger("player_typing", { socketId: "bob", isTyping: true });
      __mockSocket.__trigger("player_typing", { socketId: "carl", isTyping: true });
      __mockSocket.__trigger("player_typing", { socketId: "dan", isTyping: true });
    });
    expect(screen.getByText("Several people are typing…")).toBeInTheDocument();

    act(() => {
      __mockSocket.__trigger("player_typing", { socketId: "bob", isTyping: false });
      __mockSocket.__trigger("player_typing", { socketId: "carl", isTyping: false });
      __mockSocket.__trigger("player_typing", { socketId: "dan", isTyping: false });
    });
    expect(screen.queryByText("Several people are typing…")).not.toBeInTheDocument();
  });

  test("ignores own typing events for the typing indicator", () => {
    setup();
    render(<RoomChat />);
    act(() => {
      __mockSocket.__trigger("player_typing", { socketId: "me", isTyping: true });
    });
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  test("shows the rate limit warning", () => {
    setup({ rateLimited: "Slow down!" });
    render(<RoomChat />);
    expect(screen.getByText("⚠️ Slow down!")).toBeInTheDocument();
  });

  test("unregisters the player_typing listener on unmount", () => {
    setup();
    const { unmount } = render(<RoomChat />);
    unmount();
    expect(__mockSocket.off).toHaveBeenCalledWith("player_typing", expect.any(Function));
  });
});
