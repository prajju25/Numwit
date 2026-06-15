// Automatic manual mock for the `socket.io-client` package.
// Jest applies mocks in <rootDir>/__mocks__/<module>.js to node_modules
// packages automatically, without needing jest.mock() in each test file.

const handlers = {};

const mockSocket = {
  id: "mock-socket-id",
  connected: false,
  on: jest.fn((event, cb) => {
    handlers[event] = handlers[event] || [];
    handlers[event].push(cb);
    return mockSocket;
  }),
  off: jest.fn((event, cb) => {
    if (!handlers[event]) return mockSocket;
    if (!cb) {
      delete handlers[event];
    } else {
      handlers[event] = handlers[event].filter((h) => h !== cb);
    }
    return mockSocket;
  }),
  once: jest.fn((event, cb) => {
    handlers[event] = handlers[event] || [];
    handlers[event].push(cb);
    return mockSocket;
  }),
  emit: jest.fn(() => mockSocket),
  connect: jest.fn(() => mockSocket),
  disconnect: jest.fn(() => mockSocket),
  removeAllListeners: jest.fn(() => mockSocket),
  // Test helper (not part of the real socket.io-client API): allows tests to
  // simulate the server invoking a registered handler.
  __trigger: (event, ...args) => {
    (handlers[event] || []).forEach((cb) => cb(...args));
  },
  __handlers: handlers,
};

const io = jest.fn(() => mockSocket);

module.exports = { io, default: io, __mockSocket: mockSocket };
