import React, { useRef, useState } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import PlayerStatCard from "./PlayerStatCard";

/**
 * ShareCardModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal overlay showing a PlayerStatCard plus share actions. Opened from
 * LeaderboardPage (variant="leaderboard") and GameOverScreen (variant="victory").
 *
 * Platform note: X/Facebook/Reddit's web share endpoints only accept text +
 * a URL, not an attached image — so those three buttons carry the text/link.
 * Only "Share via Device" (Web Share API with a file) and "Download Image"
 * can carry the actual rendered card image.
 */
function buildShareText({ name, level, stats, variant }) {
  const s = stats || {};
  if (variant === "victory") {
    return `🎉 Just won a game of Numwit as ${name}! Level ${level} · ${s.gamesWon ?? 0} wins · ${s.bestStreak ?? 0}-win best streak. Can you beat me?`;
  }
  return `🧠 I'm Level ${level} on Numwit with ${s.gamesWon ?? 0} wins and a ${s.bestStreak ?? 0}-win best streak. Can you beat me?`;
}

export default function ShareCardModal({ player, variant, rank, totalPlayers, onClose }) {
  const cardRef = useRef(null);
  const [busyAction, setBusyAction] = useState(null); // "device" | "download" | null
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const { name, avatar, level, stats } = player || {};
  const shareUrl  = typeof window !== "undefined" ? window.location.origin : "https://numwit.gg";
  const shareText = buildShareText({ name, level, stats, variant });

  const openShareWindow = (url) => {
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const handlePostX = () => {
    openShareWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`);
  };

  const handleFacebook = () => {
    openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`);
  };

  const handleReddit = () => {
    openShareWindow(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`);
  };

  const handleCopyText = () => {
    const full = `${shareText} ${shareUrl}`;
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      window.prompt("Copy your stats:", full);
    });
  };

  const renderCardToPng = async () => {
    const { toPng } = await import("html-to-image");
    if (!cardRef.current) throw new Error("Card not ready");
    return toPng(cardRef.current, { pixelRatio: 2 });
  };

  const handleDownload = async () => {
    setError(null);
    setBusyAction("download");
    try {
      const dataUrl = await renderCardToPng();
      const link = document.createElement("a");
      link.download = "numwit-player-card.png";
      link.href = dataUrl;
      link.click();
    } catch (_) {
      setError("Couldn't generate the image. Try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleShareDevice = async () => {
    setError(null);
    setBusyAction("device");
    try {
      const dataUrl = await renderCardToPng();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "numwit-player-card.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Numwit", text: shareText });
      } else if (navigator.share) {
        await navigator.share({ title: "Numwit", text: `${shareText} ${shareUrl}`, url: shareUrl });
      } else {
        await handleDownload();
      }
    } catch (err) {
      // AbortError = user cancelled the native share sheet, not a real failure
      if (err?.name !== "AbortError") setError("Couldn't share. Try downloading instead.");
    } finally {
      setBusyAction(null);
    }
  };

  const overlayContent = (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-sm space-y-4 animate-fadeIn">
        <PlayerStatCard
          ref={cardRef}
          name={name}
          avatar={avatar}
          level={level}
          stats={stats}
          variant={variant}
          rank={rank}
          totalPlayers={totalPlayers}
        />

        <div className="glass-card p-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handlePostX}
              className="py-2.5 rounded-xl text-sm font-bold text-white bg-black border border-white/20 hover:bg-white/10 transition-all"
            >
              Post on X
            </button>
            <button
              onClick={handleFacebook}
              className="py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all"
            >
              Facebook
            </button>
            <button
              onClick={handleReddit}
              className="py-2.5 rounded-xl text-sm font-bold text-white bg-orange-600 hover:bg-orange-500 transition-all"
            >
              Reddit
            </button>
            <button
              onClick={handleCopyText}
              className={
                "py-2.5 rounded-xl text-sm font-bold border transition-all " +
                (copied
                  ? "bg-green-500/20 border-green-400/40 text-green-300"
                  : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10")
              }
            >
              {copied ? "Copied!" : "Copy Text"}
            </button>
          </div>

          <button
            onClick={handleShareDevice}
            disabled={busyAction === "device"}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50"
          >
            {busyAction === "device" ? "Preparing image…" : "Share via Device"}
          </button>

          <button
            onClick={handleDownload}
            disabled={busyAction === "download"}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-all disabled:opacity-50"
          >
            {busyAction === "download" ? "Generating…" : "Download image"}
          </button>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>

        <button
          onClick={onClose}
          className="w-full text-center text-xs text-white/30 hover:text-white/60 transition"
        >
          Close
        </button>
      </div>
    </div>
  );

  const rootModal = typeof document !== "undefined" ? document.getElementById("overlay-root") : null;
  return rootModal ? ReactDOM.createPortal(overlayContent, rootModal) : overlayContent;
}

ShareCardModal.propTypes = {
  player: PropTypes.shape({
    name: PropTypes.string,
    avatar: PropTypes.string,
    level: PropTypes.number,
    stats: PropTypes.object,
  }),
  variant: PropTypes.oneOf(["leaderboard", "victory"]),
  rank: PropTypes.number,
  totalPlayers: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
