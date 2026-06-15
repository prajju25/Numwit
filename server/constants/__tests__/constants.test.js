const constants = require("../constants");

describe("constants", () => {
  test("exports expected primitive constants", () => {
    expect(constants.ROOM_PREFIX).toBe("room:");
    expect(constants.MAX_PLAYERS).toBe(8);
    expect(constants.MIN_PLAYERS).toBe(3);
    expect(constants.ELIMINATION_THRESHOLD).toBe(5);
    expect(constants.TOTAL_ROUNDS_DEFAULT).toBe(3);
    expect(constants.BOT_FILL_DELAY_MS).toBe(60000);
  });

  test("exports NUMWIT_GAME_STATUS enum", () => {
    expect(constants.NUMWIT_GAME_STATUS).toEqual({
      WAIT: "WAIT",
      IN_PROGRESS: "IN_PROGRESS",
      COMPLETED: "COMPLETED",
    });
  });

  test("exports non-empty bot identity pools", () => {
    expect(Array.isArray(constants.BOT_NAMES)).toBe(true);
    expect(constants.BOT_NAMES.length).toBeGreaterThan(0);
    expect(Array.isArray(constants.BOT_AVATARS)).toBe(true);
    expect(constants.BOT_AVATARS.length).toBeGreaterThan(0);
  });

  describe("BOT_FILL_ENABLED", () => {
    const ORIGINAL_ENV = process.env.BOT_FILL_ENABLED;

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) {
        delete process.env.BOT_FILL_ENABLED;
      } else {
        process.env.BOT_FILL_ENABLED = ORIGINAL_ENV;
      }
      jest.resetModules();
    });

    test("defaults to true when BOT_FILL_ENABLED is not set", () => {
      delete process.env.BOT_FILL_ENABLED;
      jest.resetModules();
      const reloaded = require("../constants");
      expect(reloaded.BOT_FILL_ENABLED).toBe(true);
    });

    test("is false when BOT_FILL_ENABLED=false", () => {
      process.env.BOT_FILL_ENABLED = "false";
      jest.resetModules();
      const reloaded = require("../constants");
      expect(reloaded.BOT_FILL_ENABLED).toBe(false);
    });

    test("is true for any other value", () => {
      process.env.BOT_FILL_ENABLED = "true";
      jest.resetModules();
      const reloaded = require("../constants");
      expect(reloaded.BOT_FILL_ENABLED).toBe(true);
    });
  });
});
