const {
  RULES,
  applyDuplicateRule,
  isRoundVoid,
  applyTwoPlayerCycle,
  findWinners,
  hasExactMatch,
  computePenalties,
} = require("../gameRules");

describe("gameRules", () => {
  describe("applyDuplicateRule", () => {
    test("with < DUPLICATE_RULE_MIN_PLAYERS active players, all submissions are valid", () => {
      const submissions = [
        { socketId: "a", number: 10 },
        { socketId: "b", number: 10 },
      ];
      const result = applyDuplicateRule(submissions, 2);
      expect(result.valid).toEqual(submissions);
      expect(result.invalid).toEqual([]);
    });

    test("with >= DUPLICATE_RULE_MIN_PLAYERS, duplicates are filtered into invalid", () => {
      const submissions = [
        { socketId: "a", number: 10 },
        { socketId: "b", number: 10 },
        { socketId: "c", number: 50 },
      ];
      const result = applyDuplicateRule(submissions, 3);
      expect(result.valid).toEqual([{ socketId: "c", number: 50 }]);
      expect(result.invalid).toEqual([
        { socketId: "a", number: 10 },
        { socketId: "b", number: 10 },
      ]);
    });

    test("with all unique submissions, everything is valid", () => {
      const submissions = [
        { socketId: "a", number: 10 },
        { socketId: "b", number: 20 },
        { socketId: "c", number: 30 },
      ];
      const result = applyDuplicateRule(submissions, 3);
      expect(result.valid).toEqual(submissions);
      expect(result.invalid).toEqual([]);
    });
  });

  describe("isRoundVoid", () => {
    test("2-player tie (same number) is void", () => {
      const all = [
        { socketId: "a", number: 50 },
        { socketId: "b", number: 50 },
      ];
      const result = isRoundVoid(all, all, 2);
      expect(result.isVoid).toBe(true);
      expect(result.reason).toMatch(/same number/);
    });

    test("2-player different numbers is not void by this rule", () => {
      const all = [
        { socketId: "a", number: 50 },
        { socketId: "b", number: 40 },
      ];
      const result = isRoundVoid(all, all, 2);
      expect(result.isVoid).toBe(false);
      expect(result.reason).toBeNull();
    });

    test("no valid submissions (all duplicated) is void", () => {
      const all = [
        { socketId: "a", number: 50 },
        { socketId: "b", number: 50 },
        { socketId: "c", number: 50 },
      ];
      const result = isRoundVoid([], all, 3);
      expect(result.isVoid).toBe(true);
      expect(result.reason).toMatch(/duplicated/);
    });

    test("normal round with valid submissions is not void", () => {
      const all = [
        { socketId: "a", number: 50 },
        { socketId: "b", number: 40 },
        { socketId: "c", number: 30 },
      ];
      const result = isRoundVoid(all, all, 3);
      expect(result.isVoid).toBe(false);
      expect(result.reason).toBeNull();
    });
  });

  describe("applyTwoPlayerCycle", () => {
    test("returns null when submissions length is not 2", () => {
      expect(applyTwoPlayerCycle([{ socketId: "a", number: 100 }])).toBeNull();
      expect(applyTwoPlayerCycle([
        { socketId: "a", number: 100 },
        { socketId: "b", number: 0 },
        { socketId: "c", number: 1 },
      ])).toBeNull();
    });

    test("returns null when numbers are not part of the cycle", () => {
      const result = applyTwoPlayerCycle([
        { socketId: "a", number: 50 },
        { socketId: "b", number: 25 },
      ]);
      expect(result).toBeNull();
    });

    test("returns null when only one number is part of the cycle", () => {
      const result = applyTwoPlayerCycle([
        { socketId: "a", number: 100 },
        { socketId: "b", number: 25 },
      ]);
      expect(result).toBeNull();
    });

    test("100 beats 0", () => {
      const result = applyTwoPlayerCycle([
        { socketId: "a", number: 100 },
        { socketId: "b", number: 0 },
      ]);
      expect(result).toBe("a");
    });

    test("0 beats 1 (n1 beats n0 branch)", () => {
      const result = applyTwoPlayerCycle([
        { socketId: "a", number: 1 },
        { socketId: "b", number: 0 },
      ]);
      expect(result).toBe("b");
    });

    test("1 beats 100", () => {
      const result = applyTwoPlayerCycle([
        { socketId: "a", number: 1 },
        { socketId: "b", number: 100 },
      ]);
      expect(result).toBe("a");
    });

    test("both same cycle number returns null (no one beats the other)", () => {
      const result = applyTwoPlayerCycle([
        { socketId: "a", number: 100 },
        { socketId: "b", number: 100 },
      ]);
      expect(result).toBeNull();
    });
  });

  describe("findWinners", () => {
    test("returns empty array for empty submissions", () => {
      expect(findWinners([], 50)).toEqual([]);
    });

    test("returns single closest winner", () => {
      const result = findWinners([
        { socketId: "a", number: 40 },
        { socketId: "b", number: 60 },
      ], 50);
      // both equidistant -> co-winners
      expect(result.sort()).toEqual(["a", "b"]);
    });

    test("returns single winner when one is strictly closer", () => {
      const result = findWinners([
        { socketId: "a", number: 41 },
        { socketId: "b", number: 60 },
      ], 50);
      expect(result).toEqual(["a"]);
    });
  });

  describe("hasExactMatch", () => {
    test("true when a winner hit the target exactly", () => {
      const result = hasExactMatch(
        [{ socketId: "a", number: 50 }],
        50,
        ["a"]
      );
      expect(result).toBe(true);
    });

    test("false when winner did not hit target exactly", () => {
      const result = hasExactMatch(
        [{ socketId: "a", number: 49 }],
        50,
        ["a"]
      );
      expect(result).toBe(false);
    });

    test("false when the exact match belongs to a non-winner", () => {
      const result = hasExactMatch(
        [
          { socketId: "a", number: 50 },
          { socketId: "b", number: 51 },
        ],
        50,
        ["b"]
      );
      expect(result).toBe(false);
    });
  });

  describe("computePenalties", () => {
    test("applies NORMAL_PENALTY to non-winners", () => {
      const result = computePenalties(
        ["a", "b", "c"],
        ["a"],
        false,
        {},
        []
      );
      expect(result.updatedPoints).toEqual({ b: RULES.NORMAL_PENALTY, c: RULES.NORMAL_PENALTY });
      expect(result.newlyEliminated).toEqual([]);
      expect(result.eliminatedPlayers).toEqual([]);
    });

    test("applies EXACT_MATCH_PENALTY when exactMatch is true", () => {
      const result = computePenalties(
        ["a", "b"],
        ["a"],
        true,
        {},
        []
      );
      expect(result.updatedPoints.b).toBe(RULES.EXACT_MATCH_PENALTY);
    });

    test("skips already-eliminated players", () => {
      const result = computePenalties(
        ["a", "b", "c"],
        ["a"],
        false,
        { c: 4 },
        ["c"]
      );
      expect(result.updatedPoints.c).toBe(4); // unchanged
      expect(result.updatedPoints.b).toBe(RULES.NORMAL_PENALTY);
    });

    test("newly eliminates players reaching the threshold (default)", () => {
      const result = computePenalties(
        ["a", "b"],
        ["a"],
        false,
        { b: RULES.ELIMINATION_THRESHOLD - 1 },
        []
      );
      expect(result.updatedPoints.b).toBe(RULES.ELIMINATION_THRESHOLD);
      expect(result.newlyEliminated).toEqual(["b"]);
      expect(result.eliminatedPlayers).toEqual(["b"]);
    });

    test("respects a custom eliminationThreshold override", () => {
      const result = computePenalties(
        ["a", "b"],
        ["a"],
        false,
        { b: 2 },
        [],
        3
      );
      expect(result.updatedPoints.b).toBe(3);
      expect(result.newlyEliminated).toEqual(["b"]);
    });

    test("does not duplicate an already-eliminated player in newlyEliminated", () => {
      const result = computePenalties(
        ["a", "b"],
        ["a"],
        false,
        { b: RULES.ELIMINATION_THRESHOLD },
        ["b"]
      );
      expect(result.newlyEliminated).toEqual([]);
      expect(result.eliminatedPlayers).toEqual(["b"]);
    });
  });
});
