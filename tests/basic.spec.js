import { test, expect } from '@playwright/test';

test('page loads successfully', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Playwright Test Harness');
});

test('Hello World text is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Hello World');
});

test('content element exists in DOM', async ({ page }) => {
  await page.goto('/');
  const content = page.locator('#content');
  await expect(content).toBeVisible();
  await expect(content).toHaveText('Hello World');
});
