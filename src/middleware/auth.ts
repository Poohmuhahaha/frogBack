import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import database from '../database/connection';

export interface UserPayload {
  id: string;
  email: string;
  role: 'creator' | 'subscriber' | 'admin';
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: UserPayload;
  token?: string;
}

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and attaches user information to request
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set');
      res.status(500).json({
        error: 'Server configuration error',
        message: 'Authentication service unavailable'
      });
      return;
    }

    // Verify the token
    const decoded = jwt.verify(token, jwtSecret) as UserPayload;

    // Check if user still exists in database
    const userQuery = `
      SELECT id, email, role, email_verified, created_at, updated_at
      FROM users
      WHERE id = $1 AND email_verified = true
    `;

    const result = await database.query(userQuery, [decoded.id]);

    if (result.rows.length === 0) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found or email not verified'
      });
      return;
    }

    const user = result.rows[0];

    // Attach user information to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified
    };
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid token'
      });
    } else if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Token expired'
      });
    } else {
      console.error('Authentication middleware error:', error);
      res.status(500).json({
        error: 'Server error',
        message: 'Authentication service error'
      });
    }
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user information if token is provided, but doesn't require it
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      // Continue without authentication if JWT_SECRET is not configured
      next();
      return;
    }

    // Try to verify the token
    const decoded = jwt.verify(token, jwtSecret) as UserPayload;

    // Check if user exists
    const userQuery = `
      SELECT id, email, role, email_verified
      FROM users
      WHERE id = $1 AND email_verified = true
    `;

    const result = await database.query(userQuery, [decoded.id]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.email_verified
      };
      req.token = token;
    }

    next();
  } catch (error) {
    // For optional auth, we don't return errors, just continue without authentication
    next();
  }
};

/**
 * Role-based Authorization Middleware
 * Requires specific roles to access the route
 */
export const requireRole = (...roles: UserPayload['role'][]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Authorization failed',
        message: 'Insufficient permissions to access this resource'
      });
      return;
    }

    next();
  };
};

/**
 * Email Verification Required Middleware
 * Ensures the user's email is verified
 */
export const requireEmailVerification = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email address to access this resource'
    });
    return;
  }

  next();
};

/**
 * Resource Owner Authorization Middleware
 * Ensures the user owns the resource or is an admin
 */
export const requireResourceOwnership = (userIdField: string = 'userId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
      return;
    }

    // Admins can access any resource
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if user owns the resource
    const resourceUserId = req.params[userIdField] || req.body[userIdField];

    if (resourceUserId !== req.user.id) {
      res.status(403).json({
        error: 'Authorization failed',
        message: 'You can only access your own resources'
      });
      return;
    }

    next();
  };
};

/**
 * API Key Authentication Middleware
 * For webhook endpoints and internal services
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    console.error('API_KEY environment variable is not set');
    res.status(500).json({
      error: 'Server configuration error',
      message: 'API key service unavailable'
    });
    return;
  }

  if (!apiKey || apiKey !== validApiKey) {
    res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid API key'
    });
    return;
  }

  next();
};

/**
 * Rate Limiting Middleware
 * Basic rate limiting based on user ID or IP
 */
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

export const rateLimit = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const key = req.user?.id || req.ip;
    const now = Date.now();

    if (!rateLimitStore[key] || now > rateLimitStore[key].resetTime) {
      rateLimitStore[key] = {
        count: 1,
        resetTime: now + windowMs
      };
    } else {
      rateLimitStore[key].count++;
    }

    const remaining = Math.max(0, maxRequests - rateLimitStore[key].count);
    const resetTime = new Date(rateLimitStore[key].resetTime);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime.toISOString());

    if (rateLimitStore[key].count > maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit resets at ${resetTime.toISOString()}`
      });
      return;
    }

    next();
  };
};

// Utility function to generate JWT tokens
export const generateToken = (user: UserPayload, expiresIn: string = '24h'): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return jwt.sign(user, jwtSecret, { expiresIn });
};