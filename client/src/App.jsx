import React, { useEffect, useState } from "react";
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

  // Landing page: shown to visitors who haven't started yet and aren't deep-linking into a room
  // Once they click "Play Now" we flip this flag and show Login.
  const [showLanding, setShowLanding] = useState(() => {
    // If they arrived via a room link (/some-room-id) skip the landing
    const path = window.location.pathname.replace("/", "").trim();
    return !path;
  });

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
    socket.on("disconnect", () => {
      console.warn("⚠️ Socket disconnected");
      resetGame();
      resetUser();
    });

    return () => {
      socket.off("error_message");
      socket.off("disconnect");
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

      {/* Landing page */}
      {showLandingPage && (
        <LandingPage onPlay={() => setShowLanding(false)} />
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
            {(showWaiting || showGame) && user && (
              <div className="flex items-center gap-2">
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
              </div>
            )}
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
