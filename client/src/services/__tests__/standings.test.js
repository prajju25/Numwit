import { rankPlayers } from "../standings";

const p = (id) => ({ socketId: id, name: id });

describe("rankPlayers", () => {
  test("winner first, then whoever was knocked out later — even with equal points", () => {
    // "me" was knocked out in round 1, "bot" in round 3; both ended on 5 points
    const history = [{ newlyEliminated: ["me"] }, {}, { newlyEliminated: ["bot"] }];
    const ranked = rankPlayers([p("me"), p("bot"), p("champ")], { winnerSocketId: "champ", points: { me: 5, bot: 5, champ: 2 } }, history);
    expect(ranked.map((x) => x.socketId)).toEqual(["champ", "bot", "me"]);
  });

  test("players knocked out in the same round, or never, are ordered by points", () => {
    const history = [{ newlyEliminated: ["a", "b"] }];
    const ranked = rankPlayers([p("a"), p("b"), p("c"), p("d")], { winnerSocketId: null, points: { a: 7, b: 5, c: 3, d: 1 } }, history);
    expect(ranked.map((x) => x.socketId)).toEqual(["d", "c", "b", "a"]);
  });

  test("copes with missing data", () => {
    expect(rankPlayers(undefined, undefined, undefined)).toEqual([]);
    expect(rankPlayers([p("a"), p("b")]).map((x) => x.socketId)).toEqual(["a", "b"]);
  });
});
