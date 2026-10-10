import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import GameChat from "../GameChat";
import { useChat } from "../../contexts/ChatContext";
import { useUser } from "../../contexts/UserContext";

jest.mock("../../contexts/ChatContext", () => ({ useChat: jest.fn() }));
jest.mock("../../contexts/UserContext", () => ({ useUser: jest.fn() }));
jest.mock("../RoomChat", () => (props) => (
  <div data-testid="room-chat" data-embedded={String(!!props.embedded)} />
));

const msg = (socketId, name, message) => ({ socketId, name, avatar: "🐸", message });

describe("GameChat", () => {
  let messages;

  beforeEach(() => {
    jest.useFakeTimers();
    messages = [];
    useChat.mockImplementation(() => ({ messages }));
    useUser.mockReturnValue({ user: { socketId: "me" } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("panel variant renders an embedded RoomChat with a heading", () => {
    render(<GameChat variant="panel" />);
    expect(screen.getByRole("heading", { name: "Room chat" })).toBeInTheDocument();
    expect(screen.getByTestId("room-chat")).toHaveAttribute("data-embedded", "true");
  });

  test("dock variant starts closed with no unread badge", () => {
    render(<GameChat />);
    expect(screen.getByRole("button", { name: "Open room chat" })).toBeInTheDocument();
    expect(screen.queryByTestId("room-chat")).not.toBeInTheDocument();
  });

  test("new messages from others show a banner and an unread count", () => {
    const { rerender } = render(<GameChat />);

    messages = [msg("p2", "Mo", "going low 👀")];
    rerender(<GameChat />);

    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("going low 👀")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open room chat, 1 unread" })).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.queryByText("going low 👀")).not.toBeInTheDocument();
  });

  test("my own messages don't trigger a banner or unread count", () => {
    const { rerender } = render(<GameChat />);
    messages = [msg("me", "You", "gg")];
    rerender(<GameChat />);

    expect(screen.queryByText("gg")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open room chat" })).toBeInTheDocument();
  });

  test("opening the sheet shows the chat and clears unread; closing hides it", () => {
    const { rerender } = render(<GameChat />);
    messages = [msg("p2", "Mo", "hi")];
    rerender(<GameChat />);

    fireEvent.click(screen.getByRole("button", { name: /Open room chat/ }));
    expect(screen.getByRole("dialog", { name: "Room chat" })).toBeInTheDocument();
    expect(screen.getByTestId("room-chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open room chat" })).toBeInTheDocument();
  });

  test("tapping the banner opens the sheet", () => {
    const { rerender } = render(<GameChat />);
    messages = [msg("p2", "Ava", "sure you are")];
    rerender(<GameChat />);

    fireEvent.click(screen.getByText("Reply"));
    expect(screen.getByRole("dialog", { name: "Room chat" })).toBeInTheDocument();
  });
});
