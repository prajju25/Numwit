import { reportError, initErrorReporting, resetErrorReporting } from "../errorReporting";
import { track } from "../analytics";

jest.mock("../analytics", () => ({ track: jest.fn() }));

describe("errorReporting", () => {
  let consoleError;
  beforeEach(() => {
    jest.clearAllMocks();
    resetErrorReporting();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  test("logs to the console and sends a short client_error event", () => {
    const err = new Error("boom");
    reportError("render", err);
    expect(consoleError).toHaveBeenCalledWith("[render]", err);
    expect(track).toHaveBeenCalledWith("client_error", { where: "render", message: "boom" });
  });

  test("sends each distinct error once per page load, and at most 5", () => {
    reportError("render", new Error("same"));
    reportError("render", new Error("same"));
    expect(track).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) reportError("window", new Error("e" + i));
    expect(track).toHaveBeenCalledTimes(5);
    // still logged to the console every time
    expect(consoleError).toHaveBeenCalledTimes(12);
  });

  test("keeps messages short and copes with strings and empty values", () => {
    reportError("x", "x".repeat(500));
    expect(track.mock.calls[0][1].message).toHaveLength(120);
    reportError("y", null);
    expect(track).toHaveBeenLastCalledWith("client_error", { where: "y", message: "unknown" });
  });

  test("reports uncaught errors and unhandled rejections, but not failed image loads", () => {
    const handlers = {};
    const target = { addEventListener: (name, fn) => { handlers[name] = fn; } };
    initErrorReporting(target);

    handlers.error({ error: new Error("runtime") });
    handlers.error({}); // e.g. an <img> that failed to load — no .error
    handlers.unhandledrejection({ reason: new Error("rejected") });

    expect(track).toHaveBeenCalledWith("client_error", { where: "window", message: "runtime" });
    expect(track).toHaveBeenCalledWith("client_error", { where: "promise", message: "rejected" });
    expect(track).toHaveBeenCalledTimes(2);
  });
});
