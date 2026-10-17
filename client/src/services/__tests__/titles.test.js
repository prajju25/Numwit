import { computeTitles, TITLES } from "../titles";

const players = [{ socketId: "me" }, { socketId: "a" }, { socketId: "b" }];

/** A round where everyone picked; `win` lists winners. */
function round(picks, { win = [], exact = false, invalid = [], points } = {}) {
  return {
    submissions: Object.entries(picks).map(([socketId, number]) => ({ socketId, number })),
    winnerIds: win,
    exactMatch: exact,
    invalidSubmissions: invalid.map((socketId) => ({ socketId, number: picks[socketId] })),
    points,
  };
}

const titleOf = (history, gameOver = { winnerSocketId: "a" }, who = "me", ps = players) =>
  computeTitles(ps, history, gameOver)[who];

describe("computeTitles", () => {
  test("everyone gets exactly one title with a name, icon and reason", () => {
    const t = computeTitles(players, [round({ me: 30, a: 20, b: 40 }, { win: ["a"] })], { winnerSocketId: "a" });
    expect(Object.keys(t).sort()).toEqual(["a", "b", "me"]);
    Object.values(t).forEach((x) => {
      expect(TITLES[x.id]).toMatchObject({ name: x.name, icon: x.icon });
      expect(x.reason).toBeTruthy();
    });
    expect(computeTitles(undefined, undefined, undefined)).toEqual({});
  });

  test("🎯 Mind Reader — an exact-target win beats everything", () => {
    const t = titleOf([round({ me: 0, a: 10, b: 20 }, { win: ["me"], exact: true }), round({ me: 0, a: 9, b: 30 }, { win: ["me"], exact: true })]);
    expect(t).toMatchObject({ id: "mind_reader", reason: "Hit the target exactly 2 times" });
    expect(titleOf([round({ me: 8, a: 10, b: 20 }, { win: ["me"], exact: true })]).reason).toBe("Hit the target exactly");
  });

  test("🐺 Lone Wolf — won the game from a final duel entered behind on points", () => {
    const history = [
      round({ me: 30, a: 20, b: 50 }, { win: ["a"], points: { me: 3, a: 1, b: 5 } }),
      round({ me: 1, a: 100 }, { win: ["me"], points: { me: 3, a: 2 } }),
    ];
    expect(titleOf(history, { winnerSocketId: "me" })).toMatchObject({ id: "lone_wolf" });
    // entered the duel ahead → not a lone wolf
    const ahead = [
      round({ me: 30, a: 20, b: 50 }, { win: ["me"], points: { me: 0, a: 1, b: 5 } }),
      round({ me: 1, a: 100 }, { win: ["me"], points: { me: 0, a: 2 } }),
    ];
    expect(titleOf(ahead, { winnerSocketId: "me" }).id).not.toBe("lone_wolf");
  });

  test("🧮 Mathematician — most round wins but lost the game", () => {
    const history = [
      round({ me: 20, a: 30, b: 50 }, { win: ["me"] }),
      round({ me: 15, a: 30, b: 50 }, { win: ["me"] }),
      round({ me: 15, a: 10, b: 50 }, { win: ["a"] }),
    ];
    expect(titleOf(history)).toMatchObject({ id: "mathematician", reason: "Most round wins (2) — but not the game" });
  });

  test("🧊 Contrarian — lowest pick in at least half the rounds (3+ rounds)", () => {
    const history = [
      round({ me: 5, a: 30, b: 50 }, { win: ["a"] }),
      round({ me: 4, a: 25, b: 40 }, { win: ["a"] }),
      round({ me: 60, a: 20, b: 30 }, { win: ["a"] }),
      round({ me: 3, a: 19, b: 30 }, { win: ["a"] }),
    ];
    expect(titleOf(history)).toMatchObject({ id: "contrarian", reason: "Lowest pick in 3 of 4 rounds" });
    expect(titleOf(history.slice(0, 2)).id).not.toBe("contrarian"); // too few rounds
  });

  test("💘 Last Romantic, ⚓ Anchor, 🌀 Chaos Agent", () => {
    const hundred = [1, 2, 3].map(() => round({ me: 100, a: 20, b: 30 }, { win: ["a"] }));
    expect(titleOf(hundred)).toMatchObject({ id: "romantic", reason: "Picked 100 3 times" });

    const fifty = [48, 50, 55].map((n) => round({ me: n, a: 20, b: 30 }, { win: ["a"] }));
    expect(titleOf(fifty)).toMatchObject({ id: "anchor", reason: "Picked near 50 in 3 rounds" });

    const dupes = [
      round({ me: 30, a: 30, b: 10 }, { win: ["b"], invalid: ["me", "a"] }),
      round({ me: 25, a: 25, b: 70 }, { win: ["b"], invalid: ["me", "a"] }),
    ];
    expect(titleOf(dupes)).toMatchObject({ id: "chaos", reason: "2 picks wiped out as duplicates" });
    // a duplicate (void) pick never counts as "lowest"
    expect(titleOf([...dupes, round({ me: 40, a: 30, b: 20 }, { win: ["b"] })]).id).toBe("chaos");
  });

  test("🔥 Comeback Kid, 👑 Strategist, 🎢 Wildcard, 🐢 Steady Hand", () => {
    const comeback = [
      round({ me: 60, a: 20, b: 30 }, { win: ["a"], points: { me: 4, a: 0, b: 1 } }),
      round({ me: 15, a: 20, b: 30 }, { win: ["me"], points: { me: 4, a: 1, b: 2 } }),
      round({ me: 15, a: 10, b: 30 }, { win: ["a"] }),
      round({ me: 30, a: 5, b: 31 }, { win: ["a"] }),
    ];
    expect(titleOf(comeback).id).toBe("comeback");

    const winner = [round({ me: 20, a: 10, b: 30 }, { win: ["a"] }), round({ me: 20, a: 25, b: 30 }, { win: ["me"] })];
    expect(titleOf(winner, { winnerSocketId: "me" })).toMatchObject({ id: "strategist", reason: "Last mind standing with 1 round win" });

    const wild = [round({ me: 90, a: 10, b: 20 }, { win: ["a"] }), round({ me: 30, a: 9, b: 20 }, { win: ["a"] })];
    expect(titleOf(wild)).toMatchObject({ id: "wildcard", reason: "Picks ranged from 30 to 90" });

    const steady = [round({ me: 30, a: 10, b: 20 }, { win: ["a"] }), round({ me: 35, a: 9, b: 20 }, { win: ["a"] })];
    expect(titleOf(steady)).toMatchObject({ id: "steady", reason: "Stayed between 30 and 35" });
  });

  test("a player who never picked still gets a title", () => {
    const t = titleOf([{ submissions: [{ socketId: "me" }, { socketId: "a", number: 10 }], winnerIds: ["a"] }], { winnerSocketId: "a" }, "me", [{ socketId: "me" }, { socketId: "a" }]);
    expect(t).toMatchObject({ id: "steady", reason: "Kept their cards close" });
  });
});
