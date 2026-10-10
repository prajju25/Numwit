import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ShareCardModal from "../ShareCardModal";

jest.mock("html-to-image", () => ({
  toPng: jest.fn(),
}));

const { toPng } = require("html-to-image");

const player = {
  name: "Alice",
  avatar: "🐱",
  level: 3,
  stats: { gamesWon: 4, bestStreak: 5, gamesPlayed: 10, roundWins: 25, winRate: 40, achievementsUnlocked: 3, achievementsTotal: 20 },
};

describe("ShareCardModal", () => {
  let onClose;

  beforeEach(() => {
    jest.clearAllMocks();
    onClose = jest.fn();
    window.open = jest.fn();
    toPng.mockResolvedValue("data:image/png;base64,fakeImageData");
    global.fetch = jest.fn(() =>
      Promise.resolve({ blob: () => Promise.resolve(new Blob(["fake"], { type: "image/png" })) })
    );
  });

  afterEach(() => {
    delete global.fetch;
    delete navigator.share;
    delete navigator.canShare;
  });

  test("renders the player stat card with the given variant", () => {
    render(<ShareCardModal player={player} variant="victory" onClose={onClose} />);
    expect(screen.getByTestId("player-stat-card")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  test("Post on X opens a twitter intent URL with the share text and site URL", () => {
    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Post on X"));

    expect(window.open).toHaveBeenCalledTimes(1);
    const url = window.open.mock.calls[0][0];
    expect(url).toContain("twitter.com/intent/tweet");
    expect(url).toContain("text=");
  });

  test("Facebook opens a sharer.php URL", () => {
    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Facebook"));

    const url = window.open.mock.calls[0][0];
    expect(url).toContain("facebook.com/sharer/sharer.php");
  });

  test("Reddit opens a submit URL", () => {
    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Reddit"));

    const url = window.open.mock.calls[0][0];
    expect(url).toContain("reddit.com/submit");
  });

  test("Copy Text writes the share text to the clipboard and shows feedback", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Copy Text"));

    await waitFor(() => expect(screen.getByText("Copied!")).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("Can you beat me?");
  });

  test("Copy Text falls back to window.prompt when clipboard write fails", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    window.prompt = jest.fn();

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Copy Text"));

    await waitFor(() => expect(window.prompt).toHaveBeenCalled());
  });

  test("Download image renders the card to PNG and triggers a download", async () => {
    const clickSpy = jest.fn();
    const realCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Download image"));

    await waitFor(() => expect(toPng).toHaveBeenCalled());
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());

    // Exports at 1080px wide and leaves the animated sheen out
    const opts = toPng.mock.calls[0][1];
    expect(opts.pixelRatio).toBe(1080 / 360);
    const sheen = realCreateElement("div");
    sheen.className = "nw-sheen";
    expect(opts.filter(sheen)).toBe(false);
    expect(opts.filter(realCreateElement("div"))).toBe(true);

    document.createElement.mockRestore();
  });

  test("shows an error message when PNG generation fails", async () => {
    toPng.mockRejectedValue(new Error("render failed"));

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Download image"));

    await waitFor(() =>
      expect(screen.getByText("Couldn't generate the image. Try again.")).toBeInTheDocument()
    );
  });

  test("Share via Device uses the Web Share API with a file when supported", async () => {
    const share = jest.fn().mockResolvedValue();
    const canShare = jest.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Share via Device"));

    await waitFor(() => expect(share).toHaveBeenCalled());
    const sharedArgs = share.mock.calls[0][0];
    expect(sharedArgs.files).toHaveLength(1);
  });

  test("Share via Device falls back to download when navigator.share is unavailable", async () => {
    const clickSpy = jest.fn();
    const realCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Share via Device"));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    document.createElement.mockRestore();
  });

  test("ignores AbortError from a cancelled native share sheet", async () => {
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const share = jest.fn().mockRejectedValue(abortError);
    const canShare = jest.fn().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Share via Device"));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText(/Couldn't share/)).not.toBeInTheDocument();
  });

  test("clicking Close calls onClose", () => {
    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("renders via portal when #overlay-root exists", () => {
    const portalRoot = document.createElement("div");
    portalRoot.setAttribute("id", "overlay-root");
    document.body.appendChild(portalRoot);

    render(<ShareCardModal player={player} variant="leaderboard" onClose={onClose} />);
    expect(portalRoot.querySelector('[data-testid="player-stat-card"]')).toBeInTheDocument();

    document.body.removeChild(portalRoot);
  });
});
