import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { UserProvider } from "./contexts/UserContext";
import { GameProvider } from "./contexts/GameContext";

const root = document.getElementById("root");

// Service worker = installable as an app (production builds only, so it never
// interferes with webpack-dev-server).
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(root).render(
  <UserProvider>
    <GameProvider>
      <App />
    </GameProvider>
  </UserProvider>
);
