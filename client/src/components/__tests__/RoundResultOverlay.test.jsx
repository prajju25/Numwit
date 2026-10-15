import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import RoundResultOverlay from "../RoundResultOverlay";
import { __mockSocket } from "socket.io-client";

const players = [
  { socketId: "me", name: "Alice", avatar: "🐱" },
  { socketId: "bob", name: "Bob", avatar: "🐶" },
  { socketId: "carl", name: "Carl", avatar: "🦊" },
];

const baseResult = {
  round: 3,
  average: 45.5,
  target: 36.4,
  winnerIds: ["me"],
  submissions: [
    { socketId: "me", number: 36 },
    { socketId: "bob", number: 50 },
  ],
  invalidSubmissions: [],
  newlyEliminated: [],
};

describe("RoundResultOverlay", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __mockSocket.emit.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders nothing when neither result nor voidData is provided", () => {
    const { container } = render(<RoundResultOverlay result={null} voidData={null} players={players} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("void round", () => {
    const voidData = {
      reason: "Two players picked the same number",
      submissions: [
        { socketId: "me", number: 30 },
        { socketId: "bob", number: 30 },
      ],
    };

    test("renders the void modal with reason and submissions", () => {
      render(<RoundResultOverlay result={null} voidData={voidData} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("🔄")).toBeInTheDocument();
      expect(screen.getByText("Round Void!")).toBeInTheDocument();
      expect(screen.getByText(voidData.reason)).toBeInTheDocument();
      expect(screen.getByText("What everyone picked")).toBeInTheDocument();
      expect(screen.getByText("🐱 Alice")).toBeInTheDocument();
      expect(screen.getByText("🐶 Bob")).toBeInTheDocument();
      expect(screen.getByText("No points awarded. Round replaying…")).toBeInTheDocument();
    });

    test("does not render the submissions table when there are none", () => {
      render(<RoundResultOverlay result={null} voidData={{ reason: "x", submissions: [] }} players={players} onDismiss={() => {}} />);
      expect(screen.queryByText("What everyone picked")).not.toBeInTheDocument();
    });

    test("clicking Dismiss hides the modal and calls onDismiss", () => {
      const onDismiss = jest.fn();
      render(<RoundResultOverlay result={null} voidData={voidData} players={players} onDismiss={onDismiss} />);
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Round Void!")).not.toBeInTheDocument();
    });

    test("clicking the backdrop dismisses the void modal", () => {
      const onDismiss = jest.fn();
      const { container } = render(<RoundResultOverlay result={null} voidData={voidData} players={players} onDismiss={onDismiss} />);
      fireEvent.click(container.firstChild);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test("dismissing a void round does not emit skip_round_result", () => {
      const onDismiss = jest.fn();
      render(<RoundResultOverlay result={null} voidData={voidData} players={players} onDismiss={onDismiss} roomId="room1" />);
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(__mockSocket.emit).not.toHaveBeenCalledWith("skip_round_result", expect.anything());
    });

    test("auto-dismisses after 5 seconds", () => {
      const onDismiss = jest.fn();
      render(<RoundResultOverlay result={null} voidData={voidData} players={players} onDismiss={onDismiss} />);
      act(() => { jest.advanceTimersByTime(5000); });
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Round Void!")).not.toBeInTheDocument();
    });
  });

  describe("result round", () => {
    test("shows the round badge, average, target, winner, submissions, and eliminations immediately", () => {
      render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("Round 3 Result")).toBeInTheDocument();
      expect(screen.getByText("45.50")).toBeInTheDocument();
      expect(screen.getByText("36.40")).toBeInTheDocument();
      expect(screen.getByText("Average")).toBeInTheDocument();
      expect(screen.getByText("Target")).toBeInTheDocument();
      expect(screen.getByText("🏆 Winner")).toBeInTheDocument();
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
      expect(screen.getByText("Submissions")).toBeInTheDocument();
      expect(screen.getByText("36")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("No eliminations this round.")).toBeInTheDocument();
    });

    test("shows exact-match, two-player-cycle, and multi-win banners", () => {
      const result = {
        ...baseResult,
        winnerIds: ["me", "bob"],
        exactMatch: true,
        twoPlayerCycle: true,
      };
      render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText(/Exact match!/)).toBeInTheDocument();
      expect(screen.getByText("⚔️ 2-player special rule applied")).toBeInTheDocument();
      expect(screen.getByText("🤝 Tie — multiple winners!")).toBeInTheDocument();
      expect(screen.getByText("🏆 Winners")).toBeInTheDocument();
    });

    test("shows '—' for winner when no winners match", () => {
      const result = { ...baseResult, winnerIds: ["ghost"] };
      render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    test("shows submissions list with duplicate styling", () => {
      const result = {
        ...baseResult,
        invalidSubmissions: [{ socketId: "bob", number: 50 }],
      };
      render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("Submissions")).toBeInTheDocument();
      expect(screen.getByText("36")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("(duplicate)")).toBeInTheDocument();
    });

    test("shows eliminations when present", () => {
      const result = { ...baseResult, newlyEliminated: ["bob"] };
      render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText(/Eliminated:/)).toHaveTextContent("Bob");
    });

    test("clicking the backdrop dismisses the overlay", () => {
      const onDismiss = jest.fn();
      const { container } = render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={onDismiss} />);
      act(() => {
        fireEvent.click(container.firstChild);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Round 3 Result")).not.toBeInTheDocument();
    });

    test("clicking Skip dismisses immediately", () => {
      const onDismiss = jest.fn();
      render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={onDismiss} />);
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Round 3 Result")).not.toBeInTheDocument();
    });

    test("clicking Skip emits skip_round_result with the roomId", () => {
      const onDismiss = jest.fn();
      render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={onDismiss} roomId="room1" />);
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(__mockSocket.emit).toHaveBeenCalledWith("skip_round_result", { roomId: "room1" });
    });

    test("clicking the backdrop also emits skip_round_result", () => {
      const onDismiss = jest.fn();
      const { container } = render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={onDismiss} roomId="room1" />);
      act(() => {
        fireEvent.click(container.firstChild);
      });
      expect(__mockSocket.emit).toHaveBeenCalledWith("skip_round_result", { roomId: "room1" });
    });

    test("counts down from 10s to 'Starting next round…'", () => {
      render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("Next round starting in 10s…")).toBeInTheDocument();

      for (let i = 9; i >= 1; i--) {
        act(() => { jest.advanceTimersByTime(1000); });
        expect(screen.getByText(`Next round starting in ${i}s…`)).toBeInTheDocument();
      }

      act(() => { jest.advanceTimersByTime(1000); });
      expect(screen.getByText("Starting next round…")).toBeInTheDocument();
    });

    test("auto-dismisses AUTO_DISMISS ms after rendering as a fallback", () => {
      const onDismiss = jest.fn();
      render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={onDismiss} />);
      act(() => { jest.advanceTimersByTime(11500); });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test("resets to a visible state with a fresh countdown when result changes", () => {
      const { rerender } = render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={() => {}} />);
      for (let i = 0; i < 5; i++) {
        act(() => { jest.advanceTimersByTime(1000); });
      }
      expect(screen.getByText("Next round starting in 5s…")).toBeInTheDocument();

      const newResult = { ...baseResult, round: 4 };
      rerender(<RoundResultOverlay result={newResult} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("Round 4 Result")).toBeInTheDocument();
      expect(screen.getByText("Next round starting in 10s…")).toBeInTheDocument();
    });
  });
});

describe("RoundResultOverlay reveal choreography", () => {
  const result = {
    round: 4,
    average: 41.6,
    target: 33.28,
    winnerIds: ["me"],
    submissions: [
      { socketId: "me", number: 34 },
      { socketId: "bob", number: 52 },
      { socketId: "carl", number: 18 },
    ],
    invalidSubmissions: [],
    newlyEliminated: ["bob"],
  };

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); delete window.matchMedia; });

  const stage = (container) => container.querySelector("[data-rv-stage]");

  test("steps through phase flags p1…p5 and counts the average and target up", () => {
    const { container } = render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
    expect(stage(container).className).not.toMatch(/\bp1\b/);
    expect(screen.getByText("avg 0.0")).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(300); });
    expect(stage(container).className).toMatch(/\bp1\b/);

    act(() => { jest.advanceTimersByTime(2100); }); // average tween done, sweep starting
    expect(screen.getByText("avg 41.6")).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(2200); });
    expect(stage(container).className).toMatch(/\bp5\b/);
    expect(screen.getByText("target 33.28")).toBeInTheDocument();
  });

  test("rows are sorted by distance with WIN / OUT / +1 chips and Δ values", () => {
    __mockSocket.id = "me"; // no UserContext in this test — falls back to socket.id
    render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
    const chips = screen.getAllByText(/^(WIN|OUT|\+1)$/).map((n) => n.textContent);
    expect(chips).toEqual(["WIN", "+1", "OUT"]); // 34 (Δ0.72), 18 (Δ15.28), 52 (Δ18.72)
    expect(screen.getByText("Δ 0.72")).toBeInTheDocument();
    expect(screen.getByText("You read the room.")).toBeInTheDocument();
    expect(screen.getByText("×0.8")).toBeInTheDocument();
    __mockSocket.id = "mock-socket-id";
  });

  test("exact matches show +2 penalties", () => {
    render(<RoundResultOverlay result={{ ...result, exactMatch: true, newlyEliminated: [] }} voidData={null} players={players} onDismiss={() => {}} />);
    expect(screen.getAllByText("+2")).toHaveLength(2);
  });

  test("reduced motion jumps straight to the final frame", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    const { container } = render(<RoundResultOverlay result={result} voidData={null} players={players} onDismiss={() => {}} />);
    expect(stage(container).className).toMatch(/\bp5\b/);
    expect(screen.getByText("avg 41.6")).toBeInTheDocument();
  });
});

describe("RoundResultOverlay first-round explainer", () => {
  const round1 = { ...baseResult, round: 1, average: 41.6, target: 33.28 };
  beforeEach(() => localStorage.clear());

  test("explains round 1's target for a player's first 3 games, then stops", () => {
    for (let game = 1; game <= 3; game++) {
      const { unmount } = render(<RoundResultOverlay result={{ ...round1 }} voidData={null} players={players} onDismiss={() => {}} />);
      expect(screen.getByText("💡 Why was the target 33.3?")).toBeInTheDocument();
      expect(screen.getByText(/41.6 × 0.8 = 33.3/)).toBeInTheDocument();
      unmount();
    }
    render(<RoundResultOverlay result={{ ...round1 }} voidData={null} players={players} onDismiss={() => {}} />);
    expect(screen.queryByText(/Why was the target/)).not.toBeInTheDocument();
  });

  test("not shown after round 1 or for a duel-cycle win", () => {
    const { unmount } = render(<RoundResultOverlay result={baseResult} voidData={null} players={players} onDismiss={() => {}} />);
    expect(screen.queryByText(/Why was the target/)).not.toBeInTheDocument();
    unmount();
    render(<RoundResultOverlay result={{ ...round1, twoPlayerCycle: true }} voidData={null} players={players} onDismiss={() => {}} />);
    expect(screen.queryByText(/Why was the target/)).not.toBeInTheDocument();
    expect(localStorage.getItem("numwit_explainer_games")).toBeNull();
  });
});
