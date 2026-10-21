const { applyLogLevel } = require("../logLevel");

function fakeConsole() {
  const c = { debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { c, orig: { ...c } };
}

describe("applyLogLevel", () => {
  test("debug (the default) keeps everything", () => {
    const { c, orig } = fakeConsole();
    expect(applyLogLevel(undefined, c)).toBe("debug");
    expect(c).toEqual(orig);
  });

  test("info drops only debug", () => {
    const { c, orig } = fakeConsole();
    expect(applyLogLevel("info", c)).toBe("info");
    expect(c.debug).not.toBe(orig.debug);
    expect(c.log).toBe(orig.log);
    expect(c.warn).toBe(orig.warn);
  });

  test("warn also drops log/info; error also drops warn; errors always print", () => {
    const w = fakeConsole();
    applyLogLevel("WARN", w.c);
    expect(w.c.log).not.toBe(w.orig.log);
    expect(w.c.info).not.toBe(w.orig.info);
    expect(w.c.warn).toBe(w.orig.warn);

    const e = fakeConsole();
    applyLogLevel("error", e.c);
    expect(e.c.warn).not.toBe(e.orig.warn);
    expect(e.c.error).toBe(e.orig.error);
  });

  test("an unknown level falls back to debug", () => {
    const { c, orig } = fakeConsole();
    expect(applyLogLevel("loud", c)).toBe("debug");
    expect(c).toEqual(orig);
  });
});
