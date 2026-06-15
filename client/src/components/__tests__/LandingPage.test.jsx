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
    expect(screen.getAllByText(/Play Now|Enter the game/).length).toBeGreaterThan(0);
    expect(screen.getByText("Pick a number")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Play Now — Free"));
    expect(onPlay).toHaveBeenCalled();
  });

  test("shows live stats when the stats endpoint returns non-zero values", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ activePlayers: 5, gamesPlayedToday: 12, activeRooms: 2 }) })
    );

    render(<LandingPage onPlay={jest.fn()} />);
    await act(async () => {});

    expect(await screen.findByText(/5 online/)).toBeInTheDocument();
    expect(screen.getByText(/12 games today/)).toBeInTheDocument();
    expect(screen.getByText(/2 rooms active/)).toBeInTheDocument();
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
