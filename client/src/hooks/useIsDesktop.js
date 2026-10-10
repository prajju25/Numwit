import { useEffect, useState } from "react";

export const DESKTOP_BREAKPOINT = 1024; // px — matches Tailwind's "lg:" breakpoint

/**
 * True at ≥1024px. JS detection (not Tailwind show/hide) so components with
 * socket listeners are mounted exactly once in whichever layout is active.
 */
export default function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= DESKTOP_BREAKPOINT : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    setIsDesktop(mq.matches);

    const handler = (e) => setIsDesktop(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    // Safari < 14 fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  return isDesktop;
}
