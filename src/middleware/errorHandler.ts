import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: string;
}

/**
 * Custom error class for application-specific errors
 */
export class CustomError extends Error implements AppError {
  statusCode: number;
  status: string;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error types
 */
export class ValidationError extends CustomError {
  constructor(message: string = 'Validation failed', code?: string) {
    super(message, 400, code || 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = 'Authentication failed', code?: string) {
    super(message, 401, code || 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = 'Authorization failed', code?: string) {
    super(message, 403, code || 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends CustomError {
  constructor(message: string = 'Resource not found', code?: string) {
    super(message, 404, code || 'NOT_FOUND');
  }
}

export class ConflictError extends CustomError {
  constructor(message: string = 'Resource conflict', code?: string) {
    super(message, 409, code || 'CONFLICT');
  }
}

export class RateLimitError extends CustomError {
  constructor(message: string = 'Rate limit exceeded', code?: string) {
    super(message, 429, code || 'RATE_LIMIT_EXCEEDED');
  }
}

export class InternalServerError extends CustomError {
  constructor(message: string = 'Internal server error', code?: string) {
    super(message, 500, code || 'INTERNAL_SERVER_ERROR');
  }
}

/**
 * Handle database errors
 */
const handleDatabaseError = (error: DatabaseError): AppError => {
  let message = 'Database operation failed';
  let statusCode = 500;
  let code = 'DATABASE_ERROR';

  switch (error.code) {
    case '23505': // Unique violation
      message = 'A record with this information already exists';
      statusCode = 409;
      code = 'DUPLICATE_ENTRY';
      break;
    case '23503': // Foreign key violation
      message = 'Referenced resource does not exist';
      statusCode = 400;
      code = 'FOREIGN_KEY_VIOLATION';
      break;
    case '23502': // Not null violation
      message = 'Required field is missing';
      statusCode = 400;
      code = 'REQUIRED_FIELD_MISSING';
      break;
    case '23514': // Check violation
      message = 'Invalid data format or value';
      statusCode = 400;
      code = 'INVALID_DATA_FORMAT';
      break;
    case '42P01': // Undefined table
      message = 'Database schema error';
      statusCode = 500;
      code = 'SCHEMA_ERROR';
      break;
    case '42703': // Undefined column
      message = 'Database schema error';
      statusCode = 500;
      code = 'SCHEMA_ERROR';
      break;
    case '08P01': // Protocol violation
    case '08006': // Connection failure
    case '08001': // Unable to connect
      message = 'Database connection error';
      statusCode = 503;
      code = 'DATABASE_UNAVAILABLE';
      break;
    default:
      // Log unexpected database errors
      console.error('Unexpected database error:', {
        code: error.code,
        message: error.message,
        detail: error.detail,
        hint: error.hint
      });
  }

  const appError = new CustomError(message, statusCode, code);
  appError.stack = error.stack;
  return appError;
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error: Error): AppError => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }
  return new AuthenticationError('Authentication failed');
};

/**
 * Handle Stripe errors
 */
const handleStripeError = (error: any): AppError => {
  let message = 'Payment processing error';
  let statusCode = 400;
  let code = 'PAYMENT_ERROR';

  switch (error.type) {
    case 'StripeCardError':
      message = error.message || 'Card was declined';
      code = 'CARD_DECLINED';
      break;
    case 'StripeRateLimitError':
      message = 'Too many requests to payment processor';
      statusCode = 429;
      code = 'RATE_LIMIT_EXCEEDED';
      break;
    case 'StripeInvalidRequestError':
      message = 'Invalid payment request';
      code = 'INVALID_PAYMENT_REQUEST';
      break;
    case 'StripeAPIError':
      message = 'Payment service unavailable';
      statusCode = 503;
      code = 'PAYMENT_SERVICE_UNAVAILABLE';
      break;
    case 'StripeConnectionError':
      message = 'Payment service connection error';
      statusCode = 503;
      code = 'PAYMENT_SERVICE_UNAVAILABLE';
      break;
    case 'StripeAuthenticationError':
      message = 'Payment service authentication error';
      statusCode = 500;
      code = 'PAYMENT_SERVICE_CONFIG_ERROR';
      break;
  }

  return new CustomError(message, statusCode, code);
};

/**
 * Send error response in development
 */
const sendErrorDev = (err: AppError, res: Response): void => {
  res.status(err.statusCode || 500).json({
    status: err.status || 'error',
    error: err,
    message: err.message,
    code: err.code,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err: AppError, res: Response): void => {
  // Only send operational errors to client
  if (err.isOperational) {
    res.status(err.statusCode || 500).json({
      status: err.status || 'error',
      message: err.message,
      code: err.code,
      timestamp: new Date().toISOString()
    });
  } else {
    // Log non-operational errors
    console.error('ERROR:', err);

    // Send generic message
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Log errors for monitoring
 */
const logError = (err: AppError, req: Request): void => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      stack: err.stack
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id
    }
  };

  // In production, you would send this to a logging service
  if (process.env.NODE_ENV === 'production') {
    console.error('Application Error:', JSON.stringify(errorInfo, null, 2));
  } else {
    console.error('Application Error:', errorInfo);
  }
};

/**
 * Main error handling middleware
 * Must be the last middleware in the chain
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err };
  error.message = err.message;

  // Handle different types of errors
  if (err.name === 'DatabaseError' || err.code) {
    error = handleDatabaseError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
    error = handleJWTError(err);
  } else if (err.type && err.type.startsWith('Stripe')) {
    error = handleStripeError(err);
  } else if (err.name === 'ValidationError') {
    error = new ValidationError(err.message);
  } else if (err.name === 'CastError') {
    error = new ValidationError('Invalid data format');
  } else if (!error.statusCode) {
    // Unhandled errors
    error = new InternalServerError();
    error.stack = err.stack;
  }

  // Log the error
  logError(error, req);

  // Send appropriate response
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

/**
 * Handle async errors
 * Wrapper for async route handlers
 */
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle 404 errors for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const err = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(err);
};

/**
 * Health check endpoint error handler
 */
export const healthCheckError = (error: any): { status: string; error?: string } => {
  if (error.code === 'ECONNREFUSED' || error.code === '08006') {
    return {
      status: 'error',
      error: 'Database connection failed'
    };
  }

  return {
    status: 'error',
    error: 'Health check failed'
  };
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdown = (server: any) => {
  return (signal: string) => {
    console.log(`${signal} received. Starting graceful shutdown...`);

    server.close((err: any) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }

      console.log('Server closed. Exiting process...');
      process.exit(0);
    });

    // Force close after 30 seconds
    setTimeout(() => {
      console.error('Forcefully shutting down...');
      process.exit(1);
    }, 30000);
  };
};