describe("socket.jsx", () => {
  let socket;
  let mockSocket;
  let io;
  let consoleDebugSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    socket = require("../socket").default;
    ({ io, __mockSocket: mockSocket } = require("socket.io-client"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("creates a socket connection to the current origin with the socket.io path", () => {
    expect(io).toHaveBeenCalledWith(
      window.location.origin,
      expect.objectContaining({ path: "/socket.io" })
    );
  });

  test("tries WebSocket first and falls back to polling", () => {
    expect(io).toHaveBeenCalledWith(
      window.location.origin,
      expect.objectContaining({ transports: ["websocket", "polling"], tryAllTransports: true })
    );
  });

  test("exports the socket instance returned by io()", () => {
    expect(socket).toBe(mockSocket);
  });

  test("logs on connect", () => {
    mockSocket.__trigger("connect");
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Socket connected"),
      mockSocket.id
    );
  });

  test("warns on disconnect", () => {
    mockSocket.__trigger("disconnect", "transport close");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Socket disconnected"),
      "transport close"
    );
  });

  test("logs an error on connect_error", () => {
    mockSocket.__trigger("connect_error", new Error("boom"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Socket connection error"),
      "boom"
    );
  });
});
