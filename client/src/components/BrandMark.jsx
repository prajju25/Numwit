import React from "react";
import PropTypes from "prop-types";

/**
 * BrandMark — the Numwit logo glyph: a number line with the cyan target
 * line and the gold "closest pick" dot. Decorative; pair it with the
 * "Numwit" wordmark text for the accessible name.
 */
export default function BrandMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="nw-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="28" height="28" rx="9" fill="#12152A" stroke="url(#nw-mark)" strokeWidth="1.5" />
      <line x1="7" y1="19" x2="23" y2="19" stroke="#6B7194" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.5" y1="9" x2="12.5" y2="22" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="14" r="2.6" fill="#FBBF24" />
    </svg>
  );
}

BrandMark.propTypes = {
  size: PropTypes.number,
};
