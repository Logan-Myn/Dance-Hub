/**
 * Course Settings E2E
 *
 * Covers the two gaps a community owner reported: the cover image could not be
 * changed after creation, and a course could not be deleted at all.
 *
 * Requires a seeded verified owner and community (see scripts in the PR notes):
 *   E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_COMMUNITY_SLUG
 */

import { test, expect, type Page } from '@playwright/test';

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'delivered+coursee2e@resend.dev';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'CourseE2ePass123!';
const COMMUNITY_SLUG = process.env.E2E_COMMUNITY_SLUG || 'e2e-course-fix';

// Two visibly different 1x1 PNGs, so "did the cover actually change" is a
// question about the stored URL rather than about pixels.
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const BLUE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function signInAsOwner(page: Page) {
  await page.goto('/');

  await page.getByRole('button', { name: /sign in|log in/i }).first().click();
  await expect(page.getByText('Welcome to DanceHub')).toBeVisible({ timeout: 10000 });

  const dialog = page.locator('div[role="dialog"]');
  await page.getByRole('tab', { name: /sign in/i }).click();
  await dialog.getByPlaceholder('Email').fill(OWNER_EMAIL);
  await dialog.getByPlaceholder('Password').fill(OWNER_PASSWORD);
  // Scoped to the dialog: the header carries a "Sign In" button too.
  await dialog.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByText('Welcome to DanceHub')).not.toBeVisible({ timeout: 15000 });
}

/** Reads the stored cover URL straight from the API the classroom renders from. */
async function getCourseImageUrl(page: Page, courseSlug: string): Promise<string | null> {
  const response = await page.request.get(
    `/api/community/${COMMUNITY_SLUG}/courses/${courseSlug}`
  );
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.course?.image_url ?? body.image_url ?? null;
}

test.describe('Course settings: cover image and delete', () => {
  test.describe.configure({ mode: 'serial' });

  const courseTitle = `E2E Cover Course ${Date.now()}`;
  const courseSlug = courseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  test('owner can create a course with a cover image', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto(`/${COMMUNITY_SLUG}/classroom`);

    await page.getByRole('button', { name: /create course/i }).first().click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog.getByRole('heading', { name: 'Create a course' })).toBeVisible();

    await dialog.locator('#title').fill(courseTitle);
    await dialog.locator('#description').fill('Created by the course settings e2e run.');
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'cover-red.png',
      mimeType: 'image/png',
      buffer: RED_PNG,
    });

    await dialog.getByRole('button', { name: /^create course$/i }).click();

    // Creating opens the new course.
    await expect(page.getByRole('heading', { level: 1, name: courseTitle })).toBeVisible({ timeout: 15000 });

    const imageUrl = await getCourseImageUrl(page, courseSlug);
    expect(imageUrl).toBeTruthy();
    expect(imageUrl).not.toContain('course-placeholder');
  });

  test('owner can change the cover image of an existing course', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto(`/${COMMUNITY_SLUG}/classroom/${courseSlug}`);

    const before = await getCourseImageUrl(page, courseSlug);
    expect(before).toBeTruthy();

    await page.getByRole('button', { name: /settings/i }).click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog.getByRole('heading', { name: 'Course settings' })).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'cover-blue.png',
      mimeType: 'image/png',
      buffer: BLUE_PNG,
    });

    await dialog.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Course updated successfully').first()).toBeVisible({
      timeout: 15000,
    });

    // The regression was a silent no-op: the toast appeared, the row did not move.
    await expect
      .poll(() => getCourseImageUrl(page, courseSlug), { timeout: 15000 })
      .not.toBe(before);

    const after = await getCourseImageUrl(page, courseSlug);
    expect(after).toContain('course-images/');
  });

  test('a non-owner cannot update the course', async ({ page }) => {
    // No session at all — the handler used to accept this.
    const response = await page.request.put(
      `/api/community/${COMMUNITY_SLUG}/courses/${courseSlug}`,
      { multipart: { title: 'Hijacked', description: 'nope', is_public: 'true' } }
    );
    expect([401, 403]).toContain(response.status());

    // Course content is members-only, so an anonymous read is refused too.
    const anonymousRead = await page.request.get(
      `/api/community/${COMMUNITY_SLUG}/courses/${courseSlug}`
    );
    expect(anonymousRead.status()).toBe(401);

    // The owner still sees the course under its original title.
    await signInAsOwner(page);
    const stillNamed = await page.request.get(
      `/api/community/${COMMUNITY_SLUG}/courses/${courseSlug}`
    );
    expect(stillNamed.status()).toBe(200);
    expect((await stillNamed.json()).title).not.toBe('Hijacked');
  });

  test('a non-owner cannot delete the course', async ({ page }) => {
    const response = await page.request.delete(
      `/api/community/${COMMUNITY_SLUG}/courses/${courseSlug}`
    );
    expect([401, 403]).toContain(response.status());
  });

  test('owner can delete a course', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto(`/${COMMUNITY_SLUG}/classroom/${courseSlug}`);

    await page.getByRole('button', { name: /settings/i }).click();

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog.getByRole('heading', { name: 'Course settings' })).toBeVisible();

    await dialog.getByRole('button', { name: /^delete$/i }).click();
    await expect(dialog.getByRole('alertdialog')).toBeVisible();

    await dialog.getByRole('button', { name: /^delete course$/i }).click();

    // Owner lands back on the classroom listing and the course is gone.
    await expect(page).toHaveURL(new RegExp(`/${COMMUNITY_SLUG}/classroom/?$`), {
      timeout: 15000,
    });
    await expect(page.getByText(courseTitle)).toHaveCount(0);

    const response = await page.request.get(
      `/api/community/${COMMUNITY_SLUG}/courses/${courseSlug}`
    );
    expect(response.status()).toBe(404);
  });
});
