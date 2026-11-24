import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/sample-export.csv', import.meta.url));
const BENCH = 'Barbell Bench Press - Medium Grip';

async function emptyWorkout(page: Page, weight: string, reps: string) {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await expect(page).toHaveURL(/#\/trening$/);
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell bench press');
  await picker.getByRole('button', { name: BENCH, exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  const bench = page.getByRole('region', { name: BENCH });
  await bench.getByLabel('Ciężar').fill(weight);
  await bench.getByLabel('Powtórzenia').fill(reps);
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page).toHaveURL(/#\/trening\/podsumowanie\//);
}

test('motywacja: cel tygodnia, tydzień mięśni, odznaki, rekordy, kalendarz roczny (import)', async ({ page }) => {
  await page.goto('/#/ustawienia/import');
  await page.getByLabel('Plik CSV').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Importuj 3 treningi' }).click({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText('Zaimportowano 3 treningi');

  // Start: goal card with the default goal 3; the March import is not this week
  await page.goto('/#/');
  const card = page.getByRole('region', { name: 'Cel tygodnia' });
  await expect(card).toContainText('0/3 w tym tygodniu');
  await expect(card).toContainText('Jeszcze 3 do celu');

  // goal 1 in Ustawienia → the card follows
  await card.getByRole('link', { name: 'Zmień cel' }).click();
  await page.getByLabel('Cel: treningi w tygodniu').selectOption('1');
  await page.goto('/#/');
  await expect(card).toContainText('0/1 w tym tygodniu');

  // Statystyki › Mięśnie (this / last week)
  await page.goto('/#/statystyki');
  await page.getByRole('tab', { name: 'Mięśnie' }).click();
  await expect(page.getByRole('list', { name: 'Serie na mięsień w tygodniu' }).getByRole('listitem')).toHaveCount(10);
  await expect(page.getByText(/pomocniczy połową/)).toBeVisible();
  await expect(page.getByLabel('Klatka: 0 serii, za mało')).toBeVisible();
  await page.getByRole('tab', { name: 'Poprzedni' }).click();
  await expect(page.getByRole('tab', { name: 'Poprzedni' })).toHaveAttribute('aria-selected', 'true');

  // Rekordy i odznaki
  await page.getByRole('tab', { name: 'Treningi' }).click();
  await page.getByRole('link', { name: 'Rekordy i odznaki' }).click();
  await expect(page).toHaveURL(/#\/statystyki\/rekordy$/);
  const badges = page.getByRole('list', { name: 'Odznaki' });
  await expect(badges.getByRole('listitem', { name: 'Pierwszy trening, zdobyta' })).toContainText('zdobyta 02.03.2026');
  await expect(badges.getByRole('listitem', { name: '10 treningów, zablokowana' })).toContainText('3/10');
  await page.getByRole('tab', { name: 'Rekordy' }).click();
  const bests = page.getByRole('list', { name: 'Rekordy ćwiczeń' });
  await expect(bests).toContainText('Wide-Grip Lat Pulldown');
  await expect(bests).toContainText('Najcięższa: 55 kg × 8');

  // yearly calendar: back to 2026 if needed, tap 2 March → that workout
  await page.goto('/#/statystyki');
  const cal = page.getByRole('group', { name: /^Aktywność \d{4}$/ });
  await expect(cal).toBeVisible();
  for (let i = 0; i < 3 && !(await page.getByRole('group', { name: 'Aktywność 2026' }).isVisible()); i++) {
    await cal.getByRole('button', { name: 'Poprzedni rok' }).click();
  }
  const y2026 = page.getByRole('group', { name: 'Aktywność 2026' });
  await expect(y2026).toContainText('3 dni treningowe');
  await expect(y2026.getByRole('button', { name: 'Poprzedni rok' })).toBeDisabled();
  await y2026.getByRole('button', { name: /^2 marca 2026: \d+ seri/ }).click();
  await expect(page).toHaveURL(/#\/historia\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: 'Push A' })).toBeVisible();
});

test('motywacja: odznaka w podsumowaniu, dwa treningi jednego dnia w kalendarzu', async ({ page }) => {
  await emptyWorkout(page, '100', '5');
  const fresh = page.getByRole('region', { name: 'Nowa odznaka' });
  await expect(fresh).toContainText('Nowe odznaki!');
  await expect(fresh).toContainText('Pierwszy trening');
  await expect(fresh).toContainText('Pierwsze 100 kg');

  await page.goto('/#/');
  await expect(page.getByRole('region', { name: 'Cel tygodnia' })).toContainText('1/3 w tym tygodniu');

  // a second workout the same day earns nothing new
  await emptyWorkout(page, '60', '8');
  await expect(page.getByText('Trening zakończony')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Nowa odznaka' })).toHaveCount(0);

  // today in the calendar has two workouts → Historia opens on that day
  await page.goto('/#/statystyki');
  await page.getByRole('tab', { name: 'Treningi' }).click();
  const year = new Date().getFullYear();
  const cal = page.getByRole('group', { name: `Aktywność ${year}` });
  await expect(cal).toContainText('1 dzień treningowy');
  await cal.getByRole('button', { name: /: 2 serie$/ }).click();
  await expect(page).toHaveURL(/#\/historia$/);
  await expect(page.getByRole('list', { name: 'Treningi', exact: true }).getByRole('listitem')).toHaveCount(2);
});
