import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/sample-export.csv', import.meta.url));

test('statystyki: pusty stan, potem dane z importu (kafelki, mięśnie, sylwetka, okresy)', async ({ page }) => {
  await page.goto('/#/statystyki');
  await expect(page.getByRole('heading', { name: 'Statystyki' })).toBeVisible();
  await expect(page.getByText('Brak treningów w tym okresie')).toBeVisible();

  // import the made-up sample (Wiosło Krzywe stays a custom exercise without muscles)
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Importuj 3 treningi' }).click({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi (12 serii)');

  await page.goto('/#/statystyki');
  await page.getByRole('tab', { name: 'Wszystko' }).click();
  await expect(page.getByRole('heading', { name: 'Wszystko' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Treningi' })).toContainText('3');
  await expect(page.getByRole('group', { name: 'Serie robocze' })).toContainText('12');
  await expect(page.getByRole('group', { name: 'Łączny czas' })).toContainText('bez 3 z importu');
  await expect(page.getByRole('group', { name: 'Średni czas' })).toContainText('—');

  const legend = page.getByRole('list', { name: 'Serie na mięsień' });
  await expect(legend).toContainText('Klatka');
  await expect(legend).toContainText('Plecy');
  await expect(page.getByText(/3 serie bez przypisanych mięśni/)).toBeVisible();

  await page.getByRole('tab', { name: 'Pomocnicze' }).click();
  await expect(page.getByRole('tab', { name: 'Pomocnicze' })).toHaveAttribute('aria-selected', 'true');

  // silhouette: tap the chest, then the "long ago" mode
  const chest = page.locator('.bodymap').getByRole('button', { name: 'Klatka', exact: true });
  await chest.locator('polygon').first().click(); // the group's centre falls between the two pecs
  await expect(page.getByText(/^Klatka: \d+ seri/)).toBeVisible();
  await page.getByRole('tab', { name: 'Dawno nietrenowane' }).click();
  await expect(page.getByText('ponad 14 dni / nigdy')).toBeVisible();
  await expect(page.getByText(/^Klatka: \d+ dni temu$/)).toBeVisible();

  await expect(page.getByRole('img', { name: /Treningi w tygodniu/ })).toBeVisible();

  // month view: step back to March 2026
  await page.getByRole('tab', { name: 'Miesiąc' }).click();
  await expect(page.getByRole('button', { name: 'Następny okres' })).toBeDisabled();
  for (let i = 0; i < 36; i++) {
    if (await page.getByRole('heading', { name: 'marzec 2026' }).isVisible()) break;
    await page.getByRole('button', { name: 'Poprzedni okres' }).click();
  }
  await expect(page.getByRole('group', { name: 'Treningi' })).toContainText('3');
  // the first workout's month is the earliest one
  await expect(page.getByRole('button', { name: 'Poprzedni okres' })).toBeDisabled();
});
