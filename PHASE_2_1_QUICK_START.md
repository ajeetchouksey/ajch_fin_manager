# Phase 2.1 Quick Start Guide

## Prerequisites
- Google OAuth Client ID from Cloudflare dashboard
- Node.js 18+ installed
- Backend running on `http://localhost:8787`

## Setup

### 1. Configure Environment
```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local`:
```bash
VITE_API_URL=http://localhost:8787
VITE_GOOGLE_CLIENT_ID=your-client-id-here
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Testing the Authentication Flow

### Login Test
1. Click "Sign in with Google" button
2. You'll be redirected to Google's login page
3. Sign in with your Google account
4. Authorize the app to access your profile
5. You'll be redirected back to the app with a valid session
6. You should see the Dashboard placeholder

### Session Persistence Test
1. After logging in, refresh the page
2. The app should maintain your session
3. Check localStorage to see the saved auth data

### Logout Test
1. Currently no logout UI (Phase 2.3)
2. Open browser DevTools Console
3. Run: `localStorage.removeItem('authData')`
4. Refresh - you'll be redirected to login

### Protected Route Test
1. Open DevTools Console while logged out
2. Run: `window.location.href = '/dashboard'`
3. You should be redirected to /login

## Project Structure
```
frontend/
├── src/
│   ├── context/         # Auth state management
│   ├── hooks/          # Custom hooks (useAuth)
│   ├── pages/          # Login & callback pages
│   ├── components/     # Route protection
│   ├── types/          # TypeScript definitions
│   ├── utils/          # OAuth utilities
│   ├── App.tsx         # Main routing
│   └── main.tsx        # App entry point
├── .env.local          # Local environment vars
└── package.json        # Dependencies
```

## Available Commands
```bash
npm run dev      # Start dev server with HMR
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Key Files to Review
1. **AuthContext.tsx** - How sessions are managed
2. **LoginPage.tsx** - Login UI and Google button
3. **OAuthCallbackPage.tsx** - Token exchange logic
4. **useAuth.ts** - Hook for accessing auth state
5. **oauth.ts** - OAuth utility functions

## Common Issues

### "No authorization code received"
- Make sure your Google Client ID is correct in `.env.local`
- Check that redirect URI is configured in Google Console

### "Failed to exchange code for token"
- Backend might not be running on localhost:8787
- Check `VITE_API_URL` in `.env.local`
- Verify backend has `/api/auth/token` endpoint

### "Session expired. Please log in again"
- Token validation failed
- Check Google Client ID validity
- Clear localStorage and try again

## Next Phase (2.2)
- API client wrapper with TypeScript types
- Custom hooks for fetching accounts, transactions
- Dashboard UI implementation
- Integration with Phase 1 backend

## Troubleshooting Commands

```bash
# Clear all build artifacts
rm -rf dist node_modules

# Reinstall dependencies
npm install

# Clean TypeScript cache
npx tsc -b --clean

# Check for type errors
npx tsc --noEmit

# Start with fresh auth
# Open DevTools Console and run:
localStorage.clear()
location.reload()
```

---

**Phase 2.1 Status:** ✅ Complete and ready for testing
