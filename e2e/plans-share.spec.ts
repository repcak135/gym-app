import { test, expect } from '@playwright/test';
import LZString from 'lz-string';

// A plan as a friend's phone would encode it: one built-in exercise, one custom one,
// and one built-in id this phone does not know (other app version).
function friendLink(): string {
  const payload = {
    v: 1,
    n: 'Plan od Kuby',
    d: [
      ['Push', [[0, 4, 1, 6, 8, 150], [1, 3, 0, 10, 12, 90]]],
      ['Pull', [[2, 3, 0, 8, 10, 120]]],
    ],
    e: [
      ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell Bench Press - Medium Grip'],
      ['custom-kuba-1', 'Tokarski lateral raises', ['shoulders'], [], 'dumbbell'],
      ['zz-not-here', 'Mystery Row Machine'],
    ],
  };
  return `/#/plan?d=${LZString.compressToEncodedURIComponent(JSON.stringify(payload))}`;
}

test('wysłanie planu: kod QR i link', async ({ page }) => {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill('Mój PPL');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  const day = page.getByRole('dialog', { name: 'Nowy dzień' });
  await day.getByLabel('Nazwa').fill('Push');
  await day.getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell bench press');
  await picker.getByRole('button', { name: 'Wyciskanie sztangi na ławce płaskiej', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj ćwiczenia' })).toHaveCount(0);

  await page.goto('/#/plany');
  await page.getByRole('link', { name: 'Mój PPL' }).click();
  await page.getByRole('link', { name: 'Wyślij plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wyślij plan' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Kod QR planu' })).toBeVisible();
  const link = await page.getByLabel('Link do planu').inputValue();
  expect(link).toMatch(/#\/plan\?d=[A-Za-z0-9+\-$_.]+$/);

  // The link opens the preview of the same plan.
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1, name: 'Mój PPL' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Push' })).toContainText('Wyciskanie sztangi na ławce płaskiej');
});

test('otwarcie linku od znajomego: podgląd i dodanie jako kopii', async ({ page }) => {
  await page.goto(friendLink());
  await expect(page.getByRole('heading', { level: 1, name: 'Plan od Kuby' })).toBeVisible();
  const push = page.getByRole('region', { name: 'Push' });
  await expect(push).toContainText('4 × 6–8 + 1 rozgrz. · przerwa 2:30');
  await expect(push).toContainText('Tokarski lateral raises');
  await expect(push.getByText('nowe ćwiczenie')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pull' }).getByText('nieznane — doda się jako własne')).toBeVisible();

  await page.getByRole('button', { name: 'Dodaj plan' }).click();
  await expect(page).toHaveURL(/#\/plany\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Plan od Kuby' })).toBeVisible();
  await expect(page.getByText('Aktywny', { exact: true })).toBeVisible(); // no plan before

  // Custom exercises were created and are the receiver's own.
  await page.goto('/#/cwiczenia');
  await page.getByRole('tab', { name: 'Moje' }).click();
  await expect(page.getByText('Tokarski lateral raises')).toBeVisible();
  await expect(page.getByText('Mystery Row Machine')).toBeVisible();

  // Opening the same link again adds a second plan but no duplicate exercise.
  await page.goto(friendLink());
  await expect(page.getByRole('heading', { level: 1, name: 'Plan od Kuby' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Push' })).toContainText('Tokarski lateral raises');
  await expect(page.getByText('nowe ćwiczenie')).toHaveCount(0);
  await expect(page.getByText('nieznane — doda się jako własne')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dodaj plan' }).click();
  await expect(page).toHaveURL(/#\/plany\/[0-9a-f-]+$/);
  await page.goto('/#/plany');
  await expect(page.locator('.plan-card')).toHaveCount(2);
});

test('uszkodzony link i wklejanie linku w Planach', async ({ page }) => {
  const good = friendLink();
  await page.goto(good.slice(0, good.length - 20));
  await expect(page.getByRole('alert')).toContainText('Link jest uszkodzony');

  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Dodaj plan z linku' }).click();
  const sheet = page.getByRole('dialog', { name: 'Dodaj plan z linku' });
  await sheet.getByLabel('Link od znajomego').fill('cześć, nie link');
  await sheet.getByRole('button', { name: 'Pokaż plan' }).click();
  await expect(sheet.getByRole('alert')).toContainText('To nie jest link do planu');
  await sheet.getByLabel('Link od znajomego').fill(`Łap plan: https://repcak135.github.io/gym-app${good.slice(1)} 💪`);
  await sheet.getByRole('button', { name: 'Pokaż plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan od Kuby' })).toBeVisible();
});
