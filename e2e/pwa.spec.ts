import { test, expect } from '@playwright/test';

test('manifest jest poprawny', async ({ page }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const response = await page.request.get(manifestHref!);
  const manifest = await response.json();

  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toBe('pl');
  expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === '512x512')).toBe(true);
});

test('działa offline po pierwszej wizycie', async ({ page, context }) => {
  await page.goto('/');

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const hasController = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!hasController) {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  }

  await context.setOffline(true);
  await page.reload();
  await page.goto('/#/statystyki');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statystyki');
});
