import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LeaderboardPage from "../LeaderboardPage";
import { useUser } from "../../contexts/UserContext";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));
jest.mock("../ShareCardModal", () => (props) => (
  <div data-testid="share-card-modal">
    <span data-testid="share-rank">{props.rank}</span>
    <span data-testid="share-total">{props.totalPlayers}</span>
    <button onClick={props.onClose}>close-share</button>
  </div>
));

const me = { name: "Alice", avatar: "🐱" };

function boardOf(n, overrides = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: i === 0 ? "Alice" : `Player${i}`,
    avatar: i === 0 ? "🐱" : "🎮",
    level: 2,
    weekGamesPlayed: 3,
    weekGamesWon: 1,
    weekRoundWins: 5,
    allTimeGamesPlayed: 10,
    allTimeGamesWon: 4,
    allTimeRoundWins: 20,
    ...overrides,
  }));
}

describe("LeaderboardPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUser.mockReturnValue({ user: me, deviceId: "dev1" });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("shows a loading state then renders rows", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(2) }) })
    );

    render(<LeaderboardPage onBack={jest.fn()} />);
    expect(screen.getByText("Loading rankings…")).toBeInTheDocument();

    await act(async () => {});

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Player1")).toBeInTheDocument();
  });

  test("shows an error message when the fetch fails", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down")));

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.getByText("Couldn't load leaderboard. Try again.")).toBeInTheDocument();
  });

  test("shows an empty state when no one has played this week", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ leaderboard: [] }) }));

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.getByText("No games played this week yet. Be the first!")).toBeInTheDocument();
  });

  test("highlights the current user's row with a You badge and Share button", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(3) }) })
    );

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
    // Only the "me" row should have a Share button
    expect(screen.getAllByText("Share")).toHaveLength(1);
  });

  test("does not show a Share button for rows that are not the current user", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(3) }) })
    );
    useUser.mockReturnValue({ user: { name: "Nobody", avatar: "👻" }, deviceId: "dev1" });

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.queryByText("Share")).not.toBeInTheDocument();
  });

  test("clicking Share fetches the player card and opens the modal with rank/totalPlayers", async () => {
    global.fetch = jest.fn((url) => {
      if (url.startsWith("/api/leaderboard")) {
        return Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(5) }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ name: "Alice", avatar: "🐱", level: 3, gamesWon: 2 }),
      });
    });

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByText("Share"));
    await act(async () => {});

    expect(global.fetch).toHaveBeenCalledWith("/api/player/dev1/card");
    expect(screen.getByTestId("share-card-modal")).toBeInTheDocument();
    expect(screen.getByTestId("share-rank")).toHaveTextContent("1");
    // fewer than 50 rows fetched -> exact weekly total is known
    expect(screen.getByTestId("share-total")).toHaveTextContent("5");
  });

  test("omits totalPlayers when the fetched board is at the 50-row cap", async () => {
    global.fetch = jest.fn((url) => {
      if (url.startsWith("/api/leaderboard")) {
        return Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(50) }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: "Alice" }) });
    });

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByText("Share"));
    await act(async () => {});

    expect(screen.getByTestId("share-total")).toBeEmptyDOMElement();
  });

  test("does not fetch the card when deviceId is missing", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(2) }) })
    );
    useUser.mockReturnValue({ user: me, deviceId: null });

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByText("Share"));
    await act(async () => {});

    expect(screen.queryByTestId("share-card-modal")).not.toBeInTheDocument();
  });

  test("closing the share modal clears it", async () => {
    global.fetch = jest.fn((url) => {
      if (url.startsWith("/api/leaderboard")) {
        return Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(2) }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: "Alice" }) });
    });

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    fireEvent.click(screen.getByText("Share"));
    await act(async () => {});
    expect(screen.getByTestId("share-card-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-share"));
    expect(screen.queryByTestId("share-card-modal")).not.toBeInTheDocument();
  });

  test("paginates rows in pages of 10", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(15) }) })
    );

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Player1")).toBeInTheDocument();
    expect(screen.queryByText("Player10")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Next ›"));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Player10")).toBeInTheDocument();
  });

  test("calls onBack from the back button and the Play Now CTA", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(1) }) })
    );
    const onBack = jest.fn();

    render(<LeaderboardPage onBack={onBack} />);
    await act(async () => {});

    fireEvent.click(screen.getByText("← Back to Home"));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("▶ Play Now"));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

describe("LeaderboardPage period tabs and your-rank bar", () => {
  beforeEach(() => {
    useUser.mockReturnValue({ user: { name: "Alice", avatar: "🐱" }, deviceId: "dev1" });
  });
  afterEach(() => { delete global.fetch; });

  test("switching to All time shows all-time numbers", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ leaderboard: boardOf(5) }) }));
    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.getAllByText("3 games", { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "All time" }));
    expect(screen.getByRole("tab", { name: "All time" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("10 games", { exact: false }).length).toBeGreaterThan(0);
  });

  test("shows a sticky your-rank bar with Share card when your row is on another page", async () => {
    const board = boardOf(15).map((e, i) => (i === 0 ? { ...e, name: "Zed", avatar: "👻" } : e));
    board[11] = { ...board[11], name: "Alice", avatar: "🐱" };
    global.fetch = jest.fn((url) => {
      if (url.startsWith("/api/leaderboard")) {
        return Promise.resolve({ json: () => Promise.resolve({ leaderboard: board }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: "Alice" }) });
    });

    render(<LeaderboardPage onBack={jest.fn()} />);
    await act(async () => {});

    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText("Alice (you)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Share card"));
    await act(async () => {});
    expect(screen.getByTestId("share-rank")).toHaveTextContent("12");

    // On page 2 the row itself carries the Share button and the bar goes away
    fireEvent.click(screen.getByText("close-share"));
    fireEvent.click(screen.getByText("Next ›"));
    expect(screen.queryByText("Alice (you)")).not.toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
  });
});
