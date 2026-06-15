import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ShareResults from "../ShareResults";

const mySocketId = "me";
const players = [
  { socketId: "me", name: "Alice", avatar: "🐱" },
  { socketId: "other", name: "Bob", avatar: "🐶" },
];

describe("ShareResults", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("renders nothing when history is empty or missing", () => {
    expect(render(<ShareResults history={[]} mySocketId={mySocketId} players={players} />).container).toBeEmptyDOMElement();
    expect(render(<ShareResults history={null} mySocketId={mySocketId} players={players} />).container).toBeEmptyDOMElement();
  });

  test("renders the Share Results button", () => {
    const history = [{ round: 1, winnerIds: ["me"], target: 50, submissions: [{ socketId: "me", number: 50 }] }];
    render(<ShareResults history={history} mySocketId={mySocketId} players={players} />);
    expect(screen.getByRole("button", { name: "📋 Share Results" })).toBeInTheDocument();
  });

  test("copies a formatted summary to the clipboard and shows confirmation", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    const history = [
      { round: 1, winnerIds: ["me"], exactMatch: true, target: 50, submissions: [{ socketId: "me", number: 50 }] },
      { round: 2, winnerIds: ["other"], target: 40, submissions: [{ socketId: "me", number: 45 }] },
    ];
    render(<ShareResults history={history} mySocketId={mySocketId} players={players} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "📋 Share Results" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("🧠 Numwit");
    expect(text).toContain("2 rounds");
    expect(text).toContain("R1 ⚡ | Target: 50.0 | You: 50");
    expect(text).toContain("R2 💀 | Target: 40.0 | You: 45");
    expect(text).toContain("1/2 wins");

    expect(screen.getByRole("button", { name: "✅ Copied to clipboard!" })).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByRole("button", { name: "📋 Share Results" })).toBeInTheDocument();
  });

  test("shows an invalid pick icon for invalid submissions", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    const history = [
      {
        round: 1,
        winnerIds: ["other"],
        target: 50,
        submissions: [{ socketId: "me", number: 50 }],
        invalidSubmissions: [{ socketId: "me", number: 50 }],
      },
    ];
    render(<ShareResults history={history} mySocketId={mySocketId} players={players} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "📋 Share Results" }));
      await Promise.resolve();
    });

    const text = writeText.mock.calls[0][0];
    expect(text).toContain("R1 ❌");
  });

  test("falls back to window.prompt when clipboard write fails", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const prompt = jest.spyOn(window, "prompt").mockImplementation(() => {});

    const history = [{ round: 1, winnerIds: ["me"], target: 50, submissions: [{ socketId: "me", number: 50 }] }];
    render(<ShareResults history={history} mySocketId={mySocketId} players={players} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "📋 Share Results" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(prompt).toHaveBeenCalledWith("Copy your results:", expect.stringContaining("🧠 Numwit"));
  });
});
