import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TutorialOverlay from "../TutorialOverlay";
import { useNumwit } from "../../contexts/NumwitRuleContext";

jest.mock("../../contexts/NumwitRuleContext", () => ({
  useNumwit: jest.fn(),
}));

function mockRound(round) {
  useNumwit.mockReturnValue({ gameData: { round } });
}

describe("TutorialOverlay", () => {
  test("shows the round 1 tip", () => {
    mockRound(1);
    render(<TutorialOverlay />);
    expect(screen.getByText("How to play")).toBeInTheDocument();
    expect(screen.getByText(/All players pick a number 0–100/)).toBeInTheDocument();
    expect(screen.getByText("💡")).toBeInTheDocument();
  });

  test("shows the round 2 tip", () => {
    mockRound(2);
    render(<TutorialOverlay />);
    expect(screen.getByText("Strategy tip")).toBeInTheDocument();
    expect(screen.getByText(/Think about what others will pick/)).toBeInTheDocument();
    expect(screen.getByText("🧠")).toBeInTheDocument();
  });

  test("renders nothing for rounds without a tip", () => {
    mockRound(3);
    const { container } = render(<TutorialOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when gameData is missing", () => {
    useNumwit.mockReturnValue({ gameData: null });
    const { container } = render(<TutorialOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  test("dismissing the tip hides it for that round", () => {
    mockRound(1);
    render(<TutorialOverlay />);
    expect(screen.getByText("How to play")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss tip"));
    expect(screen.queryByText("How to play")).not.toBeInTheDocument();
  });
});

describe("TutorialOverlay round-2 tip from real numbers", () => {
  test("uses last round's target and the game's multiplier", () => {
    useNumwit.mockReturnValue({
      gameData: { round: 2, targetMultiplier: 0.8 },
      history: [{ average: 41.6, target: 33.28 }],
    });
    render(<TutorialOverlay />);
    expect(screen.getByText("Strategy tip")).toBeInTheDocument();
    expect(screen.getByText(/Last round's target was 33.3/)).toBeInTheDocument();
    expect(screen.getByText(/0.8 × 33 ≈ 26/)).toBeInTheDocument();
  });

  test("falls back to the generic tip when round 1 can't be explained", () => {
    useNumwit.mockReturnValue({ gameData: { round: 2 }, history: [{ twoPlayerCycle: true }] });
    render(<TutorialOverlay />);
    expect(screen.getByText(/Think about what others will pick/)).toBeInTheDocument();
  });
});
