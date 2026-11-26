import { test, expect } from '@playwright/test';

const BENCH = 'Wyciskanie sztangi na ławce płaskiej';

test('Android: notatka o wygaszonym ekranie i przełącznik „Graj w tle”', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await expect(page.getByText(/Android usypia aplikację/)).toBeVisible();
  await expect(page.getByText(/iPhone usypia/)).toHaveCount(0);
  const bg = page.getByRole('switch', { name: 'Graj w tle (eksperymentalne)' });
  await expect(bg).not.toBeChecked();
  await bg.click();
  await expect(bg).toBeChecked();
  await expect(page.getByText(/może zatrzymać muzykę/)).toBeVisible();
  await page.getByRole('radio', { name: 'Tylko wibracja' }).click();
  await expect(bg).toBeDisabled();
});

test('Android, Graj w tle: przerwa startuje plik audio, Pomiń go zatrzymuje', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: number; __pauses: number };
    w.__plays = 0;
    w.__pauses = 0;
    HTMLMediaElement.prototype.play = function () { w.__plays++; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { w.__pauses++; };
  });
  await page.goto('/#/ustawienia');
  await page.getByRole('switch', { name: 'Graj w tle (eksperymentalne)' }).click();
  await expect(page.getByRole('switch', { name: 'Graj w tle (eksperymentalne)' })).toBeChecked();

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell bench press');
  await picker.getByRole('button', { name: BENCH, exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  await page.getByRole('region', { name: BENCH }).getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __plays: number }).__plays)).toBe(1);
  await page.getByRole('timer', { name: 'Przerwa' }).getByRole('button', { name: 'Pomiń' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pauses: number }).__pauses)).toBeGreaterThan(0);
});
