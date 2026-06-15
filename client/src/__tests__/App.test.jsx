import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../App";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";
import { useSound } from "../contexts/SoundContext";
import socket from "../socket";
import { __mockSocket } from "socket.io-client";

jest.mock("../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));
jest.mock("../contexts/GameContext", () => ({
  useGame: jest.fn(),
}));
jest.mock("../contexts/SoundContext", () => ({
  useSound: jest.fn(),
  SoundProvider: ({ children }) => <div data-testid="sound-provider">{children}</div>,
}));
jest.mock("../contexts/VoiceContext", () => ({
  VoiceProvider: ({ children }) => <div data-testid="voice-provider">{children}</div>,
}));
jest.mock("../contexts/NumwitRuleContext", () => ({
  NumwitRuleProvider: ({ children }) => <div data-testid="numwit-provider">{children}</div>,
}));
jest.mock("../contexts/ChatContext", () => ({
  ChatProvider: ({ children }) => <div data-testid="chat-provider">{children}</div>,
}));

jest.mock("../components/Login", () => () => <div data-testid="login" />);
jest.mock("../components/LandingPage", () => (props) => (
  <div data-testid="landing-page">
    <button onClick={props.onPlay}>play</button>
  </div>
));
jest.mock("../components/GameBoard", () => () => <div data-testid="game-board" />);
jest.mock("../components/WaitingRoom", () => () => <div data-testid="waiting-room" />);
jest.mock("../components/AchievementToast", () => () => <div data-testid="achievement-toast" />);
jest.mock("../modals/FloatingAlert", () => (props) => (
  <div data-testid="floating-alert">
    <span>{props.message}</span>
    <button onClick={props.onClose}>close-alert</button>
  </div>
));

const baseUser = (overrides = {}) => ({
  hasStarted: false,
  user: null,
  isInGame: false,
  isWaitingRoom: false,
  roomId: null,
  setRoomId: jest.fn(),
  setRoomType: jest.fn(),
  resetUser: jest.fn(),
  isJoiningRoom: false,
  roomType: null,
  deviceId: "device1",
  ...overrides,
});

describe("App", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
    useGame.mockReturnValue({ resetGame: jest.fn() });
    useSound.mockReturnValue({ muted: false, toggleMute: jest.fn() });
    window.history.pushState({}, "", "/");
  });

  test("shows the landing page by default; Play Now switches to Login", () => {
    useUser.mockReturnValue(baseUser());
    render(<App />);

    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    expect(screen.queryByTestId("login")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("play"));

    expect(screen.queryByTestId("landing-page")).not.toBeInTheDocument();
    expect(screen.getByText("Numwit")).toBeInTheDocument();
    expect(screen.getByTestId("login")).toBeInTheDocument();
  });

  test("direct room links skip the landing page and set private room type/id", () => {
    window.history.pushState({}, "", "/abcdef");
    useUser.mockReturnValue(baseUser());
    render(<App />);

    expect(useUser().setRoomType).toHaveBeenCalledWith("private");
    expect(useUser().setRoomId).toHaveBeenCalledWith("abcdef");
    expect(screen.queryByTestId("landing-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("login")).toBeInTheDocument();
  });

  test("shows WaitingRoom (wrapped in ChatProvider/VoiceProvider) while waiting", () => {
    useUser.mockReturnValue(
      baseUser({
        hasStarted: true,
        isWaitingRoom: true,
        user: { socketId: "p0", name: "Alice", avatar: "🐱" },
        roomType: "private",
        roomId: "abcdef",
      })
    );
    render(<App />);

    expect(screen.getByTestId("voice-provider")).toBeInTheDocument();
    expect(screen.getByTestId("chat-provider")).toBeInTheDocument();
    expect(screen.getByTestId("waiting-room")).toBeInTheDocument();
    expect(screen.queryByTestId("game-board")).not.toBeInTheDocument();

    // Header shows mute button + user info
    expect(screen.getByLabelText("Mute")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  test("shows GameBoard (wrapped in NumwitRuleProvider/VoiceProvider) when in game", () => {
    useUser.mockReturnValue(
      baseUser({
        hasStarted: true,
        isInGame: true,
        user: { socketId: "p0", name: "Bob", avatar: "🐶" },
      })
    );
    render(<App />);

    expect(screen.getByTestId("voice-provider")).toBeInTheDocument();
    expect(screen.getByTestId("numwit-provider")).toBeInTheDocument();
    expect(screen.getByTestId("game-board")).toBeInTheDocument();
    expect(screen.queryByTestId("waiting-room")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  test("shows Login and a Joining room message when isJoiningRoom is true", () => {
    useUser.mockReturnValue(baseUser({ isJoiningRoom: true }));
    render(<App />);

    expect(screen.queryByTestId("landing-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("login")).toBeInTheDocument();
    expect(screen.getByText("Joining room…")).toBeInTheDocument();
  });

  test("shows a FloatingAlert on error_message and clears the message on close", () => {
    useUser.mockReturnValue(baseUser());
    render(<App />);

    act(() => {
      __mockSocket.__trigger("error_message", { message: "Room not found" });
    });

    expect(screen.getByTestId("floating-alert")).toBeInTheDocument();
    expect(screen.getByText("Room not found")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-alert"));

    expect(screen.queryByText("Room not found")).not.toBeInTheDocument();
    expect(screen.getByTestId("floating-alert")).toBeInTheDocument();
  });

  test("resets game and user state on socket disconnect", () => {
    const resetGame = jest.fn();
    const resetUser = jest.fn();
    useGame.mockReturnValue({ resetGame });
    useUser.mockReturnValue(baseUser({ resetUser }));
    render(<App />);

    act(() => {
      __mockSocket.__trigger("disconnect");
    });

    expect(resetGame).toHaveBeenCalled();
    expect(resetUser).toHaveBeenCalled();
  });

  test("emits join_room for private rooms while waiting", () => {
    useUser.mockReturnValue(
      baseUser({
        hasStarted: true,
        isWaitingRoom: true,
        user: { socketId: "p0", name: "Alice", avatar: "🐱" },
        roomType: "private",
        roomId: "abc123",
        deviceId: "dev1",
      })
    );
    render(<App />);

    expect(socket.emit).toHaveBeenCalledWith("join_room", {
      roomId: "abc123",
      user: { socketId: "p0", name: "Alice", avatar: "🐱" },
      roomType: "private",
      deviceId: "dev1",
    });
  });

  test("removes socket listeners on unmount", () => {
    useUser.mockReturnValue(baseUser());
    const { unmount } = render(<App />);

    unmount();

    expect(socket.off).toHaveBeenCalledWith("error_message");
    expect(socket.off).toHaveBeenCalledWith("disconnect");
  });

  test("renders the AchievementToast", () => {
    useUser.mockReturnValue(baseUser());
    render(<App />);

    expect(screen.getByTestId("achievement-toast")).toBeInTheDocument();
  });

  test("shows a Leave Room button while in the waiting room or game, which leaves and returns home", () => {
    const resetGame = jest.fn();
    const resetUser = jest.fn();
    useGame.mockReturnValue({ resetGame });
    useUser.mockReturnValue(
      baseUser({
        hasStarted: true,
        isInGame: true,
        user: { socketId: "p0", name: "Bob", avatar: "🐶" },
        resetUser,
      })
    );
    render(<App />);

    const leaveButton = screen.getByRole("button", { name: /leave room/i });
    fireEvent.click(leaveButton);

    expect(socket.emit).toHaveBeenCalledWith("leave_room");
    expect(resetGame).toHaveBeenCalled();
    expect(resetUser).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  test("does not show a Leave Room button on the login/landing screens", () => {
    useUser.mockReturnValue(baseUser());
    render(<App />);

    expect(screen.queryByRole("button", { name: /leave room/i })).not.toBeInTheDocument();
  });

  test("clicking the Numwit logo while in game leaves the room and returns home", () => {
    const resetGame = jest.fn();
    const resetUser = jest.fn();
    useGame.mockReturnValue({ resetGame });
    useUser.mockReturnValue(
      baseUser({
        hasStarted: true,
        isInGame: true,
        user: { socketId: "p0", name: "Bob", avatar: "🐶" },
        resetUser,
      })
    );
    render(<App />);

    fireEvent.click(screen.getByText("Numwit"));

    expect(socket.emit).toHaveBeenCalledWith("leave_room");
    expect(resetGame).toHaveBeenCalled();
    expect(resetUser).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });

  test("clicking the Numwit logo from the login screen returns home without emitting leave_room", () => {
    const resetGame = jest.fn();
    const resetUser = jest.fn();
    useGame.mockReturnValue({ resetGame });
    window.history.pushState({}, "", "/abcdef");
    useUser.mockReturnValue(baseUser({ resetUser }));
    render(<App />);

    fireEvent.click(screen.getByText("Numwit"));

    expect(socket.emit).not.toHaveBeenCalledWith("leave_room");
    expect(resetGame).toHaveBeenCalled();
    expect(resetUser).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
  });
});
