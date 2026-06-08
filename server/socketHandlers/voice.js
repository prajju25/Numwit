/**
 * voice.js — WebRTC signaling handler
 * ─────────────────────────────────────────────────────────────────────────────
 * The server NEVER touches audio. It only relays tiny signaling messages
 * (SDP offers/answers + ICE candidates) so browsers can find each other and
 * establish direct peer-to-peer audio connections.
 *
 * Socket events (client → server):
 *   voice_ready    { roomId }                  — player wants to join voice
 *   voice_offer    { to, offer }               — WebRTC offer for a specific peer
 *   voice_answer   { to, answer }              — WebRTC answer back to offerer
 *   voice_ice      { to, candidate }           — ICE candidate for a peer
 *   voice_mute     { roomId, muted }           — broadcast my mute state
 *   voice_leave    { roomId }                  — voluntary leave
 *
 * Socket events (server → client):
 *   voice_existing_peers { peers: [socketId] } — sent to new joiner only
 *   voice_peer_joined    { socketId }          — new peer arrived (to others)
 *   voice_offer          { from, offer }       — relayed offer
 *   voice_answer         { from, answer }      — relayed answer
 *   voice_ice            { from, candidate }   — relayed ICE candidate
 *   voice_peer_muted     { socketId, muted }   — peer toggled mute
 *   voice_peer_left      { socketId }          — peer left voice
 */

// In-memory: roomId → Set<socketId> of current voice participants.
// Resets on server restart (acceptable — clients re-join on reconnect).
const voiceRooms = new Map();

// In-memory: roomId → Map<socketId, boolean> — tracks each participant's mute state.
// Sent to new joiners so they see correct mute indicators immediately (BUG-015 fix).
const voiceMutes = new Map();

module.exports = function handleVoiceEvents(io, socket) {

  // ── voice_ready ─────────────────────────────────────────────────────────────
  // A player has mic access and wants to join voice for their room.
  // 1. Tell them who's already in voice → they will send offers to each.
  // 2. Tell everyone else that a new voice peer arrived.
  socket.on("voice_ready", ({ roomId }) => {
    if (!roomId) return;

    const roomPeers = voiceRooms.get(roomId) || new Set();
    const existing = Array.from(roomPeers).filter(id => id !== socket.id);

    // Build a mute map so the new joiner sees correct mute state immediately.
    const muteMap = {};
    const roomMutes = voiceMutes.get(roomId) || new Map();
    existing.forEach(id => { muteMap[id] = roomMutes.get(id) || false; });

    // Send existing peer list + their mute states to the new joiner only
    socket.emit("voice_existing_peers", { peers: existing, muteMap });

    // Notify existing voice participants about the new joiner
    existing.forEach(peerId => {
      io.to(peerId).emit("voice_peer_joined", { socketId: socket.id });
    });

    // Track this socket in the voice room
    if (!voiceRooms.has(roomId)) voiceRooms.set(roomId, new Set());
    voiceRooms.get(roomId).add(socket.id);

    // Initialize mute state for this socket (default: unmuted)
    if (!voiceMutes.has(roomId)) voiceMutes.set(roomId, new Map());
    voiceMutes.get(roomId).set(socket.id, false);

    // Remember which room this socket is in (for disconnect cleanup)
    socket._voiceRoomId = roomId;

    console.debug(`[voice] ${socket.id} joined room ${roomId} — ${existing.length} existing peer(s)`);
  });

  // ── Signaling relay ─────────────────────────────────────────────────────────
  // Forward offer/answer/ICE directly to the target socket.
  // We validate that `to` is a real connected socket to prevent spoofing.

  socket.on("voice_offer", ({ to, offer }) => {
    if (!to || !offer) return;
    io.to(to).emit("voice_offer", { from: socket.id, offer });
  });

  socket.on("voice_answer", ({ to, answer }) => {
    if (!to || !answer) return;
    io.to(to).emit("voice_answer", { from: socket.id, answer });
  });

  socket.on("voice_ice", ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit("voice_ice", { from: socket.id, candidate });
  });

  // ── voice_mute ──────────────────────────────────────────────────────────────
  // Broadcast mute/unmute state to everyone else in the room.
  socket.on("voice_mute", ({ roomId, muted }) => {
    if (!roomId) return;
    // Persist mute state so new joiners receive it via voice_existing_peers
    const roomMutes = voiceMutes.get(roomId);
    if (roomMutes) roomMutes.set(socket.id, !!muted);
    socket.to(roomId).emit("voice_peer_muted", { socketId: socket.id, muted: !!muted });
    console.debug(`[voice] ${socket.id} ${muted ? "muted" : "unmuted"} in room ${roomId}`);
  });

  // ── voice_leave ─────────────────────────────────────────────────────────────
  // Player explicitly left voice (e.g. clicked "Leave voice").
  socket.on("voice_leave", ({ roomId }) => {
    if (!roomId) return;
    removeFromVoice(socket, roomId);
  });

  // ── disconnect ──────────────────────────────────────────────────────────────
  // Handles tab close, network drop, page refresh — anything that kills the socket.
  socket.on("disconnect", () => {
    const roomId = socket._voiceRoomId;
    if (roomId) removeFromVoice(socket, roomId);
  });

  // ── helpers ──────────────────────────────────────────────────────────────────
  function removeFromVoice(socket, roomId) {
    const members = voiceRooms.get(roomId);
    if (!members || !members.has(socket.id)) return;

    members.delete(socket.id);
    if (members.size === 0) {
      voiceRooms.delete(roomId);
      voiceMutes.delete(roomId);
    } else {
      // Remove this socket's mute state
      const roomMutes = voiceMutes.get(roomId);
      if (roomMutes) roomMutes.delete(socket.id);
    }

    // Tell remaining voice members this peer left
    members.forEach(peerId => {
      io.to(peerId).emit("voice_peer_left", { socketId: socket.id });
    });

    socket._voiceRoomId = null;
    console.debug(`[voice] ${socket.id} left room ${roomId} — ${members.size} remaining`);
  }
};
