describe("prismaClient", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    jest.dontMock("@prisma/client");
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.dontMock("@prisma/client");
  });

  test("when DATABASE_URL is not set, getPrisma() returns null and db() resolves to null", async () => {
    const { db, getPrisma } = require("../prismaClient");
    expect(getPrisma()).toBeNull();

    const result = await db((p) => p.user.findMany());
    expect(result).toBeNull();
  });

  test("when @prisma/client cannot be loaded, prisma stays null", () => {
    process.env.DATABASE_URL = "postgres://fake";
    jest.doMock("@prisma/client", () => {
      throw new Error("module not found");
    });

    const { getPrisma } = require("../prismaClient");
    expect(getPrisma()).toBeNull();
  });

  test("when PrismaClient connects successfully, getPrisma returns the instance and db() runs fn", async () => {
    process.env.DATABASE_URL = "postgres://fake";
    jest.doMock("@prisma/client", () => ({
      PrismaClient: jest.fn().mockImplementation(() => ({
        $connect: jest.fn().mockResolvedValue(undefined),
        user: { findMany: jest.fn().mockResolvedValue(["a"]) },
      })),
    }));

    const { db, getPrisma } = require("../prismaClient");
    expect(getPrisma()).not.toBeNull();

    const result = await db((p) => p.user.findMany());
    expect(result).toEqual(["a"]);

    // allow the $connect promise chain to settle
    await new Promise((r) => setImmediate(r));
  });

  test("when PrismaClient $connect rejects, prisma becomes null", async () => {
    process.env.DATABASE_URL = "postgres://fake";
    jest.doMock("@prisma/client", () => ({
      PrismaClient: jest.fn().mockImplementation(() => ({
        $connect: jest.fn().mockRejectedValue(new Error("conn refused")),
      })),
    }));

    const { db, getPrisma } = require("../prismaClient");

    // flush the .then().catch() microtask chain
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(getPrisma()).toBeNull();
    const result = await db((p) => p.user.findMany());
    expect(result).toBeNull();
  });

  test("db() catches synchronous/async errors thrown by fn and returns null", async () => {
    process.env.DATABASE_URL = "postgres://fake";
    jest.doMock("@prisma/client", () => ({
      PrismaClient: jest.fn().mockImplementation(() => ({
        $connect: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const { db } = require("../prismaClient");
    const result = await db(() => {
      throw new Error("boom");
    });
    expect(result).toBeNull();
  });

  test("when constructing PrismaClient throws synchronously, prisma stays null", () => {
    process.env.DATABASE_URL = "postgres://fake";
    jest.doMock("@prisma/client", () => ({
      PrismaClient: jest.fn().mockImplementation(() => {
        throw new Error("init failed");
      }),
    }));

    const { getPrisma } = require("../prismaClient");
    expect(getPrisma()).toBeNull();
  });
});
