# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development (using Bun)
bun dev                  # Start development server at localhost:3000
bun run build            # Build production version
bun start                # Start production server
bun lint                 # Run ESLint
bun test                 # Run Jest tests
bun run test:watch       # Run tests in watch mode

# Package management
bun add <package>        # Install a package
bun remove <package>     # Remove a package
bun install              # Install all dependencies
```

## Project Architecture

**Tech Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Neon Postgres + better-auth, Stripe Connect, LiveKit (via Stream-Hub)

### Core Architecture Patterns

- **App Router Structure**: Uses Next.js 16 App Router with dynamic routes like `[communitySlug]`. Async dynamic APIs (cookies/headers/params/searchParams).
- **Authentication**: better-auth with sessions stored in Neon; OAuth providers (Google) wired via `app/api/auth/[...all]`
- **Database**: Neon Postgres accessed via `@neondatabase/serverless` and `lib/db.ts` tagged-template `sql\`...\``
- **Video Integration (client-facing)**: LiveKit + Stream-Hub. Client mounts `LiveKitVideoCall`; tokens via `/api/bookings/[bookingId]/video-token`. NOTE: legacy Daily.co booking-room creation still runs server-side (see `project_daily_co_half_migration` memory) — pending follow-up PR.
- **Payments**: Stripe Connect (Express) for community payouts and lesson payments. Subscription flow uses PaymentElement + `redirect: 'if_required'` polling pattern.

### Key Directories

- `app/` - Next.js App Router pages and API routes
- `components/` - React components (UI components in `ui/` subdirectory)
- `lib/` - Utility libraries and API helpers
- `types/` - TypeScript type definitions
- `contexts/` - React Context providers
- `supabase/migrations/` - Database migration files

### Important Architectural Concepts

**Multi-tenant Communities**: The app supports multiple dance communities, each with:
- Unique slug-based routing (`[communitySlug]`)
- Separate Stripe Connect accounts for payouts
- Individual courses, private lessons, and member management

**Video Session Lifecycle**: Private lessons follow this flow:
1. Student books lesson via Stripe payment
2. Stream-Hub LiveKit room created lazily on first `/video-token` request
3. Video tokens generated for secure access (`/api/bookings/[bookingId]/video-token/`)
4. In-app video session using `@livekit/components-react`

**Authentication & Authorization**:
- Server-side auth checks in admin layouts and route handlers (no middleware/proxy file at present)
- Better-auth session resolved via `getSession()` from `lib/auth-session`
- Permission checks done in route handlers; community-scoped operations gated by `community.created_by` checks

### Database Schema Key Tables

- `communities` - Dance communities with Stripe account integration
- `members` - Community memberships with subscription status
- `private_lessons` - Lesson offerings with Daily.co room integration
- `lesson_bookings` - Booking records with payment and video session tracking
- `teacher_availability` - Teacher scheduling system

### Critical Configuration

**Environment Variables Required**:
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase connection
- `SUPABASE_SERVICE_ROLE_KEY` - Server-side Supabase operations
- `STRIPE_SECRET_KEY` - Stripe payments
- `DAILY_API_KEY` - Video session creation

**Component Naming**: Use kebab-case for component files (per `.cursorrules.json`)

**Code Style Preferences** (from `.cursorrules.json`):
- Favor React Server Components over client components
- Minimize 'use client' usage
- Implement proper error handling and loading states
- Use semantic HTML elements
- Maintain type safety throughout

### Common Development Patterns

**API Route Structure**: Routes follow REST conventions in `app/api/` with proper HTTP methods and error handling

**Supabase Client Pattern**: Use appropriate client:
- `lib/supabase/client.ts` for browser-side operations
- `lib/supabase/admin.ts` for server-side privileged operations

**Video Session Integration**: Always create Daily.co rooms with proper expiration and security tokens for private lessons

**Payment Flow**: Stripe Connect handles community payouts - ensure proper webhook handling in `/api/webhooks/stripe/`

### Email Testing with Resend

When testing emails, use Resend's official test email addresses (refer to: https://resend.com/docs/dashboard/emails/send-test-emails):

- **Test Delivered**: `delivered@resend.dev` (or with labels like `delivered+signup@resend.dev`)
- **Test Bounced**: `bounced@resend.dev` 
- **Test Spam**: `complained@resend.dev`

**Important**: Never use fake email addresses when testing - use these official Resend test addresses to avoid damaging domain reputation and to properly simulate different email scenarios.