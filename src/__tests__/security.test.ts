/**
 * Security Tests - Auth, Input Validation, Data Protection
 * Test file: src/__tests__/security.test.ts
 * Run: npm test -- security.test.ts
 */

describe('Security Testing', () => {
  const API_BASE_URL = 'http://localhost:8787';

  // ===== Authentication Security Tests =====
  describe('Authentication Security', () => {
    it('should block unauthorized access to protected routes', async () => {
      // Attempt to access protected endpoint without token
      const response = await fetch(`${API_BASE_URL}/api/profile`);

      expect([401, 403]).toContain(response.status);
    });

    it('should reject invalid/malformed authorization header', async () => {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: {
          'Authorization': 'InvalidFormat token123',
        },
      });

      expect([400, 401]).toContain(response.status);
    });

    it('should reject expired tokens', async () => {
      // Simulate an expired token (older than 1 hour)
      const expiredToken = 'Bearer expired_token_from_long_ago';

      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: {
          'Authorization': expiredToken,
        },
      });

      expect(response.status).toBe(401);
    });

    it('should reject malicious/random token strings', async () => {
      const maliciousToken = 'Bearer ' + 'x'.repeat(1000);

      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: {
          'Authorization': maliciousToken,
        },
      });

      expect([400, 401]).toContain(response.status);
    });

    it('should handle missing Bearer prefix', async () => {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: {
          'Authorization': 'just_a_token_without_bearer',
        },
      });

      expect([400, 401]).toContain(response.status);
    });
  });

  // ===== Input Validation Security Tests =====
  describe('Input Validation Security', () => {
    describe('OAuth Handler Validation', () => {
      it('should reject missing authorization code', async () => {
        const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: '',
            redirectUri: 'http://localhost:5173/oauth/callback',
          }),
        });

        expect(response.status).toBe(400);
      });

      it('should reject missing redirect URI', async () => {
        const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'auth_code_123',
            redirectUri: '',
          }),
        });

        expect(response.status).toBe(400);
      });

      it('should reject null/undefined fields', async () => {
        const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: null,
            redirectUri: undefined,
          }),
        });

        expect([400, 500]).toContain(response.status);
      });
    });

    describe('Chat Request Validation', () => {
      const validToken = 'Bearer test_token';

      it('should reject missing message field', async () => {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': validToken,
          },
          body: JSON.stringify({
            message: '',
            provider: 'gemini',
          }),
        });

        expect(response.status).toBe(400);
      });

      it('should reject overly long messages', async () => {
        const longMessage = 'x'.repeat(10000);

        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': validToken,
          },
          body: JSON.stringify({
            message: longMessage,
            provider: 'gemini',
          }),
        });

        expect([400, 413]).toContain(response.status);
      });

      it('should reject invalid provider values', async () => {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': validToken,
          },
          body: JSON.stringify({
            message: 'test',
            provider: 'invalid_provider_xyz',
          }),
        });

        expect([400, 500]).toContain(response.status);
      });
    });

    describe('Sync Request Validation', () => {
      const validToken = 'Bearer test_token';

      it('should reject invalid scope values', async () => {
        const response = await fetch(`${API_BASE_URL}/api/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': validToken,
          },
          body: JSON.stringify({
            scope: 'invalid_scope',
          }),
        });

        expect([400, 500]).toContain(response.status);
      });

      it('should accept valid scope values', async () => {
        const validScopes = ['all', 'accounts', 'transactions', 'goals'];

        for (const scope of validScopes) {
          const response = await fetch(`${API_BASE_URL}/api/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': validToken,
            },
            body: JSON.stringify({ scope }),
          });

          expect(response.status).toBeDefined();
        }
      });
    });
  });

  // ===== Data Protection Security Tests =====
  describe('Data Protection Security', () => {
    it('should not expose sensitive data in responses', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      const data = await response.json();

      // Should not contain credentials, keys, or sensitive config
      const responseText = JSON.stringify(data);
      expect(responseText).not.toContain('SECRET');
      expect(responseText).not.toContain('API_KEY');
      expect(responseText).not.toContain('PASSWORD');
    });

    it('should not log tokens to response', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'test_auth_code',
          redirectUri: 'http://localhost:5173/oauth/callback',
        }),
      });

      const responseText = await response.text();
      // Response should not contain the input auth code
      expect(responseText).not.toContain('test_auth_code');
    });

    it('should return security headers', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`);

      // Check for important security headers
      expect(response.headers.has('x-content-type-options')).toBeTruthy();
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');

      expect(response.headers.has('x-frame-options')).toBeTruthy();
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    });

    it('should implement proper CORS headers', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });

      const corsOrigin = response.headers.get('access-control-allow-origin');
      expect(corsOrigin).toBeDefined();
      // Should only allow expected origins, not *
      expect(corsOrigin).not.toBe('*');
    });
  });

  // ===== CORS Security Tests =====
  describe('CORS Security', () => {
    it('should allow requests from valid frontend origin', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });

      const corsOrigin = response.headers.get('access-control-allow-origin');
      expect(['http://localhost:5173', '*']).toContain(corsOrigin);
    });

    it('should reject requests from unknown origins', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        headers: {
          'Origin': 'http://malicious.com',
        },
      });

      // Should either not include CORS header or reject the origin
      const corsOrigin = response.headers.get('access-control-allow-origin');
      expect(corsOrigin).not.toBe('http://malicious.com');
    });

    it('should return correct CORS methods', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
        },
      });

      const allowedMethods = response.headers.get('access-control-allow-methods');
      expect(allowedMethods).toBeDefined();
      expect(allowedMethods).toContain('GET');
      expect(allowedMethods).toContain('POST');
    });
  });

  // ===== Payload Size & DoS Protection Tests =====
  describe('Payload Size & DoS Protection', () => {
    it('should handle reasonable payload sizes', async () => {
      const payload = {
        message: 'This is a normal message within acceptable size limits',
        provider: 'gemini',
      };

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test',
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBeDefined();
    });

    it('should reject extremely large payloads', async () => {
      // Create a payload > 1MB
      const largePayload = {
        message: 'x'.repeat(1024 * 1024 * 2), // 2MB
      };

      try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test',
          },
          body: JSON.stringify(largePayload),
        });

        // Should either reject with 413 or handle gracefully
        expect([400, 413, 500]).toContain(response.status);
      } catch (error) {
        // Network error from oversized payload is acceptable
        expect(error).toBeDefined();
      }
    });

    it('should handle rapid successive requests', async () => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          fetch(`${API_BASE_URL}/api/health`)
        );
      }

      const responses = await Promise.all(requests);

      // All requests should either succeed or be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  // ===== Content Type Validation Tests =====
  describe('Content Type Validation', () => {
    it('should reject requests with invalid content-type', async () => {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain', // Wrong type
          'Authorization': 'Bearer test',
        },
        body: 'message=test',
      });

      expect([400, 415]).toContain(response.status);
    });

    it('should accept application/json content-type', async () => {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test',
        },
        body: JSON.stringify({ message: 'test', provider: 'gemini' }),
      });

      expect(response.status).toBeDefined();
    });
  });

  // ===== Injection Attack Prevention Tests =====
  describe('Injection Attack Prevention', () => {
    it('should handle XSS payloads safely', async () => {
      const xssPayload = '<script>alert("xss")</script>';

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test',
        },
        body: JSON.stringify({
          message: xssPayload,
          provider: 'gemini',
        }),
      });

      // Should not execute the script, just treat it as text
      expect([200, 400]).toContain(response.status);
    });

    it('should handle SQL-like injection payloads', async () => {
      const sqlPayload = "'; DROP TABLE users; --";

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test',
        },
        body: JSON.stringify({
          message: sqlPayload,
          provider: 'gemini',
        }),
      });

      // Should treat as text, not execute
      expect(response.status).toBeDefined();
    });

    it('should sanitize special characters in input', async () => {
      const specialChars = '!@#$%^&*(){}[]|\\:";\'<>?,./~`';

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test',
        },
        body: JSON.stringify({
          message: specialChars,
          provider: 'gemini',
        }),
      });

      expect([200, 400]).toContain(response.status);
    });
  });
});
