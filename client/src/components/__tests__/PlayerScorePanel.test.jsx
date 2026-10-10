import React from "react";
import { render, screen } from "@testing-library/react";
import PlayerScorePanel from "../PlayerScorePanel";
import { ELIMINATION_THRESHOLD } from "../../constants/constants";

const players = [
  { socketId: "a", name: "Alice", avatar: "🐱" },
  { socketId: "b", name: "Bob", avatar: "🐶", isBot: true },
  { socketId: "c", name: "Charlie", avatar: "🦊" },
];

describe("PlayerScorePanel", () => {
  test("renders a row for each player with name, avatar, and points", () => {
    render(<PlayerScorePanel players={players} points={{ a: 2, b: 0 }} eliminatedPlayers={[]} />);

    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText(/Charlie/)).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(1);
  });

  test("defaults missing points to 0", () => {
    render(<PlayerScorePanel players={players} points={{}} eliminatedPlayers={[]} />);
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(players.length);
  });

  test("shows the bot tag for bot players", () => {
    render(<PlayerScorePanel players={players} points={{}} eliminatedPlayers={[]} />);
    expect(screen.getByText(/Bob.*🤖|🤖/)).toBeInTheDocument();
  });

  test("marks eliminated players with strikethrough styling", () => {
    render(<PlayerScorePanel players={players} points={{ a: 5 }} eliminatedPlayers={["a"]} />);
    const li = screen.getByText(/Alice/).closest("li");
    expect(li.className).toMatch(/line-through/);
  });

  test("marks players near elimination as in danger", () => {
    render(
      <PlayerScorePanel
        players={players}
        points={{ a: ELIMINATION_THRESHOLD - 1 }}
        eliminatedPlayers={[]}
      />
    );
    const li = screen.getByText(/Alice/).closest("li");
    expect(li).toHaveAttribute("data-danger", "true");
  });

  test("marks players who have locked in this round and highlights me", () => {
    render(<PlayerScorePanel players={players} points={{}} eliminatedPlayers={[]} lockedIds={["b"]} mySocketId="a" />);
    expect(screen.getByText(/Bob/).closest("li")).toHaveTextContent("locked");
    expect(screen.getByText(/Alice/).closest("li")).not.toHaveTextContent("locked");
    expect(screen.getByText(/Alice/).closest("li").className).toMatch(/violet/);
  });

  test("renders the elimination threshold footer", () => {
    render(<PlayerScorePanel players={players} points={{}} eliminatedPlayers={[]} />);
    expect(screen.getByText(`${ELIMINATION_THRESHOLD} pts = eliminated`)).toBeInTheDocument();
  });

  test("renders gracefully with no players", () => {
    render(<PlayerScorePanel players={[]} points={{}} eliminatedPlayers={[]} />);
    expect(screen.getByText("Standings")).toBeInTheDocument();
  });
});
