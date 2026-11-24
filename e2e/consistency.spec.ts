import { test, expect, type Page } from '@playwright/test';

const BENCH = 'Barbell Bench Press - Medium Grip';

/** Mięśnie → Łydki hides chest exercises; clearing the filter brings them back. */
async function filterByCalves(page: Page, picker: ReturnType<Page['getByRole']>) {
  const search = picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' });
  await search.fill('barbell bench press');
  await expect(picker.getByRole('button', { name: BENCH, exact: true })).toBeVisible({ timeout: 15_000 });
  await picker.getByRole('button', { name: 'Mięśnie' }).click();
  await page.getByRole('dialog', { name: 'Mięśnie' }).getByRole('option', { name: 'Łydki' }).click();
  await expect(picker.getByRole('button', { name: 'Łydki' })).toBeVisible();
  await expect(picker.getByRole('button', { name: BENCH, exact: true })).toHaveCount(0);
  await search.fill('seated calf raise');
  await expect(picker.getByRole('button', { name: 'Seated Calf Raise', exact: true })).toBeVisible();
  await search.fill('');
}

test('wybór ćwiczeń w dniu planu ma filtry Mięśnie i Sprzęt jak zakładka Ćwiczenia', async ({ page }) => {
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill('Plan');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  const day = page.getByRole('dialog', { name: 'Nowy dzień' });
  await day.getByLabel('Nazwa').fill('Dzień 1');
  await day.getByRole('button', { name: 'Zapisz' }).click();

  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await filterByCalves(page, picker);

  // Equipment filter and the "nothing matches" state with a reset button.
  await picker.getByRole('button', { name: 'Sprzęt' }).click();
  await page.getByRole('dialog', { name: 'Sprzęt' }).getByRole('option', { name: 'Maszyna' }).click();
  const metas = picker.locator('.exercise-row__meta');
  await expect
    .poll(async () => (await metas.allTextContents()).every((t) => t.includes('Maszyna')))
    .toBe(true);
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('zzzz nic takiego');
  await expect(picker.getByText('Brak ćwiczeń dla tego wyszukiwania.')).toBeVisible();
  await picker.getByRole('button', { name: 'Wyczyść wyszukiwanie i filtry' }).click();
  await expect(picker.getByRole('button', { name: 'Mięśnie' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Sprzęt' })).toBeVisible();

  // Closing forgets the filters.
  await picker.getByRole('button', { name: 'Mięśnie' }).click();
  await page.getByRole('dialog', { name: 'Mięśnie' }).getByRole('option', { name: 'Łydki' }).click();
  await picker.getByRole('button', { name: 'Zamknij' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenia' }).click();
  await expect(page.getByRole('dialog', { name: 'Dodaj ćwiczenia' }).getByRole('button', { name: 'Mięśnie' })).toBeVisible();
});

test('trening: filtry przy dodawaniu, zakładka Opis i rekordy w arkuszu ćwiczenia', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await filterByCalves(page, picker);
  await picker.getByRole('button', { name: 'Wyczyść filtr: Mięśnie' }).click();
  await picker.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell bench press');
  await picker.getByRole('button', { name: BENCH, exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  await page.getByRole('button', { name: 'Opis' }).first().click();
  const info = page.getByRole('dialog', { name: BENCH });
  await expect(info.getByRole('tab', { name: 'Opis', selected: true })).toBeVisible();
  await expect(info.getByRole('region', { name: 'Instrukcja' })).toBeVisible();
  await expect(info.getByRole('group', { name: 'Zdjęcia ćwiczenia' })).toBeVisible();
  await info.getByRole('tab', { name: 'Notatki' }).click();
  await info.getByRole('textbox', { name: 'Notatka do ćwiczenia' }).fill('Ławka płasko');
  await expect(info.getByText('Zapisano')).toBeVisible({ timeout: 3_000 });
});

test('Co nowego: raz po aktualizacji, potem z Ustawień', async ({ page }) => {
  // Brand-new user: nothing pops up, the version is remembered.
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog', { name: /Co nowego/ })).toHaveCount(0);

  // Pretend this phone used an older version and has a plan.
  await page.goto('/#/plany');
  await page.getByRole('button', { name: 'Nowy plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy plan' });
  await sheet.getByLabel('Nazwa').fill('Stary plan');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stary plan' })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('gym-app');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          const get = store.get('app');
          get.onsuccess = () => store.put({ ...get.result, lastSeenVersion: '0.8.0' });
          tx.oncomplete = () => { open.result.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  await page.goto('/#/');
  await page.reload(); // a hash change alone is not a new launch
  const news = page.getByRole('dialog', { name: 'Co nowego w 0.9.0' });
  await expect(news).toBeVisible();
  await expect(news.getByRole('listitem').first()).toBeVisible();
  await news.getByRole('button', { name: 'Super, zamknij' }).click();
  await expect(news).toHaveCount(0);
  await page.waitForTimeout(300); // the version is saved right after closing

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog', { name: /Co nowego/ })).toHaveCount(0);

  await page.goto('/#/ustawienia');
  await expect(page.getByText('0.9.0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Co nowego' }).click();
  const all = page.getByRole('dialog', { name: 'Co nowego' });
  await expect(all.getByRole('region', { name: 'Wersja 0.9.0' })).toBeVisible();
  await all.getByRole('button', { name: 'Super, zamknij' }).click();
  await expect(all).toHaveCount(0);
});

test('zamiana ćwiczenia: najpierw ćwiczenia na ten sam mięsień, wyszukiwanie dalej obejmuje wszystko', async ({ page }) => {
  const REAR = 'Seated Bent-Over Rear Delt Raise';
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Pusty trening' }).click();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const add = page.getByRole('dialog', { name: 'Dodaj ćwiczenia' });
  await add.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('seated bent over rear delt');
  await add.getByRole('button', { name: REAR, exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Gotowe (1)' }).click();

  await page.getByRole('button', { name: 'Opcje treningu' }).click();
  await page.getByRole('button', { name: `Zamień: ${REAR}` }).click();
  const swap = page.getByRole('dialog', { name: `Zamień: ${REAR}` });
  const titles = swap.locator('.exercises-section-title');
  await expect(titles.first()).toHaveText('Podobne (barki)', { timeout: 15_000 });
  await expect(swap.getByText('Pozostałe', { exact: true })).toHaveCount(0); // beyond the first page
  // The first rows are shoulder exercises, the dumbbell ones first.
  const metas = await swap.locator('.picker__row .exercise-row__meta').allTextContents();
  for (const m of metas.slice(0, 10)) expect(m).toContain('Barki');
  expect(metas[1]).toContain('Hantle');

  // Searching still reaches other muscles: they come under "Pozostałe".
  await swap.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('row');
  await expect(swap.getByText('Pozostałe', { exact: true })).toBeVisible();
  await swap.getByRole('searchbox', { name: 'Szukaj ćwiczenia' }).fill('barbell squat');
  await swap.getByRole('button', { name: 'Barbell Squat', exact: true }).click();
  await expect(page.locator('.ex-panel__name', { hasText: 'Barbell Squat' })).toBeVisible();
});

test('instrukcja instalacji: karta w karcie przeglądarki, Nie teraz, ponownie z Ustawień', async ({ page }) => {
  await page.goto('/#/');
  const card = page.getByRole('region', { name: 'Zainstaluj aplikację na telefonie' });
  await expect(card).toBeVisible();
  // iPhone 13 profile → opens on iPhone steps, other systems one tap away.
  await expect(card.getByRole('tab', { name: 'iPhone', selected: true })).toBeVisible();
  await expect(card).toContainText('Do ekranu początkowego');
  await expect(card).toContainText('dane w karcie przeglądarki i w zainstalowanej aplikacji są osobne');
  await card.getByRole('tab', { name: 'Android' }).click();
  await expect(card).toContainText('Zainstaluj aplikację');

  await card.getByRole('button', { name: 'Nie teraz' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await page.getByRole('button', { name: 'Jak zainstalować na telefonie' }).click();
  const sheet = page.getByRole('dialog', { name: 'Jak zainstalować na telefonie' });
  await expect(sheet).toContainText('Udostępnij');
  await sheet.getByRole('button', { name: 'Zamknij' }).click();
  await expect(sheet).toHaveCount(0);
});

test('instrukcja instalacji: nie w zainstalowanej aplikacji, „Mam już zainstalowaną” chowa na stałe', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('standalone') === '1') Object.defineProperty(navigator, 'standalone', { value: true });
  });
  await page.goto('/#/');
  const card = page.getByRole('region', { name: 'Zainstaluj aplikację na telefonie' });
  await card.getByRole('button', { name: 'Mam już zainstalowaną' }).click();
  await expect(card).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('gym.installGuide'));
  await page.evaluate(() => sessionStorage.setItem('standalone', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
  await expect(card).toHaveCount(0);
});
