import { buildShareText, roundSquare, playedRounds } from "../shareText";

const round = (overrides) => ({
  target: 20,
  winnerIds: ["bot"],
  submissions: [{ socketId: "me", number: 40 }, { socketId: "bot", number: 21 }],
  invalidSubmissions: [],
  exactMatch: false,
  ...overrides,
});

describe("roundSquare", () => {
  test("marks wins, exact hits, near misses, misses, duplicates and no-picks", () => {
    expect(roundSquare(round({ winnerIds: ["me"] }), "me")).toBe("🟩");
    expect(roundSquare(round({ winnerIds: ["me"], exactMatch: true }), "me")).toBe("🎯");
    expect(roundSquare(round({ submissions: [{ socketId: "me", number: 23 }] }), "me")).toBe("🟨");
    expect(roundSquare(round(), "me")).toBe("⬛");
    expect(roundSquare(round({ invalidSubmissions: [{ socketId: "me", number: 40 }] }), "me")).toBe("🟥");
    expect(roundSquare(round({ submissions: [{ socketId: "me" }] }), "me")).toBe("⬜");
    expect(roundSquare({}, "me")).toBe("⬜");
    // A cycle win in a duel has no target — still a win, and a loss is a plain miss
    expect(roundSquare(round({ target: null, winnerIds: ["me"] }), "me")).toBe("🟩");
    expect(roundSquare(round({ target: null }), "me")).toBe("⬛");
  });
});

describe("buildShareText", () => {
  const history = [
    round({ winnerIds: ["me"], submissions: [{ socketId: "me", number: 19.6 }] }),
    round(),
    round({ winnerIds: ["me"], exactMatch: true, submissions: [{ socketId: "me", number: 20 }] }),
  ];

  test("headline, one square per round, closest pick and link", () => {
    const text = buildShareText({ history, mySocketId: "me", placement: 2, playerCount: 4, url: "https://x.test" });
    expect(text).toBe([
      "Numwit 🧠 🥈 2nd of 4 · won 2/3 rounds",
      "🟩⬛🎯",
      "Closest: dead on the target 🎯",
      "https://x.test",
    ].join("\n"));
  });

  test("uses the site URL by default and reports the closest miss", () => {
    const text = buildShareText({ history: [round()], mySocketId: "me", placement: 1, playerCount: 3 });
    expect(text).toContain("🥇 1st of 3 · won 0/1 round\n");
    expect(text).toContain("Closest: 20.0 off the target");
    expect(text.endsWith("https://numwit.prajvex.com")).toBe(true);
  });

  test("ordinals and places past the podium", () => {
    expect(buildShareText({ history: [], mySocketId: "me", placement: 3, playerCount: 8 })).toContain("🥉 3rd of 8");
    expect(buildShareText({ history: [], mySocketId: "me", placement: 4, playerCount: 8 })).toContain("🏁 4th of 8");
    expect(buildShareText({ history: [], mySocketId: "me", placement: 11, playerCount: 12 })).toContain("11th of 12");
    expect(buildShareText({ history: [], mySocketId: "me", placement: 22, playerCount: 30 })).toContain("22nd of 30");
  });

  test("without a placement, without picks, and long games wrap at 10 squares", () => {
    const long = Array.from({ length: 12 }, () => round());
    const text = buildShareText({ history: long, mySocketId: "me" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Numwit 🧠 won 0/12 rounds");
    expect(Array.from(lines[1])).toHaveLength(10);
    expect(Array.from(lines[2])).toHaveLength(2);

    const noPicks = buildShareText({ history: [round({ submissions: [] })], mySocketId: "me" });
    expect(noPicks).not.toContain("Closest");
    expect(buildShareText({ mySocketId: "me" })).toContain("won 0/0 rounds");
  });

  test("duplicate picks don't count as the closest pick", () => {
    const text = buildShareText({
      history: [round({ submissions: [{ socketId: "me", number: 20 }], invalidSubmissions: [{ socketId: "me", number: 20 }] }), round()],
      mySocketId: "me",
    });
    expect(text).toContain("Closest: 20.0 off");
  });
});

describe("playedRounds", () => {
  test("drops the rounds after the player was knocked out, keeps timed-out ones", () => {
    const history = [
      round({ winnerIds: ["me"] }),
      round({ submissions: [{ socketId: "me" }, { socketId: "bot", number: 3 }] }), // ran out of time
      round({ submissions: [{ socketId: "bot", number: 9 }, { socketId: "champ", number: 7 }] }), // already out
    ];
    expect(playedRounds(history, "me")).toHaveLength(2);
    expect(playedRounds(undefined, "me")).toEqual([]);

    const text = buildShareText({ history, mySocketId: "me", placement: 3, playerCount: 3 });
    expect(text).toContain("won 1/2 rounds");
    expect(text.split("\n")[1]).toBe("🟩⬜");
  });
});

describe("buildShareText title", () => {
  test("puts the game title on the second line", () => {
    const text = buildShareText({ history: [round()], mySocketId: "me", placement: 2, playerCount: 3, title: { name: "The Anchor", icon: "⚓" } });
    expect(text.split("\n")[1]).toBe("⚓ The Anchor");
  });
});
