const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const Joi = require('joi');
const { db } = require('../config/database');

// Rate limiting configurations
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs for auth endpoints
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again in 15 minutes',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        // Log security event
        logSecurityEvent('RATE_LIMIT_EXCEEDED', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many authentication attempts, please try again in 15 minutes',
            retryAfter: 15 * 60
        });
    }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs (increased for toll sync)
    message: {
        success: false,
        error: 'Too many requests, please try again later',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health check and toll sync operations
        return req.path === '/health' || 
               req.path.startsWith('/api/tolls/') || 
               req.path.startsWith('/api/dashboard/toll-accounts') ||
               req.path.startsWith('/api/turo-sync/');
    }
});

const tollAccountLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit toll account operations
    message: {
        success: false,
        error: 'Too many toll account operations, please try again in 1 hour',
        retryAfter: 60 * 60
    }
});

// API-specific rate limiters for comprehensive protection

// CSV Upload rate limiter - prevent abuse of file upload endpoints
const csvUploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 uploads per 5 minutes
    message: {
        success: false,
        error: 'Too many file uploads, please try again in 5 minutes',
        retryAfter: 5 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('CSV_UPLOAD_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many file uploads, please try again in 5 minutes',
            retryAfter: 5 * 60
        });
    }
});

// Verification Status rate limiter - prevent excessive verification polling
const verificationStatusLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute  
    max: 50, // 50 verification checks per minute (allows 30s polling)
    message: {
        success: false,
        error: 'Too many verification status checks, please wait 30 seconds between requests',
        retryAfter: 30
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('VERIFICATION_STATUS_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many verification status checks, please wait 30 seconds between requests',
            retryAfter: 30
        });
    }
});

// Toll operations rate limiter - prevent toll data manipulation abuse
const tollOperationsLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100, // 100 toll operations per 10 minutes
    message: {
        success: false,
        error: 'Too many toll operations, please try again in 10 minutes',
        retryAfter: 10 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('TOLL_OPERATIONS_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many toll operations, please try again in 10 minutes',
            retryAfter: 10 * 60
        });
    }
});

// Dashboard API rate limiter - prevent dashboard data scraping
const dashboardLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: process.env.NODE_ENV === 'production' ? 1000 : 3000, // Higher limits for development
    message: {
        success: false,
        error: 'Too many dashboard requests, please try again in 5 minutes',
        retryAfter: 5 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for localhost in development
        if (process.env.NODE_ENV !== 'production' && 
            (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.startsWith('192.168.'))) {
            return true;
        }
        return false;
    },
    handler: (req, res) => {
        logSecurityEvent('DASHBOARD_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many dashboard requests, please try again in 5 minutes',
            retryAfter: 5 * 60
        });
    }
});

// Analytics API rate limiter - prevent data mining
const analyticsLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: process.env.NODE_ENV === 'production' ? 50 : 500, // Higher limits for development
    message: {
        success: false,
        error: 'Too many analytics requests, please try again in 10 minutes',
        retryAfter: 10 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for localhost in development
        if (process.env.NODE_ENV !== 'production' && 
            (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.startsWith('192.168.'))) {
            return true;
        }
        return false;
    },
    handler: (req, res) => {
        logSecurityEvent('ANALYTICS_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many analytics requests, please try again in 10 minutes',
            retryAfter: 10 * 60
        });
    }
});

// Invoice operations rate limiter - prevent invoice spam
const invoiceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 invoice operations per 15 minutes
    message: {
        success: false,
        error: 'Too many invoice operations, please try again in 15 minutes',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('INVOICE_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many invoice operations, please try again in 15 minutes',
            retryAfter: 15 * 60
        });
    }
});

// ML operations rate limiter - prevent ML service abuse
const mlOperationsLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 ML operations per 5 minutes
    message: {
        success: false,
        error: 'Too many ML operations, please try again in 5 minutes',
        retryAfter: 5 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('ML_OPERATIONS_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many ML operations, please try again in 5 minutes',
            retryAfter: 5 * 60
        });
    }
});

// Notification operations rate limiter - prevent notification spam
const notificationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 15, // 15 notification operations per 10 minutes
    message: {
        success: false,
        error: 'Too many notification operations, please try again in 10 minutes',
        retryAfter: 10 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('NOTIFICATION_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many notification operations, please try again in 10 minutes',
            retryAfter: 10 * 60
        });
    }
});

// Enhanced general limiter with development-friendly settings
const enhancedGeneralLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 1500 : 5000, // Higher limits for development
    message: {
        success: false,
        error: 'Too many requests, please try again later',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip common endpoints that make frequent requests
        const skipPaths = [
            '/health',
            '/style.css',
            '/js/',
            '/favicon',
            '/dashboard.html',
            '/api/dashboard/summary',
            '/api/transponders',
            '/api/trips/recent',
            '/api/websocket'
        ];
        
        // Skip localhost during development
        if (process.env.NODE_ENV !== 'production' && req.ip === '127.0.0.1') {
            return true;
        }
        
        return skipPaths.some(path => req.path === path || req.path.startsWith(path));
    },
    handler: (req, res) => {
        logSecurityEvent('GENERAL_RATE_LIMIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            hostId: req.session?.hostId
        });
        
        res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later',
            retryAfter: 15 * 60
        });
    }
});

// Security headers configuration
const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false // Allow WebSocket connections
});

// Input validation schemas
const schemas = {
    login: Joi.object({
        email: Joi.string().email().required().max(255),
        password: Joi.string().min(8).max(128).required()
    }),
    
    signup: Joi.object({
        email: Joi.string().email().required().max(255),
        password: Joi.string().min(8).max(128).required()
            .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')),
        fullName: Joi.string().min(2).max(100).required()
            .pattern(new RegExp('^[a-zA-Z\\s\'-]+$')),
        turoHostId: Joi.string().max(50).optional().allow('')
    }),
    
    tollAccount: Joi.object({
        provider: Joi.string().valid('EZ-Pass NY', 'EZ-Pass NJ', 'SunPass', 'FasTrak').required(),
        accountNumber: Joi.string().alphanum().min(6).max(20).required(),
        username: Joi.string().email().required().max(255),
        password: Joi.string().min(8).max(128).required()
    }),
    
    transponder: Joi.object({
        transponderNumber: Joi.string().alphanum().min(6).max(20).required(),
        vehiclePlate: Joi.string().min(2).max(10).required()
            .pattern(new RegExp('^[A-Z0-9\\-\\s]+$')),
        vehicleDescription: Joi.string().max(255).optional().allow('')
    }),

    // Trip data validation
    trip: Joi.object({
        turoTripId: Joi.string().alphanum().min(6).max(50).required(),
        renterName: Joi.string().min(2).max(100).required()
            .pattern(new RegExp('^[a-zA-Z\\s\'-\\.]+$')),
        renterEmail: Joi.string().email().max(255).optional().allow(''),
        vehiclePlate: Joi.string().min(2).max(10).required()
            .pattern(new RegExp('^[A-Z0-9\\-\\s]+$')),
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
        tripStatus: Joi.string().valid('active', 'completed', 'canceled', 'cancelled', 'declined', 'expired', 'terminated', 'rejected').optional()
    }),

    // Toll charge validation  
    tollCharge: Joi.object({
        tollDate: Joi.date().iso().max('now').required(),
        tollLocation: Joi.string().min(2).max(100).required()
            .pattern(new RegExp('^[a-zA-Z0-9\\s\\-\\.,\'&()]+$')),
        tollAmount: Joi.number().positive().precision(2).max(200).required(),
        plateNumber: Joi.string().min(2).max(15).optional()
            .pattern(new RegExp('^[A-Z0-9\\-\\s]*$')),
        transactionId: Joi.string().max(50).optional().allow('')
    }),

    // Invoice data validation
    invoice: Joi.object({
        processingFee: Joi.number().min(0).precision(2).max(25).optional(),
        status: Joi.string().valid('pending', 'sent', 'paid', 'failed', 'cancelled').optional(),
        notes: Joi.string().max(1000).optional().allow('')
    }),

    // CSV upload validation
    csvUpload: Joi.object({
        fileName: Joi.string().pattern(new RegExp('^[a-zA-Z0-9\\-_\\.\\s]+\\.(csv|CSV)$')).required(),
        fileSize: Joi.number().positive().max(10485760).required(), // 10MB max
        rowCount: Joi.number().positive().max(10000).optional()
    }),

    // Financial amount validation
    financialAmount: Joi.object({
        amount: Joi.number().precision(2).min(0).max(9999.99).required(),
        currency: Joi.string().valid('USD').default('USD'),
        description: Joi.string().max(255).optional().allow('')
    }),

    // Date range validation 
    dateRange: Joi.object({
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
        timezone: Joi.string().max(50).optional().default('UTC')
    }),

    // Search/filter parameters
    searchParams: Joi.object({
        query: Joi.string().max(100).pattern(new RegExp('^[a-zA-Z0-9\\s\\-_\\.@]+$')).optional(),
        limit: Joi.number().integer().min(1).max(1000).default(50),
        offset: Joi.number().integer().min(0).default(0),
        sortBy: Joi.string().valid('date', 'amount', 'location', 'plate', 'status').optional(),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    }),

    // File upload validation
    fileUpload: Joi.object({
        mimetype: Joi.string().valid('text/csv', 'application/csv', 'text/plain').required(),
        size: Joi.number().positive().max(10485760).required(), // 10MB
        originalname: Joi.string().pattern(new RegExp('^[a-zA-Z0-9\\-_\\.\\s]+\\.(csv|CSV)$')).required()
    }),

    // API parameters validation
    apiParams: Joi.object({
        hostId: Joi.number().integer().positive().optional(),
        tripId: Joi.number().integer().positive().optional(),
        chargeId: Joi.number().integer().positive().optional(),
        invoiceId: Joi.number().integer().positive().optional(),
        vehiclePlate: Joi.string().min(2).max(10)
            .pattern(new RegExp('^[A-Z0-9\\-\\s]+$')).optional()
    })
};

/**
 * Input validation middleware factory
 */
function validateInput(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            stripUnknown: true,
            abortEarly: false
        });
        
        if (error) {
            logSecurityEvent('INVALID_INPUT', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.path,
                method: req.method,
                errors: error.details.map(detail => detail.message),
                hostId: req.session?.hostId
            });
            
            return res.status(400).json({
                success: false,
                error: 'Invalid input data',
                details: error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }))
            });
        }
        
        // Replace body with validated and sanitized data
        req.body = value;
        next();
    };
}

/**
 * Enhanced authentication middleware with security logging
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.hostId) {
        logSecurityEvent('UNAUTHORIZED_ACCESS', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            sessionId: req.sessionID
        });
        
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    
    // Verify session is still valid in database
    db.get(
        'SELECT id, email FROM hosts WHERE id = ?',
        [req.session.hostId],
        (err, host) => {
            if (err || !host) {
                logSecurityEvent('INVALID_SESSION', {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.path,
                    method: req.method,
                    hostId: req.session.hostId,
                    sessionId: req.sessionID
                });
                
                req.session.destroy();
                return res.status(401).json({
                    success: false,
                    error: 'Session expired'
                });
            }
            
            // Store host info for use in route handlers
            req.host = host;
            next();
        }
    );
}

/**
 * CSRF token validation middleware
 */
function validateCSRF(req, res, next) {
    const token = req.get('X-CSRF-Token') || req.body._csrf;
    const sessionToken = req.session.csrfToken;
    
    if (!token || !sessionToken || token !== sessionToken) {
        logSecurityEvent('CSRF_TOKEN_MISMATCH', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            method: req.method,
            hostId: req.session?.hostId,
            sessionId: req.sessionID
        });
        
        return res.status(403).json({
            success: false,
            error: 'Invalid CSRF token'
        });
    }
    
    next();
}

/**
 * Sanitize text input
 */
function sanitizeText(text) {
    if (typeof text !== 'string') return text;
    
    // Escape HTML to prevent XSS
    return validator.escape(text.trim());
}

/**
 * Enhanced HTML sanitization for dynamic content
 */
function sanitizeHTML(html) {
    if (typeof html !== 'string') return html;
    
    // Remove script tags and their content
    let sanitized = html.replace(/<script[^>]*>.*?<\/script>/gis, '');
    
    // Remove dangerous attributes (onclick, onload, etc.)
    sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Remove javascript: protocol from links
    sanitized = sanitized.replace(/javascript\s*:/gi, '');
    
    // Remove data: protocol from src attributes
    sanitized = sanitized.replace(/src\s*=\s*["']data:[^"']*["']/gi, '');
    
    // Escape remaining HTML entities
    return validator.escape(sanitized);
}

/**
 * Sanitize data for JSON output to prevent XSS in API responses
 */
function sanitizeForJSON(data) {
    if (data === null || data === undefined) return data;
    
    if (typeof data === 'string') {
        // Escape HTML entities and remove null bytes
        return validator.escape(data.replace(/\0/g, ''));
    }
    
    if (typeof data === 'object') {
        if (Array.isArray(data)) {
            return data.map(item => sanitizeForJSON(item));
        }
        
        const sanitizedObj = {};
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                // Sanitize keys as well
                const sanitizedKey = validator.escape(String(key));
                sanitizedObj[sanitizedKey] = sanitizeForJSON(data[key]);
            }
        }
        return sanitizedObj;
    }
    
    return data;
}

/**
 * Middleware to sanitize JSON responses
 */
function sanitizeJSONResponse(req, res, next) {
    const originalJson = res.json;
    
    res.json = function(data) {
        // Only sanitize if content type is JSON
        const contentType = res.get('Content-Type');
        if (!contentType || contentType.includes('application/json')) {
            const sanitizedData = sanitizeForJSON(data);
            return originalJson.call(this, sanitizedData);
        }
        return originalJson.call(this, data);
    };
    
    next();
}

/**
 * Enhanced CSP headers for dynamic content protection
 */
function enhancedCSP(req, res, next) {
    // Generate nonce for inline scripts if needed
    const nonce = require('crypto').randomBytes(16).toString('base64');
    req.nonce = nonce;
    
    res.setHeader('Content-Security-Policy', 
        `default-src 'self'; ` +
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; ` +
        `style-src 'self' 'unsafe-inline'; ` +
        `img-src 'self' data: https:; ` +
        `connect-src 'self' ws: wss:; ` +
        `font-src 'self'; ` +
        `object-src 'none'; ` +
        `media-src 'self'; ` +
        `frame-src 'none'; ` +
        `base-uri 'self'; ` +
        `form-action 'self'; ` +
        `frame-ancestors 'none';`
    );
    
    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
}

/**
 * Sanitize all string inputs in request body
 */
function sanitizeInputs(req, res, next) {
    function sanitizeObject(obj) {
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = sanitizeText(obj[key]);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitizeObject(obj[key]);
            }
        }
    }
    
    if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
    }
    
    next();
}

/**
 * Security event logging
 */
function logSecurityEvent(eventType, details) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        eventType,
        details,
        severity: getSeverity(eventType)
    };
    
    // Log to console (in production, use proper logging service)
    console.warn('🔒 SECURITY EVENT:', JSON.stringify(logEntry, null, 2));
    
    // Store in database for audit trail
    db.run(
        `INSERT INTO security_logs (event_type, details, severity, created_at) 
         VALUES (?, ?, ?, datetime('now'))`,
        [eventType, JSON.stringify(details), logEntry.severity],
        (err) => {
            if (err) {
                console.error('❌ Failed to log security event:', err.message);
            }
        }
    );
}

/**
 * Get severity level for security events
 */
function getSeverity(eventType) {
    const severityMap = {
        'RATE_LIMIT_EXCEEDED': 'MEDIUM',
        'UNAUTHORIZED_ACCESS': 'HIGH',
        'INVALID_SESSION': 'HIGH',
        'CSRF_TOKEN_MISMATCH': 'HIGH',
        'INVALID_INPUT': 'LOW',
        'LOGIN_ATTEMPT': 'INFO',
        'LOGIN_SUCCESS': 'INFO',
        'LOGIN_FAILURE': 'MEDIUM',
        'LOGIN_ERROR': 'HIGH',
        'PASSWORD_CHANGE': 'HIGH',
        'ACCOUNT_CREATED': 'MEDIUM',
        'SIGNUP_ATTEMPT': 'INFO',
        'SIGNUP_DUPLICATE': 'MEDIUM',
        'SIGNUP_ERROR': 'HIGH',
        'LOGOUT_ATTEMPT': 'INFO',
        'LOGOUT_SUCCESS': 'INFO',
        'LOGOUT_ERROR': 'MEDIUM',
        'TOLL_ACCOUNT_ACCESS': 'MEDIUM',
        'WEBSOCKET_RATE_LIMIT': 'MEDIUM',
        'WEBSOCKET_AUTH_TIMEOUT': 'MEDIUM',
        'WEBSOCKET_AUTHENTICATED': 'INFO',
        'WEBSOCKET_UNAUTH_MESSAGE': 'HIGH',
        'WEBSOCKET_MESSAGE_ERROR': 'MEDIUM',
        'WEBSOCKET_ERROR': 'MEDIUM',
        'WEBSOCKET_NO_SESSION': 'HIGH',
        'VERIFICATION_STATUS_RATE_LIMIT': 'MEDIUM'
    };
    
    return severityMap[eventType] || 'LOW';
}

/**
 * WebSocket authentication middleware
 */
function authenticateWebSocket(ws, req, next) {
    // Extract session from cookie
    const sessionID = req.sessionID;
    if (!sessionID) {
        logSecurityEvent('WEBSOCKET_NO_SESSION', {
            ip: req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        });
        return ws.close(1008, 'Authentication required');
    }
    
    // Verify session exists and is valid
    // This would need to be integrated with your session store
    next();
}

module.exports = {
    authLimiter,
    generalLimiter,
    tollAccountLimiter,
    csvUploadLimiter,
    verificationStatusLimiter,
    tollOperationsLimiter,
    dashboardLimiter,
    analyticsLimiter,
    invoiceLimiter,
    mlOperationsLimiter,
    notificationLimiter,
    enhancedGeneralLimiter,
    helmetConfig,
    validateInput,
    requireAuth,
    validateCSRF,
    sanitizeInputs,
    sanitizeText,
    sanitizeHTML,
    sanitizeForJSON,
    sanitizeJSONResponse,
    enhancedCSP,
    logSecurityEvent,
    authenticateWebSocket,
    schemas
};