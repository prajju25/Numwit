import {
  canExplain, explainFirstRound, nextRoundTip,
  explainerGamesSeen, markExplainerSeen, EXPLAINER_GAMES,
  stepsAhead, stepsLabel, roomDepth, MAX_STEPS,
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

describe("thinking steps", () => {
  test("stepsAhead maps a pick to the nearest level of 50 × m^k", () => {
    expect(stepsAhead(55, 0.8)).toBe(0);
    expect(stepsAhead(50, 0.8)).toBe(0);
    expect(stepsAhead(40, 0.8)).toBe(1);
    expect(stepsAhead(33, 0.8)).toBe(2);
    expect(stepsAhead(25.6, 0.8)).toBe(3);
    expect(stepsAhead(1, 0.8)).toBe(MAX_STEPS + 1);
    expect(stepsAhead(0, 0.8)).toBe(MAX_STEPS + 1);
  });

  test("stepsLabel reads naturally", () => {
    expect(stepsLabel(0)).toBe("0 steps");
    expect(stepsLabel(1)).toBe("1 step");
    expect(stepsLabel(3)).toBe("3 steps");
    expect(stepsLabel(MAX_STEPS + 1)).toBe(`${MAX_STEPS}+ steps`);
  });

  test("roomDepth lists the levels and where the average sits", () => {
    const depth = roomDepth({ average: 40, target: 32, twoPlayerCycle: false });
    expect(depth.room).toBe(1);
    expect(depth.levels).toHaveLength(MAX_STEPS + 1);
    expect(depth.levels[0]).toEqual({ step: 0, value: 50 });
    expect(depth.levels[2].value).toBeCloseTo(32);
  });

  test("roomDepth is null without a usable multiplier", () => {
    expect(roomDepth({ average: 0, target: 0 })).toBeNull();
    expect(roomDepth({ average: 40, target: 40 })).toBeNull();
    expect(roomDepth({ average: 40, target: 32, twoPlayerCycle: true })).toBeNull();
    expect(roomDepth(null)).toBeNull();
  });
});
