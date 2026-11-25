import { test, expect } from '@playwright/test';

const accent = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

test('Banana Gym: tytuł i domyślny bananowy akcent', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Banana Gym');
  expect(await accent(page)).toBe('#ffd23f');
});

test('ustawienia › Wygląd: wybrany kolor działa w całej aplikacji i zostaje po odświeżeniu', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await expect(page.getByRole('radio', { name: 'Bananowy' })).toBeChecked();
  await page.getByRole('radio', { name: 'Niebieski' }).click();
  await expect(page.getByRole('radio', { name: 'Niebieski' })).toBeChecked();
  expect(await accent(page)).toBe('#5aa9ff');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Niebieski' })).toBeChecked();
  await page.goto('/#/');
  expect(await accent(page)).toBe('#5aa9ff');
  await page.goto('/#/ustawienia');
  await page.getByRole('radio', { name: 'Pomarańczowy' }).click();
  expect(await accent(page)).toBe('#ff7a45');
});
