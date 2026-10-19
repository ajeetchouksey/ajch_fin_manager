# GitHub Actions CI/CD Setup Guide

**Project:** Finance Manager  
**Purpose:** Automated testing and deployment to Cloudflare  
**Trigger:** Pushes to `main` and `develop` branches  

---

## 🎯 Overview

This GitHub Actions workflow automates:
1. **Testing** — Jest, Playwright E2E tests
2. **Building** — Backend (Worker) and Frontend (Pages)
3. **Deployment** — To Cloudflare Workers and Pages
4. **Verification** — Health checks and smoke tests

---

## 🔐 Required GitHub Secrets

You need to set these secrets in your GitHub repository settings:

### GitHub Settings Path
```
Settings → Secrets and variables → Actions → New repository secret
```

### Required Secrets

#### 1. Cloudflare API Token
```
Name: CLOUDFLARE_API_TOKEN
Value: <your-cloudflare-api-token>
```

**How to create:**
1. Log into Cloudflare Dashboard
2. Go to **My Profile** → **API Tokens**
3. Click **Create Token**
4. Select **Edit Cloudflare Workers** template
5. Grant permissions for:
   - **Workers Scripts** — Edit
   - **Pages** — Edit
   - **KV** — Edit (if using KV)
6. Copy the token and save as `CLOUDFLARE_API_TOKEN` secret

#### 2. Cloudflare Account ID
```
Name: CLOUDFLARE_ACCOUNT_ID
Value: <your-cloudflare-account-id>
```

**How to find:**
1. Log into Cloudflare Dashboard
2. Go to **Workers & Pages** 
3. Look for Account ID in sidebar
4. Copy and save as `CLOUDFLARE_ACCOUNT_ID` secret

### Optional Secrets (for additional features)
```
GOOGLE_CLIENT_ID=<from-google-cloud>
GOOGLE_CLIENT_SECRET=<from-google-cloud>
GEMINI_API_KEY=<from-google>
CLAUDE_API_KEY=<from-anthropic>
OPENAI_API_KEY=<from-openai>
```

---

## 📋 GitHub Actions Workflow Details

### Workflow File
```
.github/workflows/deploy.yml
```

### Trigger Events
- **Push to `main`** — Full test, build, and deploy
- **Push to `develop`** — Full test, build, and deploy (optional)
- **Pull Requests** — Run tests only (no deploy)

### Workflow Stages

#### 1. Test Stage (Always Runs)
**Job:** `test`  
**Duration:** ~5-10 minutes

```
✓ Checkout code
✓ Setup Node.js 18
✓ Install dependencies
✓ TypeScript type check
✓ Integration tests (Jest)
✓ Security tests (Jest)
✓ UAT tests (Jest)
✓ Coverage report generation
✓ E2E tests (Playwright)
✓ Upload test reports
```

**Artifacts Generated:**
- Coverage report (coverage/)
- Playwright report (playwright-report/)
- Test results (JSON, JUnit XML)

#### 2. Build Backend Stage
**Job:** `build-backend`  
**Trigger:** Only on push to main
**Duration:** ~2-3 minutes

```
✓ Checkout code
✓ Setup Node.js 18
✓ Install dependencies
✓ Compile TypeScript → dist/worker.js
✓ Verify build output
✓ Upload build artifact
```

**Output:** `dist/worker.js` (uploaded as artifact)

#### 3. Build Frontend Stage
**Job:** `build-frontend`  
**Trigger:** Only on push to main
**Duration:** ~3-5 minutes

```
✓ Checkout code
✓ Setup Node.js 18
✓ Install frontend dependencies
✓ Build with Vite → frontend/dist/
✓ Check bundle size
✓ Upload build artifact
```

**Output:** `frontend/dist/` (uploaded as artifact)

#### 4. Deploy Backend Stage
**Job:** `deploy-backend`  
**Trigger:** Only on push to main branch
**Duration:** ~2-3 minutes

```
✓ Checkout code
✓ Build backend
✓ Deploy with Wrangler
✓ Wait for propagation (10s)
✓ Health check at https://ajch-fin-manager.workers.dev/api/health
✓ Verify 200 status code
```

**Deployment:** Cloudflare Workers  
**URL:** `https://ajch-fin-manager.workers.dev`

#### 5. Deploy Frontend Stage
**Job:** `deploy-frontend`  
**Trigger:** Only on push to main branch
**Duration:** ~2-3 minutes

```
✓ Checkout code
✓ Build frontend
✓ Deploy with Wrangler Pages
✓ Wait for propagation (10s)
✓ Health check at https://ajch-fin-manager-frontend.pages.dev
✓ Verify 200 status code
```

**Deployment:** Cloudflare Pages  
**URL:** `https://ajch-fin-manager-frontend.pages.dev`

#### 6. Smoke Tests Stage
**Job:** `smoke-tests`  
**Trigger:** Only on push to main (after backend & frontend deployed)
**Duration:** ~1 minute

```
✓ Test backend health endpoint
✓ Check response contains "status":"ok"
✓ Test frontend availability
✓ Check frontend returns 200
```

#### 7. Notification Stage
**Job:** `notify`  
**Always runs** (even on failure)

```
✓ Create deployment summary
✓ Add to GitHub Actions summary
✓ Show all job statuses
✓ Display deployment URLs
```

---

## ✅ First-Time Setup Checklist

### Step 1: Add GitHub Secrets
- [ ] Go to Settings → Secrets and variables → Actions
- [ ] Add `CLOUDFLARE_ACCOUNT_ID`
- [ ] Add `CLOUDFLARE_API_TOKEN`
- [ ] Verify secrets are set (they should show as •••••)

### Step 2: Verify Workflow File
- [ ] Check `.github/workflows/deploy.yml` exists
- [ ] Verify syntax is correct
- [ ] Check branch triggers (`main`, `develop`)

### Step 3: Test the Workflow
- [ ] Make a small commit to a feature branch
- [ ] Create a Pull Request
- [ ] Verify tests run successfully
- [ ] Check Actions tab for green checkmark

### Step 4: Deploy to Production
- [ ] Merge PR to main branch
- [ ] Go to **Actions** tab
- [ ] Watch deployment progress
- [ ] Check for green checkmarks on all jobs

### Step 5: Verify Deployments
- [ ] Test backend: `curl https://ajch-fin-manager.workers.dev/api/health`
- [ ] Test frontend: Visit `https://ajch-fin-manager-frontend.pages.dev`
- [ ] Check Cloudflare dashboard for no errors

---

## 🔄 Workflow Execution Example

### On Push to Main Branch
```
Test Phase
  ├─ Run all Jest tests
  ├─ Run Playwright E2E tests
  └─ Generate coverage report
    ↓
Build Phase (Parallel)
  ├─ Build Backend (npm run build)
  └─ Build Frontend (cd frontend && npm run build)
    ↓
Deploy Phase (Parallel)
  ├─ Deploy Backend to Workers
  │  └─ Verify health endpoint
  └─ Deploy Frontend to Pages
     └─ Verify page loads
       ↓
Smoke Tests
  ├─ Test backend health
  └─ Test frontend availability
    ↓
Notify
  └─ Create summary in Actions
```

**Total Duration:** ~15-20 minutes

---

## 📊 Monitoring Deployments

### GitHub Actions Dashboard
1. Go to **Actions** tab in repository
2. Click on workflow run
3. View job logs and artifacts
4. See deployment status

### View Live Deployments
- **Backend:** https://dash.cloudflare.com/workers/
- **Frontend:** https://dash.cloudflare.com/pages/
- **Health Check:** `https://ajch-fin-manager.workers.dev/api/health`

### Cloudflare Analytics
1. Log into Cloudflare Dashboard
2. Check **Analytics** for:
   - Request count
   - Error rate
   - Response times
   - KV operations

---

## 🐛 Troubleshooting

### Build Failures

**Issue: "dist/worker.js not found"**
```
✗ Backend build failed
- Check: npm run build output
- Fix: Verify TypeScript compiles correctly
- Run locally: npm run build
```

**Issue: "frontend/dist not found"**
```
✗ Frontend build failed
- Check: cd frontend && npm run build output
- Fix: Verify dependencies installed
- Run locally: cd frontend && npm run build
```

### Deployment Failures

**Issue: "401 Unauthorized"**
```
✗ Cloudflare authentication failed
- Fix: Verify API token in GitHub secrets
- Regenerate API token in Cloudflare
- Re-add to GitHub secrets
```

**Issue: "Worker deployment succeeded but health check failed"**
```
✗ Backend deployed but not responding
- Check: Backend logs in Cloudflare dashboard
- Fix: Verify wrangler.toml configuration
- Check: Environment variables in Cloudflare dashboard
```

**Issue: "Pages deployment succeeded but page not loading"**
```
✗ Frontend deployed but showing 404
- Check: frontend/dist folder exists
- Fix: Verify build process succeeds locally
- Check: wrangler.toml pages configuration
```

### Test Failures

**Issue: "Integration tests failing in CI but passing locally"**
```
✗ Tests pass locally but fail in GitHub Actions
- Possible causes:
  1. Environment variables missing
  2. Servers not started (CI doesn't auto-start dev servers)
  3. Timing issues (network slower in CI)
- Fix: 
  1. Check GitHub Actions logs
  2. Add GOOGLE_CLIENT_SECRET secret if needed
  3. Increase test timeouts
```

**Issue: "E2E tests timing out"**
```
✗ Playwright tests timing out
- Cause: Dev servers not running during E2E tests
- Fix: Playwright config has webServer setup
- Check: Node has enough resources in runner
```

---

## 🔑 Environment Variables in GitHub Actions

### Frontend Environment Variables
If your frontend needs environment variables, add them to:
```
.github/workflows/deploy.yml → jobs.build-frontend.steps → env:
```

Example:
```yaml
- name: Build frontend
  env:
    VITE_API_URL: 'https://ajch-fin-manager.workers.dev'
  run: cd frontend && npm run build
```

### Backend Environment Variables
Backend secrets come from:
1. **Cloudflare Dashboard secrets** (preferred for production)
2. **GitHub Actions secrets** → passed to Wrangler

To pass GitHub secrets to backend:
```yaml
- name: Deploy to Cloudflare Workers
  env:
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
    GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
  run: npx wrangler deploy
```

---

## 📈 Performance Tips

### Speed Up Builds
1. **Cache npm dependencies**
   ```yaml
   cache: 'npm'  # Added in workflow
   ```

2. **Use node_modules caching**
   - Currently configured in workflow

3. **Parallel jobs**
   - Build backend and frontend in parallel
   - Deploy backend and frontend in parallel

### Speed Up Tests
1. **Run tests in parallel**
   ```bash
   jest --maxWorkers=4
   ```

2. **Skip E2E in PR context**
   ```yaml
   if: github.event_name != 'pull_request'
   ```

---

## 🔒 Security Best Practices

### ✅ Implemented
- [ ] Secrets stored in GitHub (not in code)
- [ ] API tokens never logged or printed
- [ ] Deployment only on main branch
- [ ] Pull requests don't deploy

### Additional Security
- Keep API tokens rotated (monthly)
- Use separate tokens for different permissions
- Monitor GitHub Actions logs for exposures
- Audit Cloudflare API token usage regularly

---

## 📚 Additional Commands

### Manual Deployment (if needed)
```bash
# Deploy backend manually
npm run build
wrangler deploy

# Deploy frontend manually
cd frontend
npm run build
wrangler pages deploy dist --project-name=ajch-fin-manager
```

### Check Deployment Status
```bash
# Backend status
curl https://ajch-fin-manager.workers.dev/api/health

# Check Cloudflare Workers
wrangler deployments list

# Check Cloudflare Pages
wrangler pages deployments list --project-name=ajch-fin-manager
```

---

## 🆘 Support

### View Workflow Logs
1. Go to **Actions** tab
2. Click on failed workflow run
3. Expand job to see logs
4. Search for error messages

### Common Log Messages
- `"Cannot find module"` — Dependencies not installed
- `"Port already in use"` — Process still running
- `"401 Unauthorized"` — Bad API token
- `"404 Not Found"` — Wrong URL or deployment not ready

---

## ✨ Next Steps

1. **Add the secrets** to GitHub
2. **Test with a PR** to make sure tests pass
3. **Merge to main** to trigger full deployment
4. **Verify URLs** are responding
5. **Monitor analytics** in Cloudflare dashboard

---

**Workflow Status:** ✅ Complete and Ready

For questions or issues, check the GitHub Actions logs or review the deployment guide.
