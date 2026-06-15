module.exports = {
  testEnvironment: "node",
  rootDir: __dirname,
  testMatch: ["**/__tests__/**/*.test.js"],
  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.js",
    "!**/__tests__/**",
    "!**/__mocks__/**",
    "!jest.config.js",
    "!node_modules/**",
    "!coverage/**",
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  clearMocks: true,
  verbose: true,
};
