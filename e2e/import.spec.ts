import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/sample-export.csv', import.meta.url));

test('import CSV: dopasowanie, import, historia, rekordy, bez duplikatów przy ponownym imporcie', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await page.getByRole('link', { name: 'Importuj historię' }).click();
  await expect(page).toHaveURL(/#\/ustawienia\/import$/);
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);

  await expect(page.getByRole('heading', { name: 'Dopasuj ćwiczenia' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('3 treningi do dodania (12 serii)');
  await expect(page.getByRole('status')).toContainText('Pominięte błędne wiersze: 1');

  // other names of built-in exercises match exactly
  await expect(page.getByText(/pasuj[ąe] dokładnie do bazy/)).toBeVisible();

  // a name without a good suggestion defaults to a new custom exercise; change it through the picker
  const wioslo = page.getByRole('listitem', { name: 'Wiosło Krzywe' });
  await expect(wioslo).toContainText('Nowe własne ćwiczenie');
  await wioslo.getByRole('button', { name: 'Zmień' }).click();
  const picker = page.getByRole('dialog', { name: 'Wybierz ćwiczenie' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('bent over barbell row');
  await picker.getByRole('button', { name: 'Bent Over Barbell Row', exact: true }).click({ timeout: 15_000 });
  await expect(wioslo).toContainText('→ Bent Over Barbell Row');

  await page.getByRole('button', { name: 'Importuj 3 treningi' }).click();
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi (12 serii)');

  // history: March 2026 has the three imported workouts
  await page.getByRole('link', { name: 'Pokaż historię' }).click();
  for (let i = 0; i < 24; i++) {
    if (await page.getByRole('heading', { name: 'marzec 2026' }).isVisible()) break;
    await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  }
  const list = page.getByRole('list', { name: 'Treningi' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list).toContainText('Pull A');
  await expect(list).toContainText('Import');

  // records on the exercise card
  await list.getByRole('link', { name: /Pull A/ }).click();
  await page.getByRole('link', { name: 'Wide-Grip Lat Pulldown' }).click();
  const records = page.getByRole('region', { name: 'Rekordy' });
  await expect(records).toContainText('55 kg × 8');

  // the same file again adds nothing
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await expect(page.getByRole('status')).toContainText('Wszystkie treningi z tego pliku są już zaimportowane');
  await expect(page.getByRole('status')).toContainText('Już zaimportowane: 3');
});

test('import: plik w złym formacie pokazuje komunikat', async ({ page }) => {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  await expect(page.getByRole('alert')).toContainText('To nie wygląda na eksport z aplikacji');
});
