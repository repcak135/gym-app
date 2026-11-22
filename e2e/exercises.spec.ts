import { test, expect } from '@playwright/test';

const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// ─── Task 2 tests ────────────────────────────────────────────────────────────

test('lista pokazuje bazę 922 ćwiczenia', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  // Seeding can take up to 15 s on first run
  await expect(page.getByText('922 ćwiczenia')).toBeVisible({ timeout: 15_000 });
});

test('wyszukiwanie zawęża listę', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('922 ćwiczenia')).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder('Szukaj ćwiczenia').fill('barbell squat');

  await expect(page.getByRole('link', { name: 'Barbell Squat', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dumbbell Bicep Curl', exact: true })).toHaveCount(0);
  await expect(page.getByText('922 ćwiczenia')).toHaveCount(0);
});

test('filtr Mięśnie i Sprzęt', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('922 ćwiczenia')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Mięśnie' }).click();
  const muscleSheet = page.getByRole('dialog', { name: 'Mięśnie' });
  await expect(muscleSheet).toBeVisible();
  await muscleSheet.getByRole('option', { name: 'Łydki' }).click();
  await expect(muscleSheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Łydki' })).toBeVisible();

  await page.getByRole('button', { name: 'Sprzęt' }).click();
  const equipSheet = page.getByRole('dialog', { name: 'Sprzęt' });
  await equipSheet.getByRole('option', { name: 'Maszyna' }).click();

  const metas = page.locator('.exercise-row__meta');
  await expect(metas.first()).toBeVisible();
  for (const text of await metas.allTextContents()) expect(text).toContain('Maszyna');
  await expect(page.getByRole('link', { name: 'Seated Calf Raise', exact: true })).toBeVisible();

  // "×" clears the muscle filter; the equipment filter stays
  await page.getByRole('button', { name: 'Wyczyść filtr: Mięśnie' }).click();
  await expect(page.getByRole('button', { name: 'Mięśnie' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Leg Press', exact: true })).toBeVisible();
});

test('wiersz ma co najmniej 44 px', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('922 ćwiczenia')).toBeVisible({ timeout: 15_000 });

  const rows = page.locator('.exercise-row');
  const first = rows.first();
  const box = await first.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

// ─── Task 3 tests ────────────────────────────────────────────────────────────

test('karta ćwiczenia: zdjęcia, rady, mięśnie', async ({ page }) => {
  await page.goto('/#/cwiczenia/Barbell_Squat');

  await expect(page.getByRole('heading', { level: 1, name: 'Barbell Squat' })).toBeVisible({ timeout: 15_000 });

  // 2 images with src starting with IMAGE_BASE
  const imgs = page.locator(`img[src^="${IMAGE_BASE}"]`);
  await expect(imgs).toHaveCount(2, { timeout: 10_000 });

  // "Rady" section heading
  await expect(page.getByText('Rady', { exact: false })).toBeVisible();

  // "Czworogłowe ud" chip
  await expect(page.getByText('Czworogłowe ud')).toBeVisible();

  // Both photos are switchable; instructions are in Polish
  await page.getByRole('button', { name: 'Zdjęcie 2' }).click();
  await expect(page.getByRole('img', { name: 'Zdjęcie 2' })).toBeVisible();
  await expect(page.getByText(/To twoja pozycja wyjściowa/).first()).toBeVisible();
  await expect(page.getByText(/This will be your starting position/)).toHaveCount(0);
});

test('notatka zapisuje się i przetrwa przeładowanie', async ({ page }) => {
  await page.goto('/#/cwiczenia/Barbell_Squat');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });

  const textarea = page.getByRole('textbox', { name: 'Notatka' });
  await textarea.click();
  await textarea.fill('Ławka na 30°');

  // Wait for "Zapisano" to appear (debounce fires within 1 s)
  await expect(page.getByText('Zapisano')).toBeVisible({ timeout: 3_000 });

  // Reload and check the text survives
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('textbox', { name: 'Notatka' })).toHaveValue('Ławka na 30°');
});

test('własne ćwiczenie: utwórz, edytuj, usuń', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('922 ćwiczenia')).toBeVisible({ timeout: 15_000 });

  // Open form via "+" link
  await page.getByRole('link', { name: 'Nowe ćwiczenie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nowe ćwiczenie' })).toBeVisible();

  // Try saving with empty name → validation error
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('alert')).toContainText('Podaj nazwę');

  // Fill name
  await page.getByLabel('Nazwa').fill('Wiosło Krzywe');

  // Select primary muscle "Środek pleców"
  await page.getByRole('button', { name: 'Środek pleców', exact: true }).first().click();

  // Select equipment "Sztanga"
  await page.getByRole('button', { name: 'Sztanga', exact: true }).click();

  // Save
  await page.getByRole('button', { name: 'Zapisz' }).click();

  // Should land on the detail page
  await expect(page.getByRole('heading', { level: 1, name: 'Wiosło Krzywe' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('Własne')).toBeVisible();

  // Edit
  await page.getByRole('link', { name: 'Edytuj' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edytuj ćwiczenie' })).toBeVisible();
  const nameInput = page.getByLabel('Nazwa');
  await nameInput.fill('Wiosło krzywą sztangą');
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Wiosło krzywą sztangą' })).toBeVisible({ timeout: 5_000 });

  // Delete
  await page.getByRole('button', { name: 'Usuń' }).click();

  // Confirm sheet should appear
  const confirmDialog = page.getByRole('dialog', { name: 'Usunąć ćwiczenie?' });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Usuń' }).click();

  // Back on list
  await expect(page).toHaveURL(/#\/cwiczenia$/);

  // Search confirms it's gone
  await expect(page.getByText('922 ćwiczenia')).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('Wiosło krzywą sztangą');
  // Result count should be 0 ćwiczeń
  await expect(page.getByText('0 ćwiczeń')).toBeVisible({ timeout: 5_000 });
});
