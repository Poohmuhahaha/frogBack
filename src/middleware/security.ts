import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

/**
 * CORS configuration
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000', // Frontend development
      'http://localhost:3001', // Alternative frontend port
      'https://frogtales.com', // Production domain
      'https://www.frogtales.com', // Production domain with www
      'https://app.frogtales.com', // Production app subdomain
    ];

    // Add environment-specific origins
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }

    if (process.env.NODE_ENV === 'development') {
      // Allow any localhost origin in development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS: Blocked origin:', origin);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Client-Version',
    'X-Request-ID'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Total-Count',
    'X-Page-Count'
  ],
  maxAge: 86400 // 24 hours
};

/**
 * Helmet security configuration
 */
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for some CSS frameworks
        'https://fonts.googleapis.com',
        'https://cdn.jsdelivr.net'
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'https://cdn.jsdelivr.net'
      ],
      imgSrc: [
        "'self'",
        'data:', // For base64 images
        'https:', // Allow HTTPS images
        'https://images.unsplash.com',
        'https://via.placeholder.com'
      ],
      scriptSrc: [
        "'self'",
        'https://js.stripe.com', // Stripe payments
        'https://www.google-analytics.com', // Analytics
        'https://www.googletagmanager.com'
      ],
      connectSrc: [
        "'self'",
        'https://api.stripe.com', // Stripe API
        'https://www.google-analytics.com',
        process.env.NODE_ENV === 'development' ? 'http://localhost:*' : ''
      ].filter(Boolean),
      frameSrc: [
        "'self'",
        'https://js.stripe.com' // Stripe Elements
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"]
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for now to avoid issues with external resources
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Add API version header
  res.setHeader('X-API-Version', process.env.API_VERSION || '1.0.0');

  next();
};

/**
 * Request ID middleware for tracking
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.headers['x-request-id'] as string ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Attach to request for logging
  (req as any).requestId = requestId;

  // Return in response headers
  res.setHeader('X-Request-ID', requestId);

  next();
};

/**
 * Trust proxy configuration
 */
export const trustProxy = (req: Request, res: Response, next: NextFunction): void => {
  // Set trust proxy based on environment
  if (process.env.NODE_ENV === 'production') {
    // Trust first proxy in production (load balancer, CloudFlare, etc.)
    req.app.set('trust proxy', 1);
  } else {
    // Don't trust proxy in development
    req.app.set('trust proxy', false);
  }

  next();
};

/**
 * IP whitelist middleware for admin endpoints
 */
export const ipWhitelist = (allowedIPs: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (allowedIPs.length === 0) {
      // No whitelist configured, allow all
      next();
      return;
    }

    const clientIP = req.ip || req.connection.remoteAddress;

    if (!clientIP || !allowedIPs.includes(clientIP)) {
      res.status(403).json({
        error: 'Access denied',
        message: 'Your IP address is not allowed to access this resource'
      });
      return;
    }

    next();
  };
};

/**
 * Webhook signature verification
 */
export const verifyWebhookSignature = (secret: string, headerName: string = 'stripe-signature') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers[headerName] as string;

    if (!signature) {
      res.status(400).json({
        error: 'Missing signature',
        message: 'Webhook signature is required'
      });
      return;
    }

    // Store signature for later verification in the route handler
    (req as any).webhookSignature = signature;
    next();
  };
};

/**
 * Content type validation
 */
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'];

    if (!contentType) {
      res.status(400).json({
        error: 'Missing content type',
        message: 'Content-Type header is required'
      });
      return;
    }

    // Check if content type matches any allowed type
    const isAllowed = allowedTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      res.status(415).json({
        error: 'Unsupported content type',
        message: `Allowed types: ${allowedTypes.join(', ')}`,
        received: contentType
      });
      return;
    }

    next();
  };
};

/**
 * Request size limiter
 */
export const requestSizeLimit = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];

    if (contentLength) {
      const size = parseInt(contentLength);
      const maxSizeBytes = parseSize(maxSize);

      if (size > maxSizeBytes) {
        res.status(413).json({
          error: 'Request too large',
          message: `Maximum allowed size: ${maxSize}`,
          received: `${(size / 1024 / 1024).toFixed(2)}MB`
        });
        return;
      }
    }

    next();
  };
};

/**
 * Security audit logging
 */
export const securityAuditLog = (req: Request, res: Response, next: NextFunction): void => {
  const securityEvents = [
    'login', 'logout', 'password_reset', 'email_change',
    'role_change', 'account_deletion', 'payment', 'webhook'
  ];

  const path = req.path.toLowerCase();
  const isSecurityEvent = securityEvents.some(event => path.includes(event));

  if (isSecurityEvent) {
    const auditData = {
      timestamp: new Date().toISOString(),
      event: path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: (req as any).user?.id,
      requestId: (req as any).requestId
    };

    // In production, send to security audit service
    console.log('Security Audit:', auditData);
  }

  next();
};

/**
 * Utility function to parse size strings (e.g., "10mb", "1gb")
 */
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2];

  return Math.floor(value * units[unit]);
}

/**
 * Initialize all security middleware
 */
export const initializeSecurity = () => {
  const middlewares = [
    helmet(helmetConfig),
    cors(corsOptions),
    trustProxy,
    requestId,
    securityHeaders,
    securityAuditLog
  ];

  return middlewares;
};