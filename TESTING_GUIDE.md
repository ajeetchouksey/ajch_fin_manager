# Finance Manager - Testing Guide

**Purpose:** Run automated integration, security, and UAT tests against your local development environment

**Status:** Testing framework complete ✅
**Test Files:** 3 test suites with 100+ individual tests
**Configuration:** Jest with TypeScript support

---

## 📋 Quick Start

### Prerequisites
- Node.js 18+ installed
- Backend running on `http://localhost:8787`
- Frontend running on `http://localhost:5173`
- Google OAuth credentials in `.dev.vars` (optional, for OAuth tests)

### Setup

```bash
# From project root
npm install

# Install test dependencies (if not already installed)
npm install --save-dev jest ts-jest @types/jest typescript

# Verify Jest is working
npx jest --version
```

### Running Tests

```bash
# Run ALL tests
npm test

# Run specific test suite
npm test -- integration.test.ts     # Integration tests only
npm test -- security.test.ts        # Security tests only
npm test -- uat.test.ts             # UAT tests only

# Run with coverage report
npm test -- --coverage

# Run in watch mode (re-run on file changes)
npm test -- --watch

# Run specific test by name pattern
npm test -- -t "OAuth" # Runs all tests matching "OAuth"
npm test -- -t "should block unauthorized" # Specific test
```

---

## 🚀 Before Running Tests

### 1. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd /path/to/ajch_fin_manager
npm run dev
# Expected output: Worker listening at http://localhost:8787
```

**Terminal 2 - Frontend:**
```bash
cd /path/to/ajch_fin_manager/frontend
npm run dev
# Expected output: Local: http://localhost:5173
```

### 2. Verify Servers Are Running

```bash
# Test backend health
curl http://localhost:8787/api/health
# Should respond with: {"status":"ok","timestamp":"...","environment":"development"}

# Test frontend
curl http://localhost:5173
# Should respond with HTML content
```

### 3. (Optional) Configure Google OAuth for OAuth Tests

To test the full OAuth flow, add credentials to `.dev.vars`:

```bash
# Edit .dev.vars with your Google OAuth credentials
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

---

## 📊 Test Suites Overview

### 1. Integration Tests (`integration.test.ts`)

**Purpose:** Verify backend ↔ frontend ↔ API integration

**Test Coverage:**
- ✅ OAuth flow end-to-end
- ✅ API endpoint responses (health, auth, chat, profile, sync, analyze)
- ✅ CORS headers
- ✅ Security headers
- ✅ Frontend-backend communication
- ✅ API response times

**Key Tests:**
```bash
npm test -- integration.test.ts -t "OAuth Flow"
npm test -- integration.test.ts -t "health"
npm test -- integration.test.ts -t "Protected API"
```

**Expected Results:**
```
✅ PASSED: OAuth authentication flow integration
✅ PASSED: All API endpoints responding correctly
✅ PASSED: CORS headers properly configured
✅ PASSED: Response times within limits
```

---

### 2. Security Tests (`security.test.ts`)

**Purpose:** Verify authentication, input validation, and data protection

**Test Coverage:**
- ✅ Authentication security (unauthorized access blocked)
- ✅ Input validation (missing fields, invalid data)
- ✅ Data protection (no sensitive data in responses)
- ✅ CORS security (origin validation)
- ✅ Payload size & DoS protection
- ✅ Content-type validation
- ✅ Injection attack prevention (XSS, SQL-like)

**Key Tests:**
```bash
npm test -- security.test.ts -t "Authentication"
npm test -- security.test.ts -t "Input Validation"
npm test -- security.test.ts -t "Injection Attack Prevention"
```

**Expected Results:**
```
✅ PASSED: Unauthorized access blocked
✅ PASSED: Invalid tokens rejected
✅ PASSED: Input validation prevents invalid data
✅ PASSED: Security headers present
✅ PASSED: XSS/SQL injection payloads safely handled
```

---

### 3. UAT Tests (`uat.test.ts`)

**Purpose:** Verify user workflows, performance, and compatibility

**Test Coverage:**
- ✅ Login workflow (7 steps with acceptance criteria)
- ✅ Logout workflow
- ✅ Profile management
- ✅ Performance metrics (page load times, API response times)
- ✅ API reliability (concurrent requests, error handling)
- ✅ Browser compatibility
- ✅ Mobile responsiveness (simulated)

**Key Tests:**
```bash
npm test -- uat.test.ts -t "Login Workflow"
npm test -- uat.test.ts -t "Performance"
npm test -- uat.test.ts -t "Browser Compatibility"
```

**Expected Results:**
```
✅ PASSED: Login page loads in < 2 seconds
✅ PASSED: Health check responds in < 200ms
✅ PASSED: Protected routes require authentication
✅ PASSED: Multiple concurrent requests handled
✅ PASSED: Consistent API response format
```

---

## 📈 Running Tests with Coverage

Generate a coverage report to see which code paths are tested:

```bash
npm test -- --coverage
```

This generates a coverage report showing:
- Line coverage (% of code executed)
- Branch coverage (% of if/else paths tested)
- Function coverage (% of functions executed)
- Statement coverage (% of statements executed)

**Output:**
```
File                                | % Stmts | % Branch | % Funcs | % Lines |
---------------------------------------------------------------------------
All files                           |   75.8  |   68.4   |   82.1  |   75.2  |
 src                                |   72.5  |   65.3   |   79.4  |   72.1  |
  handlers/auth.ts                  |   88.3  |   78.5   |   95.2  |   88.1  |
  handlers/chat.ts                  |   65.4  |   58.2  |   71.3  |   64.8  |
  ...
```

---

## 🔍 Debugging Failed Tests

### Check Backend Server

```bash
# Verify backend is running
curl http://localhost:8787/api/health

# Check backend logs for errors
# Look for error messages in Terminal 1 (npm run dev output)

# Restart backend
# Stop: Ctrl+C in Terminal 1
# Start: npm run dev
```

### Check Frontend Server

```bash
# Verify frontend is running
curl http://localhost:5173

# Check for console errors
# Look for red errors in Terminal 2 (npm run dev output)

# Restart frontend
# Stop: Ctrl+C in Terminal 2
# Start: cd frontend && npm run dev
```

### Common Issues & Solutions

**Issue: "Cannot reach http://localhost:8787"**
- ✓ Backend not running
- ✓ Solution: Start backend with `npm run dev`

**Issue: "Cannot reach http://localhost:5173"**
- ✓ Frontend not running
- ✓ Solution: Start frontend with `cd frontend && npm run dev`

**Issue: "OAuth tests failing with 401"**
- ✓ Google credentials not in .dev.vars
- ✓ Solution: Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .dev.vars

**Issue: "Test timeout after 10 seconds"**
- ✓ Server responding slowly or not at all
- ✓ Solution: Check server logs, verify network connectivity

**Issue: "Port already in use"**
- ✓ Another process using port 8787 or 5173
- ✓ Solution: `lsof -i :8787` then `kill -9 <PID>`

---

## 🎯 Test Execution Strategies

### Strategy 1: Quick Health Check
```bash
# Run only integration health test (< 5 seconds)
npm test -- integration.test.ts -t "health"
```

### Strategy 2: Full Validation Before Deployment
```bash
# Run complete test suite with coverage
npm test -- --coverage
# Then review TESTING_SUITE.md for manual UAT steps
```

### Strategy 3: Continuous Testing (Watch Mode)
```bash
# Run tests in watch mode
# Re-runs when test files change
npm test -- --watch
```

### Strategy 4: Security-Focused Testing
```bash
# Run only security tests
npm test -- security.test.ts
```

### Strategy 5: Performance Testing
```bash
# Run only performance-related tests
npm test -- uat.test.ts -t "Performance"
```

---

## 📝 Interpreting Test Results

### Successful Test Run
```
PASS  src/__tests__/integration.test.ts (1234ms)
  ✓ should complete OAuth authentication flow (45ms)
  ✓ should return health status (12ms)
  ✓ should block unauthorized access (34ms)
  ...

PASS  src/__tests__/security.test.ts (2345ms)
  ✓ should reject invalid tokens (28ms)
  ✓ should handle XSS payloads safely (67ms)
  ...

Test Suites: 3 passed, 3 total
Tests:       95 passed, 95 total
Snapshots:   0 total
Time:        12.456s
```

### Failed Test Run
```
FAIL  src/__tests__/integration.test.ts
  ✗ should connect to backend (45ms)
    Error: connect ECONNREFUSED 127.0.0.1:8787

FAIL  src/__tests__/security.test.ts
  ✗ should reject missing authorization code (28ms)
    Expected status code 400, got 500

Test Suites: 2 failed, 1 passed, 3 total
Tests:       3 failed, 92 passed, 95 total
```

---

## 🔧 Customizing Tests

### Add a New Test

```typescript
// In src/__tests__/integration.test.ts or new file

it('should test new feature', async () => {
  const response = await fetch('http://localhost:8787/api/new-endpoint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test_token',
    },
    body: JSON.stringify({ data: 'test' }),
  });

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty('expected_field');
});
```

### Skip a Test (Temporarily)
```typescript
// Use .skip to skip a test during development
it.skip('should test feature under development', async () => {
  // Test code
});
```

### Focus on a Single Test
```typescript
// Use .only to run only this test
it.only('should test specific feature', async () => {
  // Test code
});
```

---

## 📊 Test Report Generation

### Generate HTML Coverage Report

```bash
npm test -- --coverage --coverageReporters=html

# Open the report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

### Generate JUnit XML Report (for CI/CD)

```bash
# Requires jest-junit
npm install --save-dev jest-junit

# Add to package.json scripts:
"test:ci": "jest --reporters=default --reporters=jest-junit"

# Run
npm run test:ci

# Output: junit.xml (for GitHub Actions, GitLab CI, Jenkins, etc.)
```

---

## 🚀 Integration with CI/CD

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start backend
        run: npm run dev &
      
      - name: Start frontend
        run: cd frontend && npm run dev &
      
      - name: Wait for servers
        run: npm run wait-for-servers
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

## ✅ Pre-Deployment Testing Checklist

Before deploying to production, ensure:

- [ ] All integration tests passing: `npm test -- integration.test.ts`
- [ ] All security tests passing: `npm test -- security.test.ts`
- [ ] All UAT tests passing: `npm test -- uat.test.ts`
- [ ] Coverage report generated: `npm test -- --coverage`
- [ ] Manual login/logout workflow verified
- [ ] Manual OAuth flow tested (if credentials available)
- [ ] Performance metrics acceptable (< 2s frontend, < 200ms API)
- [ ] No console errors in browser DevTools
- [ ] No console errors in backend logs

---

## 📞 Troubleshooting

### Tests won't start
```bash
# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Specific test timing out
```bash
# Increase timeout for slow tests
npm test -- --testTimeout=30000

# Or in test file:
jest.setTimeout(30000);
describe('Slow tests', () => {
  it('should complete slowly', async () => {
    // test code
  }, 30000); // Custom timeout
});
```

### Want to see detailed output
```bash
# Run with verbose output
npm test -- --verbose

# Run with debug logging
DEBUG=* npm test
```

---

## 📚 Resources

- **Jest Documentation:** https://jestjs.io/docs/getting-started
- **Testing Library Docs:** https://testing-library.com/
- **TypeScript Jest Setup:** https://kulshekhar.github.io/ts-jest/
- **API Testing Best Practices:** https://restfulapi.net/http-status-codes/

---

## 🎉 Success Criteria

When all tests pass, you'll see:

```
Test Suites: 3 passed, 3 total
Tests:       100+ passed, 100+ total
Snapshots:   0 total
Time:        ~15-30s
```

This means:
✅ Backend and frontend integrated correctly
✅ All API endpoints working
✅ Security measures in place
✅ User workflows validated
✅ Performance acceptable
✅ Ready for production deployment

---

**Last Updated:** 2026-10-12
**Test Framework Version:** Jest with ts-jest
**Minimum Node Version:** 18.0.0
