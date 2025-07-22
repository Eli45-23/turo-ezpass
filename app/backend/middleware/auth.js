const jwt = require('jsonwebtoken');
const cognitoService = require('../services/cognitoService');

/**
 * JWT Authentication Middleware
 * Verifies JWT token and adds user info to request object
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Check for Bearer token format
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format. Use: Bearer <token>'
      });
    }

    const token = tokenParts[1];

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      } else {
        throw jwtError;
      }
    }

    // Optionally validate with Cognito (for extra security)
    if (process.env.VALIDATE_WITH_COGNITO === 'true') {
      try {
        await cognitoService.validateUser(decoded.userSub);
      } catch (cognitoError) {
        return res.status(401).json({
          success: false,
          message: 'User validation failed',
          code: 'USER_VALIDATION_FAILED'
        });
      }
    }

    // Add user info to request object
    req.user = {
      userSub: decoded.userSub,
      email: decoded.email,
      name: decoded.name,
      turoHostId: decoded.turoHostId
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Optional Authentication Middleware
 * Adds user info if token is present, but doesn't require it
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      req.user = null;
      return next();
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      req.user = null;
      return next();
    }

    const token = tokenParts[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        userSub: decoded.userSub,
        email: decoded.email,
        name: decoded.name,
        turoHostId: decoded.turoHostId
      };
    } catch (jwtError) {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    req.user = null;
    next();
  }
};

/**
 * Admin Role Middleware
 * Requires authentication and admin role
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // First run auth middleware
    await new Promise((resolve, reject) => {
      authMiddleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user has admin role
    // This would typically be stored in the JWT or fetched from database
    const isAdmin = req.user && (
      req.user.role === 'admin' || 
      req.user.email === process.env.ADMIN_EMAIL ||
      (req.user.permissions && req.user.permissions.includes('admin'))
    );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization error'
    });
  }
};

/**
 * Rate Limiting by User Middleware
 * Implements per-user rate limiting
 */
const userRateLimitMiddleware = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100,
    skipSuccessfulRequests = false
  } = options;

  const userRequestCounts = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.userSub;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [key, data] of userRequestCounts.entries()) {
      if (data.resetTime < now) {
        userRequestCounts.delete(key);
      }
    }

    // Get or create user request data
    let userData = userRequestCounts.get(userId);
    if (!userData || userData.resetTime < now) {
      userData = {
        count: 0,
        resetTime: now + windowMs
      };
      userRequestCounts.set(userId, userData);
    }

    // Check if user has exceeded limit
    if (userData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((userData.resetTime - now) / 1000)
      });
    }

    // Increment count (conditionally)
    if (!skipSuccessfulRequests || res.statusCode >= 400) {
      userData.count++;
    }

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - userData.count),
      'X-RateLimit-Reset': new Date(userData.resetTime).toISOString()
    });

    next();
  };
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  userRateLimitMiddleware
};