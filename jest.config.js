/**
 * Jest Configuration for Finance Manager Testing
 * Tests run against local development servers
 * Backend: http://localhost:8787
 * Frontend: http://localhost:5173
 */

export default {
  // Use TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.test.ts',
  ],

  // Module path resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Transform TypeScript files
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/**',
    '!src/index.ts',
  ],

  // Test timeouts (some tests may take longer)
  testTimeout: 10000,

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Verbose output
  verbose: true,

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
