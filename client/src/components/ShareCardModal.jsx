import React, { useRef, useState } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import PlayerStatCard from "./PlayerStatCard";
import { SITE_URL } from "../hooks/usePageMeta";
import { track } from "../services/analytics";

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
function buildShareText({ name, level, stats, variant, title }) {
  const s = stats || {};
  if (variant === "victory") {
    const as = title ? `${name} — ${title.icon} ${title.name}` : name;
    return `🎉 Just won a game of Numwit as ${as}! Level ${level} · ${s.gamesWon ?? 0} wins · ${s.bestStreak ?? 0}-win best streak. Can you beat me?`;
  }
  return `🧠 I'm Level ${level} on Numwit with ${s.gamesWon ?? 0} wins and a ${s.bestStreak ?? 0}-win best streak. Can you beat me?`;
}

const EXPORT_WIDTH = 1080;

export default function ShareCardModal({ player, variant, rank, totalPlayers, title, onClose }) {
  const cardRef = useRef(null);
  const [busyAction, setBusyAction] = useState(null); // "device" | "download" | null
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const { name, avatar, level, stats } = player || {};
  // Always the canonical domain, even when played via numwit.fly.dev or localhost
  const shareUrl  = SITE_URL;
  const shareText = buildShareText({ name, level, stats, variant, title });

  const openShareWindow = (url) => {
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const shared = (method) => track("share", { method, variant });

  const handlePostX = () => {
    shared("x");
    openShareWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`);
  };

  const handleFacebook = () => {
    shared("facebook");
    openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`);
  };

  const handleReddit = () => {
    shared("reddit");
    openShareWindow(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`);
  };

  const handleCopyText = () => {
    shared("copy_text");
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
    // Export at 1080px wide (→ 1080×1350 for the 4:5 card) whatever the
    // on-screen size, and leave out the animated sheen overlay.
    const width = cardRef.current.offsetWidth || 360;
    return toPng(cardRef.current, {
      pixelRatio: EXPORT_WIDTH / width,
      filter: (node) => !node.classList?.contains("nw-sheen"),
    });
  };

  const handleDownload = async () => {
    shared("download");
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
    shared("device");
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
    <div className="fixed inset-0 z-50 bg-[#05060D]/80 backdrop-blur-md flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto nw-fade">
      <div className="w-full max-w-[360px] flex flex-col items-center gap-4 nw-rise">
        <PlayerStatCard
          ref={cardRef}
          name={name}
          avatar={avatar}
          level={level}
          stats={stats}
          variant={variant}
          rank={rank}
          totalPlayers={totalPlayers}
          title={title}
        />

        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={handleShareDevice}
            disabled={busyAction === "device"}
            className="btn-gold w-full h-14 text-base disabled:opacity-60"
          >
            {busyAction === "device" ? "Preparing image…" : "Share via Device"}
          </button>

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={handlePostX}
              className="h-11 rounded-xl text-xs font-bold text-white bg-black border border-white/20 hover:bg-white/10 transition-all"
            >
              Post on X
            </button>
            <button
              onClick={handleFacebook}
              className="h-11 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all"
            >
              Facebook
            </button>
            <button
              onClick={handleReddit}
              className="h-11 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 transition-all"
            >
              Reddit
            </button>
            <button
              onClick={handleCopyText}
              className={
                "h-11 rounded-xl text-xs font-bold border transition-all " +
                (copied
                  ? "bg-green-500/20 border-green-400/40 text-green-300"
                  : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10")
              }
            >
              {copied ? "Copied!" : "Copy Text"}
            </button>
          </div>

          <button
            onClick={handleDownload}
            disabled={busyAction === "download"}
            className="w-full h-11 rounded-xl text-sm font-semibold text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.03] transition-all disabled:opacity-50"
          >
            {busyAction === "download" ? "Generating…" : "Download image"}
          </button>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>

        <button
          onClick={onClose}
          className="w-full min-h-[44px] text-center text-sm text-white/45 hover:text-white/75 transition"
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
  // This game's title, for the victory card (services/titles.js)
  title: PropTypes.shape({ name: PropTypes.string, icon: PropTypes.string }),
  onClose: PropTypes.func.isRequired,
};
