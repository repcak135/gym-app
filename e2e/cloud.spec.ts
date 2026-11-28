import { test, expect, type Page } from '@playwright/test';

// Ustawienia › Kopia w chmurze with the server mocked in memory: switch on, encrypted upload,
// anonymous list without personal data, restore preview with cloud vs phone counts.

async function idbPut(page: Page, store: string, value: object) {
  await page.evaluate(
    ([store, value]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('gym-app');
        open.onsuccess = () => {
          const tx = open.result.transaction(store as string, 'readwrite');
          tx.objectStore(store as string).put(value);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    [store, value] as const,
  );
}

async function mockServer(page: Page) {
  const state: { keys?: { pwWrapped: string; adminWrapped: string }; objects: Buffer[]; stats: unknown[] } = { objects: [], stats: [] };
  await page.route('**/*.workers.dev/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': 'X-Backup-At' };
    const json = (status: number, b?: unknown) => route.fulfill({ status, headers, contentType: 'application/json', body: b === undefined ? '' : JSON.stringify(b) });
    if (method === 'OPTIONS') return json(204);
    if (path === '/account/salt') return json(200, { salt: 'AAAAAAAAAAAAAAAAAAAAAA', iterations: 100000 });
    if (path === '/account/login') return json(200, { token: 'b'.repeat(32), nick: 'Ola', shareWorkouts: true, shareBench: false, mustChange: false });
    if (path === '/account/session') return json(204);
    if (path === '/backup/keys' && method === 'GET') return state.keys ? json(200, { pwWrapped: state.keys.pwWrapped, lastBackupAt: null }) : json(404);
    if (path === '/backup/keys') {
      state.keys = req.postDataJSON();
      return json(204);
    }
    if (path === '/backup' && method === 'PUT') {
      state.objects.push(req.postDataBuffer()!);
      return json(200, { at: Date.now(), size: state.objects.at(-1)!.length });
    }
    if (path === '/backup/latest') return route.fulfill({ status: 200, headers: { ...headers, 'X-Backup-At': String(Date.now() - 3_600_000) }, contentType: 'application/octet-stream', body: state.objects.at(-1)! });
    if (path === '/stats/exercises') {
      state.stats.push(req.postDataJSON());
      return json(204);
    }
    if (path === '/scores' || path === '/account/me' || path === '/ranking') return json(204);
    return json(404);
  });
  return state;
}

test('kopia w chmurze: włączenie, zaszyfrowana kopia, przywracanie z podglądem', async ({ page }) => {
  const state = await mockServer(page);
  await page.goto('/#/');
  await idbPut(page, 'settings', { key: 'app', rankToken: 'a'.repeat(32), rankNick: 'Ola', rankSex: 'f' });
  await idbPut(page, 'body', { id: 'b1', date: '2026-11-01', weightKg: 61.5, measurements: {} });

  await page.goto('/#/ustawienia');
  await expect(page.getByRole('link', { name: /Kopia w chmurze/ })).toContainText('wyłączona');
  await page.getByRole('link', { name: /Kopia w chmurze/ }).click();
  await expect(page.getByText('Kopia jest zaszyfrowana Twoim hasłem. Właściciel aplikacji może ją odzyskać, jeśli zgubisz hasło.')).toBeVisible();
  await expect(page.getByLabel('Udostępnij anonimowo listę ćwiczeń')).toBeChecked(); // pre-checked
  await page.getByLabel('Twoje hasło do konta').fill('moje-haslo-1');
  await page.getByRole('button', { name: 'Włącz kopię w chmurze' }).click();
  await expect(page.getByText('Kopia w chmurze włączona')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status').first()).toContainText('Ostatnia kopia w chmurze: dzisiaj');

  // The server got ciphertext only, and both locks.
  expect(state.objects).toHaveLength(1);
  expect(state.objects[0].subarray(0, 4).toString()).toBe('BGB1');
  expect(state.objects[0].toString('latin1')).not.toContain('61.5');
  expect(JSON.parse(state.keys!.adminWrapped)).toMatchObject({ v: 1, kind: 'admin', kid: 'k20261128' });
  expect(JSON.stringify(state.stats)).not.toContain('Ola');

  // A workout newer than the cloud backup → warning in the restore preview.
  await idbPut(page, 'workouts', { id: 'wNew', name: 'Nowy', startedAt: Date.now(), endedAt: Date.now() + 60_000, source: 'app' });
  await page.getByRole('button', { name: 'Przywróć kopię z chmury' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kopia z chmury' });
  await expect(dialog.getByRole('row', { name: /Treningi/ })).toContainText('0');
  await expect(dialog.getByRole('row', { name: /Treningi/ })).toContainText('1');
  await expect(dialog.getByRole('row', { name: /Pomiary ciała/ })).toContainText('1');
  await expect(dialog).toContainText('Na tym telefonie są nowsze treningi, które przepadną');
  await dialog.getByRole('button', { name: 'Przywróć' }).click();
  await expect(page.getByText('Dane przywrócone z kopii w chmurze.')).toBeVisible();

  await page.goto('/#/historia');
  await expect(page.getByText('Nowy')).toHaveCount(0);
  await page.goto('/#/ustawienia');
  await expect(page.getByRole('link', { name: /Kopia w chmurze/ })).toContainText('włączona');
});

test('kopia w chmurze bez konta: najpierw Ranking', async ({ page }) => {
  await page.goto('/#/ustawienia/chmura');
  await expect(page.getByText('Kopia w chmurze działa z kontem z Rankingu')).toBeVisible();
});
