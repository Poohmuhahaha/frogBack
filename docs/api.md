# Frogtales API Documentation

**Version**: 1.0.0
**Base URL**: `https://api.frogtales.com/v1`
**Authentication**: Bearer Token (JWT)

## Overview

The Frogtales API provides access to academic content management, user authentication, subscription services, and analytics. This RESTful API follows OpenAPI 3.0 specification and supports JSON request/response format.

## Authentication

### Bearer Token
All protected endpoints require a valid JWT token in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### API Key (Webhooks)
Some endpoints (webhooks) require an API key in the header:

```http
X-API-Key: <your-api-key>
```

## Rate Limiting

- **Default**: 100 requests per 15 minutes per user/IP
- **Authenticated users**: 1000 requests per 15 minutes
- **Premium users**: 5000 requests per 15 minutes

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets

## Error Handling

### Error Response Format
```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### HTTP Status Codes
- `200`: Success
- `201`: Created
- `204`: No Content
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `422`: Unprocessable Entity
- `429`: Too Many Requests
- `500`: Internal Server Error

---

## Authentication Endpoints

### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "role": "creator"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "creator",
    "emailVerified": false
  },
  "message": "Registration successful. Please check your email for verification."
}
```

### POST /auth/login
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "creator",
    "emailVerified": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET /auth/me
Get current user profile (requires authentication).

**Response:**
```json
{
  "id": "user_123",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "creator",
  "emailVerified": true,
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

### POST /auth/forgot-password
Request password reset email.

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "message": "Password reset email sent"
}
```

### POST /auth/reset-password
Reset password using reset token.

**Request Body:**
```json
{
  "token": "reset_token_123",
  "newPassword": "NewSecurePassword123!"
}
```

**Response:**
```json
{
  "message": "Password reset successful"
}
```

### POST /auth/verify-email
Verify email address using verification token.

**Request Body:**
```json
{
  "token": "verification_token_123"
}
```

**Response:**
```json
{
  "message": "Email verified successfully"
}
```

---

## Articles Endpoints

### GET /articles
Retrieve paginated list of articles.

**Query Parameters:**
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 10, max: 100)
- `status` (string): Filter by status (draft, published, archived)
- `authorId` (string): Filter by author ID
- `category` (string): Filter by category
- `tags` (string): Comma-separated tags
- `search` (string): Search in title and content

**Response:**
```json
{
  "articles": [
    {
      "id": "article_123",
      "title": "Understanding Machine Learning",
      "slug": "understanding-machine-learning",
      "excerpt": "A comprehensive guide to ML concepts...",
      "author": {
        "id": "user_123",
        "name": "Dr. Jane Smith"
      },
      "status": "published",
      "category": "Technology",
      "tags": ["machine learning", "AI"],
      "isPremium": false,
      "publishedAt": "2023-01-01T00:00:00.000Z",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "pages": 15
  }
}
```

### POST /articles
Create a new article (requires authentication).

**Request Body:**
```json
{
  "title": "New Article Title",
  "content": "<p>Article content in HTML format...</p>",
  "excerpt": "Brief article summary",
  "slug": "new-article-title",
  "category": "Technology",
  "tags": ["tech", "tutorial"],
  "isPremium": false,
  "seoTitle": "SEO-optimized title",
  "seoDescription": "SEO meta description"
}
```

**Response:**
```json
{
  "id": "article_124",
  "title": "New Article Title",
  "slug": "new-article-title",
  "status": "draft",
  "authorId": "user_123",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

### GET /articles/{id}
Retrieve article by ID.

**Path Parameters:**
- `id` (string): Article ID

**Response:**
```json
{
  "id": "article_123",
  "title": "Understanding Machine Learning",
  "content": "<p>Full article content...</p>",
  "slug": "understanding-machine-learning",
  "excerpt": "A comprehensive guide...",
  "author": {
    "id": "user_123",
    "name": "Dr. Jane Smith",
    "bio": "Expert in AI and ML"
  },
  "status": "published",
  "category": "Technology",
  "tags": ["machine learning", "AI"],
  "isPremium": false,
  "seo": {
    "title": "Understanding Machine Learning | Frogtales",
    "description": "Learn the fundamentals of machine learning...",
    "keywords": ["machine learning", "AI", "technology"]
  },
  "analytics": {
    "views": 1250,
    "likes": 89,
    "comments": 23,
    "shares": 45
  },
  "publishedAt": "2023-01-01T00:00:00.000Z",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

### PUT /articles/{id}
Update article (requires authentication and ownership).

**Path Parameters:**
- `id` (string): Article ID

**Request Body:**
```json
{
  "title": "Updated Article Title",
  "content": "<p>Updated content...</p>",
  "status": "published"
}
```

**Response:**
```json
{
  "id": "article_123",
  "title": "Updated Article Title",
  "status": "published",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

### DELETE /articles/{id}
Delete article (requires authentication and ownership).

**Path Parameters:**
- `id` (string): Article ID

**Response:**
```json
{
  "message": "Article deleted successfully"
}
```

### POST /articles/{id}/publish
Publish article (requires authentication and ownership).

**Path Parameters:**
- `id` (string): Article ID

**Response:**
```json
{
  "id": "article_123",
  "status": "published",
  "publishedAt": "2023-01-01T00:00:00.000Z"
}
```

---

## Subscription Endpoints

### GET /subscription-plans
Get available subscription plans.

**Response:**
```json
{
  "plans": [
    {
      "id": "plan_basic",
      "name": "Basic Plan",
      "description": "Access to basic content",
      "price": 999,
      "currency": "USD",
      "interval": "month",
      "features": [
        "Access to free articles",
        "Monthly newsletter",
        "Community access"
      ],
      "stripePriceId": "price_basic_monthly"
    },
    {
      "id": "plan_premium",
      "name": "Premium Plan",
      "description": "Full access to all content",
      "price": 1999,
      "currency": "USD",
      "interval": "month",
      "features": [
        "Access to all articles",
        "Premium content",
        "Priority support",
        "Ad-free experience"
      ],
      "stripePriceId": "price_premium_monthly"
    }
  ]
}
```

### POST /subscriptions
Create subscription (requires authentication).

**Request Body:**
```json
{
  "planId": "plan_premium",
  "paymentMethodId": "pm_stripe_123"
}
```

**Response:**
```json
{
  "subscription": {
    "id": "sub_123",
    "planId": "plan_premium",
    "status": "active",
    "currentPeriodStart": "2023-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2023-02-01T00:00:00.000Z",
    "stripeSubscriptionId": "sub_stripe_123"
  },
  "clientSecret": "pi_client_secret_123"
}
```

### GET /subscriptions/current
Get current user subscription (requires authentication).

**Response:**
```json
{
  "id": "sub_123",
  "plan": {
    "id": "plan_premium",
    "name": "Premium Plan",
    "price": 1999,
    "currency": "USD"
  },
  "status": "active",
  "currentPeriodStart": "2023-01-01T00:00:00.000Z",
  "currentPeriodEnd": "2023-02-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "createdAt": "2023-01-01T00:00:00.000Z"
}
```

### DELETE /subscriptions/{id}
Cancel subscription (requires authentication and ownership).

**Path Parameters:**
- `id` (string): Subscription ID

**Query Parameters:**
- `immediately` (boolean): Cancel immediately or at period end (default: false)

**Response:**
```json
{
  "message": "Subscription cancelled successfully",
  "cancelAtPeriodEnd": true,
  "cancelledAt": "2023-02-01T00:00:00.000Z"
}
```

---

## Analytics Endpoints

### GET /analytics/overview
Get analytics overview (requires authentication).

**Query Parameters:**
- `startDate` (string): Start date (ISO 8601)
- `endDate` (string): End date (ISO 8601)
- `articleId` (string): Filter by specific article

**Response:**
```json
{
  "overview": {
    "totalViews": 15420,
    "totalLikes": 1250,
    "totalComments": 340,
    "totalShares": 890,
    "totalArticles": 45,
    "totalRevenue": 125000
  },
  "trends": {
    "viewsGrowth": 15.5,
    "likesGrowth": 8.2,
    "revenueGrowth": 22.1
  },
  "topArticles": [
    {
      "id": "article_123",
      "title": "Popular Article",
      "views": 2340,
      "likes": 189,
      "revenue": 450
    }
  ],
  "trafficSources": [
    {
      "source": "Direct",
      "visitors": 5670,
      "percentage": 36.8
    },
    {
      "source": "Google",
      "visitors": 4520,
      "percentage": 29.3
    }
  ]
}
```

### GET /analytics/revenue
Get revenue analytics (requires authentication).

**Query Parameters:**
- `startDate` (string): Start date (ISO 8601)
- `endDate` (string): End date (ISO 8601)
- `granularity` (string): daily, weekly, monthly (default: daily)

**Response:**
```json
{
  "totalRevenue": 125000,
  "revenueBySource": [
    {
      "source": "subscriptions",
      "amount": 89000,
      "percentage": 71.2
    },
    {
      "source": "affiliates",
      "amount": 25000,
      "percentage": 20.0
    },
    {
      "source": "ads",
      "amount": 11000,
      "percentage": 8.8
    }
  ],
  "revenueTimeline": [
    {
      "date": "2023-01-01",
      "amount": 4200
    },
    {
      "date": "2023-01-02",
      "amount": 3800
    }
  ]
}
```

---

## Webhook Endpoints

### POST /webhooks/stripe
Handle Stripe webhook events.

**Headers:**
- `stripe-signature`: Stripe webhook signature

**Request Body:**
```json
{
  "type": "customer.subscription.updated",
  "data": {
    "object": {
      "id": "sub_stripe_123",
      "status": "active"
    }
  }
}
```

**Response:**
```json
{
  "received": true
}
```

### POST /webhooks/sendgrid
Handle SendGrid webhook events.

**Headers:**
- `x-twilio-email-event-webhook-signature`: SendGrid webhook signature
- `x-twilio-email-event-webhook-timestamp`: Webhook timestamp

**Request Body:**
```json
[
  {
    "email": "user@example.com",
    "event": "delivered",
    "timestamp": 1640995200,
    "sg_event_id": "event_123",
    "sg_message_id": "message_123"
  }
]
```

**Response:**
```json
{
  "processed": 1,
  "message": "Events processed successfully"
}
```

---

## Data Models

### User
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "creator | subscriber | admin",
  "emailVerified": "boolean",
  "stripeCustomerId": "string",
  "subscriptionStatus": "string",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Article
```json
{
  "id": "string",
  "title": "string",
  "content": "string (HTML)",
  "excerpt": "string",
  "slug": "string",
  "authorId": "string",
  "status": "draft | published | archived",
  "category": "string",
  "tags": "string[]",
  "isPremium": "boolean",
  "seo": {
    "title": "string",
    "description": "string",
    "keywords": "string[]"
  },
  "publishedAt": "string (ISO 8601)",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Subscription
```json
{
  "id": "string",
  "userId": "string",
  "planId": "string",
  "stripeSubscriptionId": "string",
  "status": "active | past_due | canceled | incomplete",
  "currentPeriodStart": "string (ISO 8601)",
  "currentPeriodEnd": "string (ISO 8601)",
  "cancelAtPeriodEnd": "boolean",
  "canceledAt": "string (ISO 8601)",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

---

## SDKs and Libraries

### JavaScript/TypeScript
```bash
npm install @frogtales/api-client
```

```javascript
import { FrogtalesClient } from '@frogtales/api-client';

const client = new FrogtalesClient({
  apiKey: 'your-api-key',
  baseURL: 'https://api.frogtales.com/v1'
});

// Get articles
const articles = await client.articles.list({
  page: 1,
  limit: 10,
  status: 'published'
});

// Create article
const newArticle = await client.articles.create({
  title: 'My New Article',
  content: '<p>Article content...</p>'
});
```

### Python
```bash
pip install frogtales-api
```

```python
from frogtales import FrogtalesClient

client = FrogtalesClient(
    api_key='your-api-key',
    base_url='https://api.frogtales.com/v1'
)

# Get articles
articles = client.articles.list(page=1, limit=10, status='published')

# Create article
new_article = client.articles.create(
    title='My New Article',
    content='<p>Article content...</p>'
)
```

---

## Changelog

### Version 1.0.0 (2023-01-01)
- Initial API release
- Authentication endpoints
- Article CRUD operations
- Subscription management
- Analytics endpoints
- Webhook support

---

## Support

- **Documentation**: https://docs.frogtales.com
- **API Status**: https://status.frogtales.com
- **Support Email**: api-support@frogtales.com
- **GitHub Issues**: https://github.com/frogtales/api/issues

---

## OpenAPI Specification

The complete OpenAPI 3.0 specification is available at:
- **JSON**: https://api.frogtales.com/v1/openapi.json
- **YAML**: https://api.frogtales.com/v1/openapi.yaml
- **Interactive Docs**: https://api.frogtales.com/docs