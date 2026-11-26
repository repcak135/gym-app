import { test, expect } from '@playwright/test';

const BENCH = 'Wyciskanie sztangi na ławce płaskiej';

test('kalkulator talerzy w treningu: wynik, najbliższe ciężary, użycie', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell bench press');
  await picker.getByRole('button', { name: BENCH, exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  const bench = page.getByRole('region', { name: BENCH });
  await bench.getByRole('button', { name: 'Seria 1', exact: false }).first().click();
  await bench.getByRole('button', { name: 'Kalkulator talerzy' }).click();

  const dialog = page.getByRole('dialog', { name: 'Kalkulator talerzy' });
  await dialog.getByLabel('Ciężar docelowy').fill('100');
  await expect(dialog).toContainText('25');
  await expect(dialog.getByRole('list', { name: 'Talerze' })).toHaveText(/25\s*15/);
  await expect(dialog.getByLabel('Sztanga')).toBeVisible();

  await dialog.getByLabel('Ciężar docelowy').fill('101');
  await expect(dialog).toContainText('Nie da się dokładnie');
  await dialog.getByRole('button', { name: '102,5 kg' }).click();
  await dialog.getByRole('button', { name: 'Użyj 102,5 kg' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(bench.getByRole('button', { name: /^Seria 1: 102,5 kg/ })).toBeVisible();
});
