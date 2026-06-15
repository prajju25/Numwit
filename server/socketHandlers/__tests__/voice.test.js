const handleVoiceEvents = require("../voice");

function makeIo() {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function makeSocket(id) {
  return {
    id: id || "socket1",
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  };
}

function getHandler(socket, event) {
  const call = socket.on.mock.calls.find((c) => c[0] === event);
  return call && call[1];
}

describe("voice socket handler", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("voice_ready", () => {
    test("does nothing when roomId is missing", () => {
      const io = makeIo();
      const socket = makeSocket("v1");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_ready")({});
      expect(socket.emit).not.toHaveBeenCalled();
    });

    test("first joiner gets empty existing peers and joins the room", () => {
      const io = makeIo();
      const socket = makeSocket("v2");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_ready")({ roomId: "roomA" });

      expect(socket.emit).toHaveBeenCalledWith("voice_existing_peers", { peers: [], muteMap: {} });
      expect(socket._voiceRoomId).toBe("roomA");
    });

    test("second joiner sees the first peer and notifies them", () => {
      const io = makeIo();
      const socket1 = makeSocket("v3");
      handleVoiceEvents(io, socket1);
      getHandler(socket1, "voice_ready")({ roomId: "roomB" });

      const socket2 = makeSocket("v4");
      handleVoiceEvents(io, socket2);
      getHandler(socket2, "voice_ready")({ roomId: "roomB" });

      expect(socket2.emit).toHaveBeenCalledWith("voice_existing_peers", {
        peers: ["v3"],
        muteMap: { v3: false },
      });
      expect(io.to).toHaveBeenCalledWith("v3");
      expect(io._emit).toHaveBeenCalledWith("voice_peer_joined", { socketId: "v4" });
    });

    test("new joiner sees existing peer's mute state", () => {
      const io = makeIo();
      const socket1 = makeSocket("v5");
      handleVoiceEvents(io, socket1);
      getHandler(socket1, "voice_ready")({ roomId: "roomC" });
      getHandler(socket1, "voice_mute")({ roomId: "roomC", muted: true });

      const socket2 = makeSocket("v6");
      handleVoiceEvents(io, socket2);
      getHandler(socket2, "voice_ready")({ roomId: "roomC" });

      expect(socket2.emit).toHaveBeenCalledWith("voice_existing_peers", {
        peers: ["v5"],
        muteMap: { v5: true },
      });
    });
  });

  describe("signaling relay", () => {
    test("voice_offer forwards to target when both fields present", () => {
      const io = makeIo();
      const socket = makeSocket("v7");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_offer")({ to: "peer1", offer: { sdp: "x" } });

      expect(io.to).toHaveBeenCalledWith("peer1");
      expect(io._emit).toHaveBeenCalledWith("voice_offer", { from: "v7", offer: { sdp: "x" } });
    });

    test("voice_offer does nothing when to or offer missing", () => {
      const io = makeIo();
      const socket = makeSocket("v8");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_offer")({ to: null, offer: { sdp: "x" } });
      getHandler(socket, "voice_offer")({ to: "peer1", offer: null });
      expect(io.to).not.toHaveBeenCalled();
    });

    test("voice_answer forwards to target", () => {
      const io = makeIo();
      const socket = makeSocket("v9");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_answer")({ to: "peer1", answer: { sdp: "y" } });
      expect(io._emit).toHaveBeenCalledWith("voice_answer", { from: "v9", answer: { sdp: "y" } });
    });

    test("voice_answer does nothing when to or answer missing", () => {
      const io = makeIo();
      const socket = makeSocket("v10");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_answer")({ to: null, answer: { sdp: "y" } });
      expect(io.to).not.toHaveBeenCalled();
    });

    test("voice_ice forwards to target", () => {
      const io = makeIo();
      const socket = makeSocket("v11");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_ice")({ to: "peer1", candidate: { c: 1 } });
      expect(io._emit).toHaveBeenCalledWith("voice_ice", { from: "v11", candidate: { c: 1 } });
    });

    test("voice_ice does nothing when to or candidate missing", () => {
      const io = makeIo();
      const socket = makeSocket("v12");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_ice")({ to: "peer1", candidate: null });
      expect(io.to).not.toHaveBeenCalled();
    });
  });

  describe("voice_mute", () => {
    test("does nothing when roomId is missing", () => {
      const io = makeIo();
      const socket = makeSocket("v13");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_mute")({ muted: true });
      expect(toEmit).not.toHaveBeenCalled();
    });

    test("broadcasts mute state and persists it for future joiners", () => {
      const io = makeIo();
      const socket = makeSocket("v14");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleVoiceEvents(io, socket);

      getHandler(socket, "voice_ready")({ roomId: "roomD" });
      getHandler(socket, "voice_mute")({ roomId: "roomD", muted: true });

      expect(socket.to).toHaveBeenCalledWith("roomD");
      expect(toEmit).toHaveBeenCalledWith("voice_peer_muted", { socketId: "v14", muted: true });
    });

    test("coerces muted to boolean even when not yet in voice", () => {
      const io = makeIo();
      const socket = makeSocket("v15");
      const toEmit = jest.fn();
      socket.to = jest.fn(() => ({ emit: toEmit }));
      handleVoiceEvents(io, socket);

      getHandler(socket, "voice_mute")({ roomId: "roomE", muted: "yes" });
      expect(toEmit).toHaveBeenCalledWith("voice_peer_muted", { socketId: "v15", muted: true });
    });
  });

  describe("voice_leave / removeFromVoice", () => {
    test("does nothing when roomId is missing", () => {
      const io = makeIo();
      const socket = makeSocket("v16");
      handleVoiceEvents(io, socket);
      expect(() => getHandler(socket, "voice_leave")({})).not.toThrow();
    });

    test("does nothing when socket is not a member of the room", () => {
      const io = makeIo();
      const socket = makeSocket("v17");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_leave")({ roomId: "roomF" });
      expect(io.to).not.toHaveBeenCalled();
    });

    test("removes the last member and clears room state", () => {
      const io = makeIo();
      const socket = makeSocket("v18");
      handleVoiceEvents(io, socket);
      getHandler(socket, "voice_ready")({ roomId: "roomG" });

      getHandler(socket, "voice_leave")({ roomId: "roomG" });
      expect(socket._voiceRoomId).toBeNull();

      // Rejoining should now see an empty room again (state was cleared)
      const socket2 = makeSocket("v19");
      handleVoiceEvents(io, socket2);
      getHandler(socket2, "voice_ready")({ roomId: "roomG" });
      expect(socket2.emit).toHaveBeenCalledWith("voice_existing_peers", { peers: [], muteMap: {} });
    });

    test("notifies remaining members when one peer leaves", () => {
      const io = makeIo();
      const socket1 = makeSocket("v20");
      handleVoiceEvents(io, socket1);
      getHandler(socket1, "voice_ready")({ roomId: "roomH" });

      const socket2 = makeSocket("v21");
      handleVoiceEvents(io, socket2);
      getHandler(socket2, "voice_ready")({ roomId: "roomH" });

      io._emit.mockClear();
      io.to.mockClear();
      getHandler(socket2, "voice_leave")({ roomId: "roomH" });

      expect(io.to).toHaveBeenCalledWith("v20");
      expect(io._emit).toHaveBeenCalledWith("voice_peer_left", { socketId: "v21" });
    });
  });

  describe("disconnect", () => {
    test("does nothing when socket never joined voice", () => {
      const io = makeIo();
      const socket = makeSocket("v22");
      handleVoiceEvents(io, socket);
      expect(() => getHandler(socket, "disconnect")()).not.toThrow();
    });

    test("removes socket from voice on disconnect", () => {
      const io = makeIo();
      const socket1 = makeSocket("v23");
      handleVoiceEvents(io, socket1);
      getHandler(socket1, "voice_ready")({ roomId: "roomI" });

      const socket2 = makeSocket("v24");
      handleVoiceEvents(io, socket2);
      getHandler(socket2, "voice_ready")({ roomId: "roomI" });

      io._emit.mockClear();
      io.to.mockClear();
      getHandler(socket1, "disconnect")();

      expect(io.to).toHaveBeenCalledWith("v24");
      expect(io._emit).toHaveBeenCalledWith("voice_peer_left", { socketId: "v23" });
      expect(socket1._voiceRoomId).toBeNull();
    });
  });
});
