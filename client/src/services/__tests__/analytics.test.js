import { initAnalytics, track, trackView, resetAnalytics, PROD_HOST, UMAMI_SCRIPT } from "../analytics";

describe("analytics", () => {
  afterEach(() => {
    document.head.querySelectorAll("script").forEach((s) => s.remove());
    delete window.umami;
    resetAnalytics();
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

  test("injects the Umami script once, with automatic page views off", () => {
    expect(initAnalytics("abc-123", PROD_HOST)).toBe(true);
    expect(initAnalytics("abc-123", PROD_HOST)).toBe(true);

    const scripts = document.querySelectorAll(`script[src="${UMAMI_SCRIPT}"]`);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("data-website-id")).toBe("abc-123");
    expect(scripts[0].getAttribute("data-domains")).toBe(PROD_HOST);
    expect(scripts[0].getAttribute("data-auto-track")).toBe("false");
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

  test("trackView sends a virtual page view, keeping Umami's other fields", () => {
    window.umami = { track: jest.fn() };
    trackView("/play/game", "Game");
    const build = window.umami.track.mock.calls[0][0];
    expect(build({ url: "/abc123", title: "In game — Numwit", referrer: "https://reddit.com" }))
      .toEqual({ url: "/play/game", title: "Game", referrer: "https://reddit.com" });

    trackView("/play/results");
    expect(window.umami.track.mock.calls[1][0]({ url: "/", title: "Numwit" }))
      .toEqual({ url: "/play/results", title: "Numwit" });
  });

  test("trackView ignores repeats of the same screen", () => {
    window.umami = { track: jest.fn() };
    trackView("/play/game", "Game");
    trackView("/play/game", "Game");
    trackView("/play/results", "Results");
    trackView("/play/game", "Game"); // "Play again"
    expect(window.umami.track).toHaveBeenCalledTimes(3);
  });

  test("calls made before the script loads are queued and sent on load", () => {
    initAnalytics("abc-123", PROD_HOST);
    trackView("/", "Home");
    track("play_click", { source: "hero" });

    window.umami = { track: jest.fn() };
    document.querySelector(`script[src="${UMAMI_SCRIPT}"]`).dispatchEvent(new Event("load"));

    expect(window.umami.track).toHaveBeenCalledTimes(2);
    expect(window.umami.track.mock.calls[1]).toEqual(["play_click", { source: "hero" }]);
  });

  test("nothing is queued when analytics is off, and the queue is capped", () => {
    track("play_click");
    window.umami = { track: jest.fn() };
    track("first_pick");
    expect(window.umami.track).toHaveBeenCalledTimes(1);

    delete window.umami;
    initAnalytics("abc-123", PROD_HOST);
    for (let i = 0; i < 80; i++) track("e" + i);
    window.umami = { track: jest.fn() };
    document.querySelector(`script[src="${UMAMI_SCRIPT}"]`).dispatchEvent(new Event("load"));
    expect(window.umami.track).toHaveBeenCalledTimes(50);
  });
});
