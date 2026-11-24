import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/sample-export.csv', import.meta.url));

test('odtwórz plan z historii: import CSV, wybór dni, nowy plan', async ({ page }) => {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await expect(page.getByRole('heading', { name: 'Dopasuj ćwiczenia' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Importuj 3 treningi' }).click();
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi');

  // the card at the end of the import opens the screen
  await expect(page.getByRole('heading', { name: 'Odtwórz plan z historii?' })).toBeVisible();
  await page.getByRole('link', { name: 'Odtwórz plan z historii' }).click();
  await expect(page).toHaveURL(/#\/ustawienia\/plan-z-historii$/);

  await expect(page.getByRole('heading', { name: 'Plan z historii' })).toBeVisible();
  for (const n of ['Push A', 'Pull A', 'Legs A']) {
    await expect(page.getByRole('checkbox', { name: new RegExp(n) })).toBeVisible();
  }
  // every name occurred once → unchecked by default; check two of them
  await expect(page.getByRole('button', { name: /Utwórz plan/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Push A/ }).check();
  await page.getByRole('checkbox', { name: /Legs A/ }).check();
  await page.getByRole('button', { name: 'Ćwiczenia: Push A' }).click();
  await expect(page.getByText('2 × 8–10')).toBeVisible();

  await page.getByLabel('Nazwa nowego planu').fill('Z historii');
  await page.getByRole('button', { name: 'Utwórz plan (2 dni)' }).click();
  await expect(page.getByRole('status')).toContainText('Plan został utworzony');

  await page.goto('/#/plany');
  await page.getByRole('link', { name: 'Z historii' }).click();
  await expect(page.getByText('Push A')).toBeVisible();
  await expect(page.getByText('Legs A')).toBeVisible();
  await expect(page.getByText('Pull A')).toHaveCount(0);
});

test('odtwórz plan z historii: pusty stan prowadzi do importu', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await page.getByRole('link', { name: 'Odtwórz plan z historii' }).click();
  await expect(page.getByText('Nie masz jeszcze żadnych zakończonych treningów')).toBeVisible();
  await page.getByRole('link', { name: 'Importuj historię' }).click();
  await expect(page).toHaveURL(/#\/ustawienia\/import$/);
});
