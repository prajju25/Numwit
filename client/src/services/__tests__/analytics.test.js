import { initAnalytics, track, PROD_HOST, UMAMI_SCRIPT } from "../analytics";

describe("analytics", () => {
  afterEach(() => {
    document.head.querySelectorAll("script").forEach((s) => s.remove());
    delete window.umami;
  });

  test("stays off without a website id", () => {
    expect(initAnalytics("", PROD_HOST)).toBe(false);
    expect(document.querySelector("script")).toBeNull();
  });

  test("stays off on any host other than production", () => {
    expect(initAnalytics("abc", "localhost")).toBe(false);
    expect(initAnalytics("abc", "numwit.fly.dev")).toBe(false);
    expect(document.querySelector("script")).toBeNull();
  });

  test("injects the Umami script once on the production host", () => {
    expect(initAnalytics("abc-123", PROD_HOST)).toBe(true);
    expect(initAnalytics("abc-123", PROD_HOST)).toBe(true);

    const scripts = document.querySelectorAll(`script[src="${UMAMI_SCRIPT}"]`);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("data-website-id")).toBe("abc-123");
    expect(scripts[0].getAttribute("data-domains")).toBe(PROD_HOST);
    expect(scripts[0].defer).toBe(true);
  });

  test("track forwards events when Umami is loaded", () => {
    window.umami = { track: jest.fn() };
    track("play_click", { source: "hero" });
    track("first_pick");
    expect(window.umami.track).toHaveBeenNthCalledWith(1, "play_click", { source: "hero" });
    expect(window.umami.track).toHaveBeenNthCalledWith(2, "first_pick");
  });

  test("track is a silent no-op when Umami is absent or throws", () => {
    expect(() => track("play_click")).not.toThrow();
    window.umami = { track: () => { throw new Error("blocked"); } };
    expect(() => track("play_click")).not.toThrow();
  });
});
