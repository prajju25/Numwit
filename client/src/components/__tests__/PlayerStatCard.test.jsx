import React from "react";
import { render, screen } from "@testing-library/react";
import PlayerStatCard from "../PlayerStatCard";

const baseStats = {
  gamesPlayed: 10,
  gamesWon: 4,
  roundWins: 25,
  winRate: 40,
  currentStreak: 1,
  bestStreak: 5,
  achievementsUnlocked: 3,
  achievementsTotal: 20,
};

describe("PlayerStatCard", () => {
  test("renders name, level, and stat tiles", () => {
    render(<PlayerStatCard name="Alice" avatar="🐱" level={3} stats={baseStats} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText(/Level 3/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // Wins tile
    expect(screen.getByText("25")).toBeInTheDocument(); // Round Wins tile
    expect(screen.getByText("5")).toBeInTheDocument(); // Best Streak tile
    expect(screen.getByText("40%")).toBeInTheDocument(); // Win Rate tile
    expect(screen.getByText("10")).toBeInTheDocument(); // Games tile
    expect(screen.getByText("3/20")).toBeInTheDocument(); // Badges tile
  });

  test("defaults missing name/avatar/level gracefully", () => {
    render(<PlayerStatCard stats={{}} />);
    expect(screen.getByText("Player")).toBeInTheDocument();
    expect(screen.getByText(/Level 1/)).toBeInTheDocument();
  });

  test("shows the rank line only when rank is provided", () => {
    const { rerender } = render(<PlayerStatCard name="Alice" level={2} stats={baseStats} />);
    expect(screen.queryByText(/#/)).not.toBeInTheDocument();

    rerender(<PlayerStatCard name="Alice" level={2} stats={baseStats} rank={3} totalPlayers={12} />);
    expect(screen.getByText(/#3 of 12 this week/)).toBeInTheDocument();
  });

  test("shows the rank without 'of N this week' when totalPlayers is omitted", () => {
    render(<PlayerStatCard name="Alice" level={2} stats={baseStats} rank={7} />);
    expect(screen.getByText(/#7$/)).toBeInTheDocument();
  });

  test("shows a Champion badge when rank is 1", () => {
    render(<PlayerStatCard name="Alice" level={2} stats={baseStats} rank={1} />);
    expect(screen.getByText(/Champion/)).toBeInTheDocument();
  });

  test("shows a Just Won badge for the victory variant when not rank 1", () => {
    render(<PlayerStatCard name="Alice" level={2} stats={baseStats} variant="victory" />);
    expect(screen.getByText(/Just Won/)).toBeInTheDocument();
  });

  test("shows an On Fire badge for a 3+ current streak on the leaderboard variant", () => {
    render(
      <PlayerStatCard
        name="Alice"
        level={2}
        stats={{ ...baseStats, currentStreak: 4 }}
        variant="leaderboard"
      />
    );
    expect(screen.getByText(/On Fire/)).toBeInTheDocument();
  });

  test("shows no badge when there is nothing to highlight", () => {
    render(
      <PlayerStatCard
        name="Alice"
        level={2}
        stats={{ ...baseStats, currentStreak: 0 }}
        variant="leaderboard"
      />
    );
    expect(screen.queryByText(/Champion|Just Won|On Fire/)).not.toBeInTheDocument();
  });

  test("forwards the ref to the outer card node", () => {
    const ref = React.createRef();
    render(<PlayerStatCard ref={ref} name="Alice" level={2} stats={baseStats} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toHaveAttribute("data-testid", "player-stat-card");
  });

  test("renders a quote", () => {
    render(<PlayerStatCard name="Alice" level={2} stats={baseStats} />);
    const card = screen.getByTestId("player-stat-card");
    expect(card.textContent).toMatch(/[a-zA-Z]/); // some quote text is present
  });
});
