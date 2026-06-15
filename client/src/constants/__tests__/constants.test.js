import { avatars, MIN_PLAYERS, ELIMINATION_THRESHOLD } from "../constants.jsx";

describe("constants", () => {
  test("exports a non-empty array of avatar emojis", () => {
    expect(Array.isArray(avatars)).toBe(true);
    expect(avatars.length).toBeGreaterThan(0);
    avatars.forEach((a) => expect(typeof a).toBe("string"));
  });

  test("exports MIN_PLAYERS as 3", () => {
    expect(MIN_PLAYERS).toBe(3);
  });

  test("exports ELIMINATION_THRESHOLD as 5", () => {
    expect(ELIMINATION_THRESHOLD).toBe(5);
  });
});
