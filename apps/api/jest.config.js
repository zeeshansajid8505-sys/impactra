module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleNameMapper: {
    '^@octokit/auth-app$': '<rootDir>/test/mocks/octokit-auth-app.ts',
    '^@impactra/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@impactra/database$': '<rootDir>/../../packages/database/src/index.ts',
  },
};
