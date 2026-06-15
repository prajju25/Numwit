// Manual mock for the `redis` npm package.
// Placed at <rootDir>/__mocks__/redis.js so Jest automatically substitutes
// it for any `require("redis")` call across the codebase — no explicit
// jest.mock("redis") needed in individual test files.
//
// createClient() returns a fake client whose async methods are jest.fn()s
// resolving to sensible defaults. Individual tests can further customize
// behavior via `require("redis").__mockClient` or by re-mocking return
// values on the instance returned from createClient().

function createFakeClient() {
  var store = new Map();
  var sets = new Map();

  var client = {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnThis(),

    get: jest.fn(function(key) {
      return Promise.resolve(store.has(key) ? store.get(key) : null);
    }),
    set: jest.fn(function(key, value) {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    del: jest.fn(function(key) {
      var existed = store.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    keys: jest.fn(function(pattern) {
      var prefix = String(pattern || "").replace(/\*$/, "");
      var matches = [];
      store.forEach(function(_v, k) {
        if (k.indexOf(prefix) === 0) matches.push(k);
      });
      return Promise.resolve(matches);
    }),

    sAdd: jest.fn(function(key, member) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(member);
      return Promise.resolve(1);
    }),
    sRem: jest.fn(function(key, member) {
      if (sets.has(key)) sets.get(key).delete(member);
      return Promise.resolve(1);
    }),
    sMembers: jest.fn(function(key) {
      return Promise.resolve(sets.has(key) ? Array.from(sets.get(key)) : []);
    }),

    ping: jest.fn().mockResolvedValue("PONG"),
    duplicate: jest.fn(function() {
      return createFakeClient();
    }),

    // Test helpers (not part of the real redis API)
    __store: store,
    __sets: sets,
  };

  return client;
}

module.exports = {
  createClient: jest.fn(function() {
    return createFakeClient();
  }),
};
