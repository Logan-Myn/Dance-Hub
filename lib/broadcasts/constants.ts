// lib/broadcasts/constants.ts

export const FREE_QUOTA_PER_MONTH = 10;
export const PAID_SOFT_CAP_PER_MONTH = 200;
export const BATCH_SIZE = 100;          // Resend batch API: max 100 emails per call
export const BATCH_DELAY_MS = 600;      // < 2 req/sec, Resend's default team rate limit
export const MAX_BATCH_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000; // backoff before retry n: base * 2^(n-1), or Retry-After

export const BROADCAST_FROM_ADDRESS = 'community@dance-hub.io';

// Stripe — the €10/month price must be created in Stripe Dashboard, ID set here via env
export const BROADCAST_PRICE_ID_ENV = 'STRIPE_BROADCAST_PRICE_ID';
