import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GameBoard from "../GameBoard";
import { resetAnalytics } from "../../services/analytics";
import { useGame } from "../../contexts/GameContext";
import { useUser } from "../../contexts/UserContext";
import { useNumwit } from "../../contexts/NumwitRuleContext";
import socket from "../../socket";

jest.mock("../../contexts/GameContext", () => ({
  useGame: jest.fn(),
}));
jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));
jest.mock("../../contexts/NumwitRuleContext", () => ({
  useNumwit: jest.fn(),
}));

jest.mock("../NumberInput", () => (props) => (
  <button
    data-testid="number-input"
    disabled={props.disabled}
    onClick={() => props.onSelect(42)}
    data-last-target={props.lastTarget}
  >
    NumberInput-{props.selectedNumber}
  </button>
));
jest.mock("../PlayerScorePanel", () => () => <div data-testid="player-score-panel" />);
jest.mock("../RoundResultOverlay", () => (props) => (
  <div data-testid="round-result-overlay" data-room-id={props.roomId}>
    <button onClick={props.onDismiss}>dismiss</button>
  </div>
));
jest.mock("../GameOverScreen", () => (props) => (
  <div data-testid="game-over-screen">{JSON.stringify(props.data)}</div>
));
jest.mock("../CountdownTimer", () => (props) => (
  <div data-testid="countdown-timer" data-paused={String(!!props.paused)}>{props.timerDuration}</div>
));
jest.mock("../RoundHistory", () => () => <div data-testid="round-history" />);
jest.mock("../EmoteBar", () => () => <div data-testid="emote-bar" />);
jest.mock("../DuelView", () => (props) => (
  <div data-testid="duel-view">{props.children}</div>
));
jest.mock("../TutorialOverlay", () => () => <div data-testid="tutorial-overlay" />);
jest.mock("../../modals/FloatingAlert", () => (props) => (
  <div data-testid="floating-alert">
    <span>{props.message}</span>
    <button onClick={props.onClose}>close-alert</button>
  </div>
));
jest.mock("../VoicePanel", () => () => <div data-testid="voice-panel" />);
jest.mock("../GameChat", () => (props) => <div data-testid={`game-chat-${props.variant}`} />);

const players = [
  { socketId: "p0", name: "Alice", avatar: "🐱" },
  { socketId: "p1", name: "Bob", avatar: "🐶" },
  { socketId: "p2", name: "Charlie", avatar: "🦊" },
];

const baseGameData = {
  round: 3,
  targetMultiplier: 0.8,
  timerDuration: 30,
  points: { p0: 1, p1: 2, p2: 3 },
  eliminationThreshold: 5,
  turnOrder: ["p0", "p1", "p2"],
};

const baseNumwit = () => ({
  gameData: { ...baseGameData },
  roundResult: null,
  roundVoid: null,
  submitted: false,
  setSubmitted: jest.fn(),
  selectedNumber: null,
  setSelectedNumber: jest.fn(),
  waitingCount: null,
  gameOver: null,
  eliminatedPlayers: [],
  alert: null,
  setAlert: jest.fn(),
  timerExpired: false,
  timerKey: 0,
});

describe("GameBoard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    useGame.mockReturnValue({ players });
    useNumwit.mockReturnValue(baseNumwit());
  });

  test("renders GameOverScreen when gameOver is set, instead of the board", () => {
    useNumwit.mockReturnValue({ ...baseNumwit(), gameOver: { winnerSocketId: "p0" } });
    render(<GameBoard />);

    expect(screen.getByTestId("game-over-screen")).toBeInTheDocument();
    expect(screen.getByTestId("game-over-screen")).toHaveTextContent("p0");
    expect(screen.queryByTestId("number-input")).not.toBeInTheDocument();
  });

  test("renders the round number and target percentage", () => {
    render(<GameBoard />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Pick a number closest to 80% of the average/)).toBeInTheDocument();
  });

  test("shows the bot difficulty chip only when bots are playing", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      gameData: { ...baseGameData, gameSettings: { botDifficulty: "sharp" } },
    });
    const { unmount } = render(<GameBoard />);
    expect(screen.queryByText(/Sharp/)).not.toBeInTheDocument();
    unmount();

    useGame.mockReturnValue({ players: [players[0], { ...players[1], isBot: true }, { ...players[2], isBot: true }] });
    render(<GameBoard />);
    expect(screen.getByText(/Sharp/)).toBeInTheDocument();
  });

  test("shows 'Pick your number' and renders NumberInput by default", () => {
    render(<GameBoard />);

    expect(screen.getByText("Pick your number")).toBeInTheDocument();
    expect(screen.getByTestId("number-input")).toBeInTheDocument();
    expect(screen.getByTestId("number-input")).not.toBeDisabled();
  });

  test("clicking the number input submits the chosen number", () => {
    const numwit = baseNumwit();
    useNumwit.mockReturnValue(numwit);
    render(<GameBoard />);

    fireEvent.click(screen.getByTestId("number-input"));

    expect(numwit.setSubmitted).toHaveBeenCalledWith(true);
    expect(numwit.setSelectedNumber).toHaveBeenCalledWith(42);
    expect(socket.emit).toHaveBeenCalledWith("send_number", {
      roomId: "room1",
      user: { socketId: "p0" },
      no: 42,
    });
  });

  test("shows pending-joiner message when the player is not yet in turnOrder", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      gameData: { ...baseGameData, turnOrder: ["p1", "p2"] },
    });
    render(<GameBoard />);

    expect(screen.getByText("You'll join from the next round.")).toBeInTheDocument();
    expect(screen.getByText("Joining next round…")).toBeInTheDocument();
    expect(screen.queryByTestId("number-input")).not.toBeInTheDocument();
  });

  test("shows eliminated message when the player has been eliminated", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      eliminatedPlayers: ["p0"],
    });
    render(<GameBoard />);

    expect(screen.getByText("You were eliminated. Watch the game continue…")).toBeInTheDocument();
    expect(screen.getByText("Eliminated")).toBeInTheDocument();
    expect(screen.queryByTestId("number-input")).not.toBeInTheDocument();
  });

  test("shows the submitted number when submitted", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      submitted: true,
      selectedNumber: 17,
    });
    render(<GameBoard />);

    expect(screen.getByText("Submitted:")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByTestId("number-input")).toBeDisabled();
  });

  test("shows 'Time's up!' when the timer has expired", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      timerExpired: true,
    });
    render(<GameBoard />);

    expect(screen.getByText("Time's up!")).toBeInTheDocument();
    expect(screen.getByTestId("number-input")).toBeDisabled();
  });

  test("shows the waiting indicator when waitingCount is set", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      waitingCount: { submitted: 2, total: 3 },
    });
    render(<GameBoard />);

    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText(/submitted/)).toBeInTheDocument();
  });

  test("renders PlayerScorePanel (not DuelView) when more than 2 players are active", () => {
    render(<GameBoard />);

    expect(screen.getByTestId("player-score-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("duel-view")).not.toBeInTheDocument();
  });

  test("renders DuelView when exactly 2 active players remain", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      eliminatedPlayers: ["p2"],
    });
    render(<GameBoard />);

    expect(screen.getByTestId("duel-view")).toBeInTheDocument();
    expect(screen.queryByTestId("player-score-panel")).not.toBeInTheDocument();
    // numberInput should still be rendered inside DuelView's children
    expect(screen.getByTestId("number-input")).toBeInTheDocument();
  });

  test("shows a FloatingAlert when alert is set and clears it on close", () => {
    const numwit = { ...baseNumwit(), alert: { message: "Invalid number" } };
    useNumwit.mockReturnValue(numwit);
    render(<GameBoard />);

    expect(screen.getByTestId("floating-alert")).toBeInTheDocument();
    expect(screen.getByText("Invalid number")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-alert"));
    expect(numwit.setAlert).toHaveBeenCalledWith(null);
  });

  test("shows RoundResultOverlay when roundResult is set and dismisses it", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      roundResult: { target: 50 },
    });
    render(<GameBoard />);

    expect(screen.getByTestId("round-result-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("round-result-overlay")).toHaveAttribute("data-room-id", "room1");

    fireEvent.click(screen.getByText("dismiss"));
    expect(screen.queryByTestId("round-result-overlay")).not.toBeInTheDocument();
  });

  test("shows RoundResultOverlay when roundVoid is set", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      roundVoid: { reason: "duplicate" },
    });
    render(<GameBoard />);

    expect(screen.getByTestId("round-result-overlay")).toBeInTheDocument();
  });

  test("renders CountdownTimer, RoundHistory, VoicePanel, EmoteBar, and TutorialOverlay", () => {
    render(<GameBoard />);

    expect(screen.getByTestId("countdown-timer")).toHaveTextContent("30");
    expect(screen.getByTestId("round-history")).toBeInTheDocument();
    expect(screen.getByTestId("voice-panel")).toBeInTheDocument();
    expect(screen.getByTestId("emote-bar")).toBeInTheDocument();
    // One layout is mounted at a time, so the tip renders exactly once.
    expect(screen.getAllByTestId("tutorial-overlay").length).toBe(1);
  });

  describe("responsive layout", () => {
    const setWidth = (w) => {
      Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
      window.matchMedia = jest.fn().mockReturnValue({
        matches: w >= 1024, addEventListener: jest.fn(), removeEventListener: jest.fn(),
      });
    };
    afterEach(() => { setWidth(1024); delete window.matchMedia; });

    test("desktop shows the chat as a side panel", () => {
      setWidth(1440);
      render(<GameBoard />);
      expect(screen.getByTestId("game-chat-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("game-chat-dock")).not.toBeInTheDocument();
    });

    test("mobile shows the chat button in the bottom dock", () => {
      setWidth(390);
      render(<GameBoard />);
      expect(screen.getByTestId("game-chat-dock")).toBeInTheDocument();
      expect(screen.queryByTestId("game-chat-panel")).not.toBeInTheDocument();
      expect(screen.getByTestId("emote-bar")).toBeInTheDocument();
    });
  });

  test("ticks the avatars of players who have locked in", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      waitingCount: { submitted: 1, total: 3, submittedIds: ["p1"] },
    });
    render(<GameBoard />);
    expect(screen.getByTitle("Bob — locked in")).toBeInTheDocument();
    expect(screen.getByTitle("Alice (you)")).toBeInTheDocument();
  });

  test("counts my own pick as locked once submitted", () => {
    useNumwit.mockReturnValue({ ...baseNumwit(), submitted: true, selectedNumber: 12 });
    render(<GameBoard />);
    expect(screen.getByTitle("Alice (you) — locked in")).toBeInTheDocument();
  });

  test("passes the previous round's target to the number input", () => {
    useNumwit.mockReturnValue({ ...baseNumwit(), history: [{ round: 2, target: 28.4 }] });
    render(<GameBoard />);
    expect(screen.getByTestId("number-input")).toHaveAttribute("data-last-target", "28.4");
  });

  test("pauses the CountdownTimer while a round result or void overlay is showing", () => {
    render(<GameBoard />);
    expect(screen.getByTestId("countdown-timer")).toHaveAttribute("data-paused", "false");

    useNumwit.mockReturnValue({ ...baseNumwit(), roundResult: { target: 50 } });
    const { rerender } = render(<GameBoard />);
    rerender(<GameBoard />);
    expect(screen.getAllByTestId("countdown-timer").slice(-1)[0]).toHaveAttribute("data-paused", "true");

    useNumwit.mockReturnValue({ ...baseNumwit(), roundVoid: { reason: "duplicate" } });
    rerender(<GameBoard />);
    expect(screen.getAllByTestId("countdown-timer").slice(-1)[0]).toHaveAttribute("data-paused", "true");
  });

  test("renders the footer rule text with the elimination threshold", () => {
    render(<GameBoard />);

    expect(
      screen.getByText(/Target = 80% of average · Unique picks \(3\+ players\) · Ties = all win · 5 pts = eliminated/)
    ).toBeInTheDocument();
  });

  test("shows duel header prefix when in a duel", () => {
    useNumwit.mockReturnValue({
      ...baseNumwit(),
      eliminatedPlayers: ["p2"],
    });
    render(<GameBoard />);

    expect(screen.getByText(/⚔️ Duel —/)).toBeInTheDocument();
  });
});

describe("GameBoard analytics screens", () => {
  const urls = () => window.umami.track.mock.calls.map(([build]) => build({}).url);
  beforeEach(() => {
    resetAnalytics();
    window.umami = { track: jest.fn() };
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    useGame.mockReturnValue({ players });
  });
  afterEach(() => { delete window.umami; });

  test("reports /play/game, then /play/results at game over, then /play/game on Play again", () => {
    useNumwit.mockReturnValue(baseNumwit());
    const { rerender } = render(<GameBoard />);
    useNumwit.mockReturnValue({ ...baseNumwit(), gameOver: { winnerSocketId: "p0" } });
    rerender(<GameBoard />);
    useNumwit.mockReturnValue(baseNumwit());
    rerender(<GameBoard />);
    expect(urls()).toEqual(["/play/game", "/play/results", "/play/game"]);
  });
});
