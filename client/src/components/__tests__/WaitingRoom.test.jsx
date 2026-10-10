import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import WaitingRoom from "../WaitingRoom";
import { useUser } from "../../contexts/UserContext";
import { useGame } from "../../contexts/GameContext";
import socket from "../../socket";
import { MIN_PLAYERS } from "../../constants/constants";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));
jest.mock("../../contexts/GameContext", () => ({
  useGame: jest.fn(),
}));
jest.mock("../RoomChat", () => () => <div data-testid="room-chat" />);
jest.mock("../GameSettingsPanel", () => (props) => (
  <div data-testid="game-settings-panel">{JSON.stringify(props.settings)}</div>
));
jest.mock("../VoicePanel", () => () => <div data-testid="voice-panel" />);

const makePlayers = (n, opts = {}) =>
  Array.from({ length: n }, (_, i) => ({
    socketId: `p${i}`,
    name: `Player${i}`,
    avatar: "🐱",
    ...(opts[i] || {}),
  }));

describe("WaitingRoom", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn(() => Promise.resolve()) },
      configurable: true,
    });
  });

  function setup({
    roomType = "private",
    roomId = "room123",
    user = { socketId: "p0" },
    players = makePlayers(2),
    hostSocketId = "p0",
    botFillAt = null,
  } = {}) {
    useUser.mockReturnValue({ roomType, roomId, user });
    useGame.mockReturnValue({ players, hostSocketId, botFillAt });
  }

  test("shows player count and minimum required", () => {
    setup({ players: makePlayers(2) });
    render(<WaitingRoom />);
    expect(screen.getByText(`2/${MIN_PLAYERS} minimum · 2 joined`)).toBeInTheDocument();
  });

  test("lists each player with avatar and name", () => {
    setup({ players: makePlayers(2) });
    render(<WaitingRoom />);
    expect(screen.getByText("Player0")).toBeInTheDocument();
    expect(screen.getByText("Player1")).toBeInTheDocument();
  });

  test("shows the host badge for the host and bot badge for bots", () => {
    const players = [
      { socketId: "p0", name: "HostPlayer", avatar: "🐱" },
      { socketId: "p1", name: "BotPlayer", avatar: "🤖", isBot: true },
    ];
    setup({ players, hostSocketId: "p0" });
    render(<WaitingRoom />);

    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("Bot")).toBeInTheDocument();
  });

  test("private rooms show a copy-invite-link button that copies the room URL", async () => {
    setup({ roomType: "private", roomId: "abcdef" });
    render(<WaitingRoom />);

    expect(screen.getByText("abcdef")).toBeInTheDocument(); // room code
    const button = screen.getByText("Copy invite link");
    await act(async () => {
      fireEvent.click(button);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/abcdef`
    );
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  test("offers the native share sheet when the browser supports it", () => {
    navigator.share = jest.fn(() => Promise.resolve());
    setup({ roomType: "private", roomId: "abcdef" });
    render(<WaitingRoom />);

    fireEvent.click(screen.getByText("Share invite"));
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({
      url: `${window.location.origin}/abcdef`,
    }));
    delete navigator.share;
  });

  test("shows an open seat for every free slot up to 8", () => {
    setup({ players: makePlayers(3) });
    render(<WaitingRoom />);
    expect(screen.getAllByText("Open")).toHaveLength(5);
  });

  test("public rooms with a pending bot fill show a countdown", () => {
    setup({ roomType: "public", players: makePlayers(2), botFillAt: Date.now() + 5000 });
    render(<WaitingRoom />);

    expect(screen.getByText(/Looking for players… adding bots in/)).toBeInTheDocument();
  });

  test("public rooms without a pending bot fill show no countdown", () => {
    setup({ roomType: "public", players: makePlayers(2), botFillAt: null });
    render(<WaitingRoom />);

    expect(screen.queryByText(/Looking for players/)).not.toBeInTheDocument();
  });

  test("host sees the settings panel and a disabled Start button below MIN_PLAYERS", () => {
    setup({ players: makePlayers(2), hostSocketId: "p0", user: { socketId: "p0" } });
    render(<WaitingRoom />);

    expect(screen.getByTestId("game-settings-panel")).toBeInTheDocument();
    const startBtn = screen.getByText(/Waiting for \d+ more player/);
    expect(startBtn).toBeDisabled();
  });

  test("host sees an enabled Start Game button at MIN_PLAYERS and can start the game", () => {
    setup({
      players: makePlayers(MIN_PLAYERS),
      hostSocketId: "p0",
      user: { socketId: "p0" },
      roomId: "roomXYZ",
    });
    render(<WaitingRoom />);

    const startBtn = screen.getByText(`▶ Start game · ${MIN_PLAYERS} players`);
    expect(startBtn).not.toBeDisabled();

    fireEvent.click(startBtn);
    expect(socket.emit).toHaveBeenCalledWith("start_game", expect.objectContaining({ roomId: "roomXYZ" }));
  });

  test("non-host players see a waiting message instead of controls", () => {
    setup({ players: makePlayers(2), hostSocketId: "p0", user: { socketId: "p1" } });
    render(<WaitingRoom />);

    expect(screen.getByText("Waiting for host to start…")).toBeInTheDocument();
    expect(screen.queryByTestId("game-settings-panel")).not.toBeInTheDocument();
  });

  test("renders the voice panel and room chat", () => {
    setup();
    render(<WaitingRoom />);
    expect(screen.getByTestId("voice-panel")).toBeInTheDocument();
    expect(screen.getByTestId("room-chat")).toBeInTheDocument();
  });

  test("renders gracefully when players is empty/undefined", () => {
    setup({ players: [], hostSocketId: null });
    render(<WaitingRoom />);
    expect(screen.getByText(`0/${MIN_PLAYERS} minimum · 0 joined`)).toBeInTheDocument();
  });
});
