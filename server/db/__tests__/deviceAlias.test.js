jest.mock("../prismaClient", () => ({ db: jest.fn() }));

const { db } = require("../prismaClient");
const { canonicalDeviceId, forgetDevices, clearDeviceAliasCache } = require("../deviceAlias");

function aliasTable(rows) {
  const findUnique = jest.fn(async ({ where }) => (rows[where.deviceId] ? { user: { deviceId: rows[where.deviceId] } } : null));
  db.mockImplementation(async (fn) => fn({ deviceAlias: { findUnique } }));
  return findUnique;
}

describe("deviceAlias.canonicalDeviceId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDeviceAliasCache();
  });

  test("a merged device resolves to its player's device; others stay as they are", async () => {
    aliasTable({ "dev-phone": "dev-laptop" });
    await expect(canonicalDeviceId("dev-phone")).resolves.toBe("dev-laptop");
    await expect(canonicalDeviceId("dev-laptop")).resolves.toBe("dev-laptop");
  });

  test("answers from memory after the first lookup", async () => {
    const findUnique = aliasTable({ "dev-phone": "dev-laptop" });
    await canonicalDeviceId("dev-phone");
    await canonicalDeviceId("dev-phone");
    await canonicalDeviceId("dev-other");
    await canonicalDeviceId("dev-other");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  test("forgetDevices makes the next lookup read the database again", async () => {
    const findUnique = aliasTable({});
    await expect(canonicalDeviceId("dev-phone")).resolves.toBe("dev-phone");
    // ...admin merges the phone into the laptop
    aliasTable({ "dev-phone": "dev-laptop" });
    forgetDevices(["dev-phone"]);
    await expect(canonicalDeviceId("dev-phone")).resolves.toBe("dev-laptop");
    expect(findUnique).toHaveBeenCalledTimes(1);
    forgetDevices(undefined); // no-op
  });

  test("no database or no device id → used as is", async () => {
    db.mockResolvedValue(null);
    await expect(canonicalDeviceId("dev-x")).resolves.toBe("dev-x");
    await expect(canonicalDeviceId(null)).resolves.toBeNull();
    await expect(canonicalDeviceId("")).resolves.toBe("");
  });
});
