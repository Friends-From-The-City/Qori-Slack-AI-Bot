module.exports = {
  testMatch: ['<rootDir>/src/__tests__/**/*.test.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'node',
  // Avoid loading the full app (Sequelize, Redis, Slack connections)
  testTimeout: 10000,
};
