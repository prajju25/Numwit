import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import NumberInput from "../NumberInput";

jest.mock("../NumberGrid", () => (props) => (
  <div data-testid="number-grid" data-disabled={String(props.disabled)} data-selected={String(props.selectedNumber)} />
));
jest.mock("../NumberSlider", () => (props) => (
  <div data-testid="number-slider" data-disabled={String(props.disabled)} data-selected={String(props.selectedNumber)} />
));

// Helper to install a matchMedia mock with a controllable `matches` value
// and a way to trigger a "change" event.
function installMatchMedia(initialMatches) {
  let changeHandler = null;
  const mql = {
    matches: initialMatches,
    media: "(min-width: 1024px)",
    addEventListener: jest.fn((event, handler) => {
      if (event === "change") changeHandler = handler;
    }),
    removeEventListener: jest.fn(),
    addListener: jest.fn((handler) => {
      changeHandler = handler;
    }),
    removeListener: jest.fn(),
  };

  window.matchMedia = jest.fn().mockReturnValue(mql);

  return {
    trigger: (matches) => {
      mql.matches = matches;
      changeHandler && changeHandler({ matches });
    },
    mql,
  };
}

describe("NumberInput", () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, configurable: true });
    jest.restoreAllMocks();
  });

  test("renders NumberGrid when matchMedia reports desktop", () => {
    installMatchMedia(true);
    render(<NumberInput onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByTestId("number-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("number-slider")).not.toBeInTheDocument();
  });

  test("renders NumberSlider when matchMedia reports mobile", () => {
    installMatchMedia(false);
    render(<NumberInput onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByTestId("number-slider")).toBeInTheDocument();
    expect(screen.queryByTestId("number-grid")).not.toBeInTheDocument();
  });

  test("passes disabled and selectedNumber through to the rendered child", () => {
    installMatchMedia(true);
    render(<NumberInput onSelect={() => {}} disabled={true} selectedNumber={77} />);
    const grid = screen.getByTestId("number-grid");
    expect(grid).toHaveAttribute("data-disabled", "true");
    expect(grid).toHaveAttribute("data-selected", "77");
  });

  test("switches from grid to slider when matchMedia change fires", () => {
    const { trigger } = installMatchMedia(true);
    render(<NumberInput onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByTestId("number-grid")).toBeInTheDocument();

    act(() => {
      trigger(false);
    });

    expect(screen.getByTestId("number-slider")).toBeInTheDocument();
    expect(screen.queryByTestId("number-grid")).not.toBeInTheDocument();
  });

  test("falls back to addListener/removeListener when addEventListener is unavailable", () => {
    let changeHandler = null;
    const mql = {
      matches: true,
      media: "(min-width: 1024px)",
      addListener: jest.fn((handler) => { changeHandler = handler; }),
      removeListener: jest.fn(),
    };
    window.matchMedia = jest.fn().mockReturnValue(mql);

    const { unmount } = render(<NumberInput onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByTestId("number-grid")).toBeInTheDocument();
    expect(mql.addListener).toHaveBeenCalled();

    // Trigger a change via the legacy listener
    act(() => {
      changeHandler({ matches: false });
    });
    expect(screen.getByTestId("number-slider")).toBeInTheDocument();

    unmount();
    expect(mql.removeListener).toHaveBeenCalled();
  });

  describe("keyboard submission on desktop", () => {
    let dispatchKey;

    beforeEach(() => {
      installMatchMedia(true);
      dispatchKey = (key) => {
        const event = new KeyboardEvent("keydown", { key, bubbles: true });
        window.dispatchEvent(event);
      };
    });

    test("typing digits then Enter calls onSelect with the clamped number", () => {
      const onSelect = jest.fn();
      render(<NumberInput onSelect={onSelect} disabled={false} selectedNumber={null} />);

      dispatchKey("4");
      dispatchKey("2");
      dispatchKey("Enter");

      expect(onSelect).toHaveBeenCalledWith(42);
    });

    test("values above 100 are clamped to 100", () => {
      const onSelect = jest.fn();
      render(<NumberInput onSelect={onSelect} disabled={false} selectedNumber={null} />);

      dispatchKey("9");
      dispatchKey("9");
      dispatchKey("9");
      dispatchKey("Enter");

      expect(onSelect).toHaveBeenCalledWith(100);
    });

    test("Backspace removes the last typed digit", () => {
      const onSelect = jest.fn();
      render(<NumberInput onSelect={onSelect} disabled={false} selectedNumber={null} />);

      dispatchKey("4");
      dispatchKey("2");
      dispatchKey("Backspace");
      dispatchKey("Enter");

      expect(onSelect).toHaveBeenCalledWith(4);
    });

    test("Escape clears the buffer so Enter does nothing", () => {
      const onSelect = jest.fn();
      render(<NumberInput onSelect={onSelect} disabled={false} selectedNumber={null} />);

      dispatchKey("5");
      dispatchKey("Escape");
      dispatchKey("Enter");

      expect(onSelect).not.toHaveBeenCalled();
    });

    test("does not register keyboard listener when disabled", () => {
      const onSelect = jest.fn();
      render(<NumberInput onSelect={onSelect} disabled={true} selectedNumber={null} />);

      dispatchKey("4");
      dispatchKey("2");
      dispatchKey("Enter");

      expect(onSelect).not.toHaveBeenCalled();
    });

    test("ignores keydown events on input/textarea elements", () => {
      const onSelect = jest.fn();
      render(
        <div>
          <NumberInput onSelect={onSelect} disabled={false} selectedNumber={null} />
          <input data-testid="some-input" />
        </div>
      );

      const input = screen.getByTestId("some-input");
      fireEvent.keyDown(input, { key: "4" });
      fireEvent.keyDown(input, { key: "2" });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
