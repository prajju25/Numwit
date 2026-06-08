import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { UserProvider } from "./contexts/UserContext";
import { GameProvider } from "./contexts/GameContext";

const root = document.getElementById("root");

createRoot(root).render(
  <UserProvider>
    <GameProvider>
      <App />
    </GameProvider>
  </UserProvider>
);
