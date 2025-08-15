# Turo Toll Tracker - Security Documentation

## Overview

This document outlines the security measures implemented in the Turo Toll Tracker system to protect sensitive data and prevent security vulnerabilities.

## Security Measures Implemented

### 1. Password Storage Security

**Problem**: EZ-Pass passwords were stored using simple Base64 encoding.

**Solution**: Implemented AES-256-GCM encryption with the following features:
- 256-bit encryption keys derived using PBKDF2 with 100,000 iterations
- Unique salt per password for protection against rainbow table attacks
- Authentication tags to prevent tampering
- Host ID used as Additional Authenticated Data (AAD) for extra security
- Automatic migration from old Base64 format

**Files**: 
- `utils/crypto.js` - Encryption/decryption utilities
- `routes/dashboard.js` - Updated toll account creation
- `services/ezpass-scraper.js` - Updated password decryption

### 2. Session Security

**Problem**: Hardcoded session secret and insecure cookie settings.

**Solution**: 
- Environment-based session secrets (minimum 32 characters)
- Secure cookie settings:
  - `httpOnly: true` - Prevents XSS attacks
  - `secure: true` in production - HTTPS only
  - `sameSite: 'strict'` - CSRF protection
  - 24-hour session timeout
- Custom session ID generation using cryptographically secure random bytes

**Files**: `server.js`

### 3. Input Validation & Sanitization

**Implementation**:
- Joi schema validation for all user inputs
- HTML escaping to prevent XSS attacks
- Strict validation rules for emails, passwords, and other fields
- Password complexity requirements (uppercase, lowercase, numbers, symbols)

**Files**: `middleware/security.js`

### 4. Rate Limiting

**Implementation**:
- Authentication endpoints: 5 attempts per 15 minutes
- General API endpoints: 100 requests per 15 minutes
- Toll account operations: 10 operations per hour
- WebSocket connections: 5 per IP address
- Automatic IP blocking for excessive failed login attempts

**Files**: `middleware/security.js`, `server.js`

### 5. CSRF Protection

**Implementation**:
- CSRF tokens generated for each session
- Token validation on all state-changing operations
- Tokens provided via `/api/auth/csrf-token` endpoint
- Automatic token refresh on session creation

**Files**: `middleware/security.js`, `routes/auth.js`

### 6. Security Headers

**Implementation using Helmet.js**:
- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- X-XSS-Protection: 1; mode=block

**Files**: `server.js`

### 7. Comprehensive Audit Logging

**Events Logged**:
- Authentication attempts (success/failure)
- Account registration
- Password changes
- Rate limit violations
- CSRF token mismatches
- WebSocket authentication
- Suspicious activities

**Storage**: SQLite database with retention policies

**Files**: `middleware/security.js`, `config/database.js`

### 8. WebSocket Security

**Implementation**:
- Authentication required before message processing
- Connection limits per IP address
- Automatic timeout for unauthenticated connections
- Host ID verification for message authorization
- Security event logging for all WebSocket activities

**Files**: `server.js`

## Environment Variables

### Required Security Variables

Create a `.env` file with these variables:

```bash
# Session Security
SESSION_SECRET=your-super-secure-session-secret-key-minimum-32-characters-long

# Encryption Keys (CRITICAL)
ENCRYPTION_MASTER_KEY=your-256-bit-encryption-master-key-must-be-at-least-32-chars

# CSRF Protection
CSRF_SECRET=your-csrf-secret-key-minimum-32-characters

# Production Settings
NODE_ENV=production
SESSION_SECURE=true
ENABLE_HTTPS=true
```

### Generate Secure Keys

Use the security admin tool to generate cryptographically secure keys:

```bash
node utils/security-admin.js generate-keys
```

## Security Administration

### Security Admin Tool

The `utils/security-admin.js` script provides tools for ongoing security management:

```bash
# Generate secure keys
node utils/security-admin.js generate-keys

# Audit security logs
node utils/security-admin.js audit-logs 7

# Check for suspicious activity
node utils/security-admin.js check-suspicious

# Clean old logs (90 days retention)
node utils/security-admin.js clean-logs 90

# Migrate old passwords to new encryption
node utils/security-admin.js migrate-passwords

# Test encryption functionality
node utils/security-admin.js test-encryption
```

### Regular Security Tasks

1. **Weekly**: Review security logs for suspicious activity
2. **Monthly**: Clean old security logs
3. **Quarterly**: Review and update security policies
4. **On deployment**: Regenerate all security keys

## Monitoring & Alerting

### Security Events to Monitor

- **HIGH PRIORITY**:
  - Multiple failed login attempts from same IP
  - CSRF token mismatches
  - Unauthorized access attempts
  - WebSocket authentication failures

- **MEDIUM PRIORITY**:
  - Rate limit violations
  - Invalid input attempts
  - Session anomalies

### Log Analysis Queries

```sql
-- Failed login attempts by IP
SELECT ip_address, COUNT(*) as attempts 
FROM login_attempts 
WHERE success = 0 AND attempt_time > datetime('now', '-1 hour')
GROUP BY ip_address 
HAVING attempts >= 3;

-- Security events by severity
SELECT event_type, severity, COUNT(*) as count
FROM security_logs 
WHERE created_at > datetime('now', '-24 hours')
GROUP BY event_type, severity
ORDER BY severity DESC, count DESC;
```

## Deployment Security Checklist

### Pre-Deployment

- [ ] All security keys generated and stored securely
- [ ] Environment variables configured
- [ ] SSL/TLS certificates installed
- [ ] Database permissions restricted
- [ ] Security logs table initialized

### Post-Deployment

- [ ] Test authentication flows
- [ ] Verify CSRF protection working
- [ ] Test rate limiting
- [ ] Monitor security logs
- [ ] Verify WebSocket authentication

### Production Hardening

- [ ] Run behind reverse proxy (nginx/Apache)
- [ ] Enable fail2ban for additional IP protection
- [ ] Set up log aggregation (ELK stack/Splunk)
- [ ] Configure automated security alerts
- [ ] Regular security scanning

## Incident Response

### Security Incident Procedures

1. **Immediate Response**:
   - Identify affected systems
   - Block malicious IP addresses
   - Revoke compromised sessions
   - Notify system administrators

2. **Investigation**:
   - Review security logs
   - Analyze attack patterns
   - Determine scope of breach
   - Document findings

3. **Recovery**:
   - Patch vulnerabilities
   - Update security measures
   - Reset affected credentials
   - Monitor for continued threats

4. **Post-Incident**:
   - Update security policies
   - Improve monitoring
   - Conduct security training
   - Document lessons learned

## Known Security Considerations

### Current Limitations

1. **Single Database**: All data stored in SQLite (consider PostgreSQL for production)
2. **Local Sessions**: Sessions stored in memory (consider Redis for scaling)
3. **Basic Logging**: File-based logs (consider centralized logging)

### Future Enhancements

1. **Multi-Factor Authentication**: Add 2FA support
2. **API Rate Limiting**: Per-user rate limiting
3. **Advanced Threat Detection**: ML-based anomaly detection
4. **Data Encryption at Rest**: Encrypt database files
5. **Regular Security Audits**: Automated vulnerability scanning

## Contact Information

For security-related issues or questions:
- Review security logs: `node utils/security-admin.js audit-logs`
- Check for threats: `node utils/security-admin.js check-suspicious`
- Report security issues through appropriate channels

---

**Last Updated**: $(date)
**Security Review Required**: Quarterly