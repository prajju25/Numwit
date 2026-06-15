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
