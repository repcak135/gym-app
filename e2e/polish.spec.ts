import { test, expect, type Page, type Locator } from '@playwright/test';

/** Puts rows straight into the app's IndexedDB, then reloads so the app reads them. */
async function seed(page: Page, data: { plans?: unknown[]; workouts?: unknown[]; sets?: unknown[] }) {
  await page.goto('/#/');
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.evaluate(async (d) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('gym-app');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const stores = Object.keys(d).filter((k) => (d as Record<string, unknown[]>)[k]?.length);
        const tx = db.transaction(stores, 'readwrite');
        for (const s of stores) for (const row of (d as Record<string, unknown[]>)[s]) tx.objectStore(s).put(row);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, data);
}

const plan = (id: string, name: string, days: { id: string; name: string; items?: unknown[] }[] = []) => ({
  id, name, startedAt: '2026-11-01', days: days.map((d) => ({ items: [], ...d })),
});

/** A real finger swipe (CDP touch events), from the row's right part to the left by `dx` px. */
async function swipe(page: Page, row: Locator, dx: number, dy = 0) {
  const box = (await row.boundingBox())!;
  const x = box.x + box.width * 0.75;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, px: number, py: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }],
    });
  await touch('touchStart', x, y);
  const steps = 8;
  for (let i = 1; i <= steps; i++) await touch('touchMove', x + (dx * i) / steps, y + (dy * i) / steps);
  await touch('touchEnd', x + dx, y + dy);
  await cdp.detach();
}

const toast = (page: Page) => page.locator('.toast-host');

test('pełne przesunięcie usuwa plan, „Cofnij” go przywraca', async ({ page }) => {
  await seed(page, { plans: [plan('p1', 'Push Pull Legs'), plan('p2', 'FBW')] });
  await page.goto('/#/plany');
  const row = page.locator('.swipe-row', { hasText: 'Push Pull Legs' });
  await expect(row).toBeVisible();

  await swipe(page, row, -300);
  await expect(page.locator('.plan-card', { hasText: 'Push Pull Legs' })).toHaveCount(0);
  await expect(toast(page)).toContainText('Usunięto plan „Push Pull Legs”');

  await toast(page).getByRole('button', { name: 'Cofnij' }).click();
  await expect(page.locator('.plan-card', { hasText: 'Push Pull Legs' })).toBeVisible();
  await expect(page.locator('.plan-card')).toHaveCount(2);
});

test('krótkie przesunięcie odsłania „Usuń” dnia, dotknięcie usuwa, „Cofnij” przywraca na miejsce', async ({ page }) => {
  await seed(page, {
    plans: [plan('p1', 'Plan', [{ id: 'd1', name: 'Day 1 Push' }, { id: 'd2', name: 'Day 2 Pull' }, { id: 'd3', name: 'Day 3 Legs' }])],
  });
  await page.goto('/#/plany/p1');
  const row = page.locator('.swipe-row', { hasText: 'Day 2 Pull' });
  await swipe(page, row, -110);

  // Partial swipe: no navigation, the red button is shown.
  await expect(page).toHaveURL(/#\/plany\/p1$/);
  const del = page.getByRole('button', { name: 'Usuń: Day 2 Pull' });
  await expect(del).toBeVisible();
  await del.click();

  await expect(page.locator('.day-row')).toHaveCount(2);
  await toast(page).getByRole('button', { name: 'Cofnij' }).click();
  await expect(page.locator('.day-row__name')).toHaveText(['Day 1 Push', 'Day 2 Pull', 'Day 3 Legs']);
});

test('przesunięcie usuwa ćwiczenie z dnia i „Cofnij” je przywraca', async ({ page }) => {
  const item = (exerciseId: string) => ({ exerciseId, sets: 3, warmupSets: 0, repsMin: 8, repsMax: 12, restSec: 120 });
  await seed(page, {
    plans: [plan('p1', 'Plan', [{ id: 'd1', name: 'Day 1', items: [item('x-a'), item('x-b')] }])],
  });
  await page.goto('/#/plany/p1/dni/d1');
  const cards = page.locator('.item-card');
  await expect(cards).toHaveCount(2);

  await swipe(page, page.locator('.swipe-row').first(), -320);
  await expect(cards).toHaveCount(1);
  await expect(toast(page)).toContainText('Usunięto ćwiczenie');
  await toast(page).getByRole('button', { name: 'Cofnij' }).click();
  await expect(cards).toHaveCount(2);
});

test('przesunięcie usuwa trening z Historii razem z seriami, „Cofnij” przywraca', async ({ page }) => {
  const now = new Date();
  const at = new Date(now.getFullYear(), now.getMonth(), 1, 18).getTime();
  await seed(page, {
    workouts: [{ id: 'w1', name: 'Push A', startedAt: at, endedAt: at + 3600_000, source: 'app' }],
    sets: [1, 2, 3].map((n) => ({
      id: `s${n}`, workoutId: 'w1', exerciseId: 'x-a', exerciseOrder: 0, setOrder: n, weight: 50, reps: 8, warmup: false, completedAt: at + n * 60_000,
    })),
  });
  await page.goto('/#/historia');
  const item = page.locator('.history-item', { hasText: 'Push A' });
  await expect(item).toContainText('3 serie');

  await swipe(page, page.locator('.swipe-row', { hasText: 'Push A' }), -320);
  await expect(item).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Cofnij' }).click();
  await expect(item).toContainText('3 serie');
});

test('przesunięcie w pionie przewija stronę i nie otwiera wiersza', async ({ page }) => {
  await seed(page, { plans: [plan('p1', 'Push Pull Legs')] });
  await page.goto('/#/plany');
  const row = page.locator('.swipe-row', { hasText: 'Push Pull Legs' });
  await swipe(page, row, -30, 120);
  await expect(row).not.toHaveClass(/swipe-row--open/);
  await expect(page.getByRole('button', { name: 'Usuń: Push Pull Legs' })).toBeHidden();
  await expect(page).toHaveURL(/#\/plany$/);
});

test('ograniczony ruch: ekrany i listy bez animacji', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { plans: [plan('p1', 'Push Pull Legs')] });
  await page.goto('/#/plany');
  await expect(page.locator('.plan-card')).toBeVisible();
  const durations = await page.evaluate(() =>
    ['.screen', '.swipe-row'].map((sel) => getComputedStyle(document.querySelector(sel)!).animationDuration),
  );
  for (const d of durations) expect(parseFloat(d)).toBeLessThan(0.001);
});

test('bez ograniczenia ruchu ekran ma krótką animację wejścia', async ({ page }) => {
  await page.goto('/#/plany');
  const d = await page.evaluate(() => getComputedStyle(document.querySelector('.screen')!).animationDuration);
  expect(parseFloat(d)).toBeGreaterThan(0.1);
  expect(parseFloat(d)).toBeLessThanOrEqual(0.25);
});
