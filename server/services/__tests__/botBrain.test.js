const {
  DIFFICULTIES,
  normalizeDifficulty,
  chooseBotNumbers,
  strengthFor,
  paramsFor,
  playerModel,
  winProbabilities,
  duelPick,
  duelPayoff,
} = require("../botBrain");

const isBot = (id) => id.startsWith("bot");

/** Small seeded RNG (mulberry32) so tests are repeatable. */
function seeded(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function game(overrides) {
  return Object.assign({
    turnOrder: ["h1", "bot-0", "bot-1"],
    eliminatedPlayers: [],
    points: { h1: 0, "bot-0": 0, "bot-1": 0 },
    settings: { targetMultiplier: 0.8, duplicateRuleEnabled: true, botDifficulty: "sharp" },
    pickHistory: [],
    target: null,
  }, overrides);
}

describe("botBrain", () => {
  test("normalizeDifficulty accepts the four levels and defaults to adaptive", () => {
    DIFFICULTIES.forEach((d) => expect(normalizeDifficulty(d)).toBe(d));
    expect(normalizeDifficulty("impossible")).toBe("adaptive");
    expect(normalizeDifficulty(undefined)).toBe("adaptive");
  });

  describe("strength", () => {
    test("fixed levels map to 0, 1, 2", () => {
      expect(strengthFor("casual")).toBe(0);
      expect(strengthFor("sharp")).toBe(1);
      expect(strengthFor("ruthless")).toBe(2);
    });

    test("adaptive gets tougher while humans lead and gentler while they trail", () => {
      const level = { points: { h: 1, b: 1 } };
      const humansLead = { points: { h: 0, b: 3 } };
      const humansTrail = { points: { h: 3, b: 0 } };
      const s = (g) => strengthFor("adaptive", g, ["h"], ["b"]);
      expect(s(humansLead)).toBeGreaterThan(s(level));
      expect(s(humansTrail)).toBeLessThan(s(level));
      expect(s({ points: { h: 0, b: 99 } })).toBe(2);
      expect(s({ points: { h: 99, b: 0 } })).toBe(0);
      expect(strengthFor("adaptive", undefined, [], [])).toBeCloseTo(0.6);
    });

    test("paramsFor interpolates and gets stronger with strength", () => {
      const casual = paramsFor(0);
      const ruthless = paramsFor(2);
      const between = paramsFor(1.5);
      expect(ruthless.smart).toBeGreaterThan(casual.smart);
      expect(ruthless.topK).toBeLessThan(casual.topK);
      expect(between.smart).toBeGreaterThan(paramsFor(1).smart);
      expect(between.smart).toBeLessThan(ruthless.smart);
      expect(paramsFor(-5)).toEqual(casual);
      expect(paramsFor(9)).toEqual(ruthless);
    });
  });

  describe("playerModel", () => {
    test("round 1 picks look like real first rounds (mostly 10-60)", () => {
      const rng = seeded(1);
      const m = playerModel("h1", [], 0.8);
      const picks = Array.from({ length: 2000 }, () => m.sample(rng));
      const mean = picks.reduce((a, b) => a + b, 0) / picks.length;
      expect(mean).toBeGreaterThan(28);
      expect(mean).toBeLessThan(42);
    });

    test("learns a player's personal undercut ratio", () => {
      // This player always picks half the previous target
      const history = [
        { picks: { h1: 40 }, target: 40 },
        { picks: { h1: 20 }, target: 30 },
        { picks: { h1: 15 }, target: 20 },
      ];
      const rng = seeded(2);
      const m = playerModel("h1", history, 0.8);
      const picks = Array.from({ length: 2000 }, () => m.sample(rng));
      const mean = picks.reduce((a, b) => a + b, 0) / picks.length;
      expect(mean).toBeGreaterThan(8);
      expect(mean).toBeLessThan(13); // ≈ 0.5-0.67 × 20, not the naive 0.8 × 20
    });

    test("after one round, expects a small undercut of the last target", () => {
      const rng = seeded(3);
      const m = playerModel("h1", [{ picks: { h1: 50 }, target: 30 }], 0.8);
      const picks = Array.from({ length: 2000 }, () => m.sample(rng));
      const mean = picks.reduce((a, b) => a + b, 0) / picks.length;
      // ≈ 0.8 × 30 + 1 = 25, pulled up a little by the 12% who repeat their 50
      expect(mean).toBeGreaterThan(24);
      expect(mean).toBeLessThan(30);
    });
  });

  describe("winProbabilities", () => {
    test("against predictable opponents, the best pick sits near the expected target", () => {
      const fixed = (n) => ({ sample: () => n });
      const probs = winProbabilities([fixed(50), fixed(50)], { multiplier: 0.8, duplicateRule: false, samples: 5 }, seeded(4));
      const best = probs.indexOf(Math.max(...probs));
      expect(best).toBeLessThan(50);
      expect(probs[best]).toBe(1);
      expect(probs[100]).toBe(0);
    });

    test("never picks a number an opponent will certainly pick when duplicates are void", () => {
      const fixed = (n) => ({ sample: () => n });
      const probs = winProbabilities([fixed(30), fixed(31)], { multiplier: 0.8, duplicateRule: true, samples: 5 }, seeded(5));
      expect(probs[30]).toBe(0);
      expect(probs[31]).toBe(0);
    });
  });

  describe("duels", () => {
    test("payoffs follow the 100 → 0 → 1 → 100 cycle", () => {
      expect(duelPayoff(0, 1)).toBe(1);
      expect(duelPayoff(1, 100)).toBe(1);
      expect(duelPayoff(100, 0)).toBe(1);
      expect(duelPayoff(1, 0)).toBe(-1);
      expect(duelPayoff(0, 42)).toBe(1);
      expect(duelPayoff(1, 42)).toBe(1);
      expect(duelPayoff(100, 42)).toBe(-1);
      expect(duelPayoff(5, 5)).toBe(0);
    });

    test("counters a player who keeps picking 1 by picking 0", () => {
      const history = [1, 1, 1].map((n) => ({ picks: { h1: n }, target: null, duel: true }));
      const rng = seeded(6);
      const picks = Array.from({ length: 200 }, () => duelPick("h1", history, paramsFor(2), rng));
      const zeros = picks.filter((p) => p === 0).length;
      expect(zeros / picks.length).toBeGreaterThan(0.75);
    });

    test("counters a player who keeps picking 0 by picking 100", () => {
      const history = [0, 0].map((n) => ({ picks: { h1: n }, target: null, duel: true }));
      expect(duelPick("h1", history, { duelSmart: 1 }, seeded(7))).toBe(100);
    });

    test("otherwise plays only 0, 1 or 100 — except casual bots, which sometimes miss the trick", () => {
      const rng = seeded(8);
      for (let i = 0; i < 100; i++) {
        expect([0, 1, 100]).toContain(duelPick("h1", [], { duelSmart: 0.5 }, rng));
      }
      const casual = Array.from({ length: 200 }, () => duelPick("h1", [], { duelSmart: 0 }, rng));
      expect(casual.some((p) => p >= 2 && p <= 32)).toBe(true);
    });
  });

  describe("chooseBotNumbers", () => {
    test("returns a number 0-100 for every active bot and none for humans", () => {
      const out = chooseBotNumbers(game(), isBot, seeded(9));
      expect(Object.keys(out).sort()).toEqual(["bot-0", "bot-1"]);
      Object.values(out).forEach((n) => {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
      });
    });

    test("bots never pick the same number as each other under the duplicate rule", () => {
      const turnOrder = ["h1", "bot-0", "bot-1", "bot-2", "bot-3", "bot-4"];
      ["casual", "sharp", "ruthless"].forEach((botDifficulty, i) => {
        for (let s = 0; s < 10; s++) {
          const g = game({ turnOrder, settings: { targetMultiplier: 0.8, botDifficulty }, target: 20 });
          const picks = Object.values(chooseBotNumbers(g, isBot, seeded(100 * i + s)));
          expect(new Set(picks).size).toBe(picks.length);
        }
      });
    });

    test("skips eliminated bots and uses duel play when two players remain", () => {
      const g = game({
        eliminatedPlayers: ["bot-1"],
        pickHistory: [1, 1, 1].map((n) => ({ picks: { h1: n }, target: null, duel: true })),
        settings: { botDifficulty: "ruthless" },
      });
      const rng = seeded(10);
      const picks = Array.from({ length: 50 }, () => chooseBotNumbers(g, isBot, rng));
      picks.forEach((p) => expect(Object.keys(p)).toEqual(["bot-0"]));
      expect(picks.filter((p) => p["bot-0"] === 0).length).toBeGreaterThan(35);
    });

    test("a ruthless bot undercuts a human who always follows the crowd", () => {
      // The human has picked ≈ 0.8 × previous target for several rounds
      const pickHistory = [
        { picks: { h1: 40, "bot-0": 30, "bot-1": 35 }, target: 28 },
        { picks: { h1: 22, "bot-0": 20, "bot-1": 24 }, target: 17.6 },
        { picks: { h1: 14, "bot-0": 12, "bot-1": 15 }, target: 11.1 },
      ];
      const g = game({ pickHistory, target: 11.1, settings: { targetMultiplier: 0.8, botDifficulty: "ruthless" } });
      const rng = seeded(11);
      const all = [];
      for (let i = 0; i < 10; i++) all.push(...Object.values(chooseBotNumbers(g, isBot, rng)));
      const mean = all.reduce((a, b) => a + b, 0) / all.length;
      expect(mean).toBeLessThan(11); // below the human's expected ~9, not chasing the old target
    });

    test("bot-vs-bot duels mix 0/1/100 so they don't tie forever", () => {
      // Human knocked out; two bots left with the same history to read
      const g = game({
        eliminatedPlayers: ["h1"],
        pickHistory: [1, 1, 1].map(() => ({ picks: { "bot-0": 1, "bot-1": 1 }, target: null, duel: true })),
        settings: { botDifficulty: "ruthless" },
      });
      const rng = seeded(12);
      let ties = 0;
      const seen = new Set();
      for (let i = 0; i < 300; i++) {
        const p = chooseBotNumbers(g, isBot, rng);
        if (p["bot-0"] === p["bot-1"]) ties++;
        seen.add(p["bot-0"]);
      }
      expect([...seen].sort((x, y) => x - y)).toEqual([0, 1, 100]);
      expect(ties / 300).toBeGreaterThan(0.2);
      expect(ties / 300).toBeLessThan(0.45); // ≈ 1/3, not every round
    });

    test("works with Math.random and a bare game object", () => {
      const out = chooseBotNumbers({ turnOrder: ["h1", "bot-0", "bot-1"] }, isBot);
      expect(Object.keys(out)).toHaveLength(2);
      expect(chooseBotNumbers({}, isBot)).toEqual({});
    });
  });
});
