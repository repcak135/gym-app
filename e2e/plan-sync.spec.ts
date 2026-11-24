import { test, expect, type Page } from '@playwright/test';

const BENCH = 'Barbell Bench Press - Medium Grip';
const SQUAT = 'Barbell Squat';

async function pickExercise(page: Page, dialogName: string, query: string, name: string) {
  const picker = page.getByRole('dialog', { name: dialogName });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill(query);
  await picker.getByRole('button', { name, exact: true }).click({ timeout: 15_000 });
}

/** Plan "Plan" with day "Day 1 Upper" holding the squat (defaults 3 sets), left on the plan page. */
async function planWithSquatDay(page: Page) {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  await page.getByRole('dialog', { name: 'Nowy plan' }).getByLabel('Nazwa').fill('Plan');
  await page.getByRole('dialog', { name: 'Nowy plan' }).getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  await page.getByRole('dialog', { name: 'Nowy dzień' }).getByLabel('Nazwa').fill('Day 1 Upper');
  await page.getByRole('dialog', { name: 'Nowy dzień' }).getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'squat', SQUAT);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  await expect(page.locator('section.item-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Wróć do planu' }).click();
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Zakończ' }).click();
  await page.getByRole('dialog', { name: 'Zakończyć trening?' }).getByRole('button', { name: 'Zakończ trening' }).click();
  await expect(page).toHaveURL(/#\/trening\/podsumowanie\//);
}

test('trening z planu: zmiana liczby serii trafia do planu', async ({ page }) => {
  await planWithSquatDay(page);

  await page.getByRole('button', { name: 'Rozpocznij trening: Day 1 Upper' }).click();
  await expect(page).toHaveURL(/#\/trening$/);

  const squat = page.getByRole('region', { name: SQUAT });
  await expect(squat.getByRole('list', { name: 'Serie' }).getByRole('listitem')).toHaveCount(3);

  for (let i = 1; i <= 4; i++) {
    if (i === 4) {
      // all planned sets done: add a fourth one
      await squat.getByRole('button', { name: '+ Seria' }).click();
      await expect(squat.getByRole('list', { name: 'Serie' }).getByRole('listitem')).toHaveCount(4);
      await squat.getByRole('button', { name: /^Seria 4:/ }).click();
    }
    await squat.getByLabel('Ciężar').fill('50');
    await squat.getByRole('button', { name: 'Zalicz serię' }).click();
    await expect(squat.getByRole('button', { name: new RegExp(`^Seria ${i}: .*zaliczona`) })).toBeVisible();
    const skip = page.getByRole('timer', { name: 'Przerwa' }).getByRole('button', { name: 'Pomiń' });
    if (await skip.isVisible()) await skip.click();
  }
  await finish(page);

  const sync = page.getByRole('region', { name: 'Zmiany względem planu' });
  await expect(sync).toContainText(`Serie: ${SQUAT} 3 → 4`);
  await sync.getByRole('button', { name: 'Zapisz w planie' }).click();
  await expect(page.getByText('Plan zaktualizowany ✓')).toBeVisible();
  await expect(sync).toHaveCount(0);

  await page.goto('/#/plany');
  await page.getByRole('link', { name: 'Plan', exact: true }).first().click();
  await page.getByRole('link', { name: 'Day 1 Upper' }).click();
  await expect(page.getByRole('region', { name: SQUAT }).locator('output[aria-label="Serie"]')).toHaveText('4');
});

test('pusty trening można zapisać jako dzień nowego planu', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'Dodaj ćwiczenia', 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  const bench = page.getByRole('region', { name: BENCH });
  await bench.getByLabel('Ciężar').fill('60');
  await bench.getByRole('button', { name: 'Zalicz serię' }).click();
  await expect(bench.getByRole('button', { name: /^Seria 1: .*zaliczona/ })).toBeVisible();
  await finish(page);

  await expect(page.getByRole('region', { name: 'Zmiany względem planu' })).toHaveCount(0);
  await page.getByRole('region', { name: 'Zapisz jako dzień planu' }).getByRole('button', { name: 'Zapisz jako dzień planu' }).click();
  const sheet = page.getByRole('dialog', { name: 'Zapisz jako dzień planu' });
  await expect(sheet.getByLabel('Nazwa dnia')).toHaveValue('Trening');
  await sheet.getByLabel('Nazwa dnia').fill('Push');
  await expect(sheet.getByLabel('Nazwa nowego planu')).toHaveValue('Mój plan');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByText('Zapisano w planie „Mój plan” ✓')).toBeVisible();
  await page.getByRole('link', { name: 'Zobacz plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mój plan' })).toBeVisible();
  await expect(page.locator('.day-row__link', { hasText: 'Push' })).toContainText('1 ćwiczenie');
});
