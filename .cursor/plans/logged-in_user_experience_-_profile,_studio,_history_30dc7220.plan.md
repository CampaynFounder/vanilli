---
name: Logged-In User Experience - Profile, Studio, History
overview: "Build three core logged-in UIs: Profile (with referral system and avatar), Studio (video creation workspace with RAG help), and History (generations, projects, and payment activity). Includes database schema updates for referral rewards configuration and avatar storage."
todos:
  - id: db-schema-referrals
    content: Create referral_rewards configuration table and update referrals table with product tracking
    status: pending
  - id: db-schema-avatar
    content: Add avatar_url column to users table
    status: pending
  - id: backend-profile-api
    content: Add GET/PUT /api/auth/profile endpoints for user profile management
    status: pending
    dependencies:
      - db-schema-avatar
  - id: backend-referral-api
    content: "Add referral endpoints: generate code, get stats, list referred users"
    status: pending
    dependencies:
      - db-schema-referrals
  - id: backend-avatar-upload
    content: Add POST /api/upload/avatar endpoint using Supabase Storage
    status: pending
    dependencies:
      - db-schema-avatar
  - id: backend-history-api
    content: "Add history endpoints: generations, projects, payment activity"
    status: pending
  - id: frontend-auth-middleware
    content: Create Next.js middleware for protected routes and auth utilities
    status: pending
  - id: frontend-profile-ui
    content: Build Profile page with account info, avatar upload, and referral system
    status: pending
    dependencies:
      - backend-profile-api
      - backend-referral-api
      - backend-avatar-upload
  - id: frontend-history-ui
    content: Build History page with tabs for Generations, Projects, and Activity
    status: pending
    dependencies:
      - backend-history-api
  - id: frontend-studio-ui
    content: Build Studio page with project list, workspace, and RAG help panel (placeholder)
    status: pending
    dependencies:
      - frontend-auth-middleware
  - id: frontend-authenticated-layout
    content: Create authenticated layout with navigation (Profile | Studio | History)
    status: pending
    dependencies:
      - frontend-auth-middleware
  - id: premium-design-system
    content: Implement premium design system (glassmorphism, neumorphism, animations, gradients)
    status: pending
  - id: premium-components
    content: Build reusable premium components (glass cards, FABs, progress rings, bottom-sheets)
    status: pending
    dependencies:
      - premium-design-system
isProject: false
---

# Logged-

In User Experience - Profile, Studio, History UIs

## Overview

Build three main UIs for authenticated users:

1. **Profile** - Account management, referral system, avatar upload
2. **Studio** - Video creation workspace with projects and RAG-powered help
3. **History** - Tabbed view of Generations, Projects, and Payment Activity

## Database Schema Updates

### 1. Referral Rewards Configuration Table

**File**: `packages/database/schema.sql`Create `referral_rewards` table to configure credit amounts per tier/product:

```sql
CREATE TABLE referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tier TEXT NOT NULL CHECK (referrer_tier IN ('free', 'open_mic', 'indie_artist', 'artist', 'label')),
  referred_product TEXT NOT NULL CHECK (referred_product IN ('open_mic', 'indie_artist', 'artist', 'label')),
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_tier, referred_product)
);
```

### 2. User Avatar Field

**File**: `packages/database/schema.sql`Add `avatar_url` to `users` table:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

### 3. Update Referrals Table

**File**: `packages/database/schema.sql`Add fields to track referral source product:

```sql
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_product TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_tier_at_signup TEXT;
```

## Backend API Updates

### 1. Profile & Referral Endpoints

**File**: `apps/workers/src/routes/auth.ts`Add endpoints:

- `GET /api/auth/profile` - Get user profile with referral code, stats, avatar
- `PUT /api/auth/profile` - Update profile (avatar, preferences)
- `GET /api/auth/referrals` - Get referral stats and referred users list
- `POST /api/auth/generate-referral-code` - Generate unique referral code

### 2. Avatar Upload Endpoint

**File**: `apps/workers/src/routes/auth.ts` (or new `upload.ts`)

- `POST /api/upload/avatar` - Upload avatar to Supabase Storage, return URL
- Use Supabase Storage bucket: `user-avatars`

### 3. Referral Rewards Configuration API

**File**: `apps/workers/src/routes/admin.ts`

- `GET /api/admin/referral-rewards` - Get reward configuration (admin only)
- `PUT /api/admin/referral-rewards` - Update reward amounts (admin only)

### 4. History Endpoints

**File**: `apps/workers/src/routes/projects.ts` (extend existing)

- `GET /api/projects/history` - Get all projects with statuses
- `GET /api/generations/history` - Get all generations (queued, processing, completed, failed)
- `GET /api/activity/payments` - Get payment/subscription history (integrate with Stripe webhook data)

## Premium Design System

All logged-in UIs must follow a premium design aesthetic with glassmorphism, neumorphism, 3D depth, and micro-interactions.

### Design Principles

**File**: `apps/web/src/app/globals.css` and `apps/web/tailwind.config.js`**Core Visual Elements**:

- **Glassmorphism**: Frosted glass effects with backdrop blur (10-20px)
- **Neumorphism 2.0**: Soft shadows, elevated cards with inset/outset effects
- **3D Depth**: Parallax scrolling, layered z-index, perspective transforms
- **Animated Gradients**: Purple/blue/grey gradients with smooth transitions
- **Micro-interactions**: Hover states, tap animations, loading states on every interactive element
- **Typography**: Large, bold fonts with gradient text effects
- **Bottom-sheet Modals**: iOS-style slide-up modals for mobile
- **Haptic Feedback Indicators**: Visual feedback for touch interactions
- **Dark Mode**: Ultra-dark backgrounds (slate-950) with neon purple/blue accents
- **Floating Action Buttons**: FABs with glow effects and shadow animations

### Tailwind Configuration Updates

**File**: `apps/web/tailwind.config.js`Add custom animations and utilities:

```javascript
extend: {
  animation: {
    'scan': 'scan 3s linear infinite',
    'fade-out': 'fadeOut 2s ease-out forwards',
    'unblur': 'unblur 3s ease-out forwards',
    'shimmer': 'shimmer 2s linear infinite',
    'glow-pulse': 'glowPulse 2s ease-in-out infinite',
    'float': 'float 3s ease-in-out infinite',
  },
  keyframes: {
    scan: {
      '0%': { transform: 'translateY(-100%)' },
      '100%': { transform: 'translateY(100%)' },
    },
    fadeOut: {
      '0%': { opacity: '0.5' },
      '100%': { opacity: '0' },
    },
    unblur: {
      '0%': { filter: 'blur(40px)' },
      '100%': { filter: 'blur(0px)' },
    },
    shimmer: {
      '0%': { backgroundPosition: '-1000px 0' },
      '100%': { backgroundPosition: '1000px 0' },
    },
    glowPulse: {
      '0%, 100%': { boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)' },
      '50%': { boxShadow: '0 0 40px rgba(168, 85, 247, 0.8)' },
    },
    float: {
      '0%, 100%': { transform: 'translateY(0px)' },
      '50%': { transform: 'translateY(-10px)' },
    },
  },
  backdropBlur: {
    xs: '2px',
  },
}
```

### Global CSS Utilities

**File**: `apps/web/src/app/globals.css`Add premium utility classes:

```css
/* Glassmorphism variants */
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}

.glass-card-elevated {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.5);
}

/* Neumorphism 2.0 */
.neumorphic {
  background: #1e293b;
  box-shadow: 
    8px 8px 16px rgba(0, 0, 0, 0.4),
    -8px -8px 16px rgba(255, 255, 255, 0.05);
  border-radius: 16px;
}

.neumorphic-inset {
  background: #1e293b;
  box-shadow: 
    inset 4px 4px 8px rgba(0, 0, 0, 0.4),
    inset -4px -4px 8px rgba(255, 255, 255, 0.05);
}

/* Animated gradients */
.gradient-animated {
  background: linear-gradient(-45deg, #9333ea, #3b82f6, #6366f1, #9333ea);
  background-size: 400% 400%;
  animation: gradientShift 8s ease infinite;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Gradient text with glow */
.gradient-text-premium {
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.5));
}

/* Floating action button */
.fab {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a855f7, #3b82f6);
  box-shadow: 
    0 8px 24px rgba(168, 85, 247, 0.4),
    0 0 0 0 rgba(168, 85, 247, 0.5);
  animation: glow-pulse 2s ease-in-out infinite;
  transition: transform 0.2s ease;
}

.fab:hover {
  transform: scale(1.1);
}

/* Noise texture component */
.noise-texture {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  opacity: 0.1;
  mix-blend-mode: overlay;
}

/* Progress ring */
.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.3s ease;
}

/* Premium tier badge shimmer */
.tier-badge-shimmer {
  background: linear-gradient(
    90deg,
    rgba(168, 85, 247, 0.1) 0%,
    rgba(168, 85, 247, 0.3) 50%,
    rgba(168, 85, 247, 0.1) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}
```

### Component-Specific Design Requirements

#### Profile Page

- **Account Card**: Glassmorphic card with neumorphic inset for avatar
- **Referral Code**: Large gradient text with copy button (micro-animation on tap)
- **Tier Badge**: Animated shimmer effect, glow pulse
- **Stats Cards**: Elevated glass cards with hover lift effect
- **Avatar Upload**: Drag-and-drop zone with glass border, animated gradient on hover

#### Studio Page

- **Hero Section**: Video autoplay preview with glass overlay
- **Project Cards**: Neumorphic cards with 3D hover effect (perspective transform)
- **Upload Flow**: Card-based drag-and-drop with animated gradient border
- **Progress Rings**: Real-time circular progress with glow effect
- **Generation Preview**: Fake progressive effect while waiting:
- Animated scanning line
- Noise texture that fades out
- Progressive blur reveal (blur-xl → blur-0)
- Preview updates every 2-3 seconds
- **Video Scrubbing**: Live scrubbing during generation with neon timeline
- **RAG Help Panel**: Bottom-sheet modal (mobile) or glass sidebar (desktop)

#### History Page

- **Tabs**: Glassmorphic tab bar with gradient active indicator
- **Timeline**: Vertical timeline with neon accent lines
- **Status Badges**: Animated shimmer for premium tiers
- **Cards**: Elevated glass cards with parallax on scroll
- **Activity Items**: Micro-animation on hover (scale + glow)

#### Authenticated Layout

- **Navigation**: Glassmorphic nav bar with blur backdrop
- **User Menu**: Bottom-sheet modal on mobile, dropdown on desktop
- **Credits Display**: Floating badge with glow pulse
- **FAB**: Floating action button for "New Project" with glow effect

### Payment Integration UI

**One-Tap Payment Buttons**:

- Cash App Pay button (branded styling)
- Google Pay button (branded styling)
- Apple Pay button (branded styling)
- Card payment (glassmorphic form with neon accents)

All payment buttons should have:

- Micro-interaction on tap (scale + haptic feedback indicator)
- Glow effect on hover
- Loading state with animated gradient

### Social Proof Carousel

**File**: `apps/web/src/components/SocialProofCarousel.tsx`

- Horizontal scroll carousel with glassmorphic cards
- Parallax effect on scroll
- Auto-play with pause on hover
- Neon accent borders

### Responsive Design

- **Mobile**: Bottom-sheet modals, swipe gestures, haptic feedback indicators
- **Tablet**: Hybrid approach (bottom-sheets for modals, sidebars for panels)
- **Desktop**: Full glassmorphic experience with parallax scrolling

## Frontend Implementation

### 1. Authentication & Protected Routes

**File**: `apps/web/src/middleware.ts` (new)Create Next.js middleware to protect routes:

- Check Supabase session
- Redirect to `/auth/signin` if not authenticated
- Allow access to `/profile`, `/studio`, `/history` only when authenticated

**File**: `apps/web/src/lib/auth.ts` (new)Create auth utilities:

- `useAuth()` hook for client-side auth state
- `getServerSession()` for server-side auth checks
- Session management with Supabase

### 2. Profile UI

**File**: `apps/web/src/app/profile/page.tsx`**Sections**:

- **Account Info**: Email, tier, credits display
- **Avatar Upload**: Image upload to Supabase Storage with preview
- **Referral Section**:
- Display unique referral code (generated on first visit)
- Share button (copy link, social share)
- Referral stats (total referred, credits earned)
- List of referred users (with status: pending/completed)
- Referral rewards table (showing credits per product)
- **Subscription Management**: Current tier, upgrade/downgrade buttons
- **Settings**: Password change, preferences

**Components**:

- `AvatarUpload.tsx` - Image upload with crop/preview
- `ReferralCode.tsx` - Code display with copy/share
- `ReferralStats.tsx` - Stats cards and referred users list
- `SubscriptionCard.tsx` - Current subscription info

### 3. Studio UI

**File**: `apps/web/src/app/studio/page.tsx`**Layout**:

- **Sidebar**: Projects list (draft, processing, completed)
- **Main Area**: 
- Project creation form (when no project selected)
- Project workspace (when project selected)
- Video recording interface
- Generation status/polling
- **RAG Help Panel**: Collapsible sidebar with:
- Searchable help content
- Context-aware suggestions
- Links to relevant sections
- Placeholder for future RAG integration

**Components**:

- `ProjectList.tsx` - Sidebar project list with filters (neumorphic cards)
- `ProjectWorkspace.tsx` - Main project editing area
- `VideoRecorder.tsx` - Camera recording with audio sync
- `GenerationStatus.tsx` - Real-time status polling with progress ring
- `GenerationPreview.tsx` - Fake progressive effect while waiting for Kling:
- Animated scanning line (top to bottom, 3s loop)
- Noise texture overlay that fades out (opacity 0.5 → 0)
- Progressive blur reveal (blur-xl → blur-0 over 3s)
- Preview updates every 2-3 seconds via polling
- Live video scrubbing during generation with neon timeline
- Glassmorphic container with gradient border
- `RAGHelpPanel.tsx` - Help interface (placeholder for RAG, bottom-sheet on mobile)

**File**: `apps/web/src/app/studio/[projectId]/page.tsx`Individual project detail page with full workflow.

### 4. History UI

**File**: `apps/web/src/app/history/page.tsx`**Tabbed Interface**:

- **Generations Tab**: 
- All generations (queued, processing, completed, failed)
- Filters: status, date range
- Download links for completed
- Error messages for failed
- **Projects Tab**:
- All projects with status
- Link to studio for each project
- Delete action
- **Activity Tab**:
- Payment history (subscriptions, one-time purchases)
- Credit purchases
- Referral credits earned
- Timeline view

**Components**:

- `HistoryTabs.tsx` - Tab navigation
- `GenerationsList.tsx` - Generations with status badges
- `ProjectsList.tsx` - Projects grid/list view
- `ActivityTimeline.tsx` - Chronological activity feed

## Navigation & Layout

### 1. Authenticated Layout

**File**: `apps/web/src/app/(authenticated)/layout.tsx`Create authenticated route group with:

- Navigation bar (Profile | Studio | History)
- User menu (avatar, credits, sign out)
- Mobile-responsive sidebar

### 2. Update Root Layout

**File**: `apps/web/src/app/layout.tsx`Add conditional rendering for authenticated vs public navigation.

## Key Features

### Referral System Flow

1. User visits Profile → generates referral code if doesn't exist
2. Code format: `VANNI-{user_id_short}` or similar
3. When new user signs up with code:

- Look up referrer's tier
- Check `referral_rewards` table for credit amount
- Award credits to referrer
- Update `referrals` table

4. Display in Profile: referred users list, credits earned

### Studio Workflow

1. Create new project → enter track name, BPM, bars
2. Upload target image (AI character)
3. Record driver video (performance)
4. Submit for generation → poll status
5. Download completed video

### RAG Help System (Placeholder)

- Create `apps/web/src/data/help-content.json` with structured help docs
- Simple search/filter implementation
- Links to relevant pages
- Ready for RAG API integration later

## Files to Create/Modify

### New Files

- `apps/web/src/app/(authenticated)/layout.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/studio/page.tsx`
- `apps/web/src/app/studio/[projectId]/page.tsx`
- `apps/web/src/app/history/page.tsx`
- `apps/web/src/middleware.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/components/profile/*.tsx` (multiple components)
- `apps/web/src/components/studio/*.tsx` (multiple components)
- `apps/web/src/components/history/*.tsx` (multiple components)
- `apps/web/src/components/ui/GlassCard.tsx` - Reusable glassmorphic card
- `apps/web/src/components/ui/NeumorphicCard.tsx` - Reusable neumorphic card
- `apps/web/src/components/ui/FloatingActionButton.tsx` - FAB with glow
- `apps/web/src/components/ui/ProgressRing.tsx` - Circular progress with glow
- `apps/web/src/components/ui/BottomSheet.tsx` - iOS-style bottom sheet modal
- `apps/web/src/components/ui/NoiseTexture.tsx` - Noise texture overlay
- `apps/web/src/components/ui/PremiumBadge.tsx` - Tier badge with shimmer
- `apps/web/src/components/ui/PaymentButtons.tsx` - One-tap payment buttons
- `apps/web/src/components/ui/SocialProofCarousel.tsx` - Social proof carousel
- `packages/database/add-referral-rewards-table.sql`
- `packages/database/add-user-avatar.sql`

### Modified Files

- `apps/workers/src/routes/auth.ts` - Add profile/referral endpoints
- `apps/workers/src/routes/projects.ts` - Add history endpoints
- `apps/workers/src/routes/admin.ts` - Add referral rewards config
- `packages/database/schema.sql` - Add new tables/columns
- `apps/web/src/app/layout.tsx` - Conditional navigation
- `apps/web/src/app/globals.css` - Add premium design utilities and animations
- `apps/web/tailwind.config.js` - Add custom animations, keyframes, and utilities

## Implementation Order

1. **Database Schema** - Add tables and columns
2. **Backend APIs** - Profile, referrals, history endpoints
3. **Auth Middleware** - Protected routes
4. **Profile UI** - Account, avatar, referrals
5. **History UI** - Tabbed interface with data
6. **Studio UI** - Project workspace (await mockup for details)
7. **RAG Help** - Placeholder implementation

## Dependencies