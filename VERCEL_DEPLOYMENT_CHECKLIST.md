# Vercel Deployment Checklist

## ✅ Pre-Deployment Status

### Code Readiness
- ✅ Build successful (`npm run build` passes)
- ✅ All dependencies installed
- ✅ TypeScript compilation passes
- ✅ ESLint passes
- ✅ Sentry integration configured
- ✅ Security headers configured
- ✅ Error handling in place

### Configuration Files
- ✅ `next.config.js` - Production optimized
- ✅ `package.json` - All dependencies listed
- ✅ Sentry configs (client, server, edge)
- ✅ Security middleware configured

## ⚠️ Required Before Deployment

### 1. Environment Variables (CRITICAL)

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**:

**Required:**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_DAILY_API_KEY=your_daily_co_api_key
NEXT_PUBLIC_DAILY_DOMAIN=your_daily_co_domain
ADMIN_SIGNUP_PIN=your_secure_4_digit_pin
NODE_ENV=production
```

**Optional (but recommended):**
```
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
SENTRY_ORG=myclinicmd
SENTRY_PROJECT=javascript-nextjs
SENTRY_AUTH_TOKEN=your_sentry_auth_token (for source maps)
NEXT_PUBLIC_SOAP_NOTES_API_URL=https://mcm-soapnotes-production.up.railway.app/api/soap/complete-soapnotes
```

**Important:**
- Set these for **Production**, **Preview**, and **Development** environments
- Never commit these to Git
- `SUPABASE_SERVICE_ROLE_KEY` is secret - keep it secure

### 2. Database Migrations (CRITICAL)

Run all migrations in **Supabase SQL Editor** (in order):

1. `001_create_user_profiles.sql`
2. `002_create_patients_table_with_rls.sql`
3. `003_create_appointments_table_with_rls.sql`
4. ... (all migrations)
5. `018_create_audit_log.sql`
6. `019_add_performance_indexes.sql`

**Location:** `supabase/migrations/` folder

### 3. Supabase Storage Setup (CRITICAL)

1. Go to **Supabase Dashboard → Storage**
2. Create bucket: `patient-documents`
3. Settings:
   - Public: **Yes**
   - File size limit: **10MB**
   - Allowed MIME types: Configure as needed
4. Set up storage policies (RLS)

### 4. Database Backups (RECOMMENDED)

1. Enable automated backups in Supabase
2. Set retention to **7+ days**
3. Test restore procedure

## 🚀 Deployment Steps

### Option A: Vercel Dashboard (Easiest)

1. **Connect Repository**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your Git repository
   - Select the repository

2. **Configure Project**
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm ci` (recommended)

3. **Add Environment Variables**
   - Go to **Settings → Environment Variables**
   - Add all required variables (see section 1)
   - Set for Production, Preview, and Development

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Check deployment logs for errors

### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (preview)
vercel

# Deploy to production
vercel --prod
```

## ✅ Post-Deployment Verification

### 1. Basic Checks
- [ ] Visit production URL
- [ ] Check `/api/health` endpoint
- [ ] Verify HTTPS is enabled
- [ ] Check security headers (use [securityheaders.com](https://securityheaders.com))

### 2. Authentication
- [ ] Test user signup
- [ ] Test user login
- [ ] Test role-based access (doctor, nurse, staff)
- [ ] Verify session management

### 3. Core Features
- [ ] Test patient creation
- [ ] Test appointment scheduling
- [ ] Test video calls (Daily.co integration)
- [ ] Test file uploads (if implemented)
- [ ] Test audit logging

### 4. Monitoring
- [ ] Check Sentry dashboard for errors
- [ ] Verify error tracking is working
- [ ] Check console logs in Sentry
- [ ] Set up alerts in Sentry

### 5. Performance
- [ ] Check page load times
- [ ] Verify database queries are optimized
- [ ] Check CDN is working
- [ ] Monitor API response times

## 🔧 Vercel-Specific Configuration

### Build Settings (Auto-detected)
- **Framework:** Next.js
- **Build Command:** `npm run build`
- **Output Directory:** `.next`
- **Install Command:** `npm ci` (recommended for faster installs)

### Node.js Version
- Vercel uses Node.js 18.x by default
- To specify version, add `.nvmrc` file:
  ```
  18
  ```

### Custom Domain (Optional)
1. Go to **Project → Settings → Domains**
2. Add your custom domain
3. Follow DNS configuration instructions

## 🐛 Troubleshooting

### Build Fails
- **Check:** Environment variables are set
- **Check:** Node.js version (18+)
- **Check:** Build logs in Vercel dashboard
- **Fix:** Run `npm run build` locally to see errors

### Runtime Errors
- **Check:** All environment variables are set correctly
- **Check:** Supabase connection (verify URL and keys)
- **Check:** Daily.co credentials
- **Check:** Sentry dashboard for error details

### Database Connection Issues
- **Check:** Supabase project is active
- **Check:** RLS policies are configured
- **Check:** Network access (Supabase allows all IPs by default)
- **Check:** Service role key is correct

### Video Calls Not Working
- **Check:** Daily.co API key and domain
- **Check:** CORS settings in Daily.co
- **Check:** Browser console for errors
- **Check:** Network tab for API calls

## 📊 Monitoring & Maintenance

### Daily
- Monitor Sentry for new errors
- Check application health endpoint

### Weekly
- Review error logs
- Check performance metrics
- Review audit logs

### Monthly
- Update dependencies
- Review security alerts
- Test backup restore
- Performance optimization review

## 🔐 Security Reminders

- ✅ Never commit `.env` files
- ✅ Use strong `ADMIN_SIGNUP_PIN`
- ✅ Rotate secrets regularly
- ✅ Enable 2FA on Vercel account
- ✅ Review access logs regularly
- ✅ Keep dependencies updated

## 📝 Notes

- The warning about `/api/chat/users` using cookies is **expected** - it's a dynamic route
- Sentry source maps require `SENTRY_AUTH_TOKEN` for uploads
- Test endpoints are automatically disabled in production
- All security headers are configured in `next.config.js`

---

**Status:** ✅ Ready for deployment (after completing environment variables and migrations)

**Last Updated:** 2024-01-15
