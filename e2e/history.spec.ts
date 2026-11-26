import { test, expect } from '@playwright/test';

const BENCH = 'Wyciskanie sztangi na ławce płaskiej';
const MONTHS = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

test('historia: trening z aplikacji w kalendarzu i na liście, edycja serii, usunięcie', async ({ page }) => {
  // create a finished workout through the UI
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell bench press');
  await picker.getByRole('button', { name: BENCH, exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  const bench = page.getByRole('region', { name: BENCH });
  await bench.getByLabel('Ciężar').fill('40');
  await bench.getByLabel('Powtórzenia').fill('8');
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page.getByText('Trening zakończony')).toBeVisible();
  await page.getByRole('link', { name: 'Gotowe' }).click();

  await page.goto('/#/historia');
  await expect(page.getByRole('button', { name: /trening/ })).toBeVisible();
  const list = page.getByRole('list', { name: 'Treningi' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('1 seria');

  await list.getByRole('link').click();
  await expect(page).toHaveURL(/#\/historia\/.+/);
  await expect(page.getByRole('navigation', { name: 'Główne menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Seria 1: 40 kg × 8' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edytuj serię' });
  await sheet.getByLabel('Powtórzenia').fill('9');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('button', { name: 'Seria 1: 40 kg × 9' })).toContainText('40 kg × 9');

  await page.getByRole('button', { name: 'Usuń trening' }).click();
  await page.getByRole('dialog', { name: 'Usunąć ten trening?' }).getByRole('button', { name: 'Usuń' }).click();
  await expect(page).toHaveURL(/#\/historia$/);
  await expect(page.getByText('Brak treningów w tym miesiącu.')).toBeVisible();
});

test('historia: strzałki zmieniają miesiąc', async ({ page }) => {
  await page.goto('/#/historia');
  const now = new Date();
  await expect(page.getByRole('heading', { name: `${MONTHS[now.getMonth()]} ${now.getFullYear()}` })).toBeVisible();
  await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  await expect(page.getByRole('heading', { name: `${MONTHS[prev.getMonth()]} ${prev.getFullYear()}` })).toBeVisible();
  await page.getByRole('button', { name: 'Następny miesiąc' }).click();
  await expect(page.getByRole('heading', { name: `${MONTHS[now.getMonth()]} ${now.getFullYear()}` })).toBeVisible();
});
