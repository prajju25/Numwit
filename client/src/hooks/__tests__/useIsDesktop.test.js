import { renderHook, act } from "@testing-library/react";
import useIsDesktop from "../useIsDesktop";

describe("useIsDesktop", () => {
  const originalWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    delete window.matchMedia;
  });

  test("falls back to innerWidth when matchMedia is unavailable", () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  test("follows matchMedia change events and unsubscribes on unmount", () => {
    let handler;
    const mql = {
      matches: false,
      addEventListener: jest.fn((_, h) => { handler = h; }),
      removeEventListener: jest.fn(),
    };
    window.matchMedia = jest.fn().mockReturnValue(mql);

    const { result, unmount } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    act(() => handler({ matches: true }));
    expect(result.current).toBe(true);

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", handler);
  });

  test("uses the legacy addListener API on older Safari", () => {
    const mql = { matches: true, addListener: jest.fn(), removeListener: jest.fn() };
    window.matchMedia = jest.fn().mockReturnValue(mql);

    const { result, unmount } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    unmount();
    expect(mql.removeListener).toHaveBeenCalled();
  });
});
