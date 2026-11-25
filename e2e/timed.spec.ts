import { test, expect, type Page } from '@playwright/test';

async function pickExercise(page: Page, query: string, name: string) {
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill(query);
  await picker.getByRole('button', { name, exact: true }).click({ timeout: 15_000 });
}

function panel(page: Page, name: string) {
  return page.getByRole('region', { name });
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page).toHaveURL(/#\/trening\/podsumowanie\//);
  await expect(page.getByText('Trening zakończony')).toBeVisible();
}

test('deska z planu: czas, stoper, zaliczenie, podsumowanie', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  await page.getByRole('dialog', { name: 'Nowy plan' }).getByLabel('Nazwa').fill('Plan');
  await page.getByRole('dialog', { name: 'Nowy plan' }).getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  await page.getByRole('dialog', { name: 'Nowy dzień' }).getByLabel('Nazwa').fill('Core');
  await page.getByRole('dialog', { name: 'Nowy dzień' }).getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  await pickExercise(page, 'plank', 'Plank');
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  await expect(page.getByLabel('Cel (s)')).toHaveValue('30');

  await page.goto('/#/');
  await expect(page.locator('.start-list')).toContainText('× 0:30');
  await page.getByRole('button', { name: 'Rozpocznij trening' }).click();
  await expect(page).toHaveURL(/#\/trening$/);

  const plank = panel(page, 'Plank');
  await expect(plank.getByText(/3 × 0:30 · przerwa/)).toBeVisible();
  await expect(plank.getByLabel('Czas', { exact: true })).toHaveValue('0:30');
  await expect(plank.getByRole('button', { name: 'Rozgrzewka' })).toHaveCount(0);

  await plank.getByRole('button', { name: 'Start' }).click();
  await page.waitForTimeout(1500);
  await plank.getByRole('button', { name: 'Stop' }).click();
  await expect(plank.getByLabel('Czas', { exact: true })).toHaveValue(/^0:0[1-9]$/);

  await plank.getByRole('button', { name: 'Więcej czasu' }).click();
  await plank.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(plank.getByRole('button', { name: /Seria 1: .*zaliczona/ })).toBeVisible();

  await finish(page);
  expect(errors).toEqual([]);
});

test('cardio: dystans w km i czas, zapis w historii', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'jogging treadmill', 'Jogging, Treadmill');
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  const run = panel(page, 'Jogging, Treadmill');
  await expect(run.getByText('Dystans (km)')).toBeVisible();
  await run.getByLabel('Dystans', { exact: true }).fill('2,5');
  await run.getByLabel('Czas', { exact: true }).fill('20:00');
  await run.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(run.getByRole('button', { name: /Seria 1: 20:00 · 2,5 km, zaliczona/ })).toBeVisible();

  await finish(page);
  expect(errors).toEqual([]);

  await page.goto('/#/cwiczenia');
  await page.getByRole('searchbox').fill('jogging treadmill');
  await page.getByRole('link', { name: /Jogging, Treadmill/ }).first().click();
  await expect(page.getByRole('region', { name: 'Historia' }).getByText('20:00 · 2,5 km').first()).toBeVisible();
});
