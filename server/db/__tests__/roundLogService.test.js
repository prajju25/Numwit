jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));

const { db } = require("../prismaClient");
const { buildRoundLog, logRound } = require("../roundLogService");

const players = [
  { socketId: "h1", deviceId: "d1", name: "Alice" },
  { socketId: "h2", deviceId: "d2", name: "Bob" },
  { socketId: "b1", isBot: true, name: "Bot" },
];

const result = {
  round: 3,
  average: 30,
  target: 24,
  winnerIds: ["h2"],
  submissions: [
    { socketId: "h1", number: 50 },
    { socketId: "h2", number: 25 },
    { socketId: "b1", number: 15 },
  ],
  invalidSubmissions: [],
  exactMatch: false,
};

describe("roundLogService.buildRoundLog", () => {
  test("records human picks only, with no identity, and an opaque game id", () => {
    const game = { round: 3, settings: { targetMultiplier: 0.8 } };
    const entry = buildRoundLog({ type: "public" }, game, players, result);

    expect(entry).toEqual({
      gameId: expect.any(String),
      round: 3,
      roomType: "public",
      playerCount: 3,
      humanCount: 2,
      humanPicks: [50, 25],
      invalidCount: 0,
      average: 30,
      target: 24,
      targetMultiplier: 0.8,
      isVoid: false,
      exactMatch: false,
      isDuel: false,
      humanWon: true,
    });
    expect(game.logId).toBe(entry.gameId);
    const serialized = JSON.stringify(entry);
    ["h1", "h2", "d1", "Alice", "Bob"].forEach((id) => expect(serialized).not.toContain(id));
  });

  test("reuses the game's id across rounds", () => {
    const game = { logId: "existing", settings: {} };
    expect(buildRoundLog({ type: "solo" }, game, players, result).gameId).toBe("existing");
  });

  test("returns null when no human submitted (all-bot round or no-shows)", () => {
    const noHumans = { ...result, submissions: [{ socketId: "h1" }, { socketId: "b1", number: 10 }] };
    expect(buildRoundLog({}, {}, players, noHumans)).toBeNull();
  });

  test("handles void rounds, bot winners, duplicates and defaults", () => {
    const duel = [players[0], players[2]];
    const entry = buildRoundLog({}, { round: 7 }, duel, {
      roundVoid: true,
      winnerIds: ["b1"],
      submissions: [{ socketId: "h1", number: 33 }],
      invalidSubmissions: [{ socketId: "h1", number: 33 }],
    });
    expect(entry).toMatchObject({
      round: 7,
      roomType: "public",
      isVoid: true,
      isDuel: true,
      humanWon: false,
      invalidCount: 1,
      average: null,
      target: null,
      targetMultiplier: 0.8,
    });
  });
});

describe("roundLogService.logRound", () => {
  afterEach(() => jest.clearAllMocks());

  test("writes the row through the db helper", async () => {
    const create = jest.fn().mockResolvedValue({ id: "r1" });
    db.mockImplementation(async (fn) => fn({ roundLog: { create } }));

    await expect(logRound({ gameId: "g" })).resolves.toEqual({ id: "r1" });
    expect(create).toHaveBeenCalledWith({ data: { gameId: "g" } });
  });

  test("does nothing for a null entry", async () => {
    await expect(logRound(null)).resolves.toBeNull();
    expect(db).not.toHaveBeenCalled();
  });
});
