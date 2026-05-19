module.exports = {
  testMatch: ['<rootDir>/src/__tests__/**/*.test.{js,ts}'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/__tests__/integration/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: { ignoreCodes: [151002] },
    }],
  },
  testEnvironment: 'node',
  // Avoid loading the full app (Sequelize, Redis, Slack connections)
  testTimeout: 10000,
};
