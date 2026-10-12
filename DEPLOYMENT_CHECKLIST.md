# Finance Manager - Deployment Checklist

**Project:** Finance Manager  
**Status:** Ready for Production  
**Est. Time:** 2-3 hours  

---

## ✅ PRE-DEPLOYMENT (30 minutes)

### Local Testing
- [ ] Pull latest code: `git pull`
- [ ] Add Google Client Secret to `.dev.vars`
- [ ] Run backend: `npm run dev` → Check http://localhost:8787/api/health
- [ ] Run frontend: `cd frontend && npm run dev` → Check http://localhost:5173
- [ ] Test OAuth flow: Click "Sign in with Google" and complete flow
- [ ] Verify dashboard loads after authentication

### Build for Production
- [ ] Backend build: `npm run build` ✓ Creates `dist/worker.js`
- [ ] Frontend build: `cd frontend && npm run build` ✓ Creates `frontend/dist/`
- [ ] Verify no TypeScript errors
- [ ] Verify no ESLint errors

---

## 🔐 GOOGLE CLOUD SETUP (30 minutes)

### Create Project & Enable APIs
- [ ] Go to: https://console.cloud.google.com
- [ ] Create new project: "Finance Manager"
- [ ] Enable "Google Drive API"

### Create OAuth Credentials
- [ ] Go to: Credentials → Create Credentials → OAuth 2.0 Client ID
- [ ] Application type: "Web application"
- [ ] Name: "Finance Manager"

### Configure Authorized URLs

**JavaScript Origins:**
```
http://localhost:5173
http://localhost:8787
https://finance.ajeetchouksey.dev
```
- [ ] Add all three origins

**Redirect URIs:**
```
http://localhost:8787/api/auth/token
https://finance-api.ajeetchouksey.dev/api/auth/token
```
- [ ] Add both redirect URIs

### Save Credentials
- [ ] Copy Client ID: `939308613423-nj666hdbq0et0vt893ubmhebvssfhua5.apps.googleusercontent.com`
- [ ] Copy Client Secret: `_________________________` (save securely!)

---

## ☁️ CLOUDFLARE SETUP (45 minutes)

### Create R2 Bucket
- [ ] Dashboard → Storage → R2
- [ ] Create bucket: Name = `ajch-fin-cache`
- [ ] Region: `eu` (Frankfurt)
- [ ] Confirm creation

### Create KV Namespace
- [ ] Dashboard → Workers & Pages → KV
- [ ] Create namespace: `ajch-fin-sessions-production`
- [ ] Get Production ID: `___________________________`
- [ ] Get Preview ID: `___________________________`

### Update wrangler.toml
```toml
[[r2_buckets]]
binding = "CACHE"
bucket_name = "ajch-fin-cache"

[[kv_namespaces]]
binding = "SESSIONS"
id = "PASTE_PRODUCTION_ID_HERE"
preview_id = "PASTE_PREVIEW_ID_HERE"
```
- [ ] Update both namespace IDs
- [ ] Save file

### Set Cloudflare Secrets
```bash
wrangler secret put GOOGLE_CLIENT_ID
# Paste: 939308613423-nj666hdbq0et0vt893ubmhebvssfhua5.apps.googleusercontent.com

wrangler secret put GOOGLE_CLIENT_SECRET
# Paste: YOUR_CLIENT_SECRET

wrangler secret put GEMINI_API_KEY
# Paste: YOUR_KEY (optional, for AI)

wrangler secret put CLAUDE_API_KEY
# Paste: YOUR_KEY (optional, for AI)

wrangler secret put OPENAI_API_KEY
# Paste: YOUR_KEY (optional, for AI)
```
- [ ] GOOGLE_CLIENT_ID set
- [ ] GOOGLE_CLIENT_SECRET set
- [ ] At least one AI provider key set (GEMINI recommended)

---

## 🚀 BACKEND DEPLOYMENT (20 minutes)

### Deploy to Cloudflare Workers
```bash
# From project root (NOT frontend folder)
npm run build
wrangler deploy
```
- [ ] Build completes successfully
- [ ] Shows: "Successfully published your Worker"
- [ ] Note the Worker URL: `https://ajch-fin-manager.workers.dev`

### Verify Backend
```bash
curl https://ajch-fin-manager.workers.dev/api/health
```
- [ ] Returns: `{"status":"ok","timestamp":"...","environment":"production"}`
- [ ] Backend is working ✓

---

## 🎨 FRONTEND DEPLOYMENT (15 minutes)

### Set Environment Variables
```bash
cd frontend
# Set production API URL
export VITE_API_URL=https://finance-api.ajeetchouksey.dev
```
- [ ] API URL points to backend domain

### Build Frontend
```bash
npm run build
```
- [ ] Build completes successfully
- [ ] Creates `frontend/dist/` folder

### Deploy to Cloudflare Pages
```bash
wrangler pages deploy dist
```
- [ ] Deployment completes
- [ ] Shows deployment URL: `https://ajch-fin-manager-frontend.pages.dev`

---

## 🌐 DNS SETUP (Optional, 30 minutes)

**Skip this if using Cloudflare's default domains**

### Add DNS Records
If you want `finance.ajeetchouksey.dev` and `finance-api.ajeetchouksey.dev`:

**Frontend CNAME:**
- [ ] Type: CNAME
- [ ] Name: `finance`
- [ ] Content: `ajch-fin-manager-frontend.pages.dev`
- [ ] Proxy: Enabled

**Backend CNAME:**
- [ ] Type: CNAME
- [ ] Name: `finance-api`
- [ ] Content: `ajch-fin-manager.workers.dev`
- [ ] Proxy: Enabled

### Wait for DNS Propagation
- [ ] Wait 5-15 minutes for DNS to propagate
- [ ] Test: `nslookup finance.ajeetchouksey.dev`
- [ ] Test: `nslookup finance-api.ajeetchouksey.dev`

### Verify SSL
- [ ] Cloudflare Dashboard → SSL/TLS → Status: Active

---

## ✅ TESTING & VERIFICATION (30 minutes)

### Test Backend
```bash
curl https://finance-api.ajeetchouksey.dev/api/health
# or https://ajch-fin-manager.workers.dev/api/health
```
- [ ] Responds with status OK

### Test Frontend
- [ ] Visit: `https://finance.ajeetchouksey.dev` (or Pages URL)
- [ ] Page loads without errors
- [ ] "Sign in with Google" button visible

### Test OAuth Flow
1. [ ] Click "Sign in with Google" button
2. [ ] Redirected to Google login page
3. [ ] Sign in with Google account
4. [ ] Authorize app permissions
5. [ ] Redirected back to dashboard
6. [ ] Dashboard page loads

### Test Persistence
- [ ] Refresh page (Ctrl+R or Cmd+R)
- [ ] Should stay logged in
- [ ] Session persists ✓

### Monitor Analytics
- [ ] Cloudflare Dashboard → Analytics
- [ ] Verify traffic is showing
- [ ] Check KV operations (should be <100k/day)
- [ ] Check R2 storage (should be <15 GB/month)

---

## 🎯 FINAL CHECKLIST

### Code & Deployment
- [ ] All code committed and pushed
- [ ] Backend deployed to Cloudflare
- [ ] Frontend deployed to Cloudflare
- [ ] No build errors or warnings

### Configuration
- [ ] Google OAuth credentials set
- [ ] Cloudflare secrets configured
- [ ] Environment variables correct
- [ ] DNS records configured (if custom domain)

### Verification
- [ ] Health endpoint responding
- [ ] Frontend loads
- [ ] OAuth flow working
- [ ] Session persists
- [ ] No errors in console
- [ ] Analytics showing traffic

### Documentation
- [ ] Deployment steps documented
- [ ] Environment variables saved securely
- [ ] Credentials backed up safely
- [ ] Team notified of deployment

---

## 📊 SUCCESS METRICS

When all checkboxes are ✓, your project is LIVE:

✅ Backend responding at production URL  
✅ Frontend accessible and loading  
✅ OAuth authentication working  
✅ Sessions persisting across refreshes  
✅ Cloudflare analytics showing traffic  
✅ SSL/TLS certificate active  
✅ No errors in logs or console  

---

## 🔗 Quick Links

- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **Google Cloud Console:** https://console.cloud.google.com
- **Production Backend:** https://ajch-fin-manager.workers.dev
- **Production Frontend:** https://ajch-fin-manager-frontend.pages.dev
- **Docs:** PRODUCTION_DEPLOYMENT.md

---

## 💡 Tips

- If you get stuck, check `PRODUCTION_DEPLOYMENT.md` → Troubleshooting
- Save all credentials in a secure password manager
- Test locally first before deploying
- Monitor Cloudflare usage (free tier limits apply)
- Keep git commits clean and documented

---

**Total Time: ~2-3 hours**  
**Status: Ready to Deploy** 🚀

Good luck! 🎉
