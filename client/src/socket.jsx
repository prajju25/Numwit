import { io } from "socket.io-client";

// In dev, webpack proxies /socket.io → localhost:5000 (see webpack.config.js).
// In production, client is served by the same Express server.
// Never hardcode localhost:5000 — that bypasses the proxy.
// Connect straight over WebSocket: one connection per player instead of HTTP
// polling followed by an upgrade, which is much cheaper on the server when many
// people arrive at once. Networks that block WebSockets fall back to polling.
const socket = io(window.location.origin, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  tryAllTransports: true,
});

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
