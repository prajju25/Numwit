import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { UserProvider } from "./contexts/UserContext";
import { GameProvider } from "./contexts/GameContext";
import { initAnalytics } from "./services/analytics";
import { initErrorReporting } from "./services/errorReporting";
import ErrorBoundary from "./components/ErrorBoundary";
import { guardDomAgainstTranslators } from "./services/domGuard";

guardDomAgainstTranslators(); // before React renders anything
initAnalytics();
initErrorReporting();

const root = document.getElementById("root");

// Service worker = installable as an app (production builds only, so it never
// interferes with webpack-dev-server). Some browsers refuse it (Firefox private
// windows, strict privacy settings); the game works the same without it, so
// that's a console warning, not a reported error.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker not registered:", err?.message || err));
  });
}

createRoot(root).render(
  <ErrorBoundary>
    <UserProvider>
      <GameProvider>
        <App />
      </GameProvider>
    </UserProvider>
  </ErrorBoundary>
);
