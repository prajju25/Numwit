import { renderHook, act } from "@testing-library/react";
import useInstallPrompt from "../useInstallPrompt";

function fakePromptEvent(outcome = "accepted") {
  const e = new Event("beforeinstallprompt");
  e.preventDefault = jest.fn();
  e.prompt = jest.fn();
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

describe("useInstallPrompt", () => {
  test("cannot install until the browser offers it", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  test("captures the prompt, shows it on demand, and only once", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const e = fakePromptEvent();

    act(() => { window.dispatchEvent(e); });
    expect(e.preventDefault).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(true);

    await act(async () => { await result.current.promptInstall(); });
    expect(e.prompt).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  test("hides the option once the app is installed", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => { window.dispatchEvent(fakePromptEvent()); });
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(result.current.canInstall).toBe(false);
  });

  test("promptInstall is a no-op without a captured prompt", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    await act(async () => { await result.current.promptInstall(); });
    expect(result.current.canInstall).toBe(false);
  });
});
