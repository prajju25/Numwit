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
jest.mock("../ShareCardModal", () => (props) => (
  <div data-testid="share-card-modal" data-variant={props.variant}>
    <button onClick={props.onClose}>close-share</button>
  </div>
));

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
    expect(screen.getByText("Last mind standing")).toBeInTheDocument();
  });

  test("shows 'Game Over' when the current user did not win", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByText("Game Over")).toBeInTheDocument();
    expect(screen.queryByText("Last mind standing")).not.toBeInTheDocument();
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

  test("renders final standings with the winner first, then by fewest points, with medals", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(
      <GameOverScreen
        data={{ winnerSocketId: "p0", points: { p0: 5, p1: 2, p2: 8 } }}
        players={players}
      />
    );

    const rows = screen.getAllByText(/pts$/);
    // Podium renders 2nd, 1st, 3rd left-to-right
    expect(rows[0]).toHaveTextContent("2 pts"); // Bob — 2nd
    expect(rows[1]).toHaveTextContent("5 pts"); // Alice — winner, 1st
    expect(rows[2]).toHaveTextContent("8 pts"); // Charlie — 3rd
    expect(screen.getByText("🥇").parentElement).toHaveTextContent("5 pts");
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

  test("XP bar animates from the pre-game position to the new progress", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    useNumwit.mockReturnValue({
      history: [],
      xpData: { xpGained: 50, levelUp: false, level: 3, xpLevelStart: 250, xpNextLevel: 500, progress: 0.5 },
      myLevel: 3,
    });
    const { container } = render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);
    const fill = container.querySelector(".nw-xp-fill");
    expect(fill.style.getPropertyValue("--xp-from")).toBe("30%");
    expect(fill.style.getPropertyValue("--xp-to")).toBe("50%");
  });

  test("lists achievements unlocked this game", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    useNumwit.mockReturnValue({
      history: [], xpData: null, myLevel: null,
      newAchievements: [{ id: "hat_trick", name: "Hat Trick", icon: "🎩", description: "Win 3 rounds in a single game" }],
    });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);
    expect(screen.getByText("Unlocked this game")).toBeInTheDocument();
    expect(screen.getByText("Hat Trick")).toBeInTheDocument();
  });

  test("summarises rounds and toggles the full round history", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    useNumwit.mockReturnValue({ history: [{ round: 1, target: 30, winnerIds: ["p0"], submissions: [] }], xpData: null, myLevel: null });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);
    expect(screen.getByText("1 round · 1 round win")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Full round-by-round history" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("host sees Play Again and it emits restart_game", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    fireEvent.click(screen.getByText("Play again"));
    expect(socket.emit).toHaveBeenCalledWith("restart_game", { roomId: "room1" });
  });

  test("non-host sees a waiting message instead of Play Again", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.queryByText("Play again")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for host to start a new game/)).toBeInTheDocument();
  });

  test("renders SessionStats", () => {
    useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" } });
    render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

    expect(screen.getByTestId("session-stats")).toBeInTheDocument();
  });

  describe("Share Your Win", () => {
    afterEach(() => {
      delete global.fetch;
    });

    test("shows the share button when the user won", () => {
      useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" }, deviceId: "dev1" });
      render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

      expect(screen.getByText("Share your win")).toBeInTheDocument();
    });

    test("does not show the share button when the user lost", () => {
      useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p1" }, deviceId: "dev1" });
      render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);

      expect(screen.queryByText("Share your win")).not.toBeInTheDocument();
    });

    test("clicking the share button fetches the player card and opens the share modal", async () => {
      useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" }, deviceId: "dev1" });
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ name: "Alice", avatar: "🐱", level: 3, gamesWon: 4 }),
        })
      );

      render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);
      fireEvent.click(screen.getByText("Share your win"));

      await screen.findByTestId("share-card-modal");
      expect(global.fetch).toHaveBeenCalledWith("/api/player/dev1/card");
      expect(screen.getByTestId("share-card-modal")).toHaveAttribute("data-variant", "victory");
    });

    test("does nothing when deviceId is missing", () => {
      useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" }, deviceId: null });
      global.fetch = jest.fn();

      render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);
      fireEvent.click(screen.getByText("Share your win"));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.queryByTestId("share-card-modal")).not.toBeInTheDocument();
    });

    test("closing the modal clears the share state", async () => {
      useUser.mockReturnValue({ roomId: "room1", user: { socketId: "p0" }, deviceId: "dev1" });
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ name: "Alice" }) })
      );

      render(<GameOverScreen data={{ winnerSocketId: "p0", points: {} }} players={players} />);
      fireEvent.click(screen.getByText("Share your win"));
      await screen.findByTestId("share-card-modal");

      fireEvent.click(screen.getByText("close-share"));
      expect(screen.queryByTestId("share-card-modal")).not.toBeInTheDocument();
    });
  });
});
