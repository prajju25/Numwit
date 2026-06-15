const { isValidWord, isValidPrefix } = require("../dictionary");

describe("dictionary", () => {
  describe("isValidWord", () => {
    test("returns true for a known word (lowercase)", () => {
      expect(isValidWord("apple")).toBe(true);
    });

    test("is case-insensitive", () => {
      expect(isValidWord("APPLE")).toBe(true);
      expect(isValidWord("Apple")).toBe(true);
    });

    test("returns false for a non-word", () => {
      expect(isValidWord("zzzqqqxxx123")).toBe(false);
    });
  });

  describe("isValidPrefix", () => {
    test("returns true for a prefix of at least one known word", () => {
      expect(isValidPrefix("appl")).toBe(true);
    });

    test("is case-insensitive", () => {
      expect(isValidPrefix("APPL")).toBe(true);
    });

    test("returns false for a prefix that matches no word", () => {
      expect(isValidPrefix("zzzqqqxxx")).toBe(false);
    });
  });
});
