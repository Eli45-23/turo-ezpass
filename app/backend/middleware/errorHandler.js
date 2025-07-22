/**
 * Global Error Handler Middleware
 * Handles all errors and sends appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  if (process.env.NODE_ENV !== 'test') {
    console.error('Error Details:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID format';
    error = { message, statusCode: 400 };
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // AWS Cognito errors
  if (err.code) {
    switch (err.code) {
      case 'UsernameExistsException':
        error = { message: 'User already exists with this email', statusCode: 400 };
        break;
      case 'UserNotFoundException':
        error = { message: 'User not found', statusCode: 404 };
        break;
      case 'NotAuthorizedException':
        error = { message: 'Invalid credentials', statusCode: 401 };
        break;
      case 'UserNotConfirmedException':
        error = { message: 'User email not confirmed', statusCode: 400 };
        break;
      case 'CodeMismatchException':
        error = { message: 'Invalid verification code', statusCode: 400 };
        break;
      case 'ExpiredCodeException':
        error = { message: 'Verification code expired', statusCode: 400 };
        break;
      case 'InvalidPasswordException':
        error = { message: 'Password does not meet requirements', statusCode: 400 };
        break;
      case 'LimitExceededException':
        error = { message: 'Too many requests. Please try again later', statusCode: 429 };
        break;
      case 'TooManyRequestsException':
        error = { message: 'Too many requests. Please try again later', statusCode: 429 };
        break;
      case 'InvalidParameterException':
        error = { message: 'Invalid parameters provided', statusCode: 400 };
        break;
      default:
        if (err.statusCode) {
          error = { message: err.message, statusCode: err.statusCode };
        }
    }
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        error = { message: 'Duplicate entry detected', statusCode: 400 };
        break;
      case '23503': // Foreign key violation
        error = { message: 'Referenced resource does not exist', statusCode: 400 };
        break;
      case '23502': // Not null violation
        error = { message: 'Required field missing', statusCode: 400 };
        break;
      case '22001': // String data right truncation
        error = { message: 'Data too long for field', statusCode: 400 };
        break;
      case '08006': // Connection failure
        error = { message: 'Database connection failed', statusCode: 503 };
        break;
      case '57P01': // Admin shutdown
        error = { message: 'Database temporarily unavailable', statusCode: 503 };
        break;
    }
  }

  // Network/HTTP errors
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
    error = { message: 'External service unavailable', statusCode: 503 };
  }

  if (err.code === 'ETIMEDOUT') {
    error = { message: 'Request timeout', statusCode: 408 };
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = { message: 'File too large', statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = { message: 'Unexpected file upload', statusCode: 400 };
  }

  // Rate limiting errors
  if (err.message && err.message.includes('rate limit')) {
    error = { message: 'Rate limit exceeded', statusCode: 429 };
  }

  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';

  // Build error response
  const errorResponse = {
    success: false,
    message,
    ...(statusCode < 500 && { statusCode }),
    ...(req.originalUrl && { path: req.originalUrl }),
    ...(req.method && { method: req.method }),
    timestamp: new Date().toISOString()
  };

  // Add error ID for tracking in production
  if (process.env.NODE_ENV === 'production') {
    const errorId = require('uuid').v4();
    errorResponse.errorId = errorId;
    
    // Log error ID for debugging
    console.error(`Error ID: ${errorId}`);
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = {
      name: err.name,
      code: err.code,
      ...(err.response && { response: err.response.data })
    };
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not Found Handler
 * Handles 404 errors for unknown routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Custom Error Class
 * For creating custom errors with status codes
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error Helper
 * Creates standardized validation errors
 */
const createValidationError = (field, message, value = null) => {
  const error = new AppError(`Validation failed: ${message}`, 400);
  error.field = field;
  error.value = value;
  return error;
};

/**
 * Database Error Helper
 * Creates standardized database errors
 */
const createDatabaseError = (operation, details = null) => {
  const error = new AppError(`Database ${operation} failed`, 500);
  error.operation = operation;
  error.details = details;
  return error;
};

/**
 * External Service Error Helper
 * Creates standardized external service errors
 */
const createServiceError = (service, operation, statusCode = 503) => {
  const error = new AppError(`${service} service ${operation} failed`, statusCode);
  error.service = service;
  error.operation = operation;
  return error;
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  AppError,
  createValidationError,
  createDatabaseError,
  createServiceError
};