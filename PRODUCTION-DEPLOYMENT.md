# 🚀 Production Deployment Guide - turoezpass.com

**Complete guide to deploy Turo Toll Tracker to production with PostgreSQL database and custom domain**

## 📋 Pre-Deployment Checklist

- [ ] ✅ You have a Render.com account  
- [ ] ✅ Your code is pushed to GitHub
- [ ] ✅ You own the domain `turoezpass.com`
- [ ] ✅ You have tested the app locally
- [ ] ✅ All sensitive data is removed from code

## 🎯 Quick Deployment (5 Steps)

### Step 1: Prepare Your Repository

```bash
# Make sure all files are committed
git add .
git commit -m "Ready for production deployment"
git push origin main
```

### Step 2: Deploy to Render.com

1. **Go to Render.com Dashboard**
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select `turo-ezpass` repository

2. **Configure Web Service**
   ```
   Name: turo-toll-tracker
   Branch: main
   Root Directory: (leave blank)
   Environment: Node
   Build Command: npm ci && npm run build
   Start Command: npm start
   ```

3. **Add Environment Variables** (IMPORTANT!)
   ```
   NODE_ENV=production
   SESSION_SECRET=[click "Generate" for secure value]
   ENCRYPTION_MASTER_KEY=[click "Generate" for secure value]
   LOG_LEVEL=info
   DOMAIN=turoezpass.com
   ALLOWED_ORIGINS=https://turoezpass.com,https://www.turoezpass.com
   ```

### Step 3: Create PostgreSQL Database

1. **In Render Dashboard**
   - Click "New +" → "PostgreSQL"
   - Name: `turo-toll-db`
   - Plan: Free (can upgrade later)
   - Region: Same as your web service

2. **Connect Database to App**
   - Go back to your web service
   - In Environment Variables, add:
   ```
   DATABASE_URL=[copy from your PostgreSQL service]
   ```

### Step 4: Run Database Migration

Once your app is deployed:

```bash
# Set environment variable locally
export DATABASE_URL="your-postgresql-connection-string-from-render"

# Run migration script
node scripts/migrate-to-postgresql.js
```

### Step 5: Configure Custom Domain

1. **Add Domain in Render**
   - Go to web service → Settings → Custom Domains
   - Add: `turoezpass.com` and `www.turoezpass.com`

2. **Update DNS Records** (at your domain registrar)
   ```
   Type: CNAME
   Name: @
   Value: turo-toll-tracker.onrender.com
   
   Type: CNAME  
   Name: www
   Value: turo-toll-tracker.onrender.com
   ```

**🎉 Your app will be live at https://turoezpass.com in 15-30 minutes!**

---

## 📊 Detailed Deployment Process

### A. Pre-Deployment Setup

#### 1. Update Package.json Scripts
```json
{
  "scripts": {
    "start": "node server-production.js",
    "dev": "node server.js",
    "build": "echo 'No build step required'",
    "migrate": "node scripts/migrate-to-postgresql.js",
    "test": "echo 'Tests coming soon'"
  }
}
```

#### 2. Environment Configuration

Create production environment file:
```bash
cp .env.production .env.render
```

Edit `.env.render` with your actual values:
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
SESSION_SECRET=your-secure-32-char-secret
ENCRYPTION_MASTER_KEY=your-secure-32-char-key
DOMAIN=turoezpass.com
```

#### 3. Security Verification

Run security checks:
```bash
# Check for secrets in code
grep -r "password\|secret\|key" --include="*.js" . | grep -v node_modules

# Check .gitignore
cat .gitignore | grep -E '\.(env|log|key)$'
```

### B. Database Setup & Migration

#### 1. PostgreSQL Database Creation

In Render dashboard:
- Service Name: `turo-toll-db`
- Database Name: `turo_tolls`
- User: `turo_admin`
- Plan: Starter (Free)
- Region: Oregon (or your preferred region)

#### 2. Schema Creation

```bash
# Connect to your PostgreSQL database
psql "your-postgresql-connection-string"

# Run schema creation
\i migrations/create-postgresql-schema.sql
```

#### 3. Data Migration

```bash
# Set environment variables
export DATABASE_URL="your-postgresql-connection-string"
export SQLITE_DB_PATH="./turo_tolls.db"

# Run migration
node scripts/migrate-to-postgresql.js
```

#### 4. Verify Migration

```bash
# Check tables were created
psql "your-connection-string" -c "\dt"

# Check data was migrated
psql "your-connection-string" -c "SELECT COUNT(*) FROM hosts;"
```

### C. Application Deployment

#### 1. Render Configuration File

Use the `render-deployment.yaml` file for automated deployment:

```yaml
services:
  - type: web
    name: turo-toll-tracker
    env: node
    buildCommand: npm ci && npm install pg
    startCommand: npm start
    domains:
      - turoezpass.com
      - www.turoezpass.com
  
  - type: pgsql
    name: turo-toll-db
    databaseName: turo_tolls
```

#### 2. Deploy via Render Dashboard

1. **Create New Web Service**
2. **Select Repository**: `your-username/turo-ezpass`
3. **Configure Build Settings**:
   ```
   Build Command: npm ci --production=false && npm install pg
   Start Command: npm start
   ```
4. **Add Environment Variables** (see list above)
5. **Deploy**

#### 3. Monitor Deployment

Watch the deployment logs:
- Build logs will show package installation
- Start logs will show server startup
- Health checks will verify the app is running

### D. Domain Configuration

#### 1. DNS Setup

At your domain registrar, add these records:

**Root Domain**:
```
Type: CNAME
Name: @ (or root/blank)
Value: turo-toll-tracker.onrender.com
TTL: 300
```

**WWW Subdomain**:
```
Type: CNAME
Name: www
Value: turo-toll-tracker.onrender.com
TTL: 300
```

#### 2. SSL Certificate

Render automatically provides SSL certificates:
- Certificate is issued after DNS propagation (5-10 minutes)
- Uses Let's Encrypt (free, auto-renewing)
- Covers both root domain and www subdomain

#### 3. Verify Domain Setup

```bash
# Check DNS resolution
nslookup turoezpass.com
dig turoezpass.com

# Test HTTPS
curl -I https://turoezpass.com
curl -I https://www.turoezpass.com
```

### E. Post-Deployment Verification

#### 1. Functionality Tests

Test all major features:
- [ ] User registration/login
- [ ] Dashboard loads with real data  
- [ ] Toll data upload works
- [ ] Trip management functions
- [ ] Invoice generation works
- [ ] Analytics display correctly

#### 2. Performance Tests

```bash
# Test response times
curl -w "%{time_total}\n" -o /dev/null -s https://turoezpass.com

# Check memory usage in Render dashboard
# Monitor CPU usage and response times
```

#### 3. Security Tests

- [ ] HTTPS redirect works (http → https)
- [ ] Security headers are present
- [ ] Authentication required for protected routes
- [ ] CSRF protection works
- [ ] Rate limiting is active

#### 4. Database Performance

```sql
-- Check database performance
SELECT schemaname,tablename,attname,n_distinct,correlation 
FROM pg_stats 
WHERE tablename IN ('hosts','trips','toll_charges');

-- Check index usage
SELECT schemaname,tablename,attname,n_distinct,correlation 
FROM pg_stats 
ORDER BY n_distinct DESC;
```

## 🔧 Production Maintenance

### Regular Tasks

#### Weekly
- [ ] Check application logs for errors
- [ ] Monitor database size and performance
- [ ] Review security logs for suspicious activity
- [ ] Update dependencies if needed

#### Monthly  
- [ ] Database backup verification
- [ ] Performance metrics review
- [ ] SSL certificate status check
- [ ] Security audit of user accounts

### Monitoring Setup

#### 1. Uptime Monitoring
```javascript
// Add to your monitoring service
const monitors = [
  'https://turoezpass.com',
  'https://www.turoezpass.com',
  'https://turoezpass.com/health'
];
```

#### 2. Error Tracking
Consider adding services like:
- Sentry.io for error tracking
- LogRocket for user session recording
- New Relic for performance monitoring

#### 3. Database Monitoring
Monitor these metrics:
- Connection count
- Query performance
- Database size growth
- Index effectiveness

### Backup Strategy

#### Database Backups
```bash
# Automated daily backups (set up in Render)
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Weekly full backup with compression
pg_dump $DATABASE_URL | gzip > weekly-backup-$(date +%Y%m%d).sql.gz
```

#### Application Backups
- Code is backed up in GitHub
- Environment variables documented securely
- SSL certificates auto-managed by Render

## 🚨 Troubleshooting

### Common Issues

#### App Won't Start
```bash
# Check logs in Render dashboard
# Common causes:
# - Missing environment variables
# - Database connection failed
# - Port binding issues
```

#### Database Connection Issues
```bash
# Verify DATABASE_URL format:
postgresql://user:password@host:port/database

# Test connection:
psql "your-database-url" -c "SELECT version();"
```

#### Domain Not Working
- DNS propagation can take up to 48 hours
- Check DNS with: `nslookup turoezpass.com`
- Verify CNAME records point to correct Render URL

#### SSL Certificate Issues
- Wait 10 minutes after DNS propagation
- Force refresh browser cache
- Check certificate status in Render dashboard

### Getting Help

**Render Support**:
- https://render.com/support
- response time: Usually within 24 hours

**Emergency Contacts**:
- Database issues: Check Render status page
- Domain issues: Contact domain registrar
- App issues: Check application logs first

## 🎯 Optimization Tips

### Performance
- Enable database connection pooling
- Add Redis caching for frequently accessed data
- Optimize database queries with proper indexes
- Use CDN for static assets (optional)

### Security
- Regular dependency updates
- Security header audits
- Rate limit tuning based on usage
- Regular security log reviews

### Cost Optimization
- Start with free tiers, upgrade as needed
- Monitor database storage usage
- Consider archiving old data
- Use efficient queries to reduce database load

---

## 🎉 Success Criteria

Your deployment is successful when:
- ✅ https://turoezpass.com loads your app
- ✅ Users can register and log in
- ✅ Dashboard shows real data
- ✅ All features work as expected
- ✅ SSL certificate is valid
- ✅ Performance is acceptable (< 2s load time)

## 📞 Need Help?

If you encounter issues during deployment:
1. Check the troubleshooting section above
2. Review Render deployment logs
3. Test each component individually  
4. Contact support if needed

**Your Turo Toll Tracker is ready for real-world testing!** 🚀