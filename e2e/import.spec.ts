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
  await picker.getByRole('button', { name: 'Wiosłowanie sztangą w opadzie tułowia', exact: true }).click({ timeout: 15_000 });
  await expect(wioslo).toContainText('→ Wiosłowanie sztangą w opadzie tułowia');

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
  await page.getByRole('link', { name: 'Ściąganie drążka szerokim chwytem na wyciągu' }).click();
  const records = page.getByRole('region', { name: 'Rekordy' });
  await expect(records).toContainText('55 kg × 8');

  // the same file again adds nothing
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await expect(page.getByRole('heading', { name: 'Masz już te treningi' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('Wszystkie 3 treningi z tego pliku są już w aplikacji — nic nie zostało zdublowane.');
  await expect(page.getByRole('link', { name: 'Odtwórz plan z historii' })).toHaveAttribute('href', /plan-z-historii/);
  await expect(page.getByRole('link', { name: 'Wróć do ustawień' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wybierz inny plik' })).toBeVisible();
});

async function importFixture(page: import('@playwright/test').Page) {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Importuj 3 treningi' }).click({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi');
}

test('usuwanie zaimportowanej historii wymaga wpisania USUŃ', async ({ page }) => {
  await importFixture(page);
  await page.goto('/#/ustawienia');
  await page.getByRole('button', { name: 'Usuń zaimportowaną historię' }).click();
  const dialog = page.getByRole('dialog', { name: 'Usunąć zaimportowaną historię?' });
  await expect(dialog).toContainText('3 treningi, 12 serii');
  await expect(dialog.getByRole('link', { name: 'Najpierw zrób kopię zapasową' })).toBeVisible();
  const del = dialog.getByRole('button', { name: 'Usuń', exact: true });
  await expect(del).toBeDisabled();
  const input = dialog.getByLabel('Wpisz USUŃ, aby potwierdzić');
  await input.fill('usu');
  await expect(del).toBeDisabled();
  await input.fill(' usuń ');
  await expect(del).toBeEnabled();
  await del.click();
  await expect(page.getByRole('status')).toContainText('Usunięto zaimportowaną historię: 3 treningi, 12 serii');

  // history has no imported workouts any more
  await page.goto('/#/historia');
  for (let i = 0; i < 24; i++) {
    if (await page.getByRole('heading', { name: 'marzec 2026' }).isVisible()) break;
    await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  }
  await expect(page.getByText('Pull A')).toHaveCount(0);
});

test('usunięcie wszystkich danych zostawia pełną bazę ćwiczeń', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });
  await importFixture(page); // creates a custom exercise too
  await page.goto('/#/ustawienia');
  await page.getByRole('button', { name: 'Usuń wszystkie dane' }).click();
  const dialog = page.getByRole('dialog', { name: 'Usunąć wszystkie dane?' });
  await expect(dialog).toContainText('3 treningi, 12 serii');
  await expect(dialog).toContainText('własne ćwiczenie');
  await dialog.getByLabel('Wpisz USUŃ, aby potwierdzić').fill('USUN');
  await dialog.getByRole('button', { name: 'Usuń', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);

  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });
});

test('import: plik w złym formacie pokazuje komunikat', async ({ page }) => {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  await expect(page.getByRole('alert')).toContainText('To nie wygląda na eksport z aplikacji');
});
