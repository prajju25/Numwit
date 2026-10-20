import {
  randomProfile, randomName, openProfileMenu, OPEN_PROFILE_EVENT, NAME_ADJECTIVES, NAME_NOUNS,
} from "../profile";
import { avatars } from "../../constants/constants";

describe("profile helpers", () => {
  test("randomName is two words and a number, e.g. SwiftOtter42", () => {
    expect(randomName(() => 0)).toBe(`${NAME_ADJECTIVES[0]}${NAME_NOUNS[0]}0`);
    expect(randomName(() => 0.999)).toBe(
      `${NAME_ADJECTIVES[NAME_ADJECTIVES.length - 1]}${NAME_NOUNS[NAME_NOUNS.length - 1]}99`
    );
    expect(randomName()).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
  });

  test("every possible name fits the 20-character name limit", () => {
    const longest = (list) => Math.max(...list.map((w) => w.length));
    expect(longest(NAME_ADJECTIVES) + longest(NAME_NOUNS) + 2).toBeLessThanOrEqual(20);
  });

  test("offers about 250,000 different names, with no repeated words", () => {
    expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
    expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length);
    expect(NAME_ADJECTIVES.length * NAME_NOUNS.length * 100).toBeGreaterThanOrEqual(250000);
  });

  test("randomProfile pairs a random name with a real avatar", () => {
    expect(randomProfile(() => 0)).toEqual({ name: `${NAME_ADJECTIVES[0]}${NAME_NOUNS[0]}0`, avatar: avatars[0] });
    const p = randomProfile();
    expect(p.name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
    expect(avatars).toContain(p.avatar);
  });

  test("openProfileMenu broadcasts the open event", () => {
    const listener = jest.fn();
    window.addEventListener(OPEN_PROFILE_EVENT, listener);
    openProfileMenu();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_PROFILE_EVENT, listener);
  });
});
