const { withRoomLock } = require("../roomLock");

const tick = () => new Promise((r) => setImmediate(r));

describe("withRoomLock", () => {
  test("runs work for the same room one at a time, in order", async () => {
    const log = [];
    const slow = (name) => async () => {
      log.push(name + ":start");
      await tick();
      await tick();
      log.push(name + ":end");
      return name;
    };

    const results = await Promise.all([
      withRoomLock("r1", slow("a")),
      withRoomLock("r1", slow("b")),
    ]);

    expect(results).toEqual(["a", "b"]);
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  test("different rooms don't wait for each other", async () => {
    const log = [];
    let release;
    const blocked = withRoomLock("r2", () => new Promise((r) => { release = r; }));
    await withRoomLock("r3", async () => log.push("r3 ran"));
    expect(log).toEqual(["r3 ran"]);
    release();
    await blocked;
  });

  test("a failure is passed to its caller and doesn't block the queue", async () => {
    const failing = withRoomLock("r4", async () => { throw new Error("boom"); });
    const next = withRoomLock("r4", async () => "still runs");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("still runs");
  });
});
