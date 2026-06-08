import PropTypes from "prop-types";
import React, { useEffect, useState } from "react";

export default function FloatingAlert({ message, onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  if (!visible) return null;

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
      <div className="flex items-center gap-2 px-5 py-3 rounded-xl border border-red-500/40 text-red-300 text-sm font-semibold shadow-xl"
        style={{ background: "rgba(239,68,68,0.15)", backdropFilter: "blur(16px)" }}>
        ⚠️ {message}
      </div>
    </div>
  );
}

FloatingAlert.propTypes = {
  message: PropTypes.string,
  onClose: PropTypes.func,
};
