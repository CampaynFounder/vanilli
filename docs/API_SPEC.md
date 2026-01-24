# Vannilli API Specification

**Base URL**: `https://api.vannilli.xaino.io`  
**Version**: 1.0  
**Protocol**: HTTPS only  
**Authentication**: JWT Bearer tokens (Supabase Auth)

## Table of Contents

1. [Authentication](#authentication)
2. [Video Generation Flow](#video-generation-flow)
3. [Payment & Billing](#payment--billing)
4. [User Management](#user-management)
5. [Admin & Monitoring](#admin--monitoring)
6. [Error Handling](#error-handling)

## Authentication

All authenticated endpoints require an `Authorization` header with a JWT token from Supabase Auth.

```
Authorization: Bearer <jwt_token>
```

### POST /api/auth/signup

Create a new user account.

**Request Body**:
```json
{
  "email": "artist@example.com",
  "password": "securepassword123",
  "deviceFingerprint": "abc123..."
}
```

**Response** (201 Created):
```json
{
  "user": {
    "id": "uuid",
    "email": "artist@example.com",
    "tier": "free",
    "creditsRemaining": 0,
    "freeGenerationRedeemed": false
  },
  "session": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "expiresIn": 604800
  }
}
```

### POST /api/auth/signin

Sign in existing user.

**Request Body**:
```json
{
  "email": "artist@example.com",
  "password": "securepassword123"
}
```

**Response** (200 OK): Same as signup response

### GET /api/auth/me

Get current user profile and credit balance.

**Response** (200 OK):
```json
{
  "id": "uuid",
  "email": "artist@example.com",
  "tier": "artist",
  "creditsRemaining": 66,
  "subscription": {
    "status": "active",
    "currentPeriodEnd": "2026-02-22T00:00:00Z"
  }
}
```

## Video Generation Flow

### POST /api/calculate-duration

Convert BPM and bars to video duration and cost.

**Request Body**:
```json
{
  "bpm": 140,
  "bars": 8
}
```

**Response** (200 OK):
```json
{
  "bpm": 140,
  "bars": 8,
  "durationSeconds": 14,
  "partName": "Hook",
  "cost": {
    "credits": 14,
    "dollars": 3.50,
    "sufficientCredits": true,
    "creditsAfter": 66
  },
  "message": "This Hook will use 14 seconds of credit"
}
```

### POST /api/upload-assets

Get pre-signed URLs for uploading assets to R2.

**Request Body**:
```json
{
  "projectId": "uuid",
  "assets": {
    "driverVideo": true,
    "targetImage": true,
    "audio": false
  }
}
```

**Response** (200 OK):
```json
{
  "uploadUrls": {
    "driverVideo": {
      "url": "https://r2.vannilli.io/presigned-url-1",
      "expiresIn": 300,
      "key": "driver-videos/user-id/uuid.mp4"
    },
    "targetImage": {
      "url": "https://r2.vannilli.io/presigned-url-2",
      "expiresIn": 300,
      "key": "target-images/user-id/uuid.jpg"
    }
  }
}
```

### POST /api/start-generation

Initiate video generation with Kling AI.

**Request Body**:
```json
{
  "projectId": "uuid",
  "driverVideoKey": "driver-videos/user-id/uuid.mp4",
  "targetImageKey": "target-images/user-id/uuid.jpg",
  "prompt": "Camera zooms in slightly, maintains eye contact",
  "mode": "standard"
}
```

**Response** (202 Accepted):
```json
{
  "internalTaskId": "uuid-v7",
  "status": "pending",
  "estimatedCompletionSeconds": 90,
  "message": "Your video is being generated. Check status at /api/poll-status/uuid-v7"
}
```

### GET /api/poll-status/:taskId

Check status of video generation.

**Response** (200 OK):

**Pending/Processing**:
```json
{
  "internalTaskId": "uuid-v7",
  "status": "processing",
  "progress": 45,
  "estimatedTimeRemaining": 60,
  "message": "Syncing your performance..."
}
```

**Completed**:
```json
{
  "internalTaskId": "uuid-v7",
  "status": "completed",
  "generationId": "gen-uuid",
  "previewUrl": "https://r2.vannilli.io/previews/gen-uuid.gif",
  "thumbnailUrl": "https://r2.vannilli.io/thumbnails/gen-uuid.jpg",
  "watermarked": true,
  "costCredits": 14,
  "message": "Your video is ready! This 8-bar Hook used 14 credits."
}
```

**Failed**:
```json
{
  "internalTaskId": "uuid-v7",
  "status": "failed",
  "error": "Driver video processing failed: Invalid codec",
  "message": "Video generation failed. No credits were deducted."
}
```

### GET /api/download/:generationId

Download final video (deducts credits on first download).

**Response** (200 OK):
```json
{
  "downloadUrl": "https://r2.vannilli.io/signed-url-to-video.mp4",
  "expiresIn": 3600,
  "creditsDeducted": 14,
  "creditsRemaining": 52,
  "watermarked": false
}
```

## Payment & Billing

### POST /api/checkout

Create Stripe Checkout session for subscription or credit top-up.

**Request Body** (Subscription):
```json
{
  "type": "subscription",
  "tier": "artist",
  "successUrl": "https://vannilli.xaino.io/success",
  "cancelUrl": "https://vannilli.xaino.io/pricing"
}
```

**Request Body** (Top-Up):
```json
{
  "type": "topup",
  "credits": 100,
  "successUrl": "https://vannilli.xaino.io/success",
  "cancelUrl": "https://vannilli.xaino.io/studio"
}
```

**Response** (200 OK):
```json
{
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_...",
  "sessionId": "cs_test_..."
}
```

### POST /api/webhooks/stripe

Handle Stripe webhook events (idempotent).

**Headers**:
```
Stripe-Signature: t=timestamp,v1=signature
```

**Events Handled**:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `checkout.session.completed`

**Response** (200 OK):
```json
{
  "received": true
}
```

### GET /api/credits/balance

Get user's current credit balance.

**Response** (200 OK):
```json
{
  "creditsRemaining": 66,
  "tier": "artist",
  "includedPerMonth": 80,
  "usedThisPeriod": 14,
  "periodEnd": "2026-02-22T00:00:00Z"
}
```

## User Management

### GET /api/projects

List user's projects.

**Query Parameters**:
- `limit` (default: 20, max: 100)
- `offset` (default: 0)
- `status` (optional: draft, processing, completed, failed)

**Response** (200 OK):
```json
{
  "projects": [
    {
      "id": "uuid",
      "trackName": "Summer Vibes",
      "bpm": 140,
      "bars": 8,
      "durationSeconds": 14,
      "status": "completed",
      "createdAt": "2026-01-20T10:00:00Z",
      "generations": [
        {
          "id": "gen-uuid",
          "status": "completed",
          "thumbnailUrl": "https://r2.vannilli.io/thumbs/gen-uuid.jpg"
        }
      ]
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

### POST /api/projects

Create a new project.

**Request Body**:
```json
{
  "trackName": "Summer Vibes",
  "bpm": 140,
  "bars": 8
}
```

**Response** (201 Created):
```json
{
  "id": "uuid",
  "trackName": "Summer Vibes",
  "bpm": 140,
  "bars": 8,
  "durationSeconds": 14,
  "status": "draft",
  "createdAt": "2026-01-22T10:00:00Z"
}
```

### GET /api/projects/:id

Get project details.

**Response** (200 OK):
```json
{
  "id": "uuid",
  "trackName": "Summer Vibes",
  "bpm": 140,
  "bars": 8,
  "durationSeconds": 14,
  "status": "completed",
  "targetImageUrl": "https://r2.vannilli.io/images/uuid.jpg",
  "driverVideoUrl": "https://r2.vannilli.io/videos/uuid.mp4",
  "generations": [...]
}
```

### DELETE /api/projects/:id

Delete a project and all associated generations.

**Response** (204 No Content)

## Admin & Monitoring

### GET /api/metrics

Get cost monitoring metrics (admin only).

**Response** (200 OK):
```json
{
  "today": {
    "klingCost": 45.50,
    "revenue": 125.00,
    "margin": 79.50,
    "marginPercent": 63.6,
    "generationsCount": 150
  },
  "thisMonth": {
    "klingCost": 1250.00,
    "revenue": 3500.00,
    "margin": 2250.00,
    "marginPercent": 64.3,
    "generationsCount": 4200
  }
}
```

### POST /api/content-report

Report inappropriate content.

**Request Body**:
```json
{
  "generationId": "gen-uuid",
  "reason": "copyright",
  "description": "This uses my copyrighted image"
}
```

**Response** (201 Created):
```json
{
  "reportId": "uuid",
  "status": "pending",
  "message": "Report submitted. We'll review within 24 hours."
}
```

### GET /api/health

Health check endpoint (no auth required).

**Response** (200 OK):
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "r2": "healthy",
    "kling": "healthy",
    "stripe": "healthy"
  },
  "timestamp": "2026-01-22T10:00:00Z"
}
```

## Error Handling

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "specific_field",
      "reason": "validation_failed"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | User doesn't have access |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `INSUFFICIENT_CREDITS` | 402 | Not enough credits |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `KLING_API_ERROR` | 503 | Kling AI service unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Example Error Response

```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "You need 14 credits for this video, but you only have 5 remaining.",
    "details": {
      "creditsRequired": 14,
      "creditsRemaining": 5,
      "creditsNeeded": 9
    }
  }
}
```

## Rate Limits

| Tier | Requests per Minute | Generations per Hour |
|------|---------------------|----------------------|
| Free | 10 | 1 per 24h |
| Open Mic | 30 | 20 |
| Indie Artist | 60 | 50 |
| Artist | 60 | 100 |
| Label | 120 | 500 |

Rate limit headers included in all responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1706004000
```

## Versioning

API version is included in the base URL. Breaking changes will increment the version number.

Current: `v1` (implied in base URL)  
Future: `https://api.vannilli.xaino.io/v2/...`

## Support

For API support: [developers@vannilli.io](mailto:developers@vannilli.io)  
Status page: [status.vannilli.io](https://status.vannilli.io)  
Documentation: [docs.vannilli.io](https://docs.vannilli.io)


