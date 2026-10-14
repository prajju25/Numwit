import React from "react";
import PropTypes from "prop-types";

/**
 * BrandMark — the Numwit app icon (same artwork as the favicon / installed
 * app icon). Decorative; pair it with the "Numwit" wordmark text for the
 * accessible name. Served from client/public/icons, so it's same-origin and
 * safe for html-to-image capture on the share card.
 */
export default function BrandMark({ size = 30 }) {
  return (
    <img
      src={size > 96 ? "/icons/icon-512.png" : "/icons/icon-192.png"}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable="false"
      className="shrink-0 select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
    />
  );
}

BrandMark.propTypes = {
  size: PropTypes.number,
};
