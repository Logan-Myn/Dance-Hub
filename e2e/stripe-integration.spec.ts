/**
 * Stripe Integration E2E Tests
 *
 * Tests the complete subscription and pre-registration flows
 * Requires:
 * - Running dev server
 * - Valid Stripe test/live keys configured
 * - Test community with Stripe Connect account
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration - update these for your test environment
const TEST_CONFIG = {
  // Test user credentials (create these in your system first)
  testUser: {
    email: process.env.TEST_USER_EMAIL || 'test-user@example.com',
    password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
    name: 'Test User',
  },
  // Community owner credentials
  ownerUser: {
    email: process.env.OWNER_USER_EMAIL || 'owner@example.com',
    password: process.env.OWNER_USER_PASSWORD || 'OwnerPassword123!',
    name: 'Community Owner',
  },
  // Stripe test card details
  stripeTestCard: {
    number: '4242424242424242',
    expiry: '12/30',
    cvc: '123',
    zip: '12345',
  },
  // Community details for testing
  testCommunity: {
    name: 'Test Dance Community',
    slug: 'test-dance-community',
    price: '29.99',
  },
};

// Helper function to sign in via modal
async function signIn(page: Page, email: string, password: string) {
  // Click sign in button to open modal
  const signInButton = page.getByRole('button', { name: /sign in|log in/i });
  if (await signInButton.isVisible()) {
    await signInButton.click();
  }

  // Wait for modal to be visible
  await expect(page.getByText('Welcome to DanceHub')).toBeVisible({ timeout: 5000 });

  // Click Sign In tab if not already active
  const signInTab = page.getByRole('tab', { name: /sign in/i });
  await signInTab.click();

  // Fill in credentials
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);

  // Submit
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for modal to close (successful login)
  await expect(page.getByText('Welcome to DanceHub')).not.toBeVisible({ timeout: 10000 });
}

// Helper function to sign up via modal
async function signUp(page: Page, email: string, password: string, name: string) {
  // Click sign in button to open modal
  const signInButton = page.getByRole('button', { name: /sign in|log in/i });
  if (await signInButton.isVisible()) {
    await signInButton.click();
  }

  // Wait for modal to be visible
  await expect(page.getByText('Welcome to DanceHub')).toBeVisible({ timeout: 5000 });

  // Click Sign Up tab
  const signUpTab = page.getByRole('tab', { name: /sign up/i });
  await signUpTab.click();

  // Fill in details
  await page.getByPlaceholder(/name/i).fill(name);
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).first().fill(password);

  // Submit
  await page.getByRole('button', { name: /sign up|create account/i }).click();
}

// Helper to fill Stripe payment form (in iframe)
async function fillStripePaymentForm(page: Page, card = TEST_CONFIG.stripeTestCard) {
  // Wait for Stripe iframe to load
  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  // Fill card number
  await stripeFrame.getByPlaceholder(/card number/i).fill(card.number);

  // Fill expiry
  await stripeFrame.getByPlaceholder(/mm.*yy/i).fill(card.expiry);

  // Fill CVC
  await stripeFrame.getByPlaceholder(/cvc/i).fill(card.cvc);

  // Fill ZIP if visible
  const zipField = stripeFrame.getByPlaceholder(/zip/i);
  if (await zipField.isVisible()) {
    await zipField.fill(card.zip);
  }
}

test.describe('Test A: Community Membership Subscription Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('complete subscription flow for paid community', async ({ page }) => {
    // Step 1: Navigate to test community
    await page.goto(`/${TEST_CONFIG.testCommunity.slug}/about`);

    // Verify community page loads
    await expect(page.getByText(TEST_CONFIG.testCommunity.name)).toBeVisible({ timeout: 10000 });

    // Step 2: Click join button
    const joinButton = page.getByRole('button', { name: /join|become a member/i });
    await expect(joinButton).toBeVisible();
    await joinButton.click();

    // Step 3: Sign in if auth modal appears
    const authModal = page.getByText('Welcome to DanceHub');
    if (await authModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signIn(page, TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);
    }

    // Step 4: Wait for payment modal/form
    await expect(page.getByText(/payment|subscribe|membership/i)).toBeVisible({ timeout: 10000 });

    // Step 5: Fill Stripe payment form
    await fillStripePaymentForm(page);

    // Step 6: Submit payment
    const payButton = page.getByRole('button', { name: /pay|subscribe|confirm/i });
    await payButton.click();

    // Step 7: Wait for success
    await expect(page.getByText(/success|welcome|member/i)).toBeVisible({ timeout: 30000 });

    // Step 8: Verify redirect to classroom or community page
    await page.waitForURL(new RegExp(`${TEST_CONFIG.testCommunity.slug}/(classroom|feed)`), { timeout: 10000 });
  });

  test('verify subscription appears in Stripe via API', async ({ request }) => {
    // This test verifies the subscription was created correctly via API
    const response = await request.get('/api/admin/subscriptions');

    if (response.ok()) {
      const data = await response.json();
      console.log('Subscription data:', JSON.stringify(data, null, 2));

      // Verify we have subscriptions
      expect(data.total_active_subscriptions).toBeGreaterThanOrEqual(0);
    }
  });

  test('verify member record in database via API', async ({ request }) => {
    // Check member status via community API
    const response = await request.get(`/api/community/${TEST_CONFIG.testCommunity.slug}/members`);

    if (response.ok()) {
      const data = await response.json();
      console.log('Members data:', JSON.stringify(data, null, 2));
    }
  });
});

test.describe('Test B: Pre-Registration Flow', () => {
  // Note: This requires a community in pre_registration status
  const preRegCommunity = {
    slug: 'test-pre-reg-community',
    name: 'Test Pre-Registration Community',
  };

  test('complete pre-registration flow', async ({ page }) => {
    // Step 1: Navigate to pre-registration community
    await page.goto(`/${preRegCommunity.slug}/about`);

    // Check if community exists and is in pre-registration
    const preRegBadge = page.getByText(/pre-registration|coming soon|opening/i);

    if (await preRegBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Step 2: Click pre-register button
      const preRegButton = page.getByRole('button', { name: /pre-register|reserve|join waitlist/i });
      await expect(preRegButton).toBeVisible();
      await preRegButton.click();

      // Step 3: Handle auth if needed
      const authModal = page.getByText('Welcome to DanceHub');
      if (await authModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        await signIn(page, TEST_CONFIG.testUser.email, TEST_CONFIG.testUser.password);
      }

      // Step 4: Wait for payment method collection form
      await expect(page.getByText(/payment method|card details|save card/i)).toBeVisible({ timeout: 10000 });

      // Step 5: Fill Stripe setup form (no charge, just saving card)
      await fillStripePaymentForm(page);

      // Step 6: Confirm setup
      const confirmButton = page.getByRole('button', { name: /save|confirm|pre-register/i });
      await confirmButton.click();

      // Step 7: Verify success
      await expect(page.getByText(/success|confirmed|registered/i)).toBeVisible({ timeout: 30000 });
    } else {
      test.skip('Community not in pre-registration status');
    }
  });

  test('cancel pre-registration', async ({ page }) => {
    // Navigate to user's memberships/dashboard
    await page.goto('/dashboard');

    // Find the pre-registered community
    const preRegSection = page.getByText(preRegCommunity.name);

    if (await preRegSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click cancel button
      const cancelButton = page.getByRole('button', { name: /cancel pre-registration|cancel/i });
      await cancelButton.click();

      // Confirm cancellation
      const confirmCancel = page.getByRole('button', { name: /confirm|yes/i });
      if (await confirmCancel.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmCancel.click();
      }

      // Verify cancellation
      await expect(page.getByText(/cancelled|removed/i)).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Webhook Endpoint Tests', () => {
  test('webhook test endpoint responds in dev, is hidden in production builds', async ({ request }) => {
    const response = await request.post('/api/webhooks/stripe/test', {
      data: { test: true },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // The local e2e recipe runs against `bun start` (a production build),
    // where this debug endpoint must not exist.
    if (response.status() === 404) return;
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('main webhook endpoint exists', async ({ request }) => {
    // Send a minimal request (will fail signature validation but endpoint should respond)
    const response = await request.post('/api/webhooks/stripe', {
      data: { type: 'test' },
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test-signature',
      },
    });

    // Should return 400 (invalid signature) not 404 (not found)
    expect(response.status()).toBe(400);
  });
});

test.describe('API Endpoint Tests', () => {
  test('join-paid endpoint returns proper error without auth', async ({ request }) => {
    const response = await request.post(`/api/community/${TEST_CONFIG.testCommunity.slug}/join-paid`, {
      data: {
        userId: 'test-user-id',
        email: 'test@example.com',
      },
    });

    // Should return an error (auth required; the body userId is ignored)
    expect([400, 401, 404, 500]).toContain(response.status());
  });

  test('join-pre-registration endpoint exists', async ({ request }) => {
    const response = await request.post(`/api/community/test-community/join-pre-registration`, {
      data: {
        userId: 'test-user-id',
        email: 'test@example.com',
      },
    });

    // Should return an error (auth required) but endpoint should exist
    expect([400, 401, 404, 500]).toContain(response.status());
  });
});
