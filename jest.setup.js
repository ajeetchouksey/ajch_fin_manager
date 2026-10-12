/**
 * Jest Setup File
 * Runs before all tests to configure test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'development';

// Timeout for failing tests (30 seconds)
jest.setTimeout(30000);

// Mock fetch if not available (though it should be in modern Node)
if (!global.fetch) {
  const fetch = require('node-fetch');
  global.fetch = fetch;
}

// Log test environment info
console.log('🧪 Test Environment Setup');
console.log('  Backend API: http://localhost:8787');
console.log('  Frontend URL: http://localhost:5173');
console.log('  Environment: test');
console.log('');

// Custom matchers
expect.extend({
  toBeValidToken(received) {
    const pass = typeof received === 'string' && received.length > 0;
    return {
      pass,
      message: () => pass
        ? `Expected ${received} not to be a valid token`
        : `Expected a non-empty string token, got ${received}`,
    };
  },

  toBeValidHttpStatus(received) {
    const validStatuses = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 405, 429, 500, 502, 503];
    const pass = validStatuses.includes(received);
    return {
      pass,
      message: () => pass
        ? `Expected ${received} not to be a valid HTTP status`
        : `Expected a valid HTTP status, got ${received}`,
    };
  },
});

// Setup console mocks to reduce noise
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  // Suppress specific warnings during tests
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Unhandled Rejection')) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning')) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Global test utilities
global.testUtils = {
  /**
   * Wait for a condition to be true
   */
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > timeout) {
        throw new Error('Timeout waiting for condition');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  },

  /**
   * Retry a function with exponential backoff
   */
  retry: async (fn, maxAttempts = 3, delay = 100) => {
    let lastError;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (2 ** i)));
        }
      }
    }
    throw lastError;
  },

  /**
   * Check if backend is available
   */
  isBackendAvailable: async () => {
    try {
      const response = await fetch('http://localhost:8787/api/health');
      return response.status === 200;
    } catch {
      return false;
    }
  },

  /**
   * Check if frontend is available
   */
  isFrontendAvailable: async () => {
    try {
      const response = await fetch('http://localhost:5173');
      return response.status === 200;
    } catch {
      return false;
    }
  },

  /**
   * Generate a random token for testing
   */
  generateTestToken: () => {
    return `Bearer test_token_${Math.random().toString(36).substring(7)}`;
  },
};

// Hook to skip tests if backend/frontend not available
beforeAll(async () => {
  const backendAvailable = await global.testUtils.isBackendAvailable();
  const frontendAvailable = await global.testUtils.isFrontendAvailable();

  if (!backendAvailable || !frontendAvailable) {
    console.warn('⚠️  Warning: Backend or Frontend not available');
    console.warn('   Make sure to run:');
    console.warn('   - Terminal 1: npm run dev (backend)');
    console.warn('   - Terminal 2: cd frontend && npm run dev (frontend)');
  }
});
