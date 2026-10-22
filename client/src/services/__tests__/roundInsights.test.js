import {
  canExplain, explainFirstRound, nextRoundTip,
  explainerGamesSeen, markExplainerSeen, EXPLAINER_GAMES,
} from "../roundInsights";

const result = { average: 41.6, target: 33.28, twoPlayerCycle: false };

describe("roundInsights", () => {
  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test("canExplain needs an average and target, and not a duel-cycle win", () => {
    expect(canExplain(result)).toBe(true);
    expect(canExplain({ ...result, twoPlayerCycle: true })).toBe(false);
    expect(canExplain({ target: 3 })).toBe(false);
    expect(canExplain(null)).toBe(false);
  });

  test("explainFirstRound uses the round's real numbers", () => {
    const e = explainFirstRound(result);
    expect(e.title).toBe("Why was the target 33.3?");
    expect(e.steps[0]).toBe("Everyone's picks averaged 41.6. The target is always 80% of the average: 41.6 × 0.8 = 33.3.");
    expect(e.steps[1]).toContain("aims near 33.3");
    expect(e.steps[1]).toContain("about 27");
    expect(explainFirstRound({ ...result, twoPlayerCycle: true })).toBeNull();
  });

  test("explainFirstRound copes with an all-zero round", () => {
    const e = explainFirstRound({ average: 0, target: 0 });
    expect(e.steps[0]).toContain("80%");
  });

  test("nextRoundTip projects one step ahead, using the game's multiplier", () => {
    expect(nextRoundTip(result, 0.8)).toBe(
      "Last round's target was 33.3. Everyone saw it — if they all aim near 33, the new target lands near 0.8 × 33 ≈ 26. Stay one step ahead of the crowd."
    );
    expect(nextRoundTip(result, 0.6)).toContain("0.6 × 33 ≈ 20");
    expect(nextRoundTip(result)).toContain("0.8 × 33");
    expect(nextRoundTip(null, 0.8)).toBeNull();
  });

  test("counts how many games have shown the explainer", () => {
    expect(explainerGamesSeen()).toBe(0);
    markExplainerSeen();
    markExplainerSeen();
    expect(explainerGamesSeen()).toBe(2);
  });

  test("blocked storage counts as 'seen enough' and never throws", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(explainerGamesSeen()).toBe(EXPLAINER_GAMES);
    expect(() => markExplainerSeen()).not.toThrow();
  });
});
