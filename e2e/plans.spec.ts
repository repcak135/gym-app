import { test, expect, type Page } from '@playwright/test';

async function createPlan(page: Page, name: string) {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill(name);
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function addDay(page: Page, name: string) {
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy dzień' });
  await sheet.getByLabel('Nazwa').fill(name);
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function pickExercise(page: Page, query: string, name: string) {
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill(query);
  const row = picker.getByRole('button', { name, exact: true });
  await row.click({ timeout: 15_000 });
  await expect(row).toHaveAttribute('aria-pressed', 'true');
}

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj ćwiczenia' })).toBeVisible();
}

/** Plan with one day, left on the day page. */
async function planWithDay(page: Page, planName = 'Plan', dayName = 'Day 1 Upper') {
  await createPlan(page, planName);
  await addDay(page, dayName);
}

test('pusty Start i utworzenie planu', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByText('Brak aktywnego planu')).toBeVisible();
  await page.getByRole('link', { name: 'Utwórz plan' }).click();
  await expect(page).toHaveURL(/#\/plany$/);

  await expect(page.getByText('Nie masz jeszcze planu.')).toBeVisible();

  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill('Mój plan');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Mój plan' })).toBeVisible();
  await expect(page.getByText('Aktywny', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Wróć do planów' }).click();
  await expect(page).toHaveURL(/#\/plany$/);
  const card = page.locator('.plan-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Mój plan');
  await expect(card).toContainText('Aktywny');
  await expect(card).toContainText('0 dni');
});

test('dni: dodaj, zmień nazwę, przesuń, usuń', async ({ page }) => {
  await createPlan(page, 'Plan dni');

  await addDay(page, 'Day 1 Upper');
  await page.getByRole('link', { name: 'Wróć do planu' }).click();
  await addDay(page, 'Day 2 Legs 1');
  await page.getByRole('link', { name: 'Wróć do planu' }).click();

  const dayLinks = page.locator('.day-row__link');
  await expect(dayLinks).toHaveText([/Day 1 Upper/, /Day 2 Legs 1/]);

  await page.getByRole('button', { name: 'Przesuń w dół: Day 1 Upper' }).click();
  await expect(dayLinks).toHaveText([/Day 2 Legs 1/, /Day 1 Upper/]);

  // rename
  await page.getByRole('button', { name: 'Opcje dnia Day 2 Legs 1' }).click();
  await page.getByRole('dialog', { name: 'Opcje dnia' }).getByRole('button', { name: 'Zmień nazwę' }).click();
  const renameSheet = page.getByRole('dialog', { name: 'Zmień nazwę' });
  await renameSheet.getByLabel('Nazwa').fill('Day 2 Legs 2');
  await renameSheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dayLinks).toHaveText([/Day 2 Legs 2/, /Day 1 Upper/]);

  // delete
  await page.getByRole('button', { name: 'Opcje dnia Day 1 Upper' }).click();
  await page.getByRole('dialog', { name: 'Opcje dnia' }).getByRole('button', { name: 'Usuń' }).click();
  const confirm = page.getByRole('dialog', { name: 'Usunąć dzień?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect(dayLinks).toHaveText([/Day 2 Legs 2/]);
});

test('ćwiczenia w dniu: szybkie dodawanie i ustawienia', async ({ page }) => {
  await planWithDay(page);
  await openPicker(page);

  await pickExercise(page, 'barbell bench press', 'Barbell Bench Press - Medium Grip');
  await pickExercise(page, 'squat', 'Barbell Squat');
  await pickExercise(page, 'lat pulldown', 'Wide-Grip Lat Pulldown');

  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj ćwiczenia' })).toHaveCount(0);

  const sections = page.locator('section.item-card');
  await expect(sections).toHaveCount(3);
  await expect(sections.nth(0)).toHaveAccessibleName('Barbell Bench Press - Medium Grip');
  await expect(sections.nth(1)).toHaveAccessibleName('Barbell Squat');
  await expect(sections.nth(2)).toHaveAccessibleName('Wide-Grip Lat Pulldown');
  await expect(page.getByText('3 ćwiczenia')).toBeVisible();

  // defaults
  const item1 = page.getByRole('region', { name: 'Barbell Bench Press - Medium Grip' });
  await expect(item1.locator('output[aria-label="Serie"]')).toHaveText('3');
  await expect(item1.getByLabel('Przerwa')).toHaveValue('120');
  await expect(item1.getByLabel('Przerwa').locator('option:checked')).toHaveText('2:00');

  await item1.getByRole('button', { name: 'Serie: więcej' }).click();
  await expect(item1.locator('output[aria-label="Serie"]')).toHaveText('4');
  await item1.getByRole('button', { name: 'Rozgrzewka: więcej' }).click();
  await expect(item1.locator('output[aria-label="Rozgrzewka"]')).toHaveText('1');

  await item1.getByLabel('Powtórzenia od').fill('10');
  await item1.getByLabel('Powtórzenia do').fill('12');
  await item1.getByLabel('Powtórzenia do').press('Enter');
  await item1.getByLabel('Przerwa').selectOption({ label: '3:00' });
  await expect(item1.getByLabel('Przerwa').locator('option:checked')).toHaveText('3:00');

  // move item 3 up -> becomes 2nd
  await page.getByRole('button', { name: 'Przesuń w górę: Wide-Grip Lat Pulldown' }).click();
  await expect(sections.nth(1)).toHaveAccessibleName('Wide-Grip Lat Pulldown');
  await expect(sections.nth(2)).toHaveAccessibleName('Barbell Squat');

  // remove squat
  await page.getByRole('button', { name: 'Usuń: Barbell Squat' }).click();
  await expect(sections).toHaveCount(2);
  await expect(page.getByText('2 ćwiczenia')).toBeVisible();

  // persistence
  await page.reload();
  await expect(sections).toHaveCount(2, { timeout: 15_000 });
  await expect(sections.nth(0)).toHaveAccessibleName('Barbell Bench Press - Medium Grip');
  await expect(sections.nth(1)).toHaveAccessibleName('Wide-Grip Lat Pulldown');
  const r1 = sections.nth(0);
  await expect(r1.locator('output[aria-label="Serie"]')).toHaveText('4');
  await expect(r1.locator('output[aria-label="Rozgrzewka"]')).toHaveText('1');
  await expect(r1.getByLabel('Powtórzenia od')).toHaveValue('10');
  await expect(r1.getByLabel('Powtórzenia do')).toHaveValue('12');
  await expect(r1.getByLabel('Przerwa').locator('option:checked')).toHaveText('3:00');
});

test('clamp powtórzeń', async ({ page }) => {
  await planWithDay(page);
  await openPicker(page);
  await pickExercise(page, 'barbell squat', 'Barbell Squat');
  await page.getByRole('button', { name: 'Gotowe' }).click();

  const item = page.locator('section.item-card').first();
  await item.getByLabel('Powtórzenia od').fill('12');
  await item.getByLabel('Powtórzenia od').press('Enter');
  await expect(item.getByLabel('Powtórzenia od')).toHaveValue('12');
  await item.getByLabel('Powtórzenia do').fill('8');
  await item.getByLabel('Powtórzenia do').press('Enter');
  await expect(item.getByLabel('Powtórzenia do')).toHaveValue('12');
});

test('Start pokazuje aktywny plan i następny dzień', async ({ page }) => {
  await planWithDay(page, 'Plan startowy', 'Day 1 Upper');
  await openPicker(page);
  await pickExercise(page, 'barbell squat', 'Barbell Squat');
  await pickExercise(page, 'lat pulldown', 'Wide-Grip Lat Pulldown');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.locator('section.item-card')).toHaveCount(2);

  await page.goto('/#/');
  const section = page.getByRole('region', { name: 'Następny trening' });
  await expect(section).toContainText('Plan startowy');
  await expect(section).toContainText('Day 1 Upper');
  await expect(section).toContainText('2 ćwiczenia');
  await expect(section.getByRole('button', { name: 'Rozpocznij trening' })).toBeDisabled();
});

test('kopiuj i usuń plan, aktywny się czyści', async ({ page }) => {
  await createPlan(page, 'A');
  await page.getByRole('link', { name: 'Wróć do planów' }).click();

  await page.getByRole('button', { name: 'Opcje planu A', exact: true }).click();
  await page.getByRole('dialog', { name: 'Opcje planu' }).getByRole('button', { name: 'Kopiuj' }).click();

  const copyCard = page.locator('.plan-card', { hasText: 'A (kopia)' });
  await expect(copyCard).toBeVisible();
  await expect(copyCard).not.toContainText('Aktywny');

  await page.getByRole('button', { name: 'Opcje planu A', exact: true }).click();
  await page.getByRole('dialog', { name: 'Opcje planu' }).getByRole('button', { name: 'Usuń' }).click();
  const confirm = page.getByRole('dialog', { name: 'Usunąć plan?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.locator('.plan-card')).toHaveCount(1);

  await page.goto('/#/');
  await expect(page.getByText('Brak aktywnego planu')).toBeVisible();
});

test('przyciski mają co najmniej 44 px', async ({ page }) => {
  await planWithDay(page);
  await openPicker(page);
  await pickExercise(page, 'barbell squat', 'Barbell Squat');
  await page.getByRole('button', { name: 'Gotowe' }).click();

  const item = page.locator('section.item-card').first();
  await expect(item).toBeVisible();
  const controls = item.locator('button, select');
  const n = await controls.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i);
    const box = await el.boundingBox();
    const label = await el.getAttribute('aria-label');
    expect(box, `control ${label}`).not.toBeNull();
    expect(box!.height, `height of ${label}`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `width of ${label}`).toBeGreaterThanOrEqual(44);
  }
});

test('wybór ćwiczeń: zaznacz/odznacz, Zamknij, bez duplikatów', async ({ page }) => {
  await planWithDay(page);
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });

  // X closes without adding anything
  await openPicker(page);
  await pickExercise(page, 'squat', 'Barbell Squat');
  await picker.getByRole('button', { name: 'Zamknij' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('section.item-card')).toHaveCount(0);

  // toggle: tap twice = unselected; Gotowe shows the count
  await openPicker(page);
  await pickExercise(page, 'squat', 'Barbell Squat');
  await pickExercise(page, 'bench press', 'Barbell Bench Press - Medium Grip');
  await expect(picker.getByRole('button', { name: 'Gotowe (2)' })).toBeVisible();
  const bench = picker.getByRole('button', { name: 'Barbell Bench Press - Medium Grip', exact: true });
  await bench.click();
  await expect(bench).toHaveAttribute('aria-pressed', 'false');
  await picker.getByRole('button', { name: 'Gotowe (1)' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('section.item-card')).toHaveCount(1);

  // already in the day: shown as added and not selectable
  await openPicker(page);
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('squat');
  const squat = picker.getByRole('button', { name: 'Barbell Squat', exact: true });
  await expect(squat).toBeDisabled();
  await expect(squat).toContainText('W dniu');
  await picker.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.locator('section.item-card')).toHaveCount(1);
});

test('wybór ćwiczeń: przyciski widoczne pod paskiem stanu', async ({ page }) => {
  // Simulate the iPhone top inset (standalone, translucent status bar).
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '.picker__bar{padding-top:calc(59px + 8px)!important}';
      document.head.appendChild(s);
    });
  });
  await planWithDay(page);
  await openPicker(page);
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  const close = await picker.getByRole('button', { name: 'Zamknij' }).boundingBox();
  expect(close!.y).toBeGreaterThanOrEqual(59);
  const done = await picker.getByRole('button', { name: 'Gotowe' }).boundingBox();
  const vh = page.viewportSize()!.height;
  expect(done!.y + done!.height).toBeLessThanOrEqual(vh);
  expect(done!.height).toBeGreaterThanOrEqual(44);
});

test('ustawienia: domyślne wartości dla nowych ćwiczeń', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
  await expect(page.getByLabel('Przerwa')).toHaveValue('120');
  await expect(page.getByLabel('Krok ciężaru')).toHaveValue('2.5');
  await expect(page.getByLabel('Waga gryfu')).toHaveValue('20');

  await page.getByLabel('Przerwa').selectOption({ label: '3:00' });
  await page.getByLabel('Serie', { exact: true }).selectOption('4');
  await page.getByLabel('Powtórzenia od').selectOption('6');
  await page.getByLabel('Powtórzenia do').selectOption('10');
  await page.getByLabel('Krok ciężaru').selectOption({ label: '1,25 kg' });
  await expect(page.getByLabel('Krok ciężaru')).toHaveValue('1.25');
  await page.reload();
  await expect(page.getByLabel('Przerwa')).toHaveValue('180');
  await expect(page.getByLabel('Krok ciężaru')).toHaveValue('1.25');

  await page.getByRole('button', { name: 'Wróć' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();

  await planWithDay(page);
  await openPicker(page);
  await pickExercise(page, 'squat', 'Barbell Squat');
  await page.getByRole('button', { name: 'Gotowe' }).click();
  const item = page.getByRole('region', { name: 'Barbell Squat' });
  await expect(item.locator('output[aria-label="Serie"]')).toHaveText('4');
  await expect(item.getByLabel('Przerwa')).toHaveValue('180');
  await expect(item.getByLabel('Powtórzenia od')).toHaveValue('6');
  await expect(item.getByLabel('Powtórzenia do')).toHaveValue('10');
});
