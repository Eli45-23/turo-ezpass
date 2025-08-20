# 🌐 Domain Setup Guide - turoezpass.com

This guide will help you configure your custom domain `turoezpass.com` with your Render deployment.

## 📋 Prerequisites

- ✅ Your app is deployed on Render.com
- ✅ You have access to your domain registrar (where you bought turoezpass.com)
- ✅ Your Render service is running and accessible via the default Render URL

## 🔧 Step 1: Configure Domain in Render

1. **Go to your Render Dashboard**
   - Navigate to your `turo-toll-tracker` web service
   - Click on "Settings" tab

2. **Add Custom Domain**
   - Scroll down to "Custom Domains" section
   - Click "Add Custom Domain"
   - Add both:
     - `turoezpass.com` (root domain)
     - `www.turoezpass.com` (www subdomain)

3. **Get DNS Configuration**
   - After adding domains, Render will provide DNS records
   - **Copy these values** - you'll need them for your DNS setup

## 🌍 Step 2: Configure DNS Records

You need to update DNS records at your domain registrar. Here's how:

### For Root Domain (turoezpass.com)

**Option A: CNAME Record (Recommended)**
```
Type: CNAME
Name: @ (or leave blank for root)
Value: your-app-name.onrender.com
TTL: 300 (or Auto)
```

**Option B: A Records (if CNAME isn't supported for root)**
```
Type: A
Name: @ (or leave blank for root)  
Value: [IP addresses provided by Render]
TTL: 300
```

### For WWW Subdomain (www.turoezpass.com)

```
Type: CNAME
Name: www
Value: your-app-name.onrender.com
TTL: 300
```

## 🔍 Common Domain Registrars Setup

### GoDaddy
1. Log into GoDaddy account
2. Go to "My Products" → "DNS"
3. Find turoezpass.com and click "Manage DNS"
4. Add/Edit the CNAME records as shown above
5. Click "Save"

### Namecheap
1. Log into Namecheap account
2. Go to "Domain List" → click "Manage" next to turoezpass.com
3. Click "Advanced DNS" tab
4. Add the CNAME records
5. Save changes

### Cloudflare
1. Log into Cloudflare dashboard
2. Select turoezpass.com domain
3. Go to "DNS" tab
4. Add CNAME records
5. **Important**: Set proxy status to "DNS only" (grey cloud) initially

### Google Domains
1. Go to domains.google.com
2. Select turoezpass.com
3. Click "DNS" in left sidebar
4. Add the CNAME records in "Custom records" section
5. Save

## ⏱️ Step 3: Wait for DNS Propagation

- **DNS propagation** can take **15 minutes to 48 hours**
- Most changes show up within **15-30 minutes**
- Use online tools to check: `whatsmydns.net`

## 🔒 Step 4: SSL Certificate Setup

**Render handles SSL automatically!**
- Once DNS is configured, Render will automatically issue a Let's Encrypt SSL certificate
- This usually happens within **5-10 minutes** of DNS propagation
- You'll see the certificate status in your Render dashboard

## ✅ Step 5: Verify Setup

1. **Check DNS Resolution**
   ```bash
   nslookup turoezpass.com
   nslookup www.turoezpass.com
   ```

2. **Test Your Domain**
   - Visit `https://turoezpass.com`
   - Visit `https://www.turoezpass.com`  
   - Both should load your Turo Toll Tracker app

3. **Verify SSL Certificate**
   - Look for the 🔒 lock icon in your browser
   - Click on it to verify the certificate details

## 🚨 Troubleshooting

### "DNS_PROBE_FINISHED_NXDOMAIN"
- DNS records haven't propagated yet
- Wait longer (up to 48 hours)
- Double-check DNS records are correct

### "Your connection is not secure"
- SSL certificate is still being issued
- Wait 5-10 minutes after DNS propagates
- Force refresh the page (Ctrl+F5 or Cmd+Shift+R)

### "This site can't be reached"
- Check if your Render app is running
- Verify DNS records point to correct Render URL
- Try accessing the default Render URL first

### Domain Shows Wrong Content
- Clear your browser cache
- Try incognito/private browsing mode
- Check DNS propagation with online tools

## 📧 Email Setup (Optional)

If you want to set up email for your domain:

### Email Forwarding Records
```
Type: MX
Name: @ (or leave blank)
Value: mail.turoezpass.com
Priority: 10
```

### Email CNAME (for webmail)
```
Type: CNAME
Name: mail
Value: your-email-provider-url
```

## 🔄 Redirect www to Root (Optional)

If you prefer all traffic to go to `turoezpass.com` (without www):

1. In Render, keep both domains
2. Add this to your app's middleware:

```javascript
app.use((req, res, next) => {
  if (req.headers.host === 'www.turoezpass.com') {
    return res.redirect(301, `https://turoezpass.com${req.url}`);
  }
  next();
});
```

## 📊 Monitoring Your Domain

### Check Domain Health
- Set up monitoring at uptimerobot.com
- Monitor both `turoezpass.com` and `www.turoezpass.com`
- Get alerts if your site goes down

### Analytics Setup
- Add Google Analytics to track visitors
- Set up Google Search Console for SEO
- Monitor performance with Render's built-in metrics

## 🎯 SEO Optimization

### Basic SEO Setup
1. **Update Meta Tags** in your HTML files:
```html
<title>Turo Toll Tracker - Automated Toll Management</title>
<meta name="description" content="Professional toll tracking and invoicing for Turo hosts">
<meta name="keywords" content="turo, toll tracking, ezpass, automated invoicing">
```

2. **Add Structured Data** for better search results
3. **Submit sitemap** to Google Search Console
4. **Set up redirects** from your old URLs if needed

## 🔐 Security Best Practices

- ✅ Always use HTTPS (Render handles this)
- ✅ Set up security headers (already configured)
- ✅ Regular security updates (monitor dependencies)
- ✅ Monitor for unusual traffic patterns

## 📞 Support Contacts

**Render Support**: https://render.com/support
**Domain Issues**: Contact your domain registrar's support
**Application Issues**: Check the application logs in Render dashboard

---

## 🎉 Congratulations!

Once your domain is set up, your Turo Toll Tracker will be live at:
- **https://turoezpass.com**
- **https://www.turoezpass.com**

Your users can now access your professional toll tracking system with a custom domain!