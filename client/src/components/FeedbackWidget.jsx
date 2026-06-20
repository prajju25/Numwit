import React, { useState } from "react";
import { useUser } from "../contexts/UserContext";
import socket from "../socket";

const CATEGORIES = [
  { value: "bug", label: "🐛 Bug report" },
  { value: "feature", label: "💡 Feature request" },
  { value: "other", label: "💬 Other" },
];

const MAX_MESSAGE_LENGTH = 2000;

/**
 * FeedbackWidget
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating button + modal that lets players send bug reports, feature
 * requests, or general feedback. Submits via the `submit_feedback` socket
 * event (see server/socketHandlers/feedback.js).
 */
export default function FeedbackWidget() {
  const { user, deviceId, roomId } = useUser();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(null); // null | "sending" | "sent" | "error"
  const [errorMessage, setErrorMessage] = useState(null);

  const close = () => {
    setOpen(false);
    setStatus(null);
    setErrorMessage(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setStatus("sending");
    setErrorMessage(null);

    socket.emit("submit_feedback", {
      deviceId,
      name: user?.name || null,
      category,
      message: trimmed,
      context: roomId || window.location.pathname,
    }, (res) => {
      if (res?.status === "ok") {
        setStatus("sent");
        setMessage("");
      } else {
        setStatus("error");
        setErrorMessage(res?.message || "Something went wrong. Please try again.");
      }
    });
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        className="fixed bottom-6 left-4 z-40 flex items-center justify-center w-10 h-10 rounded-full text-lg text-white bg-white/10 hover:bg-white/20 border border-white/10 shadow-xl transition-all duration-200"
        style={{ backdropFilter: "blur(16px)" }}
      >
        💬
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={close}
        >
          <div
            className="glass-card w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">Send feedback</h2>
              <button
                onClick={close}
                aria-label="Close"
                className="text-white/50 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {status === "sent" ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">🎉</p>
                <p className="text-white font-semibold mb-1">Thanks for the feedback!</p>
                <p className="text-white/50 text-sm mb-4">We'll take a look soon.</p>
                <button
                  onClick={close}
                  className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-500 transition"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">
                  What's this about?
                </label>
                <div className="flex gap-2 mb-3">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`flex-1 text-xs font-semibold px-2 py-2 rounded-lg border transition ${
                        category === c.value
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <label htmlFor="feedback-message" className="block text-xs font-semibold text-white/60 mb-1.5">
                  Tell us more
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                  rows={4}
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder="What happened, or what would you like to see?"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:outline-none focus:border-violet-400 transition-colors resize-none"
                />

                {status === "error" && (
                  <p className="text-xs text-red-400 mt-2">⚠️ {errorMessage}</p>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={close}
                    className="text-sm px-4 py-2 rounded-lg bg-white/5 text-white/70 font-semibold hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim() || status === "sending"}
                    className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white font-bold disabled:opacity-30 hover:bg-violet-500 transition"
                  >
                    {status === "sending" ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
