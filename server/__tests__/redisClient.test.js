describe("redisClient", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("creates a redis client with the default URL when REDIS_URL is not set", () => {
    delete process.env.REDIS_URL;
    const { createClient } = require("redis");

    const redisClient = require("../redisClient");

    expect(createClient).toHaveBeenCalledWith({ url: "redis://localhost:6379" });
    expect(redisClient.connect).toHaveBeenCalledTimes(1);
  });

  test("uses REDIS_URL from the environment when set", () => {
    process.env.REDIS_URL = "redis://custom-host:1234";
    const { createClient } = require("redis");

    require("../redisClient");

    expect(createClient).toHaveBeenCalledWith({ url: "redis://custom-host:1234" });
  });

  test("exports the client returned by createClient", () => {
    const { createClient } = require("redis");
    const redisClient = require("../redisClient");

    expect(redisClient).toBe(createClient.mock.results[0].value);
  });

  test("logs a connection error via console.error if connect() rejects", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const connectError = new Error("ECONNREFUSED");

    jest.doMock("redis", () => ({
      createClient: jest.fn(() => ({
        connect: jest.fn().mockRejectedValue(connectError),
        on: jest.fn(),
        ping: jest.fn(),
      })),
    }));

    require("../redisClient");

    // Allow the connect().catch(console.error) microtask to settle.
    await new Promise((r) => setImmediate(r));

    expect(consoleErrorSpy).toHaveBeenCalledWith(connectError);
    consoleErrorSpy.mockRestore();
    jest.dontMock("redis");
  });
});

describe("redisClient error handling", () => {
  beforeEach(() => jest.resetModules());

  test("registers an error listener so dropped connections don't crash the process", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.doMock("redis", () => ({
      createClient: jest.fn(() => ({ connect: jest.fn().mockResolvedValue(), on: jest.fn() })),
    }));
    const redisClient = require("../redisClient");

    const call = redisClient.on.mock.calls.find((c) => c[0] === "error");
    expect(call).toBeDefined();
    call[1](new Error("Socket closed unexpectedly"));
    expect(consoleErrorSpy).toHaveBeenCalledWith("Redis client error:", "Socket closed unexpectedly");
    consoleErrorSpy.mockRestore();
    jest.dontMock("redis");
  });
});
