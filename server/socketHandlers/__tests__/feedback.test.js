jest.mock("../../utils/rateLimiter", () => ({
  isAllowed: jest.fn(() => true),
}));
jest.mock("../../db/feedbackService", () => ({
  createFeedback: jest.fn(),
}));

const rateLimiter = require("../../utils/rateLimiter");
const feedbackService = require("../../db/feedbackService");
const handleFeedbackEvents = require("../feedback");

function makeIo() {
  const emit = jest.fn();
  return { to: jest.fn(() => ({ emit })), _emit: emit };
}

function makeSocket(id, headers) {
  return {
    id: id || "socket1",
    on: jest.fn(),
    emit: jest.fn(),
    handshake: { headers: headers || { "user-agent": "test-agent" } },
  };
}

function getHandler(socket, event) {
  const call = socket.on.mock.calls.find((c) => c[0] === event);
  return call && call[1];
}

describe("feedback socket handler", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("submit_feedback", () => {
    test("returns an error via callback when message is missing or blank", async () => {
      const io = makeIo();
      const socket = makeSocket("s1");
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");
      const callback = jest.fn();

      await handler({ message: "   " }, callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: "Feedback message is required" });
      expect(feedbackService.createFeedback).not.toHaveBeenCalled();
    });

    test("returns an error via callback when rate limited", async () => {
      rateLimiter.isAllowed.mockReturnValueOnce(false);
      const io = makeIo();
      const socket = makeSocket("s2");
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");
      const callback = jest.fn();

      await handler({ message: "Found a bug" }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
      expect(feedbackService.createFeedback).not.toHaveBeenCalled();
    });

    test("trims/truncates fields and passes user-agent through to createFeedback", async () => {
      feedbackService.createFeedback.mockResolvedValueOnce({ id: "f1" });
      const io = makeIo();
      const socket = makeSocket("s3", { "user-agent": "Mozilla/5.0" });
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");
      const callback = jest.fn();

      await handler({
        deviceId: "dev1",
        name: "  Alice  ",
        category: "bug",
        message: "  The board freezes  ",
        context: "  /room/abc123  ",
      }, callback);

      expect(feedbackService.createFeedback).toHaveBeenCalledWith({
        deviceId: "dev1",
        name: "Alice",
        category: "bug",
        message: "The board freezes",
        context: "/room/abc123",
        userAgent: "Mozilla/5.0",
      });
      expect(callback).toHaveBeenCalledWith({ status: "ok", id: "f1" });
    });

    test("defaults optional fields to null when absent", async () => {
      feedbackService.createFeedback.mockResolvedValueOnce({ id: "f2" });
      const io = makeIo();
      const socket = makeSocket("s4", {});
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");
      const callback = jest.fn();

      await handler({ message: "General comment" }, callback);

      expect(feedbackService.createFeedback).toHaveBeenCalledWith({
        deviceId: null,
        name: null,
        category: undefined,
        message: "General comment",
        context: null,
        userAgent: null,
      });
      expect(callback).toHaveBeenCalledWith({ status: "ok", id: "f2" });
    });

    test("works without a callback", async () => {
      feedbackService.createFeedback.mockResolvedValueOnce({ id: "f3" });
      const io = makeIo();
      const socket = makeSocket("s5");
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");

      await expect(handler({ message: "No callback here" })).resolves.toBeUndefined();
    });

    test("returns an error via callback when createFeedback throws", async () => {
      feedbackService.createFeedback.mockRejectedValueOnce(new Error("db down"));
      const io = makeIo();
      const socket = makeSocket("s6");
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");
      const callback = jest.fn();

      await handler({ message: "hello" }, callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: "Failed to submit feedback" });
    });

    test("returns an error when createFeedback resolves null (db unavailable)", async () => {
      feedbackService.createFeedback.mockResolvedValueOnce(null);
      const io = makeIo();
      const socket = makeSocket("s7");
      handleFeedbackEvents(io, socket);
      const handler = getHandler(socket, "submit_feedback");
      const callback = jest.fn();

      await handler({ message: "hello" }, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: "Failed to save feedback. Please try again later.",
      });
    });
  });
});
