import { test, expect } from '@playwright/test';

const FBW = 'FBW dla początkujących — kobiety';

test('szablon: dodanie planu FBW z listy szablonów', async ({ page }) => {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Dodaj z szablonu' }).click();
  await expect(page).toHaveURL(/#\/plany\/szablony$/);
  await expect(page.getByRole('button', { name: /FBW dla początkujących/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Plan 4-dniowy/ })).toBeVisible();

  await page.getByRole('button', { name: new RegExp(FBW) }).click();
  await expect(page.getByRole('heading', { level: 1, name: FBW })).toBeVisible();
  await expect(page.getByText('Inspirowane książką „Fundamenty Treningu Siłowego” (Michał Sakowski)')).toBeVisible();

  await page.getByRole('button', { name: 'Dodaj ten plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: FBW })).toBeVisible();
  await expect(page).toHaveURL(/#\/plany\/[^/]+$/);
  await expect(page.getByRole('link', { name: /^A/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^B/ })).toBeVisible();

  await page.getByRole('link', { name: /^A/ }).click();
  const row = page.getByText('Barbell Squat', { exact: true });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const squat = page.getByRole('region', { name: 'Barbell Squat' });
  await expect(squat.getByRole('status', { name: 'Serie' })).toHaveText('5');
  await expect(squat.getByRole('textbox', { name: 'Powtórzenia od' })).toHaveValue('5');
  await expect(squat.getByRole('textbox', { name: 'Powtórzenia do' })).toHaveValue('5');
});

test('szablon: przy istniejącym aktywnym planie zostaje on aktywny', async ({ page }) => {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill('Stary plan');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stary plan' })).toBeVisible();

  // The first plan becomes active on its own.
  await expect(page.getByText('Aktywny')).toBeVisible();
  await page.goto('/#/plany/szablony');
  await page.getByRole('button', { name: /Plan 4-dniowy/ }).click();
  await page.getByRole('button', { name: 'Dodaj ten plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Plan 4-dniowy/ })).toBeVisible();

  await page.getByRole('link', { name: 'Wróć do planów' }).click();
  const old = page.getByRole('link', { name: 'Stary plan' });
  await expect(old).toBeVisible();
  await expect(old.getByText('Aktywny')).toBeVisible();
  const added = page.getByRole('link', { name: /Plan 4-dniowy/ });
  await expect(added).toBeVisible();
  await expect(added.getByText('Aktywny')).toHaveCount(0);
});
