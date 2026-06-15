import React from "react";
import { render, screen, act } from "@testing-library/react";
import FloatingAlert from "../FloatingAlert";

describe("FloatingAlert", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders the message with a warning icon", () => {
    render(<FloatingAlert message="Something went wrong" onClose={() => {}} />);
    expect(screen.getByText("⚠️ Something went wrong")).toBeInTheDocument();
  });

  test("auto-dismisses after 5 seconds and calls onClose", () => {
    const onClose = jest.fn();
    render(<FloatingAlert message="Bye" onClose={onClose} />);

    expect(screen.getByText("⚠️ Bye")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("⚠️ Bye")).not.toBeInTheDocument();
  });

  test("clears the timeout on unmount", () => {
    const onClose = jest.fn();
    const { unmount } = render(<FloatingAlert message="Bye" onClose={onClose} />);
    unmount();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
