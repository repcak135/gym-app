import { test, expect } from '@playwright/test';

test('każda zakładka pokazuje swój ekran', async ({ page }) => {
  await page.goto('/');
  for (const [label, title] of [['Plany','Plany'],['Ćwiczenia','Ćwiczenia'],['Historia','Historia'],['Statystyki','Statystyki'],['Start','Start']]) {
    await page.getByRole('navigation', { name: 'Główne menu' }).getByRole('link', { name: label }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});
test('link bezpośredni działa po przeładowaniu', async ({ page }) => {
  await page.goto('/#/historia'); await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Historia');
});
test('przyciski menu mają co najmniej 44 px', async ({ page }) => {
  await page.goto('/');
  for (const link of await page.getByRole('navigation', { name: 'Główne menu' }).getByRole('link').all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test('menu uwzględnia bezpieczny obszar iPhone', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('viewport-fit=cover');
  const css = await page.evaluate(() => [...document.styleSheets].flatMap(s => [...s.cssRules].map(r => r.cssText)).join('\n'));
  expect(css).toContain('safe-area-inset-bottom');
});
