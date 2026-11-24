import { test, expect, type Page } from '@playwright/test';
import LZString from 'lz-string';

function exercisesLink(): string {
  const payload = {
    v: 1,
    t: 'x',
    x: [['Tokarski lateral raises', ['shoulders'], [], 'dumbbell', 'strength']],
  };
  return `/#/cwiczenia/import?d=${LZString.compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

async function createCustom(page: Page, name: string) {
  await page.goto('/#/cwiczenia');
  await expect(page.getByText('4731 ćwiczeń')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Nowe ćwiczenie' }).click();
  await page.getByLabel('Nazwa').fill(name);
  await page.getByRole('button', { name: 'Barki', exact: true }).first().click();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('wybierak ćwiczeń: zakładka Moje pokazuje własne ćwiczenie', async ({ page }) => {
  await createCustom(page, 'Moje boczne');
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill('Plan testowy');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  const day = page.getByRole('dialog', { name: 'Nowy dzień' });
  await day.getByLabel('Nazwa').fill('Push');
  await day.getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();

  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('tab', { name: 'Moje' }).click();
  await expect(picker.getByRole('button', { name: 'Moje boczne', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Barbell Bench Press - Medium Grip', exact: true })).toHaveCount(0);
  await picker.getByRole('tab', { name: 'Używane' }).click();
  await expect(picker.getByText('Tu pojawią się ćwiczenia z Twoich planów i treningów.')).toBeVisible();
});

test('wysłanie własnego ćwiczenia: kod QR i link', async ({ page }) => {
  await createCustom(page, 'Moje boczne');
  await page.getByRole('link', { name: 'Wyślij ćwiczenie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wyślij ćwiczenie' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Kod QR ćwiczeń' })).toBeVisible();
  const link = await page.getByLabel('Link do ćwiczeń').inputValue();
  expect(link).toMatch(/#\/cwiczenia\/import\?d=[A-Za-z0-9+\-$_.]+$/);
  await expect(page.getByText('Plany → Skanuj kod QR')).toBeVisible();

  // "Wyślij wszystkie moje" leads to the same kind of page.
  await page.goto('/#/cwiczenia?t=moje');
  await page.getByRole('link', { name: 'Wyślij wszystkie moje' }).click();
  await expect(page.getByRole('img', { name: 'Kod QR ćwiczeń' })).toBeVisible();

  // The link opens the preview.
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Moje boczne' })).toBeVisible();
});

test('import ćwiczeń z linku: dodaje raz, potem "Masz już"', async ({ page }) => {
  await page.goto(exercisesLink());
  await expect(page.getByRole('heading', { level: 1, name: 'Tokarski lateral raises' })).toBeVisible();
  await expect(page.getByText('Masz już')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  await expect(page.getByRole('status')).toContainText('Dodano: 1');

  await page.goto('/#/cwiczenia?t=moje');
  await expect(page.getByRole('link', { name: 'Tokarski lateral raises' })).toHaveCount(1);

  await page.goto(exercisesLink());
  await expect(page.getByText('Masz już')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wszystko już masz' })).toBeDisabled();

  await page.goto('/#/cwiczenia?t=moje');
  await expect(page.getByRole('link', { name: 'Tokarski lateral raises' })).toHaveCount(1);
});

test('uszkodzony link do ćwiczeń pokazuje błąd', async ({ page }) => {
  const good = exercisesLink();
  await page.goto(good.slice(0, good.length - 15));
  await expect(page.getByRole('alert')).toContainText('Link jest uszkodzony');
});

test('skaner QR bez aparatu: komunikat i wklejanie linku', async ({ page }) => {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Skanuj kod QR' }).click();
  const scan = page.getByRole('dialog', { name: 'Skaner kodów QR' });
  await expect(scan.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await scan.getByRole('button', { name: 'Wklej link' }).click();
  const paste = page.getByRole('dialog', { name: 'Dodaj plan z linku' });
  await paste.getByLabel('Link od znajomego').fill(`https://x.test/app/${exercisesLink()}`);
  await paste.getByRole('button', { name: 'Pokaż plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tokarski lateral raises' })).toBeVisible();
  await expect(scan).toHaveCount(0);
});
