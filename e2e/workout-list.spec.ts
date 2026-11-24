import { test, expect, type Page } from '@playwright/test';

const BENCH = 'Barbell Bench Press - Medium Grip';
const SQUAT = 'Barbell Squat';

const panel = (page: Page, name: string) => page.getByRole('region', { name });

async function pickExercise(page: Page, query: string, name: string) {
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill(query);
  await picker.getByRole('button', { name, exact: true }).click({ timeout: 15_000 });
}

/** Empty workout with bench + squat (default 3 sets each). */
async function workoutWithTwo(page: Page) {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'barbell bench press', BENCH);
  await pickExercise(page, 'squat', SQUAT);
  await page.getByRole('button', { name: 'Gotowe (2)' }).click();
  await expect(panel(page, BENCH)).toBeVisible();
}

async function completeAll(page: Page, name: string) {
  for (let i = 0; i < 3; i++) await panel(page, name).getByRole('button', { name: 'Zalicz serię' }).click();
}

test('lista ćwiczeń: postęp, odznaka "zrobione", otwieranie ćwiczenia z listy', async ({ page }) => {
  // stay on the exercise so only the list moves us
  await page.goto('/#/ustawienia');
  await page.getByRole('radio', { name: 'Zostań na ćwiczeniu' }).click();
  await expect(page.getByRole('radio', { name: 'Zostań na ćwiczeniu' })).toBeChecked();
  await workoutWithTwo(page);

  await completeAll(page, BENCH);
  await page.getByRole('button', { name: 'Lista ćwiczeń' }).click();
  const list = page.getByRole('list', { name: 'Lista ćwiczeń' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const benchRow = list.getByRole('listitem').filter({ hasText: BENCH });
  const squatRow = list.getByRole('listitem').filter({ hasText: SQUAT });
  await expect(benchRow).toContainText('3/3 serie');
  await expect(benchRow.getByRole('img', { name: 'Zrobione' })).toBeVisible();
  await expect(squatRow).toContainText('0/3 serie');
  await expect(squatRow.getByRole('img', { name: 'Zrobione' })).toHaveCount(0);
  // header, timer and rest bar stay visible
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();
  await expect(page.getByLabel('Czas treningu')).toBeVisible();

  await squatRow.locator('.wl-row').click();
  await expect(list).toHaveCount(0);
  await expect(panel(page, SQUAT)).toBeVisible();
  await expect(page.getByRole('button', { name: `Ćwiczenie 2: ${SQUAT}` })).toHaveAttribute('aria-current', 'step');
});

test('po ostatniej serii (domyślnie) trening przechodzi do następnego ćwiczenia', async ({ page }) => {
  await workoutWithTwo(page);
  await completeAll(page, BENCH);
  await expect(page.getByRole('button', { name: `Ćwiczenie 2: ${SQUAT}` })).toHaveAttribute('aria-current', 'step', { timeout: 5000 });
  await expect(page.getByRole('timer', { name: 'Przerwa' })).toBeVisible();
});

test('ustawienie "Pokaż listę ćwiczeń": po ostatniej serii lista; po wszystkim przycisk Zakończ trening', async ({ page }) => {
  await page.goto('/#/ustawienia');
  await page.getByRole('radio', { name: 'Pokaż listę ćwiczeń' }).click();
  await expect(page.getByRole('radio', { name: 'Pokaż listę ćwiczeń' })).toBeChecked();
  await workoutWithTwo(page);
  await completeAll(page, BENCH);
  const list = page.getByRole('list', { name: 'Lista ćwiczeń' });
  await expect(list).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Zakończ trening' })).toHaveCount(0);

  await list.getByRole('listitem').filter({ hasText: SQUAT }).locator('.wl-row').click();
  await completeAll(page, SQUAT);
  await expect(list).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page).toHaveURL(/#\/trening\/podsumowanie\//);
});

test('kolejność: menu "Przesuń niżej" przesuwa pierwsze ćwiczenie na drugie miejsce', async ({ page }) => {
  await workoutWithTwo(page);
  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await expect(page.getByRole('button', { name: `Przesuń wyżej: ${BENCH}` })).toHaveCount(0);
  await page.getByRole('button', { name: `Przesuń niżej: ${BENCH}` }).click();
  // the pager keeps showing the moved exercise, now second
  await expect(page.getByRole('button', { name: `Ćwiczenie 2: ${BENCH}` })).toHaveAttribute('aria-current', 'step');
  await expect(panel(page, BENCH)).toBeVisible();
  await page.getByRole('button', { name: 'Lista ćwiczeń' }).click();
  const rows = page.getByRole('list', { name: 'Lista ćwiczeń' }).getByRole('listitem');
  await expect(rows.nth(0)).toContainText(SQUAT);
  await expect(rows.nth(1)).toContainText(BENCH);
});

test('kolejność: przeciągnięcie uchwytu ostatniego wiersza na górę', async ({ page }) => {
  await workoutWithTwo(page);
  await page.getByRole('button', { name: 'Lista ćwiczeń' }).click();
  const rows = page.getByRole('list', { name: 'Lista ćwiczeń' }).getByRole('listitem');
  await expect(rows.nth(0)).toContainText(BENCH);
  const handle = rows.nth(1).getByRole('button', { name: 'Przeciągnij, aby zmienić kolejność' });
  const h = (await handle.boundingBox())!;
  const top = (await rows.nth(0).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - 20, { steps: 4 });
  await page.mouse.move(h.x + h.width / 2, top.y + 4, { steps: 8 });
  await page.mouse.up();
  await expect(rows.nth(0)).toContainText(SQUAT);
  await expect(rows.nth(1)).toContainText(BENCH);
});
