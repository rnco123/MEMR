# Production Deployment Guide

This guide covers the steps to deploy MyclinicMD to production.

## Prerequisites

- Node.js 18+ installed
- Supabase project set up
- Daily.co account configured
- Hosting platform account (Vercel, Netlify, AWS, etc.)

## Pre-Deployment Checklist

### 1. Environment Variables

Set the following environment variables in your hosting platform:

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (keep secret!)
- `NEXT_PUBLIC_DAILY_API_KEY` - Daily.co API key
- `NEXT_PUBLIC_DAILY_DOMAIN` - Daily.co domain
- `ADMIN_SIGNUP_PIN` - Secure 4-digit PIN for user signup
- `NODE_ENV` - Set to `production`

**Optional:**
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking

### 2. Database Migrations

Run all database migrations in order:

```bash
# In Supabase SQL Editor, run migrations in order:
1. 001_create_user_profiles.sql
2. 002_create_patients_table_with_rls.sql
3. 003_create_appointments_table_with_rls.sql
# ... (all migrations up to)
18. 018_create_audit_log.sql
19. 019_add_performance_indexes.sql
```

### 3. Supabase Storage Setup

1. Create storage bucket: `patient-documents`
2. Set as Public: Yes
3. File size limit: 10MB
4. Configure storage policies (see `PATIENT_DOCUMENTS_FEATURE.md`)

### 4. Database Backups

1. Enable automated backups in Supabase
2. Set retention to 7+ days
3. Test restore procedure

### 5. Security Configuration

- [ ] Remove hardcoded secrets (already done in code)
- [ ] Verify RLS policies are enabled
- [ ] Test role-based access control
- [ ] Configure CORS if needed

## Deployment Steps

### Option 1: Vercel (Recommended)

1. **Connect Repository**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel
   ```

2. **Configure Environment Variables**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add all required variables
   - Set for Production, Preview, and Development

3. **Configure Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm ci`

4. **Deploy**
   ```bash
   vercel --prod
   ```

### Option 2: Netlify

1. **Connect Repository**
   - Go to Netlify Dashboard
   - Add new site from Git
   - Connect your repository

2. **Configure Build Settings**
   - Build command: `npm run build`
   - Publish directory: `.next`

3. **Add Environment Variables**
   - Site settings → Environment variables
   - Add all required variables

### Option 3: AWS/Other

Follow your hosting platform's Next.js deployment guide.

## Post-Deployment

### 1. Verify Deployment

- [ ] Visit your production URL
- [ ] Test login functionality
- [ ] Verify database connection
- [ ] Test video calls
- [ ] Check health endpoint: `/api/health`

### 2. Monitoring Setup

- [ ] Configure Sentry (if using)
- [ ] Set up uptime monitoring
- [ ] Configure error alerts
- [ ] Set up performance monitoring

### 3. Security Verification

- [ ] Test authentication flows
- [ ] Verify HTTPS is enabled
- [ ] Check security headers (use securityheaders.com)
- [ ] Test rate limiting
- [ ] Verify audit logging

### 4. Performance Testing

- [ ] Run load tests
- [ ] Check database query performance
- [ ] Verify CDN is working
- [ ] Test video call capacity

## Rollback Procedure

If deployment fails:

1. **Vercel:**
   ```bash
   vercel rollback
   ```

2. **Manual:**
   - Revert to previous deployment
   - Check error logs
   - Fix issues
   - Redeploy

## Maintenance

### Regular Tasks

- [ ] Monitor error logs weekly
- [ ] Review audit logs monthly
- [ ] Update dependencies monthly
- [ ] Test backups quarterly
- [ ] Security audit annually

### Updates

1. Test in staging environment first
2. Run database migrations
3. Update environment variables if needed
4. Deploy to production
5. Monitor for issues

## Troubleshooting

### Common Issues

**Build Fails:**
- Check environment variables
- Verify Node.js version
- Check build logs

**Database Connection Errors:**
- Verify Supabase credentials
- Check RLS policies
- Verify network access

**Video Calls Not Working:**
- Verify Daily.co credentials
- Check CORS settings
- Verify API keys

## Support

For issues, check:
- Application logs
- Supabase logs
- Hosting platform logs
- Sentry (if configured)
