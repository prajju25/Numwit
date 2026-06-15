jest.mock("../prismaClient", () => ({
  db: jest.fn(),
}));

const { db } = require("../prismaClient");
const {
  createFeedback,
  listFeedback,
  updateFeedbackStatus,
  getFeedbackCounts,
} = require("../feedbackService");

describe("feedbackService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createFeedback", () => {
    test("returns null when message is missing or blank", async () => {
      expect(await createFeedback({})).toBeNull();
      expect(await createFeedback({ message: "   " })).toBeNull();
      expect(db).not.toHaveBeenCalled();
    });

    test("creates a row with defaults for optional fields", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          create: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve({ id: "f1", ...args.data });
          }),
        },
      }));

      const result = await createFeedback({ message: "Something is broken" });
      expect(capturedArgs.data).toEqual({
        deviceId: null,
        name: null,
        category: "other",
        message: "Something is broken",
        context: null,
        userAgent: null,
      });
      expect(result.id).toBe("f1");
    });

    test("passes through provided fields and a valid category", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          create: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve({ id: "f2", ...args.data });
          }),
        },
      }));

      await createFeedback({
        deviceId: "dev1",
        name: "Alice",
        category: "bug",
        message: "Game board freezes on round 3",
        context: "/room/abc123",
        userAgent: "Mozilla/5.0",
      });
      expect(capturedArgs.data).toEqual({
        deviceId: "dev1",
        name: "Alice",
        category: "bug",
        message: "Game board freezes on round 3",
        context: "/room/abc123",
        userAgent: "Mozilla/5.0",
      });
    });

    test("falls back to 'other' for an invalid category", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          create: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve({ id: "f3", ...args.data });
          }),
        },
      }));

      await createFeedback({ message: "hi", category: "not-a-real-category" });
      expect(capturedArgs.data.category).toBe("other");
    });

    test("trims and caps message length at 2000 chars", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          create: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve({ id: "f4", ...args.data });
          }),
        },
      }));

      const longMessage = "  " + "x".repeat(2010) + "  ";
      await createFeedback({ message: longMessage });
      expect(capturedArgs.data.message.length).toBe(2000);
      expect(capturedArgs.data.message.startsWith(" ")).toBe(false);
    });
  });

  describe("listFeedback", () => {
    test("returns [] when the db returns null (unavailable)", async () => {
      db.mockResolvedValueOnce(null);
      const result = await listFeedback();
      expect(result).toEqual([]);
    });

    test("applies default pagination and no filters", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          findMany: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve([{ id: "f1" }]);
          }),
        },
      }));

      const result = await listFeedback();
      expect(capturedArgs).toEqual({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
      expect(result).toEqual([{ id: "f1" }]);
    });

    test("filters by valid status and category, and respects custom pagination", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          findMany: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve([]);
          }),
        },
      }));

      await listFeedback({ status: "open", category: "bug", limit: 10, offset: 20 });
      expect(capturedArgs).toEqual({
        where: { status: "open", category: "bug" },
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 20,
      });
    });

    test("ignores invalid status/category filters", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          findMany: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve([]);
          }),
        },
      }));

      await listFeedback({ status: "bogus", category: "bogus" });
      expect(capturedArgs.where).toEqual({});
    });
  });

  describe("updateFeedbackStatus", () => {
    test("returns null for an invalid status", async () => {
      const result = await updateFeedbackStatus("f1", "not-a-status");
      expect(result).toBeNull();
      expect(db).not.toHaveBeenCalled();
    });

    test("updates the row's status", async () => {
      let capturedArgs;
      db.mockImplementationOnce(async (fn) => fn({
        feedback: {
          update: jest.fn((args) => {
            capturedArgs = args;
            return Promise.resolve({ id: "f1", status: args.data.status });
          }),
        },
      }));

      const result = await updateFeedbackStatus("f1", "resolved");
      expect(capturedArgs).toEqual({ where: { id: "f1" }, data: { status: "resolved" } });
      expect(result.status).toBe("resolved");
    });
  });

  describe("getFeedbackCounts", () => {
    test("returns zeroed counts when the db is unavailable", async () => {
      db.mockResolvedValueOnce(null);
      const result = await getFeedbackCounts();
      expect(result).toEqual({ open: 0, in_review: 0, resolved: 0 });
    });

    test("maps groupBy rows into a status -> count object", async () => {
      db.mockResolvedValueOnce([
        { status: "open", _count: { id: 3 } },
        { status: "resolved", _count: { id: 12 } },
      ]);

      const result = await getFeedbackCounts();
      expect(result).toEqual({ open: 3, in_review: 0, resolved: 12 });
    });
  });
});
