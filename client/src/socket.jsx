import { io } from "socket.io-client";

// In dev, webpack proxies /socket.io → localhost:5000 (see webpack.config.js).
// In production, client is served by the same Express server.
// Never hardcode localhost:5000 — that bypasses the proxy.
const socket = io(window.location.origin, { path: "/socket.io" });

socket.on("connect", () => {
  console.debug("✅ Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.warn("🔌 Socket disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
});

export default socket;
