// lib/broadcasts/constants.ts

export const FREE_QUOTA_PER_MONTH = 10;
export const PAID_SOFT_CAP_PER_MONTH = 200;
export const BATCH_SIZE = 100;          // Resend batch API: max 100 emails per call
export const BATCH_DELAY_MS = 250;      // ~4 req/sec, stays under Resend's 5 req/sec team cap
export const MAX_BATCH_RETRIES = 3;

export const BROADCAST_FROM_ADDRESS = 'community@dance-hub.io';

// Stripe — the €10/month price must be created in Stripe Dashboard, ID set here via env
export const BROADCAST_PRICE_ID_ENV = 'STRIPE_BROADCAST_PRICE_ID';
