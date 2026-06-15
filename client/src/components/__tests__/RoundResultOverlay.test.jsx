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
