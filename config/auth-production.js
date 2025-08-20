const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Production-ready authentication configuration
const AUTH_CONFIG = {
    // Password requirements
    password: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        saltRounds: 12 // Higher for production
    },

    // Session configuration
    session: {
        name: 'turo.sid',
        secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            sameSite: 'strict'
        }
    },

    // Rate limiting
    rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxAttempts: 5,
        skipSuccessfulRequests: true,
        skipFailedRequests: false
    },

    // Account lockout
    accountLockout: {
        maxFailedAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        enableAccountRecovery: true
    },

    // Security headers
    security: {
        enableCSP: true,
        enableHSTS: process.env.NODE_ENV === 'production',
        enableXFrameOptions: true,
        enableXSSProtection: true
    }
};

// Password strength validator
class PasswordValidator {
    static validate(password) {
        const errors = [];
        const config = AUTH_CONFIG.password;

        if (password.length < config.minLength) {
            errors.push(`Password must be at least ${config.minLength} characters long`);
        }

        if (config.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (config.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (config.requireNumbers && !/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        if (config.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            errors.push('Password must contain at least one special character');
        }

        // Check against common passwords
        const commonPasswords = [
            'password', '123456', '12345678', 'qwerty', 'abc123',
            'password123', '123456789', 'welcome', 'admin', 'letmein'
        ];

        if (commonPasswords.includes(password.toLowerCase())) {
            errors.push('Password is too common. Please choose a more secure password');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static generateSecure(length = 16) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        
        // Ensure at least one character from each required category
        password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
        password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
        password += '0123456789'[Math.floor(Math.random() * 10)]; // Number
        password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special char

        // Fill the rest randomly
        for (let i = 4; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }

        // Shuffle the password
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    }
}

// Account lockout manager
class AccountLockoutManager {
    constructor(db) {
        this.db = db;
    }

    async recordFailedAttempt(email, ipAddress, userAgent) {
        try {
            await this.db.run(
                `INSERT INTO login_attempts (email, ip_address, attempt_time, success, user_agent) 
                 VALUES (?, ?, ?, ?, ?)`,
                [email, ipAddress, new Date(), false, userAgent]
            );

            // Check if account should be locked
            const recentFailures = await this.getRecentFailedAttempts(email);
            if (recentFailures >= AUTH_CONFIG.accountLockout.maxFailedAttempts) {
                await this.lockAccount(email);
                return { locked: true, attemptsRemaining: 0 };
            }

            return { 
                locked: false, 
                attemptsRemaining: AUTH_CONFIG.accountLockout.maxFailedAttempts - recentFailures 
            };
        } catch (error) {
            console.error('Failed to record login attempt:', error);
            return { locked: false, attemptsRemaining: 1 };
        }
    }

    async recordSuccessfulAttempt(email, ipAddress, userAgent) {
        try {
            await this.db.run(
                `INSERT INTO login_attempts (email, ip_address, attempt_time, success, user_agent) 
                 VALUES (?, ?, ?, ?, ?)`,
                [email, ipAddress, new Date(), true, userAgent]
            );
        } catch (error) {
            console.error('Failed to record successful login:', error);
        }
    }

    async getRecentFailedAttempts(email) {
        const cutoffTime = new Date(Date.now() - AUTH_CONFIG.accountLockout.lockoutDuration);
        
        try {
            const result = await this.db.get(
                `SELECT COUNT(*) as count FROM login_attempts 
                 WHERE email = ? AND success = 0 AND attempt_time > ?`,
                [email, cutoffTime]
            );
            return result ? result.count : 0;
        } catch (error) {
            console.error('Failed to get recent failed attempts:', error);
            return 0;
        }
    }

    async isAccountLocked(email) {
        const recentFailures = await this.getRecentFailedAttempts(email);
        return recentFailures >= AUTH_CONFIG.accountLockout.maxFailedAttempts;
    }

    async lockAccount(email) {
        console.log(`🔒 Account locked for ${email} due to too many failed attempts`);
        
        // Log security event
        try {
            await this.db.run(
                `INSERT INTO security_logs (event_type, details, severity) 
                 VALUES (?, ?, ?)`,
                ['ACCOUNT_LOCKED', JSON.stringify({ email, reason: 'too_many_failed_attempts' }), 'HIGH']
            );
        } catch (error) {
            console.error('Failed to log account lockout:', error);
        }
    }
}

// Security utilities
class SecurityUtils {
    static generateCSRFToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    static validateCSRFToken(sessionToken, providedToken) {
        if (!sessionToken || !providedToken) {
            return false;
        }
        return crypto.timingSafeEqual(
            Buffer.from(sessionToken, 'hex'),
            Buffer.from(providedToken, 'hex')
        );
    }

    static hashPassword(password) {
        return bcrypt.hash(password, AUTH_CONFIG.password.saltRounds);
    }

    static validatePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    static generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    static sanitizeEmail(email) {
        return email.toLowerCase().trim();
    }

    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 255;
    }

    static rateLimitKey(ip, email) {
        return `auth:${ip}:${email}`;
    }

    static getClientFingerprint(req) {
        const userAgent = req.get('User-Agent') || '';
        const acceptLanguage = req.get('Accept-Language') || '';
        const acceptEncoding = req.get('Accept-Encoding') || '';
        
        return crypto
            .createHash('sha256')
            .update(`${userAgent}:${acceptLanguage}:${acceptEncoding}`)
            .digest('hex');
    }
}

// Authentication middleware factory
function createAuthMiddleware(db) {
    const lockoutManager = new AccountLockoutManager(db);

    return {
        // Require authentication
        requireAuth: (req, res, next) => {
            if (!req.session || !req.session.hostId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required',
                    redirectTo: '/'
                });
            }

            // Update session activity
            req.session.lastActivity = Date.now();
            next();
        },

        // Validate CSRF token
        validateCSRF: (req, res, next) => {
            if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
                return next();
            }

            const sessionToken = req.session.csrfToken;
            const providedToken = req.body.csrfToken || req.get('X-CSRF-Token');

            if (!SecurityUtils.validateCSRFToken(sessionToken, providedToken)) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid CSRF token'
                });
            }

            next();
        },

        // Check account lockout
        checkAccountLockout: async (email) => {
            return await lockoutManager.isAccountLocked(email);
        },

        // Record login attempt
        recordLoginAttempt: async (email, success, req) => {
            const ipAddress = req.ip;
            const userAgent = req.get('User-Agent');

            if (success) {
                await lockoutManager.recordSuccessfulAttempt(email, ipAddress, userAgent);
            } else {
                return await lockoutManager.recordFailedAttempt(email, ipAddress, userAgent);
            }
        },

        // Generate CSRF token for session
        generateCSRFToken: (req) => {
            const token = SecurityUtils.generateCSRFToken();
            req.session.csrfToken = token;
            return token;
        },

        // Session cleanup middleware
        sessionCleanup: (req, res, next) => {
            // Check session timeout
            if (req.session && req.session.lastActivity) {
                const now = Date.now();
                const sessionTimeout = 60 * 60 * 1000; // 1 hour of inactivity
                
                if (now - req.session.lastActivity > sessionTimeout) {
                    req.session.destroy();
                    return res.status(401).json({
                        success: false,
                        error: 'Session expired',
                        redirectTo: '/'
                    });
                }
            }

            next();
        }
    };
}

module.exports = {
    AUTH_CONFIG,
    PasswordValidator,
    AccountLockoutManager,
    SecurityUtils,
    createAuthMiddleware
};