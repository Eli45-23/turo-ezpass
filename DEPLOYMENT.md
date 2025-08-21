# 🚀 Deployment Guide - Turo Toll Tracker

This guide will help you deploy the Turo Toll Tracker for real-life testing and production use, ensuring your live site works identically to your local development environment.

## 🔧 CRITICAL: Environment Parity

**The live site will now automatically work just like your local environment!** Recent improvements ensure identical behavior:

✅ **Environment-Aware Session Security**
- Automatically uses HTTPS-secure cookies in production
- Relaxed settings for local development

✅ **Dynamic Rate Limiting**  
- Strict limits in production (500 req/15min)
- Relaxed limits in development (10,000 req/15min)
- Localhost always bypassed in development

✅ **Database Compatibility**
- Automatic transponder_id column migration
- Backwards-compatible INSERT operations
- Environment-aware database paths

✅ **Trust Proxy Configuration**
- Enabled automatically in production for reverse proxies
- Disabled in development for direct connections

⚠️ **Required Environment Variables for Production:**
```bash
NODE_ENV=production
BASE_URL=https://yourdomain.com
SESSION_SECRET=your_32_char_secret
ENCRYPTION_MASTER_KEY=your_32_char_key
```

## 📋 Quick Start Options

### Option 1: Instant Local Sharing (Recommended for Testing) ⚡

**Perfect for immediate testing with friends/family**

1. **Run the sharing script:**
   ```bash
   ./start-sharing.sh
   ```

2. **Share the URL** that appears in the ngrok output with your testers

**What this does:**
- Starts your local server
- Creates a secure tunnel to the internet via ngrok
- Gives you a public URL like `https://abc123.ngrok.io`
- Anyone can access your app instantly

### Option 2: Free Cloud Deployment 🌟

**Choose one of these platforms for permanent hosting:**

#### A. Render.com (Recommended)
```bash
# 1. Push your code to GitHub (if not already done)
git add .
git commit -m "Ready for deployment"
git push origin main

# 2. Go to render.com and connect your GitHub repo
# 3. Deploy with these settings:
#    - Build Command: npm install
#    - Start Command: npm start
#    - Environment: Add the variables from the Environment Variables section
```

#### B. Railway.app
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
railway init
railway up
```

#### C. Fly.io
```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. Login and launch
flyctl auth login
flyctl launch --copy-config --name turo-toll-tracker
```

#### D. Vercel (Frontend-focused, may need adjustments)
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel --prod
```

## 🔧 Environment Variables

For any deployment, you'll need these environment variables:

### Required Variables
```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-secure-32-character-session-secret
ENCRYPTION_MASTER_KEY=your-secure-32-character-encryption-key
```

### Generate Secure Secrets
```bash
# Generate SESSION_SECRET
openssl rand -hex 32

# Generate ENCRYPTION_MASTER_KEY
openssl rand -hex 32
```

### Optional But Recommended
```env
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
```

## 📱 Platform-Specific Instructions

### Render.com Setup

1. **Create Account**: Go to [render.com](https://render.com)
2. **Connect GitHub**: Link your GitHub account
3. **New Web Service**: Select your `turo-ezpass` repository
4. **Configure Settings**:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (for testing)
5. **Add Environment Variables**: Use the variables listed above
6. **Deploy**: Click "Create Web Service"

**Your app will be available at**: `https://your-app-name.onrender.com`

### Railway.app Setup

1. **Install CLI**: `npm install -g @railway/cli`
2. **Login**: `railway login`
3. **Initialize**: `railway init`
4. **Set Variables**:
   ```bash
   railway variables set NODE_ENV=production
   railway variables set SESSION_SECRET=your-secret-here
   railway variables set ENCRYPTION_MASTER_KEY=your-key-here
   ```
5. **Deploy**: `railway up`

### Fly.io Setup

1. **Install CLI**: Follow instructions at [fly.io/docs/getting-started/installing-flyctl/](https://fly.io/docs/getting-started/installing-flyctl/)
2. **Login**: `flyctl auth login`
3. **Launch**: `flyctl launch`
4. **Set Secrets**:
   ```bash
   flyctl secrets set SESSION_SECRET=your-secret-here
   flyctl secrets set ENCRYPTION_MASTER_KEY=your-key-here
   ```
5. **Deploy**: `flyctl deploy`

## 🗄️ Database Considerations

Your app uses SQLite, which works well for testing but consider these notes:

### For Testing (Current Setup)
- SQLite file is included in your deployment
- Perfect for small-scale testing
- No additional setup required

### For Production Scale
Consider upgrading to PostgreSQL:
```bash
# Most platforms offer free PostgreSQL
# Add to your environment variables:
DATABASE_URL=postgresql://username:password@host:port/database
```

## 🔒 Security Checklist

Before going live:

- [ ] **Set strong SESSION_SECRET** (32+ characters)
- [ ] **Set unique ENCRYPTION_MASTER_KEY**
- [ ] **Enable HTTPS** (automatic on most platforms)
- [ ] **Set NODE_ENV=production**
- [ ] **Configure rate limiting**
- [ ] **Review .env file** (never commit secrets!)
- [ ] **Enable CORS if needed**
- [ ] **Set up monitoring** (optional but recommended)

## 📊 Monitoring Your Deployment

### Check Health
All platforms include this health check endpoint:
```
GET /api/health
```

### View Logs
```bash
# Render: View in dashboard
# Railway: railway logs
# Fly.io: flyctl logs
# Vercel: vercel logs
```

### Performance Monitoring
Consider adding:
- Error tracking (Sentry)
- Uptime monitoring (UptimeRobot)
- Performance monitoring (New Relic)

## 🚨 Troubleshooting

### Common Issues

**App won't start:**
```bash
# Check logs for errors
# Most common: missing environment variables
```

**Database errors:**
```bash
# Ensure SQLite file has proper permissions
# Check if data directory is writable
```

**ngrok connection issues:**
```bash
# Install ngrok globally: npm install -g ngrok
# Or use the local version: npx ngrok http 3000
```

**Port conflicts:**
```bash
# Change port in .env file:
echo "PORT=3001" >> .env
```

### Getting Help

1. **Check the logs** in your deployment platform
2. **Test locally first** with `npm run dev`
3. **Verify environment variables** are set correctly
4. **Check the health endpoint**: `/api/health`

## 🎯 Testing Strategy

### Phase 1: Local Testing
1. Run `./start-sharing.sh`
2. Share ngrok URL with 2-3 close testers
3. Collect initial feedback

### Phase 2: Cloud Testing  
1. Deploy to Render.com (free tier)
2. Share permanent URL with larger group
3. Monitor performance and usage

### Phase 3: Production Ready
1. Consider paid hosting for better performance
2. Set up monitoring and backups
3. Implement user authentication if needed

## 💰 Cost Breakdown

### Free Tier Limits
- **Render.com**: 750 hours/month, sleeps after 15min inactivity
- **Railway.app**: $5 credit monthly, then pay-as-you-go
- **Fly.io**: 3 shared VMs free, then $1.94/month per VM
- **Vercel**: Generous free tier, pay for overages

### Recommended Path
1. **Testing**: Start with ngrok (free) or Render.com (free)
2. **Small Scale**: Railway.app or Fly.io ($5-10/month)
3. **Production**: VPS or dedicated hosting ($20+/month)

---

## 🎉 Quick Deployment Commands

### Instant Sharing (Right Now!)
```bash
./start-sharing.sh
# Share the ngrok URL that appears
```

### Cloud Deployment (Render.com)
```bash
git add . && git commit -m "Deploy ready" && git push
# Then go to render.com and connect your repo
```

### Emergency Troubleshooting
```bash
# Reset everything
git status
npm install
npm run dev
# Check http://localhost:3000
```

**Need help?** Open an issue on GitHub or contact the development team.