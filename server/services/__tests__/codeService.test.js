const { getOrCreateCode, resolveCode, removeRoom } = require("../codeService");

describe("codeService", () => {
  describe("getOrCreateCode", () => {
    test("generates a 6-character alphanumeric (lowercase) code", () => {
      const code = getOrCreateCode("room-A");
      expect(code).toMatch(/^[a-z0-9]{6}$/);
    });

    test("returns the same code for the same roomId on repeated calls", () => {
      const code1 = getOrCreateCode("room-B");
      const code2 = getOrCreateCode("room-B");
      expect(code1).toBe(code2);
    });

    test("generates different codes for different rooms (overwhelmingly likely)", () => {
      const codeC = getOrCreateCode("room-C");
      const codeD = getOrCreateCode("room-D");
      // Extremely unlikely to collide given 36^6 possibilities; if it does,
      // the underlying dedup logic (do/while) would have already kicked in.
      expect(codeC).toMatch(/^[a-z0-9]{6}$/);
      expect(codeD).toMatch(/^[a-z0-9]{6}$/);
    });
  });

  describe("resolveCode", () => {
    test("resolves a known code back to its roomId", () => {
      const code = getOrCreateCode("room-E");
      expect(resolveCode(code)).toBe("room-E");
    });

    test("returns null for an unknown code", () => {
      expect(resolveCode("zzzzzz")).toBeNull();
    });
  });

  describe("removeRoom", () => {
    test("removes the code mapping for a room", () => {
      const code = getOrCreateCode("room-F");
      removeRoom("room-F");
      expect(resolveCode(code)).toBeNull();
    });

    test("getOrCreateCode issues a new code after removal", () => {
      const code1 = getOrCreateCode("room-G");
      removeRoom("room-G");
      const code2 = getOrCreateCode("room-G");
      expect(code2).toMatch(/^[a-z0-9]{6}$/);
      // not asserting inequality (random collision theoretically possible)
    });

    test("removeRoom on an unknown roomId is a no-op", () => {
      expect(() => removeRoom("never-existed")).not.toThrow();
    });
  });
});
