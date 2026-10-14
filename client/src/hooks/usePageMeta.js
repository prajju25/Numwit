import { useEffect } from "react";

export const SITE_URL = "https://numwit.prajvex.com";
export const DEFAULT_TITLE = "Numwit — Multiplayer Number Mind Game | Guess 80% of the Average";

/**
 * Keeps the tab title and <link rel="canonical"> in step with the current view.
 * Room links (/<code>) and in-game views all canonicalise to the home page so
 * search engines index one page, not every room code.
 */
export default function usePageMeta(title, path = "/") {
  useEffect(() => {
    document.title = title ? `${title} — Numwit` : DEFAULT_TITLE;

    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${SITE_URL}${path}`;
  }, [title, path]);
}
