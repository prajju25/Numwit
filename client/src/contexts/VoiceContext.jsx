/**
 * VoiceContext.jsx — WebRTC voice chat for Numwit
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses native RTCPeerConnection (no external library needed).
 * Socket.IO handles signaling; audio flows directly peer-to-peer.
 *
 * Architecture:
 *   - New joiner receives voice_existing_peers → sends WebRTC OFFER to each
 *   - Existing members receive voice_peer_joined → wait for incoming offer
 *   - Each peer pair: initiator sends offer, responder sends answer
 *   - ICE candidates buffered until remote description is set (avoids race)
 *   - Speaking detection via AudioContext AnalyserNode (no server involvement)
 *   - Playback via hidden HTMLAudioElement per peer (autoplay)
 *   - Mute = track.enabled = false (no renegotiation needed, instant)
 */

import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState,
} from "react";
import PropTypes from "prop-types";
import socket from "../socket";

const VoiceContext = createContext(null);

// Public STUN servers — sufficient for ~95% of networks.
// Add TURN server here for corporate/symmetric-NAT users (production).
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// Speaking detection threshold — tune between 8 (very sensitive) and 25 (shouting only)
const SPEAKING_THRESHOLD = 12;
// How often to poll the analyser (ms) — 80ms ≈ good balance of accuracy vs CPU
const SPEAKING_POLL_MS   = 80;

// ── createSpeakingDetector ─────────────────────────────────────────────────────
// Attaches an AudioContext analyser to a MediaStream and calls onSpeaking(bool)
// when the speaking state changes. Returns a cleanup function.
function createSpeakingDetector(stream, onSpeaking) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !stream?.active) return () => {};

    const ctx      = new AudioCtx();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    let rafId, lastCheck = 0, lastSpeaking = false;

    const poll = (ts) => {
      rafId = requestAnimationFrame(poll);
      if (ts - lastCheck < SPEAKING_POLL_MS) return;
      lastCheck = ts;
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
      const isSpeaking = avg > SPEAKING_THRESHOLD;
      if (isSpeaking !== lastSpeaking) {
        lastSpeaking = isSpeaking;
        onSpeaking(isSpeaking);
      }
    };
    rafId = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(rafId);
      // Teardown can run after the AudioContext is already closed (e.g. the
      // tab is backgrounded) — that's expected, not an error worth surfacing.
      try { source.disconnect(); ctx.close(); } catch (_) {}
    };
  } catch (_) {
    // AudioContext/analyser setup can fail (no mic permissions, no Web Audio
    // support, stream already ended) — speaking detection is a non-essential
    // nicety, so just skip it rather than disrupting the call.
    return () => {};
  }
}

// ── VoiceProvider ──────────────────────────────────────────────────────────────
export function VoiceProvider({ children, roomId }) {
  // ── Reactive state (drives UI) ──────────────────────────────────────────────
  const [joined,        setJoined]        = useState(false);
  const [isMuted,       setIsMuted]       = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [error,         setError]         = useState(null);
  // peers: { [socketId]: { speaking: bool, muted: bool, connected: bool } }
  const [peers,         setPeers]         = useState({});

  // ── Mutable refs — never trigger re-renders ─────────────────────────────────
  const localStream     = useRef(null);   // local MediaStream
  const pcs             = useRef({});     // socketId → RTCPeerConnection
  const audioEls        = useRef({});     // socketId → HTMLAudioElement (remote playback)
  const pendingIce      = useRef({});     // socketId → RTCIceCandidate[] (buffered)
  const speakingCleanup = useRef({});     // socketId → cleanup fn (remote detectors)
  const localCleanup    = useRef(null);   // local speaking detector cleanup

  // ── updatePeer — merge partial update into a specific peer ──────────────────
  const updatePeer = useCallback((socketId, patch) => {
    setPeers(prev => ({
      ...prev,
      [socketId]: {
        speaking: false, muted: false, connected: false,
        ...prev[socketId],
        ...patch,
      },
    }));
  }, []);

  // ── destroyPeer — close connection, free audio resources ───────────────────
  const destroyPeer = useCallback((socketId) => {
    // Close RTCPeerConnection
    pcs.current[socketId]?.close();
    delete pcs.current[socketId];
    delete pendingIce.current[socketId];

    // Stop remote audio playback
    const el = audioEls.current[socketId];
    if (el) {
      el.srcObject = null;
      el.pause();
      delete audioEls.current[socketId];
    }

    // Stop speaking detector
    speakingCleanup.current[socketId]?.();
    delete speakingCleanup.current[socketId];

    // Remove from UI state
    setPeers(prev => {
      const next = { ...prev };
      delete next[socketId];
      return next;
    });
  }, []);

  // ── flushPendingIce — add buffered ICE candidates once remoteDesc is set ───
  const flushPendingIce = useCallback(async (socketId) => {
    const pc = pcs.current[socketId];
    if (!pc || !pc.remoteDescription) return;
    const buffered = pendingIce.current[socketId] || [];
    for (const candidate of buffered) {
      // A buffered candidate can fail to add if the connection was already
      // closed/renegotiated in the meantime — benign and expected under
      // normal WebRTC churn, not worth surfacing per-candidate.
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    }
    pendingIce.current[socketId] = [];
  }, []);

  // ── createPeerConnection — wire up a WebRTC connection to a peer ────────────
  const createPC = useCallback((peerId) => {
    // Tear down any previous connection to this peer (e.g. reconnect scenario)
    if (pcs.current[peerId]) {
      pcs.current[peerId].close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcs.current[peerId] = pc;
    pendingIce.current[peerId] = [];

    // Attach our local audio tracks to this connection
    if (localStream.current) {
      localStream.current.getTracks().forEach(track =>
        pc.addTrack(track, localStream.current)
      );
    }

    // ICE: relay candidates via the signaling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit("voice_ice", { to: peerId, candidate });
      }
    };

    // Remote audio stream arrived — wire to an Audio element for playback
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;

      // Create (or reuse) a hidden Audio element for this peer
      let el = audioEls.current[peerId];
      if (!el) {
        el = document.createElement("audio");
        el.autoplay = true;
        // Muted = false so we hear them; this is their REMOTE stream, not ours
        audioEls.current[peerId] = el;
      }
      el.srcObject = stream;

      // Speaking detection for this remote peer
      speakingCleanup.current[peerId]?.();
      speakingCleanup.current[peerId] = createSpeakingDetector(stream, (speaking) => {
        setPeers(prev =>
          prev[peerId]
            ? { ...prev, [peerId]: { ...prev[peerId], speaking } }
            : prev
        );
      });

      updatePeer(peerId, { connected: true });
    };

    // Connection state changes — clean up failed connections
    pc.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        // Don't destroy on temporary "disconnected" — it may recover
        if (pc.connectionState === "failed") {
          destroyPeer(peerId);
        }
      }
    };

    return pc;
  }, [destroyPeer, updatePeer]);

  // ── Socket event handlers — registered only while joined ───────────────────
  useEffect(() => {
    if (!joined) return;

    // We are the new joiner → server gave us the list of existing voice members
    // plus their current mute states. We initiate offers to each of them.
    const onExistingPeers = async ({ peers: existingIds, muteMap = {} }) => {
      for (const peerId of existingIds) {
        // Apply the known mute state immediately — avoids showing everyone as
        // unmuted until the next voice_peer_muted event arrives (BUG-015 fix).
        updatePeer(peerId, { muted: !!muteMap[peerId] });
        const pc = createPC(peerId);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("voice_offer", { to: peerId, offer: pc.localDescription });
        } catch (e) {
          console.error("[voice] Failed to create offer for", peerId, e);
        }
      }
    };

    // A new peer joined while we were already in voice.
    // They will send us an offer; just show them as "connecting" in the UI.
    const onPeerJoined = ({ socketId }) => {
      updatePeer(socketId, {}); // placeholder — connection incoming
    };

    // Received a WebRTC offer → create connection, answer it
    const onOffer = async ({ from, offer }) => {
      let pc = pcs.current[from];
      if (!pc) {
        updatePeer(from, {});
        pc = createPC(from);
      }
      try {
        // Guard against invalid state transitions
        if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingIce(from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("voice_answer", { to: from, answer: pc.localDescription });
      } catch (e) {
        console.error("[voice] Failed to answer offer from", from, e);
      }
    };

    // Received a WebRTC answer to our offer → complete the handshake
    const onAnswer = async ({ from, answer }) => {
      const pc = pcs.current[from];
      if (!pc) return;
      try {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingIce(from);
        }
      } catch (e) {
        console.error("[voice] Failed to set remote answer from", from, e);
      }
    };

    // ICE candidate from a peer — add immediately or buffer if remoteDesc not set yet
    const onIce = ({ from, candidate }) => {
      if (!candidate) return;
      const pc = pcs.current[from];
      if (!pc) return;

      if (pc.remoteDescription?.type) {
        // Remote description set — add immediately
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        // Buffer until setRemoteDescription completes
        if (!pendingIce.current[from]) pendingIce.current[from] = [];
        pendingIce.current[from].push(candidate);
      }
    };

    // A peer toggled their microphone
    const onPeerMuted = ({ socketId, muted }) => {
      setPeers(prev =>
        prev[socketId]
          ? { ...prev, [socketId]: { ...prev[socketId], muted } }
          : prev
      );
    };

    // A peer left voice chat
    const onPeerLeft = ({ socketId }) => {
      destroyPeer(socketId);
    };

    socket.on("voice_existing_peers", onExistingPeers);
    socket.on("voice_peer_joined",    onPeerJoined);
    socket.on("voice_offer",          onOffer);
    socket.on("voice_answer",         onAnswer);
    socket.on("voice_ice",            onIce);
    socket.on("voice_peer_muted",     onPeerMuted);
    socket.on("voice_peer_left",      onPeerLeft);

    // Emit AFTER all handlers are registered — the server responds immediately
    // with voice_existing_peers, so the handler must be listening first.
    socket.emit("voice_ready", { roomId });

    return () => {
      socket.off("voice_existing_peers", onExistingPeers);
      socket.off("voice_peer_joined",    onPeerJoined);
      socket.off("voice_offer",          onOffer);
      socket.off("voice_answer",         onAnswer);
      socket.off("voice_ice",            onIce);
      socket.off("voice_peer_muted",     onPeerMuted);
      socket.off("voice_peer_left",      onPeerLeft);
    };
  }, [joined, createPC, destroyPeer, flushPendingIce, updatePeer, roomId]);

  // ── joinVoice — request mic access and enter voice ─────────────────────────
  const joinVoice = useCallback(async () => {
    if (joined) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("not_supported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,   // removes echo from speakers
          noiseSuppression: true,   // filters keyboard/background noise
          autoGainControl:  true,   // normalises volume levels
          channelCount: 1,          // mono — halves bandwidth
          sampleRate: 48000,        // standard WebRTC rate
        },
        video: false,
      });

      localStream.current = stream;
      setError(null);
      // Start tracking whether the local user is speaking
      localCleanup.current = createSpeakingDetector(stream, setLocalSpeaking);
      // setJoined(true) triggers the socket useEffect below, which registers
      // all handlers FIRST and only then emits voice_ready — so we never miss
      // the voice_existing_peers response that the server sends back immediately.
      setJoined(true);

    } catch (err) {
      const denied = ["NotAllowedError", "PermissionDeniedError", "NotFoundError"];
      setError(denied.includes(err.name) ? "permission_denied" : "unavailable");
    }
  }, [joined]);

  // ── leaveVoice — stop mic and tear down all peer connections ───────────────
  const leaveVoice = useCallback(() => {
    if (!joined) return;

    socket.emit("voice_leave", { roomId });

    // Destroy all peer connections
    Object.keys(pcs.current).forEach(destroyPeer);

    // Stop local microphone
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;

    // Stop local speaking detector
    localCleanup.current?.();
    localCleanup.current = null;

    setJoined(false);
    setIsMuted(false);
    setLocalSpeaking(false);
    setPeers({});
  }, [joined, roomId, destroyPeer]);

  // ── toggleMute — enable/disable local audio track instantly ────────────────
  const toggleMute = useCallback(() => {
    if (!localStream.current) return;
    setIsMuted(prev => {
      const newMuted = !prev;
      localStream.current.getAudioTracks().forEach(t => {
        t.enabled = !newMuted; // false = muted
      });
      socket.emit("voice_mute", { roomId, muted: newMuted });
      return newMuted;
    });
  }, [roomId]);

  // ── Cleanup on unmount (page navigation, disconnect) ───────────────────────
  useEffect(() => {
    return () => {
      if (localStream.current) {
        socket.emit("voice_leave", { roomId });
        Object.values(pcs.current).forEach(pc => pc?.close());
        localStream.current.getTracks().forEach(t => t.stop());
        localCleanup.current?.();
        Object.values(speakingCleanup.current).forEach(fn => fn?.());
        Object.values(audioEls.current).forEach(el => { el.srcObject = null; });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    joined,
    isMuted,
    localSpeaking,
    error,
    peers,       // { [socketId]: { speaking, muted, connected } }
    joinVoice,
    leaveVoice,
    toggleMute,
  }), [joined, isMuted, localSpeaking, error, peers, joinVoice, leaveVoice, toggleMute]);

  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  );
}

VoiceProvider.propTypes = {
  children: PropTypes.node.isRequired,
  roomId:   PropTypes.string,
};

export const useVoice = () => useContext(VoiceContext);
