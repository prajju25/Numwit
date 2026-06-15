import React from "react";
import { renderHook, act } from "@testing-library/react";
import { VoiceProvider, useVoice } from "../VoiceContext";
import { __mockSocket } from "socket.io-client";

// ── Mock WebRTC primitives (not implemented in jsdom) ─────────────────────────
class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = "stable";
    this.connectionState = "new";
    this.tracks = [];
    this.onicecandidate = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    this.addIceCandidate = jest.fn(async (candidate) => {
      this._addedCandidates = this._addedCandidates || [];
      this._addedCandidates.push(candidate);
    });
    this.close = jest.fn(() => {
      this.connectionState = "closed";
    });
    MockRTCPeerConnection.instances.push(this);
  }

  addTrack(track, stream) {
    this.tracks.push({ track, stream });
  }

  async createOffer() {
    return { type: "offer", sdp: "offer-sdp" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "answer-sdp" };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
    this.signalingState = desc.type === "offer" ? "have-local-offer" : "stable";
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
    this.signalingState = desc.type === "offer" ? "have-remote-offer" : "stable";
  }
}
MockRTCPeerConnection.instances = [];

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeStream() {
  const track = { stop: jest.fn(), enabled: true, kind: "audio" };
  return {
    active: true,
    getTracks: jest.fn(() => [track]),
    getAudioTracks: jest.fn(() => [track]),
    _track: track,
  };
}

function wrapper({ children }) {
  return <VoiceProvider roomId="room1">{children}</VoiceProvider>;
}

beforeAll(() => {
  global.RTCPeerConnection = MockRTCPeerConnection;
  global.RTCIceCandidate = class {
    constructor(init) {
      Object.assign(this, init);
    }
  };
  global.RTCSessionDescription = class {
    constructor(init) {
      Object.assign(this, init);
    }
  };
  // jsdom doesn't implement media playback
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
});

describe("VoiceContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockRTCPeerConnection.instances = [];
    Object.keys(__mockSocket.__handlers).forEach((k) => delete __mockSocket.__handlers[k]);
    navigator.mediaDevices = { getUserMedia: jest.fn(() => Promise.resolve(makeStream())) };
  });

  test("starts with default unjoined state", () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    expect(result.current.joined).toBe(false);
    expect(result.current.isMuted).toBe(false);
    expect(result.current.localSpeaking).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.peers).toEqual({});
  });

  test("joinVoice sets not_supported error when getUserMedia is unavailable", async () => {
    navigator.mediaDevices = undefined;
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    expect(result.current.error).toBe("not_supported");
    expect(result.current.joined).toBe(false);
  });

  test("joinVoice sets permission_denied error on NotAllowedError", async () => {
    const err = new Error("denied");
    err.name = "NotAllowedError";
    navigator.mediaDevices = { getUserMedia: jest.fn(() => Promise.reject(err)) };

    const { result } = renderHook(() => useVoice(), { wrapper });
    await act(async () => {
      await result.current.joinVoice();
    });

    expect(result.current.error).toBe("permission_denied");
    expect(result.current.joined).toBe(false);
  });

  test("joinVoice sets unavailable error on other getUserMedia failures", async () => {
    const err = new Error("hardware issue");
    err.name = "SomeOtherError";
    navigator.mediaDevices = { getUserMedia: jest.fn(() => Promise.reject(err)) };

    const { result } = renderHook(() => useVoice(), { wrapper });
    await act(async () => {
      await result.current.joinVoice();
    });

    expect(result.current.error).toBe("unavailable");
    expect(result.current.joined).toBe(false);
  });

  test("joinVoice success sets joined=true, clears error, and emits voice_ready", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    expect(result.current.joined).toBe(true);
    expect(result.current.error).toBeNull();
    expect(__mockSocket.emit).toHaveBeenCalledWith("voice_ready", { roomId: "room1" });
  });

  test("joinVoice is a no-op when already joined", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });
    await act(async () => {
      await result.current.joinVoice();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  test("onExistingPeers creates a connection per peer, applies muteMap, and sends offers", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_existing_peers", {
        peers: ["p1", "p2"],
        muteMap: { p1: true },
      });
      await flushPromises();
    });

    expect(result.current.peers.p1.muted).toBe(true);
    expect(result.current.peers.p2.muted).toBe(false);
    expect(__mockSocket.emit).toHaveBeenCalledWith(
      "voice_offer",
      expect.objectContaining({ to: "p1" })
    );
    expect(__mockSocket.emit).toHaveBeenCalledWith(
      "voice_offer",
      expect.objectContaining({ to: "p2" })
    );
    expect(MockRTCPeerConnection.instances).toHaveLength(2);
  });

  test("onPeerJoined adds a placeholder peer entry", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    act(() => {
      __mockSocket.__trigger("voice_peer_joined", { socketId: "p3" });
    });

    expect(result.current.peers.p3).toEqual({ speaking: false, muted: false, connected: false });
  });

  test("onOffer creates a connection, sets remote description, and emits an answer", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_offer", {
        from: "p4",
        offer: { type: "offer", sdp: "remote-offer" },
      });
      await flushPromises();
    });

    expect(__mockSocket.emit).toHaveBeenCalledWith(
      "voice_answer",
      expect.objectContaining({ to: "p4" })
    );
    expect(result.current.peers.p4).toBeDefined();
    expect(MockRTCPeerConnection.instances[0].remoteDescription).toEqual({
      type: "offer",
      sdp: "remote-offer",
    });
  });

  test("onAnswer completes the handshake for an offer we sent", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
      await flushPromises();
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.signalingState).toBe("have-local-offer");

    await act(async () => {
      __mockSocket.__trigger("voice_answer", {
        from: "p1",
        answer: { type: "answer", sdp: "remote-answer" },
      });
      await flushPromises();
    });

    expect(pc.remoteDescription).toEqual({ type: "answer", sdp: "remote-answer" });
    expect(pc.signalingState).toBe("stable");
  });

  test("onIce buffers candidates until the remote description is set, then flushes", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
      await flushPromises();
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.remoteDescription).toBeNull();

    // Buffered because remoteDescription isn't set yet
    act(() => {
      __mockSocket.__trigger("voice_ice", { from: "p1", candidate: { candidate: "cand1" } });
    });
    expect(pc.addIceCandidate).not.toHaveBeenCalled();

    // Completing the handshake should flush the buffered candidate
    await act(async () => {
      __mockSocket.__trigger("voice_answer", {
        from: "p1",
        answer: { type: "answer", sdp: "remote-answer" },
      });
      await flushPromises();
    });

    expect(pc.addIceCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: "cand1" })
    );
  });

  test("onIce adds candidates immediately once remote description is set", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_offer", {
        from: "p4",
        offer: { type: "offer", sdp: "remote-offer" },
      });
      await flushPromises();
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(pc.remoteDescription).not.toBeNull();

    act(() => {
      __mockSocket.__trigger("voice_ice", { from: "p4", candidate: { candidate: "cand2" } });
    });

    expect(pc.addIceCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: "cand2" })
    );
  });

  test("onIce ignores null candidates and unknown peers", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });
    await act(async () => {
      await result.current.joinVoice();
    });

    expect(() => {
      act(() => {
        __mockSocket.__trigger("voice_ice", { from: "ghost", candidate: null });
        __mockSocket.__trigger("voice_ice", { from: "ghost", candidate: { candidate: "x" } });
      });
    }).not.toThrow();
  });

  test("onPeerMuted updates an existing peer's muted flag", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    act(() => {
      __mockSocket.__trigger("voice_peer_joined", { socketId: "p5" });
    });
    expect(result.current.peers.p5.muted).toBe(false);

    act(() => {
      __mockSocket.__trigger("voice_peer_muted", { socketId: "p5", muted: true });
    });
    expect(result.current.peers.p5.muted).toBe(true);
  });

  test("onPeerMuted is a no-op for an unknown peer", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });
    await act(async () => {
      await result.current.joinVoice();
    });

    act(() => {
      __mockSocket.__trigger("voice_peer_muted", { socketId: "ghost", muted: true });
    });

    expect(result.current.peers.ghost).toBeUndefined();
  });

  test("onPeerLeft destroys the peer connection and removes it from state", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
      await flushPromises();
    });

    const pc = MockRTCPeerConnection.instances[0];
    expect(result.current.peers.p1).toBeDefined();

    act(() => {
      __mockSocket.__trigger("voice_peer_left", { socketId: "p1" });
    });

    expect(pc.close).toHaveBeenCalled();
    expect(result.current.peers.p1).toBeUndefined();
  });

  test("leaveVoice stops tracks, closes connections, resets state, and emits voice_leave", async () => {
    const stream = makeStream();
    navigator.mediaDevices = { getUserMedia: jest.fn(() => Promise.resolve(stream)) };

    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
      await flushPromises();
    });

    const pc = MockRTCPeerConnection.instances[0];

    act(() => {
      result.current.leaveVoice();
    });

    expect(__mockSocket.emit).toHaveBeenCalledWith("voice_leave", { roomId: "room1" });
    expect(pc.close).toHaveBeenCalled();
    expect(stream._track.stop).toHaveBeenCalled();
    expect(result.current.joined).toBe(false);
    expect(result.current.isMuted).toBe(false);
    expect(result.current.localSpeaking).toBe(false);
    expect(result.current.peers).toEqual({});
  });

  test("leaveVoice is a no-op when not joined", () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    act(() => {
      result.current.leaveVoice();
    });

    expect(__mockSocket.emit).not.toHaveBeenCalledWith("voice_leave", expect.anything());
  });

  test("toggleMute disables/enables the local track and emits voice_mute", async () => {
    const stream = makeStream();
    navigator.mediaDevices = { getUserMedia: jest.fn(() => Promise.resolve(stream)) };

    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(true);
    expect(stream._track.enabled).toBe(false);
    expect(__mockSocket.emit).toHaveBeenCalledWith("voice_mute", { roomId: "room1", muted: true });

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
    expect(stream._track.enabled).toBe(true);
    expect(__mockSocket.emit).toHaveBeenCalledWith("voice_mute", { roomId: "room1", muted: false });
  });

  test("toggleMute is a no-op when there is no local stream", () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    act(() => {
      result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
    expect(__mockSocket.emit).not.toHaveBeenCalledWith("voice_mute", expect.anything());
  });

  test("unmounting after joining tears down the active voice session", async () => {
    const stream = makeStream();
    navigator.mediaDevices = { getUserMedia: jest.fn(() => Promise.resolve(stream)) };

    const { result, unmount } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    await act(async () => {
      __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
      await flushPromises();
    });

    const pc = MockRTCPeerConnection.instances[0];

    unmount();

    expect(__mockSocket.emit).toHaveBeenCalledWith("voice_leave", { roomId: "room1" });
    expect(pc.close).toHaveBeenCalled();
    expect(stream._track.stop).toHaveBeenCalled();
  });

  test("unmounting without ever joining does not emit voice_leave", () => {
    const { unmount } = renderHook(() => useVoice(), { wrapper });

    unmount();

    expect(__mockSocket.emit).not.toHaveBeenCalledWith("voice_leave", expect.anything());
  });

  test("cleans up voice socket listeners after leaving", async () => {
    const { result } = renderHook(() => useVoice(), { wrapper });

    await act(async () => {
      await result.current.joinVoice();
    });

    act(() => {
      result.current.leaveVoice();
    });

    [
      "voice_existing_peers",
      "voice_peer_joined",
      "voice_offer",
      "voice_answer",
      "voice_ice",
      "voice_peer_muted",
      "voice_peer_left",
    ].forEach((event) => {
      expect(__mockSocket.off).toHaveBeenCalledWith(event, expect.any(Function));
    });
  });

  describe("peer connection event handlers", () => {
    test("onicecandidate relays ICE candidates via voice_ice", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      __mockSocket.emit.mockClear();
      act(() => {
        pc.onicecandidate({ candidate: { candidate: "abc" } });
      });
      expect(__mockSocket.emit).toHaveBeenCalledWith("voice_ice", { to: "p1", candidate: { candidate: "abc" } });
    });

    test("onicecandidate does nothing for the end-of-candidates null signal", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      __mockSocket.emit.mockClear();
      act(() => {
        pc.onicecandidate({ candidate: null });
      });
      expect(__mockSocket.emit).not.toHaveBeenCalledWith("voice_ice", expect.anything());
    });

    test("ontrack creates an audio element and marks the peer as connected", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      const remoteStream = makeStream();
      act(() => {
        pc.ontrack({ streams: [remoteStream] });
      });
      expect(result.current.peers.p1.connected).toBe(true);

      // Re-triggering ontrack for the same peer reuses the existing audio element
      act(() => {
        pc.ontrack({ streams: [remoteStream] });
      });
      expect(result.current.peers.p1.connected).toBe(true);
    });

    test("ontrack ignores events with no stream", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      act(() => {
        pc.ontrack({ streams: [] });
      });
      expect(result.current.peers.p1.connected).toBe(false);
    });

    test("destroyPeer stops remote audio playback for a connected peer", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      act(() => {
        pc.ontrack({ streams: [makeStream()] });
      });

      window.HTMLMediaElement.prototype.pause.mockClear();
      act(() => {
        __mockSocket.__trigger("voice_peer_left", { socketId: "p1" });
      });

      expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      expect(result.current.peers.p1).toBeUndefined();
    });

    test("onconnectionstatechange destroys the peer when the connection fails", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      pc.connectionState = "failed";
      act(() => {
        pc.onconnectionstatechange();
      });
      expect(result.current.peers.p1).toBeUndefined();
    });

    test("onconnectionstatechange does not destroy the peer on a temporary 'disconnected' state", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const pc = MockRTCPeerConnection.instances[0];
      pc.connectionState = "disconnected";
      act(() => {
        pc.onconnectionstatechange();
      });
      expect(result.current.peers.p1).toBeDefined();
    });

    test("creating a new connection to an existing peer closes the previous one", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });
      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });
      const firstPc = MockRTCPeerConnection.instances[0];

      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });

      expect(firstPc.close).toHaveBeenCalled();
      expect(MockRTCPeerConnection.instances).toHaveLength(2);
    });
  });

  describe("error handling branches", () => {
    test("onExistingPeers logs an error if creating an offer fails", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });

      const offerSpy = jest
        .spyOn(MockRTCPeerConnection.prototype, "createOffer")
        .mockRejectedValueOnce(new Error("offer failed"));

      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[voice] Failed to create offer for",
        "p1",
        expect.any(Error)
      );
      errorSpy.mockRestore();
      offerSpy.mockRestore();
    });

    test("onOffer ignores offers when the connection is in an invalid signaling state", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });

      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });

      const pc = MockRTCPeerConnection.instances[0];
      expect(pc.signalingState).toBe("have-local-offer");

      __mockSocket.emit.mockClear();
      await act(async () => {
        __mockSocket.__trigger("voice_offer", { from: "p1", offer: { type: "offer", sdp: "x" } });
        await flushPromises();
      });

      // have-local-offer is neither "stable" nor "have-remote-offer" → offer ignored
      expect(__mockSocket.emit).not.toHaveBeenCalledWith("voice_answer", expect.anything());
    });

    test("onOffer logs an error if answering fails", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });

      const answerSpy = jest
        .spyOn(MockRTCPeerConnection.prototype, "createAnswer")
        .mockRejectedValueOnce(new Error("answer failed"));

      await act(async () => {
        __mockSocket.__trigger("voice_offer", { from: "p4", offer: { type: "offer", sdp: "remote-offer" } });
        await flushPromises();
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[voice] Failed to answer offer from",
        "p4",
        expect.any(Error)
      );
      errorSpy.mockRestore();
      answerSpy.mockRestore();
    });

    test("onAnswer logs an error if completing the handshake fails", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { result } = renderHook(() => useVoice(), { wrapper });
      await act(async () => {
        await result.current.joinVoice();
      });

      await act(async () => {
        __mockSocket.__trigger("voice_existing_peers", { peers: ["p1"], muteMap: {} });
        await flushPromises();
      });

      const pc = MockRTCPeerConnection.instances[0];
      const setRemoteSpy = jest
        .spyOn(pc, "setRemoteDescription")
        .mockRejectedValueOnce(new Error("answer set failed"));

      await act(async () => {
        __mockSocket.__trigger("voice_answer", { from: "p1", answer: { type: "answer", sdp: "remote-answer" } });
        await flushPromises();
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "[voice] Failed to set remote answer from",
        "p1",
        expect.any(Error)
      );
      errorSpy.mockRestore();
      setRemoteSpy.mockRestore();
    });
  });

  describe("speaking detection", () => {
    let rafCallbacks;
    let originalAudioContext;
    let originalRAF;
    let originalCAF;

    class MockAnalyser {
      constructor() {
        this.fftSize = 0;
        this.smoothingTimeConstant = 0;
        this.frequencyBinCount = 32;
      }
      getByteFrequencyData(buf) {
        buf.fill(MockAnalyser.fillValue);
      }
    }
    MockAnalyser.fillValue = 0;

    class MockAudioContext {
      createMediaStreamSource() {
        return { connect: jest.fn(), disconnect: jest.fn() };
      }
      createAnalyser() {
        return new MockAnalyser();
      }
      close() {}
    }

    beforeEach(() => {
      rafCallbacks = [];
      originalAudioContext = global.AudioContext;
      originalRAF = global.requestAnimationFrame;
      originalCAF = global.cancelAnimationFrame;
      global.AudioContext = MockAudioContext;
      global.requestAnimationFrame = jest.fn((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      global.cancelAnimationFrame = jest.fn();
      MockAnalyser.fillValue = 0;
    });

    afterEach(() => {
      global.AudioContext = originalAudioContext;
      global.requestAnimationFrame = originalRAF;
      global.cancelAnimationFrame = originalCAF;
    });

    test("detects local speaking changes via the analyser poll loop", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });

      await act(async () => {
        await result.current.joinVoice();
      });

      expect(rafCallbacks.length).toBeGreaterThan(0);

      MockAnalyser.fillValue = 50; // above SPEAKING_THRESHOLD
      act(() => {
        rafCallbacks[rafCallbacks.length - 1](1000);
      });
      expect(result.current.localSpeaking).toBe(true);

      MockAnalyser.fillValue = 0; // below threshold
      act(() => {
        rafCallbacks[rafCallbacks.length - 1](2000);
      });
      expect(result.current.localSpeaking).toBe(false);
    });

    test("stops polling when leaving voice", async () => {
      const { result } = renderHook(() => useVoice(), { wrapper });

      await act(async () => {
        await result.current.joinVoice();
      });

      act(() => {
        result.current.leaveVoice();
      });

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
