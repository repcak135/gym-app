import { test, expect, type Page } from '@playwright/test';
/** Row link by its Polish name (the accessible name also holds the English line underneath). */
const rowLink = (page: Page, pl: string) =>
  page.getByRole('link').filter({ has: page.getByText(pl, { exact: true }) });


const IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// ─── Task 2 tests ────────────────────────────────────────────────────────────

test('lista pokazuje bazę 4566 ćwiczeń', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  // Seeding can take up to 15 s on first run
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });
});

test('wyszukiwanie zawęża listę', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder('Szukaj ćwiczenia').fill('barbell squat');

  await expect(rowLink(page, 'Przysiad ze sztangą')).toBeVisible();
  await expect(rowLink(page, 'Uginanie ramion z hantlami')).toHaveCount(0);
  await expect(page.getByText('4566 ćwiczeń')).toHaveCount(0);
});

test('filtr Mięśnie i Sprzęt', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });

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
  // the list re-renders after the sheet closes; wait until every row reflects the filter
  await expect
    .poll(async () => (await metas.allTextContents()).every((t) => t.includes('Maszyna')))
    .toBe(true);
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('seated calf raise');
  await expect(rowLink(page, 'Wspięcia na palce w siadzie na maszynie')).toBeVisible();

  // "×" clears the muscle filter; the equipment filter stays
  await page.getByRole('button', { name: 'Wyczyść filtr: Mięśnie' }).click();
  await expect(page.getByRole('button', { name: 'Mięśnie' })).toBeVisible();
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('leg press');
  await expect(rowLink(page, 'Wypychanie nóg na suwnicy')).toBeVisible();
});

test('szukanie po polsku: angielska nazwa pod polską', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText(/\d+ ćwicze/)).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('wyciskanie sztangi na lawce plaskiej');
  const row = rowLink(page, 'Wyciskanie sztangi na ławce płaskiej');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Barbell Bench Press - Medium Grip');
});

test('wiersz ma co najmniej 44 px', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });

  const rows = page.locator('.exercise-row');
  const first = rows.first();
  const box = await first.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

// ─── Task 3 tests ────────────────────────────────────────────────────────────

test('karta ćwiczenia: zdjęcia, rady, mięśnie', async ({ page }) => {
  await page.goto('/#/cwiczenia/Barbell_Squat');

  await expect(page.getByRole('heading', { level: 1, name: 'Przysiad ze sztangą' })).toBeVisible({ timeout: 15_000 });

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
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });

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
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('Wiosło krzywą sztangą');
  // Result count should be 0 ćwiczeń
  await expect(page.getByText('0 ćwiczeń')).toBeVisible({ timeout: 5_000 });
});

test('zakładki Moje i Używane pokazują własne i używane ćwiczenia', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });
  const tabs = page.getByRole('tablist', { name: 'Które ćwiczenia' });

  await tabs.getByRole('tab', { name: 'Moje' }).click();
  await expect(page.getByText('Nie masz jeszcze własnych ćwiczeń')).toBeVisible();
  await tabs.getByRole('tab', { name: 'Używane' }).click();
  await expect(page.getByText('Tu pojawią się ćwiczenia z Twoich planów')).toBeVisible();

  // create a custom exercise
  await tabs.getByRole('tab', { name: 'Wszystkie' }).click();
  await page.getByRole('link', { name: 'Nowe ćwiczenie' }).click();
  await page.getByLabel('Nazwa').fill('Tokarski lateral raises');
  await page.getByRole('button', { name: 'Barki', exact: true }).first().click();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tokarski lateral raises' })).toBeVisible();

  await page.goto('/#/cwiczenia?t=moje');
  await expect(page.getByText('1 ćwiczenie')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tokarski lateral raises' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Moje' })).toHaveAttribute('aria-selected', 'true');
});

test('powrót z karty ćwiczenia: ta sama wyszukiwarka, wczytane wiersze i miejsce na liście', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder('Szukaj ćwiczenia').fill('press');
  const more = page.getByRole('button', { name: /^Pokaż więcej/ });
  await more.click();
  const moreText = await more.textContent();

  const rows = page.locator('a[href^="#/cwiczenia/"]:not([href$="/nowe"])');
  await expect(rows.nth(110)).toBeAttached(); // second page loaded
  const href = (await rows.nth(100).getAttribute('href'))!;
  const target = page.locator(`a[href="${href}"]`);
  await target.scrollIntoViewIfNeeded();
  const yBefore = await page.evaluate(() => window.scrollY);
  expect(yBefore).toBeGreaterThan(1000);
  await target.click();
  await expect(page).toHaveURL((u) => decodeURIComponent(u.hash) === decodeURIComponent(href));

  await page.getByRole('link', { name: 'Wróć do listy ćwiczeń' }).click();
  await expect(page.getByPlaceholder('Szukaj ćwiczenia')).toHaveValue('press');
  await expect(more).toHaveText(moreText!);
  await expect(page.locator(`a[href="${href}"]`)).toBeInViewport();
  const yAfter = await page.evaluate(() => window.scrollY);
  expect(Math.abs(yAfter - yBefore)).toBeLessThan(50);
});

test('karta ćwiczenia: rodzaj ćwiczenia (deska = czas) i zmiana wyboru', async ({ page }) => {
  await page.goto('/#/cwiczenia/Plank');
  const select = page.getByLabel('Rodzaj ćwiczenia');
  await expect(select).toHaveValue('time', { timeout: 15_000 });
  await select.selectOption('reps');
  await expect(select).toHaveValue('reps');
  await page.waitForTimeout(300); // let the write finish before reloading
  await page.reload();
  await expect(page.getByLabel('Rodzaj ćwiczenia')).toHaveValue('reps');
  await page.getByLabel('Rodzaj ćwiczenia').selectOption('time'); // back to the default clears the override
  await expect(page.getByLabel('Rodzaj ćwiczenia')).toHaveValue('time');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByLabel('Rodzaj ćwiczenia')).toHaveValue('time');
});

test('filtr Mięśnie → Barki → tył: Face Pull tak, boczne unoszenie nie', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4566 ćwiczeń')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Mięśnie' }).click();
  const sheet = page.getByRole('dialog', { name: 'Mięśnie' });
  await expect(sheet.getByRole('option', { name: 'Barki', exact: true })).toBeVisible();
  await sheet.getByRole('option', { name: 'tył', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Barki — tył' })).toBeVisible();

  const search = page.getByPlaceholder('Szukaj ćwiczenia');
  await search.fill('face pull');
  await expect(rowLink(page, 'Face pull')).toBeVisible();
  await search.fill('side lateral raise');
  await expect(rowLink(page, 'Unoszenie hantli bokiem')).toHaveCount(0);

  // plain Barki still finds the side raise
  await page.getByRole('button', { name: 'Wyczyść filtr: Mięśnie' }).click();
  await page.getByRole('button', { name: 'Mięśnie' }).click();
  await page.getByRole('dialog', { name: 'Mięśnie' }).getByRole('option', { name: 'Barki', exact: true }).click();
  await expect(rowLink(page, 'Unoszenie hantli bokiem')).toBeVisible();
});
