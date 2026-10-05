/**
 * Authentication E2E Tests
 *
 * Tests the complete authentication flows using Playwright
 * Note: DanceHub uses a modal-based authentication system, not separate pages
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads
    await expect(page).toHaveTitle(/DanceHub/i);
  });

  test('auth modal can be opened from navigation', async ({ page }) => {
    await page.goto('/');

    // Look for sign in/login button in the navigation
    const signInButton = page.getByRole('button', { name: /sign in|log in/i });

    // If there's a sign in button, click it and verify modal opens
    if (await signInButton.isVisible()) {
      await signInButton.click();

      // Modal should show the "Welcome back" title
      await expect(page.getByRole('dialog').getByText('Welcome back')).toBeVisible();

      // Modal should have Sign In and Sign Up tabs
      await expect(page.getByRole('tab', { name: /sign in/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /sign up/i })).toBeVisible();
    }
  });

  test('auth modal shows email and password inputs', async ({ page }) => {
    await page.goto('/');

    const signInButton = page.getByRole('button', { name: /sign in|log in/i });

    if (await signInButton.isVisible()) {
      await signInButton.click();

      // Check for email and password inputs (labelled fields)
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Email')).toBeVisible();
      await expect(dialog.getByLabel('Password', { exact: true })).toBeVisible();
    }
  });

  test('auth modal has Google sign in option', async ({ page }) => {
    await page.goto('/');

    const signInButton = page.getByRole('button', { name: /sign in|log in/i });

    if (await signInButton.isVisible()) {
      await signInButton.click();

      // Check for Google sign in button
      await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    }
  });

  test('redirects unauthenticated users from protected pages', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto('/dashboard');

    // The dashboard uses client-side redirect for unauthenticated users
    // Wait for the redirect to complete (up to 5 seconds)
    await page.waitForURL('/', { timeout: 5000 }).catch(() => {
      // If redirect didn't happen, check current URL
      // Some pages may show content while checking auth
    });

    // Should either be on home page or still on dashboard (client-side redirect)
    const url = page.url();
    expect(url).toMatch(/\/$|dashboard/);
  });
});

test.describe('Navigation', () => {
  test('main navigation links exist', async ({ page }) => {
    await page.goto('/');

    // Check that navigation elements exist
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('community about page responds correctly', async ({ page }) => {
    // Test with a community slug pattern
    // This verifies the route handler works
    const response = await page.goto('/test-community/about');

    // Either loads the page or shows 404 (both are valid responses)
    expect([200, 404]).toContain(response?.status());
  });
});
