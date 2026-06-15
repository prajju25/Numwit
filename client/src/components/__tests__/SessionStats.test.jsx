import React from "react";
import { render, screen } from "@testing-library/react";
import SessionStats from "../SessionStats";

const mySocketId = "me";

describe("SessionStats", () => {
  test("renders nothing when history is empty or missing", () => {
    expect(render(<SessionStats history={[]} mySocketId={mySocketId} />).container).toBeEmptyDOMElement();
    expect(render(<SessionStats history={null} mySocketId={mySocketId} />).container).toBeEmptyDOMElement();
  });

  test("computes rounds, wins, win rate for a winning history", () => {
    const history = [
      { round: 1, winnerIds: ["me"], target: 50, submissions: [{ socketId: "me", number: 50 }] },
      { round: 2, winnerIds: ["other"], target: 40, submissions: [{ socketId: "me", number: 45 }] },
    ];
    render(<SessionStats history={history} mySocketId={mySocketId} />);

    expect(screen.getByText("Your Session")).toBeInTheDocument();
    expect(screen.getByText("Rounds")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // rounds played
    expect(screen.getByText("Wins")).toBeInTheDocument();
    const winsValue = screen.getByText("Wins").previousElementSibling;
    expect(winsValue).toHaveTextContent("1");
    expect(screen.getByText("50%")).toBeInTheDocument(); // win rate
    expect(screen.getByText("Penalties")).toBeInTheDocument();
  });

  test("adds extra penalty for exact-match losses and shows closest diff", () => {
    const history = [
      { round: 1, winnerIds: ["other"], exactMatch: true, target: 50, submissions: [{ socketId: "me", number: 48 }] },
    ];
    render(<SessionStats history={history} mySocketId={mySocketId} />);
    // total penalty = 2 (exact match loss)
    expect(screen.getByText("2")).toBeInTheDocument();
    // closest diff = |48-50| = 2.00
    expect(screen.getByText("2.00")).toBeInTheDocument();
  });

  test("shows '—' for closest when no valid submissions exist", () => {
    const history = [
      { round: 1, winnerIds: ["other"], target: 50, submissions: [], invalidSubmissions: [] },
    ];
    render(<SessionStats history={history} mySocketId={mySocketId} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  test("shows 'Exact!' stat when player won with an exact match", () => {
    const history = [
      { round: 1, winnerIds: ["me"], exactMatch: true, target: 50, submissions: [{ socketId: "me", number: 50 }] },
    ];
    render(<SessionStats history={history} mySocketId={mySocketId} />);
    expect(screen.getByText("Exact!")).toBeInTheDocument();
  });

  test("ignores invalid submissions when computing closest diff", () => {
    const history = [
      {
        round: 1,
        winnerIds: ["other"],
        target: 50,
        submissions: [{ socketId: "me", number: 48 }],
        invalidSubmissions: [{ socketId: "me", number: 48 }],
      },
    ];
    render(<SessionStats history={history} mySocketId={mySocketId} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
