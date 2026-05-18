/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['<rootDir>/src/__tests__/integration/**/*.test.{js,ts}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock modules that fail to load in test context (user.model.ts
    // imports helpers/token.js → jsonwebtoken, helpers/mail.js → nodemailer).
    // These aren't used by integration tests — we only need the models.
    '^jsonwebtoken$': '<rootDir>/src/__tests__/integration/setup/mocks/jsonwebtoken.ts',
    '^nodemailer$': '<rootDir>/src/__tests__/integration/setup/mocks/nodemailer.ts',
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
  globalSetup: '<rootDir>/src/__tests__/integration/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/src/__tests__/integration/setup/globalTeardown.ts',
};
