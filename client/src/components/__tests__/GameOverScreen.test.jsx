import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GameOverScreen from "../GameOverScreen";
import { useUser } from "../../contexts/UserContext";
import { useNumwit } from "../../contexts/NumwitRuleContext";
import { useGame } from "../../contexts/GameContext";
import socket from "../../socket";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));
jest.mock("../../contexts/NumwitRuleContext", () => ({
  useNumwit: jest.fn(),
}));
jest.mock("../../contexts/GameContext", () => ({
  useGame: jest.fn(),
}));
jest.mock("../SessionStats", () => () => <div data-testid="session-stats" />);
jest.mock("../LevelBadge", () => (props) => <div data-testid="level-badge">{props.level}</div>);

const players = [
  { socketId: "p0", name: "Alice", avatar: "🐱" },
  { socketId: "p1", name: "Bob", avatar: "🐶" },
  { socketId: "p2", name: "Charlie", avatar: "🦊" },
];

describe("GameOverScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNumwit.mockReturnValue({ history: [], xpData: null, myLevel: null });
    useGame.mockReturnValue({ hostSocketId: "p0" });
  });

  test("shows 'You Won!' when the current user is the winner", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByText("You Won!")).toBeInTheDocument();
    expect(screen.getByText("🎉")).toBeInTheDocument();
  });

  test("shows 'Game Over' when the current user did not win", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByText("Game Over")).toBeInTheDocument();
    expect(screen.getByText("💀")).toBeInTheDocument();
  });

  test("shows disconnect reason text when the opponent disconnected", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(
      <GameOverScreen
        data={{ winnerSocketId: "p0", reason: "opponent_disconnected", points: {} }}
        players={players}
      />
    );

    expect(screen.getByText("A player disconnected — game ended early.")).toBeInTheDocument();
  });

  test("shows the winner spotlight", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByText("🏆 Winner")).toBeInTheDocument();
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
  });

  test("renders final scores sorted ascending by points with medals", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(
      <GameOverScreen
        data={{ winnerSocketId: "p0", points: { p0: 5, p1: 2, p2: 8 } }}
        players={players}
      />
    );

    const rows = screen.getAllByText(/pts$/);
    expect(rows[0]).toHaveTextContent("2 pts"); // Bob, lowest score, first
    expect(rows[1]).toHaveTextContent("5 pts"); // Alice
    expect(rows[2]).toHaveTextContent("8 pts"); // Charlie
    expect(screen.getByText("🥇")).toBeInTheDocument();
    expect(screen.getByText("🥈")).toBeInTheDocument();
    expect(screen.getByText("🥉")).toBeInTheDocument();
  });

  test("shows the XP banner with level-up styling when leveling up", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    useNumwit.mockReturnValue({
      history: [],
      xpData: { xpGained: 25, levelUp: true, level: 4 },
      myLevel: 4,
    });

    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByText(/\+25 XP/)).toBeInTheDocument();
    expect(screen.getByText(/Level 4 reached!/)).toBeInTheDocument();
    expect(screen.getByTestId("level-badge")).toHaveTextContent("4");
  });

  test("XP banner without level-up shows just the XP amount", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    useNumwit.mockReturnValue({
      history: [],
      xpData: { xpGained: -5, levelUp: false, level: 2 },
      myLevel: 2,
    });

    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByText(/-5 XP/)).toBeInTheDocument();
    expect(screen.queryByText(/Level \d reached!/)).not.toBeInTheDocument();
  });

  test("host sees Play Again and it emits restart_game", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    fireEvent.click(screen.getByText("🔄 Play Again"));
    expect(socket.emit).toHaveBeenCalledWith("restart_game", { roomId: "room1" });
  });

  test("non-host sees a waiting message instead of Play Again", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.queryByText("🔄 Play Again")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for host to start a new game/)).toBeInTheDocument();
  });

  test("renders SessionStats", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByTestId("session-stats")).toBeInTheDocument();
  });
});
