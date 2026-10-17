import React, { useEffect, useRef, useState } from "react";
import { useUser } from "./contexts/UserContext";
import Login from "./components/Login";
import LandingPage from "./components/LandingPage";
import GameBoard from "./components/GameBoard";
import WaitingRoom from "./components/WaitingRoom";
import { twMerge } from "tailwind-merge";
import socket from "./socket";
import FloatingAlert from "./modals/FloatingAlert";
import { useGame } from "./contexts/GameContext";
import { NumwitRuleProvider } from "./contexts/NumwitRuleContext";
import { ChatProvider } from "./contexts/ChatContext";
import { SoundProvider, useSound } from "./contexts/SoundContext";
import { VoiceProvider } from "./contexts/VoiceContext";
import AchievementToast from "./components/AchievementToast";
import FeedbackWidget from "./components/FeedbackWidget";
import LeaderboardPage from "./components/LeaderboardPage";
import BrandMark from "./components/BrandMark";
import ProfileMenu from "./components/ProfileMenu";
import usePageMeta from "./hooks/usePageMeta";
import { track, trackView } from "./services/analytics";

// Mute toggle button — reads from SoundContext
function MuteButton() {
  const { muted, toggleMute } = useSound();
  return (
    <button
      onClick={toggleMute}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 transition-all duration-200"
      aria-label={muted ? "Unmute" : "Mute"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5L6 9H3v6h3l5 4V5z" />
        {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </button>
  );
}

function AppInner() {
  const {
    hasStarted,
    user,
    isInGame,
    isWaitingRoom,
    roomId,
    setRoomId,
    setRoomType,
    resetUser,
    isJoiningRoom,
    roomType,
    deviceId,
  } = useUser();
  const { resetGame } = useGame();
  const [error, setError] = useState({ isError: false, message: null });

  // Reconnecting: true while the socket is mid-disconnect but we're giving the
  // server's 60s grace period (see lobby.js DISCONNECT_GRACE_MS) a chance to
  // work — e.g. a mobile user who backgrounds the tab to share the room link
  // via WhatsApp. We deliberately do NOT clear game/user state the instant the
  // socket drops; doing so used to kick the user straight back to the home
  // screen before the browser even had a chance to reconnect.
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectFallbackTimer = useRef(null);
  // Mirrors the latest session info so the socket listeners below (registered
  // once on mount) always see current values without having to re-subscribe.
  const sessionRef = useRef({});

  // Landing page: shown to visitors who haven't started yet and aren't deep-linking into a room
  // Once they click "Play Now" we flip this flag and show Login.
  const [showLanding, setShowLanding] = useState(() => {
    const path = window.location.pathname.replace("/", "").trim();
    return !path && path !== "leaderboard";
  });
  const [showLeaderboard, setShowLeaderboard] = useState(() => {
    return window.location.pathname.replace("/", "").trim() === "leaderboard";
  });

  // Keep sessionRef current so the listeners below (registered once) can read
  // the latest room/user state without re-subscribing on every change.
  useEffect(() => {
    sessionRef.current = { roomId, user, roomType, deviceId, isWaitingRoom, isInGame };
  }, [roomId, user, roomType, deviceId, isWaitingRoom, isInGame]);

  useEffect(() => {
    const path = window.location.pathname.replace("/", "").trim();
    if (path?.length >= 6) {
      setRoomType("private");
      setRoomId(path);
      setShowLanding(false); // direct room link → skip landing
    }

    socket.on("error_message", (err) => {
      if (err.message) setError({ isError: true, message: err.message });
    });

    socket.on("disconnect", (reason) => {
      console.warn("⚠️ Socket disconnected:", reason);
      const { isWaitingRoom: w, isInGame: g, roomId: r } = sessionRef.current;

      // Mid-session drop (waiting room or active game): give the server's
      // grace period a chance — socket.io will auto-reconnect on its own.
      // Don't touch game/user state yet, just show a "reconnecting" banner.
      if ((w || g) && r) {
        setReconnecting(true);
        reconnectFallbackTimer.current = setTimeout(() => {
          console.warn("Reconnect window expired — returning to home");
          setReconnecting(false);
          resetGame();
          resetUser();
        }, 65000); // slightly longer than the server's 60s DISCONNECT_GRACE_MS
      } else {
        resetGame();
        resetUser();
      }
    });

    socket.on("connect", () => {
      if (reconnectFallbackTimer.current) {
        clearTimeout(reconnectFallbackTimer.current);
        reconnectFallbackTimer.current = null;
      }
      setReconnecting((wasReconnecting) => {
        if (wasReconnecting) {
          const { roomId: r, user: u, roomType: rt, deviceId: d } = sessionRef.current;
          if (r && u) {
            console.log("Reconnected — rejoining room", r);
            socket.emit("join_room", { roomId: r, user: u, roomType: rt, deviceId: d });
          }
        }
        return false;
      });
    });

    return () => {
      socket.off("error_message");
      socket.off("disconnect");
      socket.off("connect");
      if (reconnectFallbackTimer.current) clearTimeout(reconnectFallbackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (hasStarted && isWaitingRoom && user && roomType === "private" && roomId) {
      socket.emit("join_room", { roomId, user, roomType, deviceId });
    }
    socket.once("error_message", (err) => {
      if (err.message) resetUser();
    });
  }, [hasStarted, isWaitingRoom, user, roomType, roomId]);

  const showLogin = !user || !hasStarted;
  const showWaiting = hasStarted && isWaitingRoom && !isInGame;
  const showGame = hasStarted && isInGame;

  // Landing page: only shown when nothing else is active and user chose to see it
  const showLandingPage = showLanding && showLogin && !isJoiningRoom;

  // Analytics screens owned here; the room picker, invite form, game and
  // results report themselves (see services/analytics.js for the list)
  const analyticsView = showLeaderboard ? ["/leaderboard", "Leaderboard"]
    : showWaiting ? ["/play/waiting", "Waiting room"]
    : showLandingPage ? ["/", "Home"]
    : null;
  useEffect(() => {
    if (analyticsView) trackView(analyticsView[0], analyticsView[1]);
  }, [analyticsView?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab title + canonical URL for the current view
  usePageMeta(
    showLeaderboard ? "Leaderboard"
      : showGame ? "In game"
      : showWaiting ? "Waiting room"
      : null,
    showLeaderboard ? "/leaderboard" : "/"
  );

  // Leave the current room (if any) and return to the home/landing page.
  // Used both by the "Leave Room" button and by clicking the Numwit logo.
  const goHome = () => {
    if (showWaiting || showGame) {
      socket.emit("leave_room");
    }
    resetGame();
    resetUser();
    setShowLanding(true);
    setShowLeaderboard(false);
    window.history.pushState({}, "", "/");
  };

  const openLeaderboard = () => {
    setShowLeaderboard(true);
    setShowLanding(false);
    window.history.pushState({}, "", "/leaderboard");
  };

  const closeLeaderboard = () => {
    setShowLeaderboard(false);
    setShowLanding(true);
    window.history.pushState({}, "", "/");
  };

  // Leaderboard "Play Now" — same as the home page's Play now
  const playFromLeaderboard = () => {
    track("play_click", { source: "leaderboard" });
    setShowLeaderboard(false);
    setShowLanding(false);
    window.history.pushState({}, "", "/");
  };

  return (
    <div className={twMerge(
      "min-h-screen w-full flex flex-col items-center",
      showLandingPage ? "" : "justify-center"
    )}>
      {error.isError && (
        <FloatingAlert
          message={error.message}
          onClose={() => setError({ isError: true, message: null })}
        />
      )}

      {reconnecting && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-amber-200 border border-amber-400/30 shadow-lg nw-fade"
          style={{ background: "rgba(120,53,15,0.85)", backdropFilter: "blur(10px)" }}
        >
          <span className="animate-spin">🔄</span> Reconnecting…
        </div>
      )}

      {/* Leaderboard page */}
      {showLeaderboard && (
        <LeaderboardPage onBack={closeLeaderboard} onPlay={playFromLeaderboard} />
      )}

      {/* Landing page */}
      {showLandingPage && !showLeaderboard && (
        <LandingPage onPlay={() => setShowLanding(false)} onLeaderboard={openLeaderboard} />
      )}

      {/* After "Play Now" — normal app flow */}
      {!showLandingPage && (
        <div className="min-h-screen w-full flex flex-col items-center px-4 sm:px-8">
          {/* Sticky top navbar */}
          <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b border-white/[0.07]"
            style={{ background: "rgba(11,14,28,0.78)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}
          >
            <h1
              onClick={goHome}
              role="button"
              title="Back to home"
              className="font-display text-lg sm:text-xl font-bold text-white flex items-center gap-2 cursor-pointer select-none"
            >
              <BrandMark size={40} />
              <span>Numwit</span>
            </h1>
            <div className="flex items-center gap-2">
              {/* Leaderboard button — always visible in the non-landing flow */}
              {!showWaiting && !showGame && <ProfileMenu />}
              {!showWaiting && !showGame && (
                <button
                  onClick={openLeaderboard}
                  title="View leaderboard"
                  className="text-sm font-semibold px-3 h-10 sm:h-11 rounded-xl bg-white/5 hover:bg-amber-500/15 hover:text-amber-200 border border-white/10 transition-all duration-200"
                >
                  🏆 Leaderboard
                </button>
              )}
              {(showWaiting || showGame) && user && (
                <>
                  <button
                    onClick={goHome}
                    title="Leave room"
                    aria-label="Leave room"
                    className="text-sm font-semibold px-3 h-10 sm:h-11 rounded-xl bg-white/5 text-red-300 hover:bg-red-500/15 border border-white/10 transition-all duration-200"
                  >
                    🚪 Leave
                  </button>
                  <MuteButton />
                  {/* Rename works mid-game too (server updates the room) */}
                  <ProfileMenu />
                </>
              )}
            </div>
          </header>

          {/* Page content — padded below navbar */}
          <main className={twMerge(
            "flex items-start sm:items-center justify-center w-full mx-auto pt-20 sm:pt-24 pb-8 min-h-screen",
            showGame ? "max-w-6xl" : "max-w-2xl"
          )}>
            {/* Not while the leaderboard is open: Login *is* the play flow (quick
                start begins a game, returning players get the room picker) */}
            {showLogin && !showLeaderboard && <Login onCancel={goHome} />}
            {/* VoiceProvider and ChatProvider are single instances wrapping both
                screens so peer connections and the chat log survive the
                WaitingRoom → GameBoard transition. */}
            {(showWaiting || showGame) && (
              <VoiceProvider roomId={roomId}>
                <ChatProvider>
                  {showWaiting && <WaitingRoom />}
                  {showGame && (
                    <NumwitRuleProvider>
                      <GameBoard />
                    </NumwitRuleProvider>
                  )}
                </ChatProvider>
              </VoiceProvider>
            )}
            {isJoiningRoom && (
              <div className="text-center animate-pulse text-lg text-white/60 self-center">
                Joining room…
              </div>
            )}
          </main>
        </div>
      )}

      <AchievementToast />
      <FeedbackWidget />
    </div>
  );
}

function App() {
  return (
    <SoundProvider>
      <AppInner />
    </SoundProvider>
  );
}

export default App;
