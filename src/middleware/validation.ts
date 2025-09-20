import { Request, Response, NextFunction } from 'express';
import { ValidationChain, validationResult, body, param, query, check } from 'express-validator';

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));

    res.status(400).json({
      error: 'Validation failed',
      message: 'Invalid input data',
      details: formattedErrors
    });
    return;
  }

  next();
};

/**
 * Helper function to create validation chains with error handling
 */
export const validate = (validations: ValidationChain[]) => {
  return [...validations, handleValidationErrors];
};

// Common validation rules
export const commonValidations = {
  // Email validation
  email: body('email')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .trim(),

  // Password validation
  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  // Name validation
  name: body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .trim()
    .escape(),

  // UUID validation
  uuid: (field: string) => param(field)
    .isUUID()
    .withMessage(`${field} must be a valid UUID`),

  // Role validation
  role: body('role')
    .isIn(['creator', 'subscriber', 'admin'])
    .withMessage('Role must be one of: creator, subscriber, admin'),

  // Article validation
  articleTitle: body('title')
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters')
    .trim(),

  articleContent: body('content')
    .isLength({ min: 1 })
    .withMessage('Content cannot be empty')
    .trim(),

  articleSlug: body('slug')
    .isLength({ min: 1, max: 100 })
    .withMessage('Slug must be between 1 and 100 characters')
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens')
    .trim(),

  articleExcerpt: body('excerpt')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Excerpt must not exceed 500 characters')
    .trim(),

  articleTags: body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
    .custom((tags) => {
      if (!Array.isArray(tags)) return false;
      return tags.every(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 50);
    })
    .withMessage('Each tag must be a non-empty string with maximum 50 characters'),

  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  // Search validation
  search: query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters')
    .trim()
    .escape(),

  // Subscription plan validation
  subscriptionPlanName: body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Plan name must be between 1 and 100 characters')
    .trim(),

  subscriptionPlanPrice: body('price')
    .isInt({ min: 0 })
    .withMessage('Price must be a non-negative integer (in cents)')
    .toInt(),

  subscriptionPlanCurrency: body('currency')
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter ISO code')
    .isUppercase()
    .withMessage('Currency must be uppercase'),

  // Affiliate link validation
  affiliateLinkName: body('name')
    .isLength({ min: 1, max: 200 })
    .withMessage('Link name must be between 1 and 200 characters')
    .trim(),

  affiliateLinkUrl: body('originalUrl')
    .isURL()
    .withMessage('Must be a valid URL'),

  affiliateCommissionRate: body('commissionRate')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Commission rate must be between 0 and 100')
    .toFloat(),

  // Email campaign validation
  emailCampaignSubject: body('subject')
    .isLength({ min: 1, max: 200 })
    .withMessage('Subject must be between 1 and 200 characters')
    .trim(),

  emailCampaignContent: body('content')
    .isLength({ min: 1 })
    .withMessage('Content cannot be empty')
    .trim(),

  // Date validation
  date: (field: string) => body(field)
    .optional()
    .isISO8601()
    .withMessage(`${field} must be a valid ISO 8601 date`)
    .toDate(),

  // Boolean validation
  boolean: (field: string) => body(field)
    .optional()
    .isBoolean()
    .withMessage(`${field} must be a boolean`)
    .toBoolean(),
};

// Specific validation sets for different endpoints
export const validationSets = {
  // User registration
  userRegistration: validate([
    commonValidations.email,
    commonValidations.password,
    commonValidations.name,
    commonValidations.role
  ]),

  // User login
  userLogin: validate([
    commonValidations.email,
    body('password').notEmpty().withMessage('Password is required')
  ]),

  // Password reset request
  passwordResetRequest: validate([
    commonValidations.email
  ]),

  // Password reset
  passwordReset: validate([
    body('token').notEmpty().withMessage('Reset token is required'),
    commonValidations.password
  ]),

  // Article creation
  articleCreate: validate([
    commonValidations.articleTitle,
    commonValidations.articleContent,
    commonValidations.articleSlug,
    commonValidations.articleExcerpt,
    commonValidations.articleTags,
    body('isPremium').optional().isBoolean().toBoolean(),
    body('seoTitle').optional().isLength({ max: 200 }).trim(),
    body('seoDescription').optional().isLength({ max: 500 }).trim()
  ]),

  // Article update
  articleUpdate: validate([
    commonValidations.uuid('id'),
    commonValidations.articleTitle.optional(),
    commonValidations.articleContent.optional(),
    commonValidations.articleSlug.optional(),
    commonValidations.articleExcerpt,
    commonValidations.articleTags,
    body('isPremium').optional().isBoolean().toBoolean(),
    body('status').optional().isIn(['draft', 'published', 'archived']),
    body('seoTitle').optional().isLength({ max: 200 }).trim(),
    body('seoDescription').optional().isLength({ max: 500 }).trim()
  ]),

  // Subscription plan creation
  subscriptionPlanCreate: validate([
    commonValidations.subscriptionPlanName,
    body('description').optional().isLength({ max: 1000 }).trim(),
    commonValidations.subscriptionPlanPrice,
    commonValidations.subscriptionPlanCurrency,
    body('features').optional().isArray().withMessage('Features must be an array')
  ]),

  // Affiliate link creation
  affiliateLinkCreate: validate([
    commonValidations.affiliateLinkName,
    commonValidations.affiliateLinkUrl,
    body('network').isIn(['amazon', 'shareasale', 'cj', 'custom']).withMessage('Invalid network'),
    commonValidations.affiliateCommissionRate,
    body('category').isLength({ min: 1, max: 100 }).trim()
  ]),

  // Email campaign creation
  emailCampaignCreate: validate([
    body('name').isLength({ min: 1, max: 200 }).trim(),
    commonValidations.emailCampaignSubject,
    commonValidations.emailCampaignContent,
    body('type').isIn(['newsletter', 'automation', 'announcement']),
    body('scheduledAt').optional().isISO8601().toDate()
  ]),

  // Newsletter subscription
  newsletterSubscribe: validate([
    commonValidations.email,
    body('name').optional().isLength({ min: 1, max: 100 }).trim(),
    body('source').optional().isIn(['website', 'social', 'referral', 'import']),
    body('tags').optional().isArray()
  ]),

  // Pagination
  pagination: validate([
    commonValidations.page,
    commonValidations.limit
  ]),

  // Search
  search: validate([
    commonValidations.search,
    commonValidations.page,
    commonValidations.limit
  ])
};

/**
 * Custom validation for file uploads
 */
export const validateFileUpload = (allowedTypes: string[], maxSize: number = 5 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file && !req.files) {
      next();
      return;
    }

    const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];

    for (const file of files) {
      if (!file) continue;

      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        res.status(400).json({
          error: 'Invalid file type',
          message: `Allowed types: ${allowedTypes.join(', ')}`,
          received: file.mimetype
        });
        return;
      }

      // Check file size
      if (file.size > maxSize) {
        res.status(400).json({
          error: 'File too large',
          message: `Maximum size: ${maxSize / (1024 * 1024)}MB`,
          received: `${(file.size / (1024 * 1024)).toFixed(2)}MB`
        });
        return;
      }
    }

    next();
  };
};

/**
 * Sanitize HTML content
 */
export const sanitizeHtml = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const field of fields) {
      if (req.body[field]) {
        // Basic HTML sanitization - in production, use a library like DOMPurify
        req.body[field] = req.body[field]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
    }
    next();
  };
};