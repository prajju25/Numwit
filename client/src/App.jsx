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

// Mute toggle button — reads from SoundContext
function MuteButton() {
  const { muted, toggleMute } = useSound();
  return (
    <button
      onClick={toggleMute}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      className="text-xl p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-all duration-200"
      aria-label={muted ? "Unmute" : "Mute"}
    >
      {muted ? "🔇" : "🔊"}
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
    if (path && path.length >= 6) {
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
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-amber-200 border border-amber-400/30 shadow-lg animate-pulse"
          style={{ background: "rgba(120,53,15,0.85)", backdropFilter: "blur(10px)" }}
        >
          <span className="animate-spin">🔄</span> Reconnecting…
        </div>
      )}

      {/* Leaderboard page */}
      {showLeaderboard && (
        <LeaderboardPage onBack={closeLeaderboard} />
      )}

      {/* Landing page */}
      {showLandingPage && !showLeaderboard && (
        <LandingPage onPlay={() => setShowLanding(false)} onLeaderboard={openLeaderboard} />
      )}

      {/* After "Play Now" — normal app flow */}
      {!showLandingPage && (
        <div className="min-h-screen w-full flex flex-col items-center px-4 sm:px-8">
          {/* Sticky top navbar */}
          <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-3 border-b border-white/10"
            style={{ background: "rgba(26,26,46,0.85)", backdropFilter: "blur(20px)" }}
          >
            <h1
              onClick={goHome}
              role="button"
              title="Back to home"
              className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2 cursor-pointer select-none"
            >
              <span>🧠</span>
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Numwit
              </span>
            </h1>
            <div className="flex items-center gap-2">
              {/* Leaderboard button — always visible in the non-landing flow */}
              {!showWaiting && !showGame && (
                <button
                  onClick={openLeaderboard}
                  title="View leaderboard"
                  className="text-sm font-semibold px-3 py-2 rounded-full bg-white/10 hover:bg-yellow-500/20 hover:text-yellow-300 border border-white/10 transition-all duration-200"
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
                    className="text-sm font-semibold px-3 py-2 rounded-full bg-white/10 hover:bg-red-500/20 hover:text-red-300 border border-white/10 transition-all duration-200"
                  >
                    🚪 Leave
                  </button>
                  <MuteButton />
                  <div className="flex items-center gap-2 glass-card-sm px-3 py-1.5">
                    <span className="text-lg">{user.avatar}</span>
                    <span className="font-semibold text-white text-sm">{user.name}</span>
                  </div>
                </>
              )}
            </div>
          </header>

          {/* Page content — padded below navbar */}
          <main className="flex items-center justify-center w-full max-w-2xl mx-auto pt-24 pb-8 min-h-screen">
            {showLogin && <Login />}
            {/* VoiceProvider is a single instance wrapping both screens so
                peer connections survive the WaitingRoom → GameBoard transition. */}
            {(showWaiting || showGame) && (
              <VoiceProvider roomId={roomId}>
                {showWaiting && (
                  <ChatProvider>
                    <WaitingRoom />
                  </ChatProvider>
                )}
                {showGame && (
                  <NumwitRuleProvider>
                    <GameBoard />
                  </NumwitRuleProvider>
                )}
              </VoiceProvider>
            )}
            {isJoiningRoom && (
              <div className="text-center animate-pulse text-lg text-white/60">
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
