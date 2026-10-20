import React from "react";
import { render, screen } from "@testing-library/react";
import RoundHistory from "../RoundHistory";
import { useNumwit } from "../../contexts/NumwitRuleContext";
import { useUser } from "../../contexts/UserContext";
import { useGame } from "../../contexts/GameContext";

jest.mock("../../contexts/NumwitRuleContext", () => ({ useNumwit: jest.fn() }));
jest.mock("../../contexts/UserContext", () => ({ useUser: jest.fn() }));
jest.mock("../../contexts/GameContext", () => ({ useGame: jest.fn() }));

const players = [
  { socketId: "me", name: "Alice", avatar: "🐱" },
  { socketId: "bob", name: "Bob", avatar: "🐶" },
];

function setup({ history }) {
  useNumwit.mockReturnValue({ history });
  useUser.mockReturnValue({ user: { socketId: "me" } });
  useGame.mockReturnValue({ players });
}

describe("RoundHistory", () => {
  test("renders nothing when history is empty or missing", () => {
    setup({ history: [] });
    expect(render(<RoundHistory />).container).toBeEmptyDOMElement();

    setup({ history: null });
    expect(render(<RoundHistory />).container).toBeEmptyDOMElement();
  });

  test("renders a row with round, target, picks, and winner", () => {
    setup({
      history: [
        {
          round: 1,
          target: 40.5,
          winnerIds: ["me"],
          submissions: [
            { socketId: "me", number: 40 },
            { socketId: "bob", number: 60 },
          ],
        },
      ],
    });
    render(<RoundHistory />);

    expect(screen.getByText("Round History")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("40.5")).toBeInTheDocument();
    expect(screen.getByText("🐱40")).toBeInTheDocument();
    expect(screen.getByText("🐶60")).toBeInTheDocument();
    expect(screen.getByText("🐱Alice (you)")).toBeInTheDocument();
  });

  test("shows '—' when no target or winner", () => {
    setup({
      history: [{ round: 2, target: null, submissions: [], winnerIds: [] }],
    });
    render(<RoundHistory />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2); // target and winner
  });

  test("shows '(dup)' suffix when there are invalid submissions", () => {
    setup({
      history: [
        {
          round: 3,
          target: 30,
          winnerIds: ["bob"],
          submissions: [
            { socketId: "me", number: 30 },
            { socketId: "bob", number: 30 },
          ],
          invalidSubmissions: [{ socketId: "me", number: 30 }],
        },
      ],
    });
    render(<RoundHistory />);
    expect(screen.getByText("(dup)")).toBeInTheDocument();
  });

  test("renders '?' avatar for unknown players in submissions and winners", () => {
    setup({
      history: [
        {
          round: 4,
          target: 20,
          winnerIds: ["ghost"],
          submissions: [{ socketId: "ghost", number: 20 }],
        },
      ],
    });
    render(<RoundHistory />);
    expect(screen.getByText("?20")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  test("applies winner styling to the player's own winning row", () => {
    setup({
      history: [
        {
          round: 5,
          target: 50,
          winnerIds: ["me"],
          submissions: [{ socketId: "me", number: 50 }],
        },
      ],
    });
    render(<RoundHistory />);
    const winnerCell = screen.getByText("🐱Alice (you)").closest("td");
    expect(winnerCell.className).toMatch(/text-emerald-400/);
  });
});
