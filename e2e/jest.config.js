/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.e2e.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  globalSetup: './setup/global-setup.ts',
  globalTeardown: './setup/global-teardown.ts',
  setupFilesAfterFramework: [],
  testTimeout: 30000,
  // Run tests sequentially since they share state
  maxWorkers: 1,
};
