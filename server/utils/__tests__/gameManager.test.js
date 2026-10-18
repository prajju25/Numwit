jest.mock("../roomManager", () => ({
  saveRoom: jest.fn().mockResolvedValue(undefined),
}));

const { saveRoom } = require("../roomManager");
const { createGameData, evaluateRound, sanitizeSettings, replaceSocketId } = require("../gameManager");
const { NUMWIT_GAME_STATUS } = require("../../constants/constants");

describe("gameManager", () => {
  describe("sanitizeSettings", () => {
    test("returns defaults for undefined/null/non-object input", () => {
      expect(sanitizeSettings(undefined)).toEqual({
        timerDuration: 30,
        eliminationThreshold: 5,
        targetMultiplier: 0.8,
        duplicateRuleEnabled: true,
        botDifficulty: "adaptive",
      });
      expect(sanitizeSettings(null)).toEqual({
        timerDuration: 30,
        eliminationThreshold: 5,
        targetMultiplier: 0.8,
        duplicateRuleEnabled: true,
        botDifficulty: "adaptive",
      });
      expect(sanitizeSettings("nope")).toEqual({
        timerDuration: 30,
        eliminationThreshold: 5,
        targetMultiplier: 0.8,
        duplicateRuleEnabled: true,
        botDifficulty: "adaptive",
      });
    });

    test("accepts valid values", () => {
      const result = sanitizeSettings({
        timerDuration: 60,
        eliminationThreshold: 7,
        targetMultiplier: 0.6,
        duplicateRuleEnabled: false,
        botDifficulty: "ruthless",
      });
      expect(result).toEqual({
        timerDuration: 60,
        eliminationThreshold: 7,
        targetMultiplier: 0.6,
        duplicateRuleEnabled: false,
        botDifficulty: "ruthless",
      });
    });

    test("falls back to defaults for invalid values", () => {
      const result = sanitizeSettings({
        timerDuration: 999,
        eliminationThreshold: 1,
        targetMultiplier: 2.5,
      });
      expect(result).toEqual({
        timerDuration: 30,
        eliminationThreshold: 5,
        targetMultiplier: 0.8,
        duplicateRuleEnabled: true,
        botDifficulty: "adaptive",
      });
    });

    test("botDifficulty falls back to adaptive for unknown values", () => {
      expect(sanitizeSettings({ botDifficulty: "godlike" }).botDifficulty).toBe("adaptive");
      expect(sanitizeSettings({ botDifficulty: "casual" }).botDifficulty).toBe("casual");
    });

    test("duplicateRuleEnabled defaults to true unless explicitly false", () => {
      expect(sanitizeSettings({ duplicateRuleEnabled: true }).duplicateRuleEnabled).toBe(true);
      expect(sanitizeSettings({ duplicateRuleEnabled: "false" }).duplicateRuleEnabled).toBe(true);
      expect(sanitizeSettings({ duplicateRuleEnabled: false }).duplicateRuleEnabled).toBe(false);
    });
  });

  describe("createGameData", () => {
    test("creates and persists game data when room.game is absent", async () => {
      const room = {
        id: "room1",
        users: [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }],
      };
      const game = await createGameData(room, { timerDuration: 60 });

      expect(game).not.toBeNull();
      expect(game.round).toBe(1);
      expect(game.status).toBe(NUMWIT_GAME_STATUS.IN_PROGRESS);
      expect(game.turnOrder.sort()).toEqual(["a", "b", "c"]);
      expect(game.points).toEqual({ a: 0, b: 0, c: 0 });
      expect(game.settings.timerDuration).toBe(60);
      expect(room.game).toBe(game);
      expect(saveRoom).toHaveBeenCalledWith(room);
    });

    test("uses default settings when none are provided", async () => {
      const room = { id: "room2", users: [{ socketId: "x" }] };
      const game = await createGameData(room);
      expect(game.settings).toEqual({
        timerDuration: 30,
        eliminationThreshold: 5,
        targetMultiplier: 0.8,
        duplicateRuleEnabled: true,
        botDifficulty: "adaptive",
      });
    });

    test("returns null and does not overwrite an existing game", async () => {
      const existingGame = { round: 5 };
      const room = { id: "room3", users: [], game: existingGame };
      const result = await createGameData(room, {});
      expect(result).toBeNull();
      expect(room.game).toBe(existingGame);
    });
  });

  describe("evaluateRound", () => {
    function makeGame(overrides) {
      return Object.assign({
        round: 1,
        numbers: {},
        points: {},
        eliminatedPlayers: [],
        settings: {},
      }, overrides);
    }

    test("3-player normal round picks a single winner and applies penalties", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }];
      const game = makeGame({
        numbers: { a: 50, b: 40, c: 10 },
      });
      const result = evaluateRound(game, players);

      expect(result.roundVoid).toBe(false);
      // average = (50+40+10)/3 = 33.33, target = *0.8 = 26.67 -> closest is "b" (40, diff 13.33) vs a(50,diff 23.33) vs c(10, diff 16.67)
      expect(result.winnerIds).toEqual(["b"]);
      expect(result.points.a).toBeGreaterThan(0);
      expect(result.points.c).toBeGreaterThan(0);
      expect(result.points.b).toBeUndefined();
      expect(result.updatedGame.status).toBe(NUMWIT_GAME_STATUS.COMPLETED);
    });

    test("round is void when all 3 players submit the same number (duplicate rule)", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }];
      const game = makeGame({ numbers: { a: 50, b: 50, c: 50 } });
      const result = evaluateRound(game, players);
      expect(result.roundVoid).toBe(true);
      expect(result.reason).toMatch(/duplicated/);
      expect(result.submissions).toHaveLength(3);
    });

    test("2-player round applies the cycle rule when applicable", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }];
      const game = makeGame({ numbers: { a: 100, b: 0 } });
      const result = evaluateRound(game, players);
      expect(result.roundVoid).toBe(false);
      expect(result.twoPlayerCycle).toBe(true);
      expect(result.winnerIds).toEqual(["a"]);
    });

    test("2-player round with same number is void (tie)", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }];
      const game = makeGame({ numbers: { a: 50, b: 50 } });
      const result = evaluateRound(game, players);
      expect(result.roundVoid).toBe(true);
      expect(result.reason).toMatch(/same number/);
    });

    test("2-player round outside the cycle falls through to normal target calc", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }];
      const game = makeGame({ numbers: { a: 60, b: 40 } });
      const result = evaluateRound(game, players);
      expect(result.roundVoid).toBe(false);
      expect(result.twoPlayerCycle).toBe(false);
      // average = 50, target = 40, b is exact -> winner b, exact match
      expect(result.winnerIds).toEqual(["b"]);
      expect(result.exactMatch).toBe(true);
      expect(result.points.a).toBe(RULES_EXACT_MATCH_PENALTY());
    });

    test("duplicateRuleEnabled=false skips duplicate filtering even with 3+ players", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }];
      const game = makeGame({
        numbers: { a: 50, b: 50, c: 10 },
        settings: { duplicateRuleEnabled: false },
      });
      const result = evaluateRound(game, players);
      expect(result.roundVoid).toBe(false);
      expect(result.validSubmissions).toHaveLength(3);
      expect(result.invalidSubmissions).toHaveLength(0);
    });

    test("respects custom targetMultiplier and eliminationThreshold settings", () => {
      const players = [{ socketId: "a" }, { socketId: "b" }, { socketId: "c" }];
      const game = makeGame({
        numbers: { a: 90, b: 10, c: 20 },
        points: { a: 2, b: 0, c: 0 },
        settings: { targetMultiplier: 1.0, eliminationThreshold: 3 },
      });
      const result = evaluateRound(game, players);
      expect(result.roundVoid).toBe(false);
      // average = 40, target = 40 (multiplier 1.0). closest: c(20,diff20) vs b(10,diff30) vs a(90,diff50) -> c wins
      expect(result.winnerIds).toEqual(["c"]);
      // a had 2 points + 1 penalty = 3 >= threshold 3 -> eliminated
      expect(result.newlyEliminated).toContain("a");
    });

    function RULES_EXACT_MATCH_PENALTY() {
      return require("../gameRules").RULES.EXACT_MATCH_PENALTY;
    }
  });
  describe("replaceSocketId", () => {
    function game() {
      return {
        turnOrder: ["a", "b", "c"],
        eliminatedPlayers: ["a"],
        winnerIds: ["a"],
        winnerSocketId: "a",
        pendingJoiners: [],
        numbers: { a: 10, b: 20 },
        points: { a: 4, b: 1, c: 0 },
        winHistory: { a: 2 },
        exactMatchHistory: { a: 1 },
        consecWinHistory: { a: 1 },
        maxConsecWinHistory: { a: 2 },
        wasLastPlaceSet: { a: true },
        pickHistory: [{ picks: { a: 30, b: 40 } }, { picks: { b: 50 } }],
      };
    }

    test("moves every per-player field from the old id to the new one", () => {
      const g = game();
      expect(replaceSocketId(g, "a", "a2")).toBe(true);
      expect(g.turnOrder).toEqual(["a2", "b", "c"]);
      expect(g.eliminatedPlayers).toEqual(["a2"]);
      expect(g.winnerIds).toEqual(["a2"]);
      expect(g.winnerSocketId).toBe("a2");
      expect(g.numbers).toEqual({ b: 20, a2: 10 });
      expect(g.points).toEqual({ b: 1, c: 0, a2: 4 });
      expect(g.winHistory).toEqual({ a2: 2 });
      expect(g.exactMatchHistory).toEqual({ a2: 1 });
      expect(g.consecWinHistory).toEqual({ a2: 1 });
      expect(g.maxConsecWinHistory).toEqual({ a2: 2 });
      expect(g.wasLastPlaceSet).toEqual({ a2: true });
      expect(g.pickHistory).toEqual([{ picks: { b: 40, a2: 30 } }, { picks: { b: 50 } }]);
    });

    test("does not list the new id twice if it was already queued as a joiner", () => {
      const g = game();
      g.pendingJoiners = ["a2"];
      replaceSocketId(g, "a", "a2");
      expect(g.pendingJoiners).toEqual([]);
      expect(g.turnOrder).toEqual(["a2", "b", "c"]);
    });

    test("a player who was still waiting to join keeps waiting, under the new id", () => {
      const g = game();
      g.pendingJoiners = ["d"];
      expect(replaceSocketId(g, "d", "d2")).toBe(true);
      expect(g.pendingJoiners).toEqual(["d2"]);
    });

    test("returns false and changes nothing when the old id is not in the game", () => {
      const g = game();
      const before = JSON.stringify(g);
      expect(replaceSocketId(g, "zzz", "new")).toBe(false);
      expect(replaceSocketId(g, null, "new")).toBe(false);
      expect(replaceSocketId(g, "a", "a")).toBe(false);
      expect(replaceSocketId(null, "a", "b")).toBe(false);
      expect(JSON.stringify(g)).toBe(before);
    });

    test("copes with games missing optional fields", () => {
      const g = { turnOrder: ["a"], points: { a: 1 } };
      expect(replaceSocketId(g, "a", "b")).toBe(true);
      expect(g).toEqual({ turnOrder: ["b"], points: { b: 1 } });
    });
  });
});
