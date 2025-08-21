# Supabase Setup Guide for Turo Toll Tracker

This guide will walk you through setting up Supabase for your Turo toll tracking application.

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Project name**: turo-toll-tracker
   - **Database password**: Use a strong password (save this!)
   - **Region**: Choose closest to your users
5. Click "Create new project"
6. Wait for project to finish setting up (2-3 minutes)

## Step 2: Get Your API Keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon public** key (starts with `eyJ...`)
   - **service_role** key (starts with `eyJ...`)

## Step 3: Update Your .env File

Replace the placeholder values in your `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 4: Set Up Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Copy the entire contents of `/scripts/supabase-schema.sql`
3. Paste into the SQL editor
4. Click **Run** to execute the schema
5. You should see "Success" messages and the setup complete notice

## Step 5: Configure Authentication Settings

1. Go to **Authentication** → **Settings**
2. Under **Site URL**, add your domain (e.g., `https://yourdomain.com` or `http://localhost:3000` for development)
3. Under **Redirect URLs**, add:
   - `http://localhost:3000/dashboard` (development)
   - `https://yourdomain.com/dashboard` (production)
4. **Email Templates**: Customize if desired
5. **Providers**: Email is enabled by default (recommended to start)

## Step 6: Test Connection

Run the connection test script:

```bash
node scripts/test-supabase-connection.js
```

This will verify your configuration is correct.

## Step 7: Migrate Your Data

⚠️ **IMPORTANT**: Back up your current SQLite database first!

```bash
# Backup current database
cp turo_tolls.db turo_tolls_backup_$(date +%Y%m%d_%H%M%S).db

# Run migration
node scripts/migrate-to-supabase.js
```

The migration script will:
- Export all data from SQLite
- Create new UUIDs for all hosts (compatible with Supabase Auth)
- Import all data to Supabase
- Create a mapping file for reference

## Step 8: Switch to Supabase Mode

Add to your `.env` file:

```env
USE_SUPABASE=true
```

Or set for production only:
- Development: Keep using SQLite
- Production: Use Supabase

## Step 9: Update Authentication

Since users will have new UUIDs in Supabase Auth, they'll need to:
1. **Reset their passwords** using Supabase Auth
2. **Create new accounts** if you prefer a clean start

### Option A: Password Reset Flow
1. In Supabase dashboard, go to **Authentication** → **Users**
2. For each migrated user, click **Send reset password email**

### Option B: Fresh Start
1. Keep SQLite data as backup
2. Let users create new accounts in Supabase
3. Manually migrate their important data if needed

## Step 10: Test Everything

1. **Authentication**: Sign up/login with Supabase
2. **Dashboard**: Verify data loads correctly
3. **Toll Matching**: Test with new database
4. **CSV Import**: Verify file uploads work
5. **Real-time Updates**: Check live notifications

## Troubleshooting

### Connection Issues
- Verify all API keys are correct
- Check your project URL format
- Ensure no trailing slashes in URLs

### Migration Issues
- Check Supabase logs in dashboard
- Verify RLS policies aren't blocking operations
- Run migration with detailed logging

### Authentication Issues
- Check redirect URLs match exactly
- Verify site URL is set correctly
- Check browser console for errors

### Performance Issues
- Monitor database usage in Supabase dashboard
- Check if you need to upgrade from free tier
- Review query performance in SQL logs

## Benefits After Migration

✅ **Automatic Authentication**: No more session management headaches  
✅ **Scalable Database**: PostgreSQL handles concurrent users  
✅ **Real-time Updates**: Live notifications for toll matches  
✅ **Better Security**: Row-level security built-in  
✅ **Managed Infrastructure**: No server maintenance  
✅ **Better Backups**: Automatic daily backups  

## Support

If you run into issues:
1. Check the Supabase documentation: https://supabase.com/docs
2. Review error logs in your Supabase dashboard
3. Test individual components separately
4. Keep your SQLite backup until everything works perfectly

---

**Remember**: You can always switch back to SQLite by setting `USE_SUPABASE=false` in your `.env` file!