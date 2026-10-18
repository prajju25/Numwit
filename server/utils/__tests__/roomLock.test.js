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

describe("withRoomLock slow-work warning", () => {
  test("logs a warning with the room and label when work holds the lock too long", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const now = jest.spyOn(Date, "now");
    let t = 1000;
    now.mockImplementation(() => t);
    await withRoomLock("slow1", async () => { t += 5000; }, "send_number");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("slow send_number in room slow1"));
    now.mockRestore();
    warn.mockRestore();
  });

  test("stays quiet for fast work", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await withRoomLock("fast1", async () => "ok", "send_number");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
