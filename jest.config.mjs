/** @type {import('jest').Config} */
const config = {
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
      transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, diagnostics: { ignoreCodes: [151002] } }] },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
      transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, diagnostics: { ignoreCodes: [151002] } }] },
    },
    {
      displayName: 'fixture',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/fixture/**/*.test.ts'],
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
      transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: './tsconfig.json', diagnostics: { ignoreCodes: [151002] } }] },
    },
  ],
};

export default config;
