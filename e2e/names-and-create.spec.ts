import { test, expect, type Page } from '@playwright/test';

const BENCH = 'Barbell Bench Press - Medium Grip';

async function pickExercise(page: Page, query: string, name: string) {
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill(query);
  await picker.getByRole('button', { name, exact: true }).click({ timeout: 15_000 });
}

test('slang: "allah" znajduje Cable Crunch i pokazuje dopasowaną nazwę', async ({ page }) => {
  await page.goto('/#/cwiczenia');
  await page.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('allah');
  const list = page.getByRole('region', { name: 'Lista ćwiczeń' });
  const first = list.getByRole('link').filter({ hasText: 'Cable Crunch' }).first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await expect(first).toContainText('„Allah');
});

test('inne nazwy: dodana na karcie działa w wyszukiwarce, można ją usunąć', async ({ page }) => {
  await page.goto('/#/cwiczenia/Hammer_Curls');
  const section = page.getByRole('region', { name: 'Inne nazwy' });
  await expect(section).toContainText('Młotki'); // built-in slang
  await section.getByRole('textbox', { name: 'Nowa inna nazwa' }).fill('Kopytka');
  await section.getByRole('button', { name: 'Dodaj' }).click();
  await expect(section.getByRole('button', { name: 'Usuń nazwę Kopytka' })).toBeVisible();

  await page.goto('/#/cwiczenia?q=kopytka');
  await expect(page.getByRole('link', { name: 'Hammer Curls' })).toContainText('„Kopytka”', { timeout: 15_000 });

  await page.goto('/#/cwiczenia/Hammer_Curls');
  await page.getByRole('button', { name: 'Usuń nazwę Kopytka' }).click();
  await expect(page.getByRole('button', { name: 'Usuń nazwę Kopytka' })).toHaveCount(0);
});

test('trening: utwórz własne ćwiczenie z wyszukiwarki — od razu w treningu', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('Wiosło Bartka');
  await picker.getByRole('button', { name: /Utwórz własne ćwiczenie/ }).click();

  const form = page.getByRole('dialog', { name: 'Nowe ćwiczenie' });
  await expect(form.getByLabel('Nazwa')).toHaveValue('Wiosło Bartka');
  await form.getByRole('group', { name: 'Mięśnie główne' }).getByRole('button', { name: 'Najszersze' }).click();
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(form).toHaveCount(0);

  await expect(picker.getByRole('button', { name: 'Gotowe (1)' })).toBeVisible();
  await picker.getByRole('button', { name: 'Gotowe (1)' }).click();
  await expect(page.getByRole('region', { name: 'Wiosło Bartka' })).toBeVisible();
});

test('edytor serii otwiera się pod dotkniętą serią', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await pickExercise(page, 'barbell bench press', BENCH);
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();
  const panel = page.getByRole('region', { name: BENCH });
  const items = panel.getByRole('list', { name: 'Serie' }).getByRole('listitem');
  // the empty workout starts with one set; add two more
  while ((await items.count()) < 3) await panel.getByRole('button', { name: '+ Seria' }).click();
  await expect(items).toHaveCount(3);

  // default: the first undone set (1) is open, under its row
  await expect(items.nth(0).getByRole('button', { name: 'Zalicz serię' })).toBeVisible();
  await items.nth(2).getByRole('button', { name: /^Seria 3/ }).click();
  await expect(items.nth(2).getByRole('button', { name: 'Zalicz serię' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Zalicz serię' })).toHaveCount(1);
  await items.nth(0).getByRole('button', { name: /^Seria 1/ }).click();
  await expect(items.nth(0).getByRole('button', { name: 'Zalicz serię' })).toBeVisible();
  await expect(items.nth(2).getByRole('button', { name: 'Zalicz serię' })).toHaveCount(0);
});
