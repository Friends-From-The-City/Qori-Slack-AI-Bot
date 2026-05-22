/** @type {import('jest').Config} */
module.exports = {
  testMatch: [
    '<rootDir>/src/__tests__/integration/pattern-enforcement.test.ts',
    '<rootDir>/src/__tests__/integration/modal-flows.test.ts',
  ],
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
  testTimeout: 30000,
  // No database required — these tests scan the filesystem only
};
