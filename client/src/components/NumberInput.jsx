import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import NumberGrid from "./NumberGrid";
import NumberSlider from "./NumberSlider";

/**
 * NumberInput — responsive wrapper.
 *
 * Renders NumberSlider on screens narrower than 1024px (mobile + tablet).
 * Renders NumberGrid  on screens 1024px and wider (desktop).
 *
 * Prop interface is identical to NumberGrid so GameBoard.jsx needs only
 * one import change — no other logic changes.
 *
 * Why JS detection instead of Tailwind show/hide?
 * Rendering 101 hidden buttons on mobile wastes DOM nodes and memory.
 * The media query listener is cheap and keeps only one component in tree.
 */

const DESKTOP_BREAKPOINT = 1024; // px — matches Tailwind's "lg:" breakpoint

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    // Safe default: check window on mount — avoids hydration mismatch if ever SSR'd
    typeof window !== "undefined"
      ? window.innerWidth >= DESKTOP_BREAKPOINT
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

    // Sync immediately in case state is stale after mount
    setIsDesktop(mq.matches);

    const handler = (e) => setIsDesktop(e.matches);
    // Use addEventListener with fallback for older browsers
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      // Safari < 14 fallback
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
  }, []);

  return isDesktop;
}

/**
 * Desktop keyboard shortcut: type a number (0-100) then press Enter to submit.
 * Only active when not disabled and on desktop layout.
 */
function useKeyboardSubmit(onSelect, disabled, isDesktop) {
  const bufRef = React.useRef("");

  useEffect(() => {
    if (!isDesktop || disabled) return;

    const onKeyDown = (e) => {
      // Ignore when typing in an input/textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.key >= "0" && e.key <= "9") {
        bufRef.current = (bufRef.current + e.key).slice(-3); // keep max 3 digits
        return;
      }

      if (e.key === "Enter" && bufRef.current.length > 0) {
        const num = Math.max(0, Math.min(100, parseInt(bufRef.current, 10)));
        if (!isNaN(num)) onSelect(num);
        bufRef.current = "";
        return;
      }

      if (e.key === "Backspace") {
        bufRef.current = bufRef.current.slice(0, -1);
        return;
      }

      if (e.key === "Escape") {
        bufRef.current = "";
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSelect, disabled, isDesktop]);
}

export default function NumberInput({ onSelect, disabled, selectedNumber }) {
  const isDesktop = useIsDesktop();
  useKeyboardSubmit(onSelect, disabled, isDesktop);

  if (isDesktop) {
    return (
      <NumberGrid
        onSelect={onSelect}
        disabled={disabled}
        selectedNumber={selectedNumber}
      />
    );
  }

  return (
    <NumberSlider
      onSelect={onSelect}
      disabled={disabled}
      selectedNumber={selectedNumber}
    />
  );
}

NumberInput.propTypes = {
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  selectedNumber: PropTypes.number,
};
