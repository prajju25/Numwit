import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import EmoteBar from "../EmoteBar";
import { useUser } from "../../contexts/UserContext";
import { __mockSocket } from "socket.io-client";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));

describe("EmoteBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useUser.mockReturnValue({ roomId: "room1" });
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
    __mockSocket.emit.mockClear();
    __mockSocket.off.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders all emote buttons", () => {
    render(<EmoteBar />);
    ["😂", "😱", "🔥", "💀", "🤔", "👏"].forEach((emote) => {
      expect(screen.getByRole("button", { name: emote })).toBeInTheDocument();
    });
  });

  test("clicking an emote emits send_emote with roomId and emote", () => {
    render(<EmoteBar />);
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(__mockSocket.emit).toHaveBeenCalledWith("send_emote", { roomId: "room1", emote: "🔥" });
  });

  test("enters cooldown after sending and disables buttons", () => {
    render(<EmoteBar />);
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    screen.getAllByRole("button").forEach((btn) => expect(btn).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "😂" }));
    expect(__mockSocket.emit).toHaveBeenCalledTimes(1);
  });

  test("cooldown clears after 1200ms allowing another emote", () => {
    render(<EmoteBar />);
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(__mockSocket.emit).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    screen.getAllByRole("button").forEach((btn) => expect(btn).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "😂" }));
    expect(__mockSocket.emit).toHaveBeenCalledTimes(2);
  });

  test("shows a toast when an emote is received and removes it after 2.5s", () => {
    render(<EmoteBar />);

    act(() => {
      __mockSocket.__trigger("emote_received", { name: "Bob", avatar: "🐶", emote: "🔥" });
    });

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("🐶")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  test("unregisters the emote_received listener on unmount", () => {
    const { unmount } = render(<EmoteBar />);
    unmount();
    expect(__mockSocket.off).toHaveBeenCalledWith("emote_received");
  });
});
