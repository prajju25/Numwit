import React from "react";
import { render, screen, act } from "@testing-library/react";
import AchievementToast from "../AchievementToast";
import { __mockSocket } from "socket.io-client";

describe("AchievementToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
    __mockSocket.off.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders nothing initially", () => {
    const { container } = render(<AchievementToast />);
    expect(container).toBeEmptyDOMElement();
  });

  test("shows a toast when achievement_unlocked fires", () => {
    render(<AchievementToast />);

    act(() => {
      __mockSocket.__trigger("achievement_unlocked", {
        icon: "🏆",
        name: "First Win",
        description: "Win your first round",
      });
    });

    expect(screen.getByText("Achievement Unlocked!")).toBeInTheDocument();
    expect(screen.getByText("First Win — Win your first round")).toBeInTheDocument();
    expect(screen.getByText("🏆")).toBeInTheDocument();
  });

  test("shows a level-up toast when xp_update has levelUp true", () => {
    render(<AchievementToast />);

    act(() => {
      __mockSocket.__trigger("xp_update", { levelUp: true, level: 4, xpGained: 50 });
    });

    expect(screen.getByText("Level Up!")).toBeInTheDocument();
    expect(screen.getByText(/You reached Level 4/)).toBeInTheDocument();
    expect(screen.getByText("⬆️")).toBeInTheDocument();
  });

  test("ignores xp_update without levelUp", () => {
    render(<AchievementToast />);

    act(() => {
      __mockSocket.__trigger("xp_update", { levelUp: false, level: 4, xpGained: 10 });
    });

    expect(screen.queryByText("Level Up!")).not.toBeInTheDocument();
  });

  test("auto-dismisses a toast after 5 seconds", () => {
    render(<AchievementToast />);

    act(() => {
      __mockSocket.__trigger("achievement_unlocked", {
        icon: "🏆",
        name: "First Win",
        description: "Win your first round",
      });
    });

    expect(screen.getByText("Achievement Unlocked!")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.queryByText("Achievement Unlocked!")).not.toBeInTheDocument();
  });

  test("unregisters socket listeners on unmount", () => {
    const { unmount } = render(<AchievementToast />);
    unmount();
    expect(__mockSocket.off).toHaveBeenCalledWith("achievement_unlocked", expect.any(Function));
    expect(__mockSocket.off).toHaveBeenCalledWith("xp_update", expect.any(Function));
  });
});
