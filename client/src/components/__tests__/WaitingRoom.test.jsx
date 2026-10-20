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

  test("public rooms with enough people count down to the game starting", () => {
    setup({ roomType: "public", players: makePlayers(3), botFillAt: Date.now() + 5000 });
    render(<WaitingRoom />);

    expect(screen.getByText(/Game starts in/)).toBeInTheDocument();
    expect(screen.queryByText(/adding bots/)).not.toBeInTheDocument();
  });

  test("anyone in a waiting public room can start now with bots", () => {
    setup({ roomType: "public", players: makePlayers(1), botFillAt: Date.now() + 15000 });
    render(<WaitingRoom />);

    fireEvent.click(screen.getByRole("button", { name: "Start now with bots" }));
    expect(socket.emit).toHaveBeenCalledWith("start_now");
  });

  test("with enough people the button just says Start now", () => {
    setup({ roomType: "public", players: makePlayers(3), botFillAt: Date.now() + 15000 });
    render(<WaitingRoom />);
    expect(screen.getByRole("button", { name: "Start now" })).toBeInTheDocument();
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
  test("the player's own seat says (you)", () => {
    setup({ players: makePlayers(3), user: { socketId: "p1" } });
    render(<WaitingRoom />);
    expect(screen.getAllByText("(you)")).toHaveLength(1);
    expect(screen.getByText("(you)").closest("li")).toHaveTextContent("Player1");
  });

});

describe("WaitingRoom challenge from the game-over screen", () => {
  const realShare = navigator.share;
  const realMatch = window.matchMedia;
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem("numwit_challenge", "I just finished 🥈 2nd of 3. Join my room 👇");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: jest.fn(() => Promise.resolve()) }, configurable: true });
    useUser.mockReturnValue({ roomType: "private", roomId: "room123", user: { socketId: "p0" } });
    useGame.mockReturnValue({ players: [{ socketId: "p0", name: "A", avatar: "🐱" }], hostSocketId: "p0", botFillAt: null });
  });
  afterEach(() => {
    navigator.share = realShare;
    window.matchMedia = realMatch;
    sessionStorage.clear();
  });

  test("shows the waiting message; on desktop Send copies it with the room link", async () => {
    render(<WaitingRoom />);
    expect(screen.getByLabelText("Your challenge")).toHaveTextContent("I just finished 🥈 2nd of 3");
    await act(async () => { fireEvent.click(screen.getByText("Send challenge")); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "I just finished 🥈 2nd of 3. Join my room 👇\n" + window.location.origin + "/room123"
    );
    expect(screen.getByText("✓ Copied — paste it to your friends")).toBeInTheDocument();
  });

  test("on phones it opens the share sheet; closing the sheet is not an error", async () => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
    navigator.share = jest.fn(() => Promise.resolve());
    render(<WaitingRoom />);
    await act(async () => { fireEvent.click(screen.getByText("Send challenge")); });
    expect(navigator.share).toHaveBeenCalledWith({
      title: "Numwit", text: "I just finished 🥈 2nd of 3. Join my room 👇", url: window.location.origin + "/room123",
    });
    expect(screen.getByText("✓ Sent — send to more friends")).toBeInTheDocument();

    navigator.share = jest.fn(() => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })));
    await act(async () => { fireEvent.click(screen.getByText("✓ Sent — send to more friends")); });
    expect(screen.getByText("✓ Sent — send to more friends")).toBeInTheDocument();
  });

  test("a failed copy says so; dismiss removes the card and the message", async () => {
    navigator.clipboard.writeText = jest.fn(() => Promise.reject(new Error("denied")));
    render(<WaitingRoom />);
    await act(async () => { fireEvent.click(screen.getByText("Send challenge")); });
    expect(screen.getByText("Couldn't share — try again")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss challenge"));
    expect(screen.queryByLabelText("Your challenge")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("numwit_challenge")).toBeNull();
  });

  test("the message is forgotten once the waiting room closes (game started or left)", () => {
    const { unmount } = render(<WaitingRoom />);
    unmount();
    expect(sessionStorage.getItem("numwit_challenge")).toBeNull();
  });

  test("no card without a pending challenge, or in a public room", () => {
    sessionStorage.clear();
    const { unmount } = render(<WaitingRoom />);
    expect(screen.queryByLabelText("Your challenge")).not.toBeInTheDocument();
    unmount();
    sessionStorage.setItem("numwit_challenge", "x");
    useUser.mockReturnValue({ roomType: "public", roomId: "room123", user: { socketId: "p0" } });
    render(<WaitingRoom />);
    expect(screen.queryByLabelText("Your challenge")).not.toBeInTheDocument();
  });
});
