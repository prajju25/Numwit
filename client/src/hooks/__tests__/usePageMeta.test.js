import { renderHook } from "@testing-library/react";
import usePageMeta, { DEFAULT_TITLE, SITE_URL } from "../usePageMeta";

describe("usePageMeta", () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="canonical"]').forEach((l) => l.remove());
  });

  test("uses the default title and home canonical when no title is given", () => {
    renderHook(() => usePageMeta(null));
    expect(document.title).toBe(DEFAULT_TITLE);
    expect(document.querySelector('link[rel="canonical"]').href).toBe(`${SITE_URL}/`);
  });

  test("sets a page title and canonical path, reusing the existing link tag", () => {
    const { rerender } = renderHook(({ t, p }) => usePageMeta(t, p), { initialProps: { t: "Leaderboard", p: "/leaderboard" } });
    expect(document.title).toBe("Leaderboard — Numwit");
    expect(document.querySelector('link[rel="canonical"]').href).toBe(`${SITE_URL}/leaderboard`);

    rerender({ t: "In game", p: "/" });
    expect(document.title).toBe("In game — Numwit");
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });
});
