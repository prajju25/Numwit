import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import FeedbackWidget from "../FeedbackWidget";
import { useUser } from "../../contexts/UserContext";
import { __mockSocket } from "socket.io-client";

jest.mock("../../contexts/UserContext", () => ({ useUser: jest.fn() }));

function setup(overrides = {}) {
  useUser.mockReturnValue({
    user: { name: "Alice", avatar: "🐱" },
    deviceId: "dev1",
    roomId: "room1",
    ...overrides,
  });
}

describe("FeedbackWidget", () => {
  beforeEach(() => {
    __mockSocket.emit.mockClear();
  });

  test("renders the floating feedback button and no modal by default", () => {
    setup();
    render(<FeedbackWidget />);

    expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
    expect(screen.queryByText("Send feedback", { selector: "h2" })).not.toBeInTheDocument();
  });

  test("opens the modal when the floating button is clicked", () => {
    setup();
    render(<FeedbackWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(screen.getByRole("heading", { name: /send feedback/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tell us more/i)).toBeInTheDocument();
    expect(screen.getByText("🐛 Bug report")).toBeInTheDocument();
    expect(screen.getByText("💡 Feature request")).toBeInTheDocument();
    expect(screen.getByText("💬 Other")).toBeInTheDocument();
  });

  test("closes the modal via the × button", () => {
    setup();
    render(<FeedbackWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("heading", { name: /send feedback/i })).not.toBeInTheDocument();
  });

  test("closes the modal via the Cancel button", () => {
    setup();
    render(<FeedbackWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("heading", { name: /send feedback/i })).not.toBeInTheDocument();
  });

  test("the Send button is disabled until a message is entered", () => {
    setup();
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    const sendButton = screen.getByRole("button", { name: /^send$/i });
    expect(sendButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/tell us more/i), { target: { value: "It's broken" } });
    expect(sendButton).not.toBeDisabled();
  });

  test("submits feedback with deviceId, name, category and context, and shows a thank-you on success", () => {
    setup();
    __mockSocket.emit.mockImplementation((event, payload, cb) => {
      if (event === "submit_feedback") cb({ status: "ok", id: "f1" });
    });
    render(<FeedbackWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    fireEvent.click(screen.getByText("💡 Feature request"));
    fireEvent.change(screen.getByLabelText(/tell us more/i), { target: { value: "Add dark mode" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(__mockSocket.emit).toHaveBeenCalledWith(
      "submit_feedback",
      {
        deviceId: "dev1",
        name: "Alice",
        category: "feature",
        message: "Add dark mode",
        context: "room1",
      },
      expect.any(Function)
    );

    expect(screen.getByText(/thanks for the feedback/i)).toBeInTheDocument();
  });

  test("shows an error message when submission fails", () => {
    setup();
    __mockSocket.emit.mockImplementation((event, payload, cb) => {
      if (event === "submit_feedback") cb({ status: "error", message: "Too many submissions" });
    });
    render(<FeedbackWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    fireEvent.change(screen.getByLabelText(/tell us more/i), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(screen.getByText(/too many submissions/i)).toBeInTheDocument();
    expect(screen.queryByText(/thanks for the feedback/i)).not.toBeInTheDocument();
  });

  test("falls back to window.location.pathname for context when no roomId", () => {
    setup({ roomId: null, user: null });
    __mockSocket.emit.mockImplementation((event, payload, cb) => {
      if (event === "submit_feedback") cb({ status: "ok", id: "f2" });
    });
    render(<FeedbackWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    fireEvent.change(screen.getByLabelText(/tell us more/i), { target: { value: "Just a comment" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(__mockSocket.emit).toHaveBeenCalledWith(
      "submit_feedback",
      expect.objectContaining({
        deviceId: "dev1",
        name: null,
        context: window.location.pathname,
      }),
      expect.any(Function)
    );
  });
});
