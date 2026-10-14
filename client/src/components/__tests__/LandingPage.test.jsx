import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import LandingPage from "../LandingPage";

describe("LandingPage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("renders hero, CTA, how-it-works steps, and footer", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 0, gamesPlayedToday: 0, activeRooms: 0 }) })
    );

    render(<LandingPage onPlay={jest.fn()} />);
    await act(async () => {});

    expect(screen.getByText("Numwit")).toBeInTheDocument();
    expect(screen.getAllByText(/Play now|Enter the game/).length).toBeGreaterThan(0);
    expect(screen.getByText("Pick in secret")).toBeInTheDocument();
    expect(screen.getByText("Target = 80% of the average")).toBeInTheDocument();
    expect(screen.getByText("Advanced rules")).toBeInTheDocument();
    expect(screen.getByLabelText(/Demo: five players pick/)).toBeInTheDocument();
    expect(screen.getByText("Last one standing")).toBeInTheDocument();
    expect(screen.getByText("No account needed. Ever.")).toBeInTheDocument();
  });

  test("calls onPlay when the primary CTA is clicked", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 0, gamesPlayedToday: 0, activeRooms: 0 }) })
    );
    const onPlay = jest.fn();
    render(<LandingPage onPlay={onPlay} />);
    await act(async () => {});

    const { fireEvent } = require("@testing-library/react");
    fireEvent.click(screen.getAllByRole("button", { name: /Play now/ })[0]);
    expect(onPlay).toHaveBeenCalled();
  });

  test("calls onLeaderboard from the top bar", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 0, gamesPlayedToday: 0, activeRooms: 0 }) })
    );
    const onLeaderboard = jest.fn();
    render(<LandingPage onPlay={jest.fn()} onLeaderboard={onLeaderboard} />);
    await act(async () => {});

    const { fireEvent } = require("@testing-library/react");
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(onLeaderboard).toHaveBeenCalled();
  });

  test("shows live stats when the stats endpoint returns non-zero values", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 5, gamesPlayedToday: 12, activeRooms: 2 }) })
    );

    render(<LandingPage onPlay={jest.fn()} />);
    await act(async () => {});

    expect(await screen.findByText(/5 online/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("games today")).toBeInTheDocument();
    expect(screen.getByText("rooms active")).toBeInTheDocument();
  });

  test("hides the stats pill when fetch fails", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network error")));

    render(<LandingPage onPlay={jest.fn()} />);
    await act(async () => {});

    expect(screen.queryByText(/online/)).not.toBeInTheDocument();
  });

  test("polls the stats endpoint on an interval and cleans up on unmount", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 0, gamesPlayedToday: 0, activeRooms: 0 }) })
    );

    const { unmount } = render(<LandingPage onPlay={jest.fn()} />);
    await act(async () => {});

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("LandingPage install button", () => {
  test("appears only when the browser offers installation", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 0, gamesPlayedToday: 0, activeRooms: 0 }) })
    );
    render(<LandingPage onPlay={jest.fn()} onLeaderboard={jest.fn()} />);
    await act(async () => {});
    expect(screen.queryByText("Install app")).not.toBeInTheDocument();

    const e = new Event("beforeinstallprompt");
    e.prompt = jest.fn();
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    act(() => { window.dispatchEvent(e); });

    const { fireEvent } = require("@testing-library/react");
    fireEvent.click(screen.getByText("Install app"));
    await act(async () => {});
    expect(e.prompt).toHaveBeenCalled();
    expect(screen.queryByText("Install app")).not.toBeInTheDocument();
  });
});
