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
